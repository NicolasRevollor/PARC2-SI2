# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU26] Solicitar reporte generativo en lenguaje natural -> POST /api/reports/ia/consultar
# [CU27] Solicitar reporte generativo por voz            -> POST /api/reports/ia/transcribir (y luego consultar)
# [CU28] Exportar reporte a PDF o Excel                  -> POST /api/reports/exportar
# Pantalla (boundary): web/src/app/features/reports-ia/reports-ia.component.ts
# Reglas: services/reportes_generativos.py y services/exportacion.py
# ==================================================================
"""Reportes generativos con IA, voz y exportacion formal."""

import asyncio
import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models import ReporteExportacion, ReporteSolicitud, Sucursal, Tenant, Usuario
from app.security import get_current_payload, require_permiso
from app.services import exportacion as exp
from app.services import notificaciones as notif
from app.services import reportes_generativos as rg
from app.services import reportes_ia
from app.services.alcance import alcance_sucursales
from app.services.bitacora import registrar_bitacora
from app.services.horario import HORA_BOLIVIA
from app.services.tenancy import ContextoTenant, require_feature, tenant_actual

router = APIRouter(prefix="/api/reports", tags=["reportes-ia"])

PERMISO_IA = "reporte.ia"
# Paso 1 de la alternativa del CU28: arriba de esto se genera en segundo plano.
FILAS_DESCARGA_DIRECTA = 1000
TIPOS_AUDIO = ("audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/m4a")


class AjustesIn(BaseModel):
    """[CU26] paso 7: ajustar los filtros de un reporte sin volver a llamar a la IA."""

    idSolicitud: int
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    sucursales: list[str] | None = None


class ConsultaIn(BaseModel):
    texto: str = Field(default="", max_length=500)
    origen: str = Field(default="texto", pattern="^(texto|voz)$")
    ajustes: AjustesIn | None = None


class FavoritaIn(BaseModel):
    favorita: bool


class ExportarIn(BaseModel):
    origen: str = Field(pattern="^(solicitud|ventas|inventario)$")
    formato: str = Field(pattern="^(pdf|xlsx)$")
    idSolicitud: int | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    codigoSucursal: int | None = None
    idProducto: int | None = None


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


async def _contexto(session: AsyncSession, auth: dict, id_tenant: int) -> rg.Contexto:
    tenant = await session.get(Tenant, id_tenant)
    return await rg.contexto(session, id_tenant, tenant.nombre if tenant else "", await alcance_sucursales(session, auth))


async def _guardar(session: AsyncSession, auth: dict, id_tenant: int, texto: str, origen: str, motor: str,
                   estado: str, interp: rg.Interpretacion | None, titulo: str | None = None, filas: int = 0) -> ReporteSolicitud:
    solicitud = ReporteSolicitud(
        idTenant=id_tenant, idUsuario=int(auth["sub"]), texto=texto[:500] or "(ajuste)", origen=origen, motor=motor[:40],
        interpretacion=interp.model_dump(mode="json") if interp else None, titulo=(titulo or "")[:150] or None,
        estado=estado, filas=filas,
    )
    session.add(solicitud)
    await session.flush()
    return solicitud


async def _solicitud_mia(session: AsyncSession, id_solicitud: int, auth: dict, id_tenant: int) -> ReporteSolicitud:
    s = await session.get(ReporteSolicitud, id_solicitud)
    if s is None or s.idTenant != id_tenant or s.idUsuario != int(auth["sub"]):
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return s


# ==== [CU26] ControlReportesIA.consultar() =========================
# Pasos 2 a 7 y flujos alternativos 1 a 7 (el 7, plan Basico, lo resuelve require_feature: CU25).
# ===================================================================
@router.post("/ia/consultar")
async def consultar(
    payload: ConsultaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_IA)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    ctx = await _contexto(session, auth, id_tenant)
    aviso_ia = None
    if payload.ajustes is not None:
        anterior = await _solicitud_mia(session, payload.ajustes.idSolicitud, auth, id_tenant)
        if not anterior.interpretacion:
            raise HTTPException(status_code=409, detail="Ese reporte no se puede ajustar")
        interp = rg.Interpretacion.model_validate(anterior.interpretacion)
        a = payload.ajustes
        interp.filtros.fecha_desde, interp.filtros.fecha_hasta = a.fecha_desde, a.fecha_hasta
        interp.periodoPorDefecto = False
        if a.sucursales is not None:
            interp.filtros.sucursales = a.sucursales
        texto, motor = anterior.texto, "Ajuste de filtros"
    else:
        texto = payload.texto.strip()
        if len(texto) < 3:
            raise HTTPException(status_code=400, detail="Escriba lo que necesita, por ejemplo: " + rg.EJEMPLOS[0])
        interp, motor, aviso_ia = await rg.interpretar(texto, ctx)

    if interp.accion == "aclarar":
        await _guardar(session, auth, id_tenant, texto, payload.origen, motor, "Aclaracion", interp)
        await session.commit()
        return {"estado": "aclaracion", "pregunta": interp.pregunta, "opciones": interp.opciones[:4], "motor": motor}

    try:
        valida = rg.validar(interp, ctx)
    except rg.Rechazo as exc:
        await _guardar(session, auth, id_tenant, texto, payload.origen, motor, "Rechazado", interp)
        await registrar_bitacora(session, f"Reporte IA rechazado: {texto}"[:150], int(auth["sub"]), _ip(request))
        await session.commit()
        return {"estado": "rechazado", "motivo": exc.mensaje, "ejemplos": rg.EJEMPLOS, "motor": motor}

    filas, hay_mas = await rg.ejecutar(valida, id_tenant, valida.limite)
    if not filas:
        solicitud = await _guardar(session, auth, id_tenant, texto, payload.origen, motor, "SinDatos", interp, valida.titulo)
        await session.commit()
        return {
            "estado": "sin_datos", "idSolicitud": solicitud.idSolicitud, "titulo": valida.titulo,
            "mensaje": "No hay datos para el periodo o filtros indicados", "filtros": valida.filtros_texto,
            "avisos": valida.avisos, "motor": motor, "ajustes": _ajustes(valida, ctx),
        }
    totales = rg.totales_de(valida, filas)
    resumen, motor_resumen = await rg.resumir(valida, filas, totales)
    solicitud = await _guardar(session, auth, id_tenant, texto, payload.origen, motor, "Generado", interp, valida.titulo, len(filas))
    await registrar_bitacora(session, f"Reporte IA: {valida.titulo}"[:150], int(auth["sub"]), _ip(request))
    await session.commit()
    avisos = list(valida.avisos)
    if aviso_ia:
        avisos.append(aviso_ia)
    if hay_mas:
        avisos.append(f"Se muestran las primeras {len(filas)} filas: exporte el reporte para verlo completo.")
    return {
        "estado": "generado", "idSolicitud": solicitud.idSolicitud, "titulo": valida.titulo,
        "columnas": rg.columnas_de(valida), "filas": filas, "totales": totales, "visualizacion": valida.visualizacion,
        "filtros": valida.filtros_texto, "avisos": avisos, "resumen": resumen, "motor": motor, "motorResumen": motor_resumen,
        "ajustes": _ajustes(valida, ctx), "favorita": False,
    }


def _ajustes(s: rg.SolicitudValida, ctx: rg.Contexto) -> dict:
    """Lo que la pantalla deja cambiar sin volver a la IA."""
    visibles = ctx.visibles if ctx.visibles is not None else set(ctx.sucursales)
    return {
        "fecha_desde": s.desde.isoformat() if s.desde else None,
        "fecha_hasta": s.hasta.isoformat() if s.hasta else None,
        "usaFechas": s.fuente != "inventario",
        "sucursales": [ctx.sucursales[c] for c in sorted(s.sucursales or [])],
        "sucursalesDisponibles": [ctx.sucursales[c] for c in sorted(visibles) if c in ctx.sucursales],
    }


@router.get("/ia/historial")
async def historial(
    favoritas: bool = False,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_IA)),
    id_tenant: int = Depends(tenant_actual),
):
    """Poscondicion del CU26: la solicitud queda en el historial de reportes."""
    stmt = (
        select(ReporteSolicitud)
        .where(ReporteSolicitud.idTenant == id_tenant, ReporteSolicitud.idUsuario == int(auth["sub"]))
        .order_by(ReporteSolicitud.fecha.desc())
        .limit(50)
    )
    if favoritas:
        stmt = stmt.where(ReporteSolicitud.favorita.is_(True))
    return [
        {"idSolicitud": s.idSolicitud, "texto": s.texto, "titulo": s.titulo, "estado": s.estado, "origen": s.origen,
         "motor": s.motor, "filas": s.filas, "favorita": s.favorita, "fecha": s.fecha}
        for s in (await session.execute(stmt)).scalars()
    ]


@router.patch("/ia/{id_solicitud}/favorita")
async def marcar_favorita(
    id_solicitud: int,
    payload: FavoritaIn,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_IA)),
    id_tenant: int = Depends(tenant_actual),
):
    """[CU26] paso 7: guardar la solicitud como favorita."""
    s = await _solicitud_mia(session, id_solicitud, auth, id_tenant)
    s.favorita = payload.favorita
    await session.commit()
    return {"idSolicitud": s.idSolicitud, "favorita": s.favorita}


# ==== [CU27] Solicitar reporte generativo por voz ==================
# Paso 4: el navegador transcribe con su reconocimiento de voz; si no lo tiene,
# manda el audio aca y lo transcribe Gemini. La confianza baja pide repetir (alt. 2).
# ===================================================================
class Transcripcion(BaseModel):
    texto: str
    audible: bool


@router.post("/ia/transcribir")
async def transcribir(
    audio: UploadFile = File(...),
    auth: dict = Depends(require_permiso(PERMISO_IA)),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    tipo = (audio.content_type or "").split(";")[0]
    if tipo not in TIPOS_AUDIO:
        raise HTTPException(status_code=415, detail="Formato de audio no soportado")
    datos = await audio.read()
    if len(datos) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La grabacion es demasiado larga")
    try:
        cliente = reportes_ia._client()
    except reportes_ia.GeminiNoConfigurado:
        raise HTTPException(status_code=503, detail="La transcripcion en el servidor no esta disponible: escriba su solicitud")
    try:
        respuesta = await asyncio.wait_for(
            cliente.aio.models.generate_content(
                model=reportes_ia.MODEL,
                contents=[
                    reportes_ia.types.Part.from_bytes(data=datos, mime_type=tipo),
                    "Transcribe en espanol lo que dice la persona. audible=false si hay mucho ruido o no se entiende.",
                ],
                config=reportes_ia.types.GenerateContentConfig(response_mime_type="application/json", response_schema=Transcripcion),
            ),
            timeout=30,
        )
        resultado = respuesta.parsed or Transcripcion.model_validate(json.loads(respuesta.text))
    except Exception:
        raise HTTPException(status_code=503, detail="No se pudo transcribir el audio: repita la solicitud o escribala")
    return {"texto": resultado.texto.strip(), "confianza": "alta" if resultado.audible and resultado.texto.strip() else "baja"}


# ==== [CU28] ControlExportacion.exportar() =========================
# ===================================================================
async def _documento(session: AsyncSession, auth: dict, id_tenant: int, payload: ExportarIn, limite: int) -> exp.Documento:
    """Paso 2: arma el documento con los datos vigentes (se vuelve a consultar)."""
    from app.routers import reports as convencional

    tenant = await session.get(Tenant, id_tenant)
    usuario = await session.get(Usuario, int(auth["sub"]))
    visibles = await alcance_sucursales(session, auth)
    generado = datetime.now(HORA_BOLIVIA).replace(tzinfo=None)
    base = {"empresa": tenant.nombre if tenant else "", "usuario": usuario.nombre if usuario else "", "generado": generado}

    if payload.origen == "solicitud":
        if PERMISO_IA not in auth.get("permisos", []):
            raise HTTPException(status_code=403, detail=f"No tiene permiso '{PERMISO_IA}'")
        solicitud = await _solicitud_mia(session, payload.idSolicitud or 0, auth, id_tenant)
        if solicitud.estado != "Generado" or not solicitud.interpretacion:
            raise HTTPException(status_code=409, detail="El reporte no tiene datos para exportar")
        ctx = await rg.contexto(session, id_tenant, base["empresa"], visibles)
        valida = rg.validar(rg.Interpretacion.model_validate(solicitud.interpretacion), ctx)
        filas, _ = await rg.ejecutar(valida, id_tenant, limite)
        totales = rg.totales_de(valida, filas)
        return exp.Documento(
            **base, titulo=valida.titulo, filtros=valida.filtros_texto,
            columnas=[exp.Columna(c["clave"], c["etiqueta"], c["tipo"]) for c in rg.columnas_de(valida)],
            filas=filas, totales=totales, visualizacion=valida.visualizacion,
            resumen=rg.resumen_por_reglas(valida, filas, totales), avisos=valida.avisos,
        )

    if "reporte.ver" not in auth.get("permisos", []):
        raise HTTPException(status_code=403, detail="No tiene permiso 'reporte.ver'")
    filtros = []
    if payload.fecha_desde or payload.fecha_hasta:
        filtros.append(("Periodo", f"{payload.fecha_desde or 'inicio'} al {payload.fecha_hasta or 'hoy'}"))
    if payload.codigoSucursal:
        sucursal = await session.get(Sucursal, payload.codigoSucursal)
        filtros.append(("Sucursal", sucursal.nombre if sucursal else str(payload.codigoSucursal)))
    if payload.origen == "ventas":
        filas = await convencional._consultar_ventas(
            session, id_tenant, payload.fecha_desde, payload.fecha_hasta, payload.codigoSucursal, payload.idProducto, visibles
        )
        filas = sorted(filas, key=lambda f: (f["sucursal_nombre"], -float(f["monto"])))[:limite]
        filas = [{**f, "monto": float(f["monto"])} for f in filas]
        columnas = [exp.Columna("sucursal_nombre", "Sucursal", "texto"), exp.Columna("producto_nombre", "Producto", "texto"),
                    exp.Columna("cantidad_vendida", "Unidades vendidas", "entero"), exp.Columna("monto", "Monto vendido", "moneda")]
        totales = {"cantidad_vendida": sum(f["cantidad_vendida"] for f in filas), "monto": round(sum(f["monto"] for f in filas), 2)}
        resumen = f"{totales['cantidad_vendida']:,} unidades vendidas por Bs {totales['monto']:,.2f}." if filas else None
        return exp.Documento(**base, titulo="Reporte de ventas", filtros=filtros, columnas=columnas, filas=filas,
                             totales=totales, visualizacion="tabla", resumen=resumen)
    filas = await convencional._consultar_inventario(session, id_tenant, payload.codigoSucursal, payload.idProducto, visibles)
    filas = [{**f, "disponible": f["cantidad_actual"] - f["cantidad_reservada"]} for f in sorted(filas, key=lambda f: f["sucursal_nombre"])][:limite]
    columnas = [exp.Columna("sucursal_nombre", "Sucursal", "texto"), exp.Columna("producto_nombre", "Producto", "texto"),
                exp.Columna("cantidad_actual", "Stock actual", "entero"), exp.Columna("cantidad_reservada", "Reservado", "entero"),
                exp.Columna("disponible", "Disponible", "entero")]
    totales = {c: sum(f[c] for f in filas) for c in ("cantidad_actual", "cantidad_reservada", "disponible")}
    return exp.Documento(**base, titulo="Reporte de inventario", filtros=filtros, columnas=columnas, filas=filas,
                         totales=totales, visualizacion="tabla", resumen=f"{totales['disponible']:,} prendas disponibles." if filas else None)


def _bytes(doc: exp.Documento, formato: str) -> tuple[bytes, str]:
    if formato == "pdf":
        return exp.pdf(doc), "application/pdf"
    return exp.excel(doc), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _generar_en_segundo_plano(id_exportacion: int, auth: dict, id_tenant: int, payload: ExportarIn) -> None:
    """[CU28] flujo alternativo 1: el reporte grande se arma despues de responder y se avisa."""
    async with AsyncSessionLocal() as session:
        registro = await session.get(ReporteExportacion, id_exportacion)
        try:
            doc = await _documento(session, auth, id_tenant, payload, rg.FILAS_MAXIMAS)
            contenido, _ = await asyncio.to_thread(_bytes, doc, payload.formato)
            registro.archivo, registro.estado = contenido, "Lista"
            registro.nombreArchivo, registro.filas = exp.nombre_archivo(doc, payload.formato), len(doc.filas)
            titulo, mensaje = f"Su reporte esta listo: {doc.titulo}", "Descarguelo desde Reportes con IA > Exportaciones."
        except Exception as exc:  # noqa: BLE001
            registro.estado, registro.error = "Fallida", str(exc)[:255]
            titulo, mensaje = "No se pudo generar su reporte", "Vuelva a intentarlo."
        await notif.notificar_usuario(session, int(auth["sub"]), id_tenant, tipo="reporte", titulo=titulo[:150],
                                      mensaje=mensaje, referencia=f"exp-{id_exportacion}", por_correo=False)
        await session.commit()


@router.post("/exportar")
async def exportar(
    payload: ExportarIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    doc = await _documento(session, auth, id_tenant, payload, FILAS_DESCARGA_DIRECTA + 1)
    # Flujo alternativo 2: sin datos no se exporta.
    if not doc.filas:
        raise HTTPException(status_code=409, detail="El reporte no tiene datos para exportar")
    await registrar_bitacora(session, f"Reporte exportado a {payload.formato.upper()}: {doc.titulo}"[:150], int(auth["sub"]), _ip(request))
    if len(doc.filas) > FILAS_DESCARGA_DIRECTA:
        registro = ReporteExportacion(idTenant=id_tenant, idUsuario=int(auth["sub"]), titulo=doc.titulo[:150], formato=payload.formato)
        session.add(registro)
        await session.commit()
        background_tasks.add_task(_generar_en_segundo_plano, registro.idExportacion, auth, id_tenant, payload)
        return Response(
            status_code=202, media_type="application/json",
            content=json.dumps({"idExportacion": registro.idExportacion, "estado": "EnProceso",
                                "mensaje": "El reporte es grande: se genera en segundo plano y le avisaremos cuando este listo."}),
        )
    await session.commit()
    contenido, tipo = await asyncio.to_thread(_bytes, doc, payload.formato)
    return Response(content=contenido, media_type=tipo,
                    headers={"Content-Disposition": f'attachment; filename="{exp.nombre_archivo(doc, payload.formato)}"'})


@router.get("/exportaciones")
async def mis_exportaciones(
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    filas = (
        await session.execute(
            select(ReporteExportacion.idExportacion, ReporteExportacion.titulo, ReporteExportacion.formato, ReporteExportacion.estado,
                   ReporteExportacion.filas, ReporteExportacion.fecha, ReporteExportacion.error)
            .where(ReporteExportacion.idTenant == id_tenant, ReporteExportacion.idUsuario == int(auth["sub"]))
            .order_by(ReporteExportacion.fecha.desc())
            .limit(20)
        )
    ).mappings().all()
    return [dict(f) for f in filas]


@router.get("/exportaciones/{id_exportacion}/archivo")
async def descargar_exportacion(
    id_exportacion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    registro = await session.get(ReporteExportacion, id_exportacion)
    if registro is None or registro.idTenant != id_tenant or registro.idUsuario != int(auth["sub"]):
        raise HTTPException(status_code=404, detail="Exportacion no encontrada")
    if registro.estado != "Lista" or registro.archivo is None:
        raise HTTPException(status_code=409, detail="La exportacion todavia no esta lista")
    tipo = "application/pdf" if registro.formato == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content=registro.archivo, media_type=tipo,
                    headers={"Content-Disposition": f'attachment; filename="{registro.nombreArchivo}"'})
