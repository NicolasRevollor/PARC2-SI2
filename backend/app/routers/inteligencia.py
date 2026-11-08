# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU29] Entrenar y evaluar modelos de Machine Learning -> /api/ia/modelos/*
#   Pantalla (boundary): web/src/app/features/modelos-ia/modelos-ia.component.ts
# [CU30] Visualizar dashboard analitico inteligente     -> GET /api/ia/dashboard
#   Pantalla (boundary): web/src/app/features/dashboard-analitico/dashboard-analitico.component.ts
# Reglas: services/modelos_ia.py
# ==================================================================
"""Modelos de IA de la empresa y dashboard analitico."""

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Devolucion, Inventario, ModeloIA, Producto, Sucursal
from app.security import require_permiso
from app.services import modelos_ia as ml
from app.services import reportes_ia
from app.services.alcance import alcance_sucursales
from app.services.bitacora import registrar_bitacora
from app.services.horario import ZONA_BOLIVIA_SQL, fin_del_dia, inicio_del_dia
from app.services.tenancy import ContextoTenant, cargar_contexto, require_feature, tenant_actual

router = APIRouter(prefix="/api/ia", tags=["inteligencia"])
logger = logging.getLogger("app.errors")

PERMISO_MODELOS = "ia.modelos"


class EntrenarIn(BaseModel):
    """[CU29] paso 3: fuente de datos y variables."""

    tipo: str = Field(pattern="^(demanda|devolucion|segmentacion|anomalias)$")
    usarSinteticos: bool = False
    registros: int = Field(default=3000, ge=200, le=20000)
    semanas: int = Field(default=26, ge=8, le=104)
    estacionalidad: float = Field(default=0.3, ge=0, le=1)
    variables: list[str] = []


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


def _modelo_out(m: ModeloIA, publicado: ModeloIA | None = None) -> dict:
    return {
        "idModeloIA": m.idModeloIA, "tipo": m.tipo, "etiqueta": ml.ETIQUETAS[m.tipo], "version": m.version, "estado": m.estado,
        "algoritmo": m.algoritmo, "metricas": m.metricas, "umbrales": ml.UMBRALES[m.tipo], "cumpleUmbral": m.cumpleUmbral,
        "filasReales": m.filasReales, "filasSinteticas": m.filasSinteticas, "conSinteticos": m.filasSinteticas > 0,
        "parametros": m.parametros, "error": m.error, "fechaEntrenamiento": m.fechaEntrenamiento,
        "fechaPublicacion": m.fechaPublicacion,
        "comparacion": ml.comparar(m.metricas, publicado.metricas if publicado and publicado.idModeloIA != m.idModeloIA else None),
        "versionComparada": publicado.version if publicado and publicado.idModeloIA != m.idModeloIA else None,
    }


async def _publicado(session: AsyncSession, id_tenant: int, tipo: str) -> ModeloIA | None:
    return await session.scalar(
        select(ModeloIA).where(ModeloIA.idTenant == id_tenant, ModeloIA.tipo == tipo, ModeloIA.estado == "Publicado")
    )


# --- [CU29] ---------------------------------------------------------------------

@router.get("/modelos/datos")
async def datos_disponibles(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_MODELOS)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    """Paso 2: cuantos datos reales tiene la empresa para cada modelo."""
    ventas = await ml.datos_ventas(session, id_tenant)
    return [
        {"tipo": t, "etiqueta": ml.ETIQUETAS[t], "filasReales": ml.contar_datos(t, ventas), "minimo": ml.MINIMOS[t],
         "suficiente": ml.contar_datos(t, ventas) >= ml.MINIMOS[t], "variables": ml.VARIABLES[t], "umbrales": ml.UMBRALES[t]}
        for t in ml.TIPOS
    ]


@router.get("/modelos")
async def listar_modelos(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_MODELOS)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    modelos = (
        await session.execute(
            select(ModeloIA).where(ModeloIA.idTenant == id_tenant).order_by(ModeloIA.tipo, ModeloIA.version.desc())
        )
    ).scalars().all()
    publicados = {m.tipo: m for m in modelos if m.estado == "Publicado"}
    return [_modelo_out(m, publicados.get(m.tipo)) for m in modelos]


@router.post("/modelos/entrenar")
async def entrenar(
    payload: EntrenarIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_MODELOS)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    """Pasos 4 a 6. Alternativo 4: solo datos de la empresa del actor."""
    hoy = ml.hoy_bolivia()
    reales = await ml.datos_ventas(session, id_tenant)
    cantidad = ml.contar_datos(payload.tipo, reales)
    # Alternativo 1.
    if cantidad < ml.MINIMOS[payload.tipo] and not payload.usarSinteticos:
        raise HTTPException(
            status_code=409,
            detail=f"Hay {cantidad} datos reales y el minimo es {ml.MINIMOS[payload.tipo]}: active los datos sinteticos para entrenar.",
        )
    sinteticos = ml.sinteticos_ventas(reales, payload.registros, payload.semanas, payload.estacionalidad, hoy) if payload.usarSinteticos else []
    variables = [v for v in payload.variables if v in ml.VARIABLES[payload.tipo]] or ml.VARIABLES[payload.tipo]
    devueltas = await ml.devueltas(session, id_tenant)
    disponible = await ml.stock_disponible(session, id_tenant)
    nombres = await ml.nombres_clientes(session, {v["idCliente"] for v in reales})
    version = (await session.scalar(
        select(func.coalesce(func.max(ModeloIA.version), 0)).where(ModeloIA.idTenant == id_tenant, ModeloIA.tipo == payload.tipo)
    )) + 1
    parametros = {"usarSinteticos": payload.usarSinteticos, "registros": payload.registros if payload.usarSinteticos else 0,
                  "semanas": payload.semanas, "estacionalidad": payload.estacionalidad, "variables": variables}
    modelo = ModeloIA(idTenant=id_tenant, tipo=payload.tipo, version=version, idUsuario=int(auth["sub"]), parametros=parametros)
    try:
        resultado = await asyncio.to_thread(
            ml.entrenar, payload.tipo, reales, sinteticos, disponible=disponible, devueltas_reales=devueltas,
            hoy=hoy, nombres=nombres, variables=variables,
        )
        modelo.estado, modelo.algoritmo = "Entrenado", resultado.algoritmo
        modelo.metricas, modelo.cumpleUmbral, modelo.resultados = resultado.metricas, resultado.cumple, resultado.resultados
        modelo.filasReales, modelo.filasSinteticas = resultado.filas_reales, resultado.filas_sinteticas
    except ml.DatosInsuficientes as exc:
        modelo.estado, modelo.error = "Fallido", str(exc)
        modelo.filasReales = cantidad
    except Exception as exc:  # noqa: BLE001 — alternativo 3: se registra y la publicada sigue
        logger.exception("Fallo el entrenamiento del modelo %s", payload.tipo)
        modelo.estado, modelo.error = "Fallido", f"Error al entrenar: {type(exc).__name__}"
        modelo.filasReales = cantidad
    session.add(modelo)
    await session.flush()
    await registrar_bitacora(session, f"Modelo IA {payload.tipo} v{version}: {modelo.estado}", int(auth["sub"]), _ip(request))
    await session.commit()
    return _modelo_out(modelo, await _publicado(session, id_tenant, payload.tipo))


@router.post("/modelos/{id_modelo}/publicar")
async def publicar(
    id_modelo: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_MODELOS)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    """Paso 7. Alternativo 2: si no alcanza el umbral, no se publica."""
    modelo = await session.get(ModeloIA, id_modelo)
    if modelo is None or modelo.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Modelo no encontrado")
    if modelo.estado != "Entrenado":
        raise HTTPException(status_code=409, detail=f"La version esta {modelo.estado}: no se puede publicar")
    if not modelo.cumpleUmbral:
        umbral = ", ".join(f"{k} >= {v}" for k, v in ml.UMBRALES[modelo.tipo].items())
        raise HTTPException(status_code=409, detail=f"Las metricas no alcanzan el minimo ({umbral}): no se puede publicar")
    anterior = await _publicado(session, id_tenant, modelo.tipo)
    if anterior is not None:
        anterior.estado = "Retirado"
        await session.flush()
    modelo.estado, modelo.fechaPublicacion = "Publicado", datetime.now(timezone.utc)
    await registrar_bitacora(session, f"Modelo IA {modelo.tipo} v{modelo.version} publicado", int(auth["sub"]), _ip(request))
    await session.commit()
    return _modelo_out(modelo)


# --- [CU30] ---------------------------------------------------------------------

async def _indicadores(session: AsyncSession, id_tenant: int, desde: date, hasta: date, sucursales: set[int] | None, categoria: str | None) -> dict:
    """Paso 2: ventas, ticket promedio, rotacion de stock y tasa de devoluciones."""
    lineas = reportes_ia.lineas_venta_con_sucursal()
    base = (
        select()
        .select_from(lineas)
        .join(Producto, Producto.idProducto == lineas.c.idProducto)
        .where(Producto.idTenant == id_tenant, lineas.c.fecha >= inicio_del_dia(desde), lineas.c.fecha <= fin_del_dia(hasta))
    )
    if sucursales is not None:
        base = base.where(lineas.c.codigoSucursal.in_(sorted(sucursales)))
    if categoria:
        base = base.where(Producto.tipo == categoria)
    monto, unidades, ventas = (await session.execute(base.with_only_columns(
        func.coalesce(func.sum(lineas.c.monto), 0), func.coalesce(func.sum(lineas.c.cantidad), 0), func.count(func.distinct(lineas.c.idVenta))
    ))).one()
    semana = func.date_trunc("week", func.timezone(ZONA_BOLIVIA_SQL, lineas.c.fecha))
    serie = (await session.execute(
        base.with_only_columns(semana.label("semana"), func.sum(lineas.c.monto).label("monto")).group_by(semana).order_by(semana)
    )).all()
    stock = select(func.coalesce(func.sum(Inventario.cantidad_actual - Inventario.cantidad_reservada), 0)).join(
        Producto, Producto.idProducto == Inventario.idProducto
    ).join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal).where(Sucursal.idTenant == id_tenant)
    devoluciones = select(func.coalesce(func.sum(Devolucion.cantidad), 0)).join(Producto, Producto.idProducto == Devolucion.idProducto).where(
        Devolucion.idTenant == id_tenant, Devolucion.fecha >= inicio_del_dia(desde), Devolucion.fecha <= fin_del_dia(hasta),
        Devolucion.estado.not_in(("Rechazada", "Anulada", "Cancelada")),
    )
    if sucursales is not None:
        stock = stock.where(Inventario.codigoSucursal.in_(sorted(sucursales)))
        devoluciones = devoluciones.where(Devolucion.codigoSucursal.in_(sorted(sucursales)))
    if categoria:
        stock = stock.where(Producto.tipo == categoria)
        devoluciones = devoluciones.where(Producto.tipo == categoria)
    disponible = int(await session.scalar(stock) or 0)
    devueltas = int(await session.scalar(devoluciones) or 0)
    unidades = int(unidades)
    return {
        "ventas": round(float(monto), 2), "unidades": unidades, "cantidadVentas": int(ventas),
        "ticketPromedio": round(float(monto) / ventas, 2) if ventas else 0.0,
        # Rotacion del periodo: unidades vendidas por cada unidad disponible hoy.
        "rotacionStock": round(unidades / disponible, 2) if disponible else None, "stockDisponible": disponible,
        "tasaDevoluciones": round(devueltas * 100 / unidades, 1) if unidades else 0.0, "unidadesDevueltas": devueltas,
        "serieSemanal": [{"semana": s.date().isoformat(), "monto": round(float(m), 2)} for s, m in serie],
    }


def _interpretacion_reglas(ind: dict, demanda: list, segmentos: list, anomalias: list, devolucion: list) -> str:
    partes = [f"En el periodo se vendieron Bs {ind['ventas']:,.2f} ({ind['unidades']} prendas) con un ticket promedio de Bs {ind['ticketPromedio']:,.2f}."]
    if demanda:
        total = sum(p["total"] for p in demanda)
        urgentes = [p for p in demanda if p["reponer"] > 0]
        texto = f"Para las proximas 4 semanas se esperan unas {total:,.0f} prendas"
        if urgentes:
            u = urgentes[0]
            texto += f"; {len(urgentes)} producto(s) necesitan reposicion, el mas urgente {u['producto']} talla {u['talla']} en {u['sucursal']} ({u['reponer']} unidades)"
        partes.append(texto + ".")
    if devolucion:
        d = devolucion[0]
        partes.append(f"La talla con mayor probabilidad de devolucion es {d['talla']} de {d['categoria']} ({d['probabilidad'] * 100:.0f}%).")
    if segmentos:
        mayor = max(segmentos, key=lambda s: s["clientes"])
        partes.append(f"Hay {len(segmentos)} segmentos de clientes; el mas grande es '{mayor['segmento']}' con {mayor['clientes']} clientes.")
    if anomalias:
        partes.append(f"Se detectaron {len(anomalias)} anomalia(s) para revisar, por ejemplo: {anomalias[0]['detalle']}.")
    return " ".join(partes)


async def _interpretacion(ind, demanda, segmentos, anomalias, devolucion) -> tuple[str, str]:
    base = _interpretacion_reglas(ind, demanda, segmentos, anomalias, devolucion)
    try:
        cliente = reportes_ia._client()
        datos = json.dumps({"indicadores": {k: v for k, v in ind.items() if k != "serieSemanal"}, "demanda": demanda[:10],
                            "segmentos": segmentos, "anomalias": anomalias[:5], "devolucionPorTalla": devolucion[:5]}, default=str, ensure_ascii=False)
        respuesta = await asyncio.wait_for(cliente.aio.models.generate_content(
            model=reportes_ia.MODEL, contents=datos,
            config=reportes_ia.types.GenerateContentConfig(system_instruction=(
                "Interpreta para la gerencia de una tienda de ropa, en 3 o 4 oraciones en espanol, estos indicadores y "
                "resultados de modelos. Usa solo los numeros entregados y termina con una recomendacion concreta.")),
        ), timeout=30)
        if (respuesta.text or "").strip():
            return respuesta.text.strip(), reportes_ia.MODEL
    except reportes_ia.GeminiNoConfigurado:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("Interpretacion del dashboard por reglas: %s", exc)
    return base, reportes_ia.MOTOR_REGLAS


@router.get("/dashboard")
async def dashboard(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    categoria: str | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    hoy = ml.hoy_bolivia()
    hasta = fecha_hasta or hoy
    desde = fecha_desde or (hasta - timedelta(days=89))
    visibles = await alcance_sucursales(session, auth)
    # Alternativo 2: el Encargado solo ve sus sucursales.
    if codigoSucursal is not None:
        sucursales = {codigoSucursal} if visibles is None or codigoSucursal in visibles else set()
    else:
        sucursales = visibles
    disponibles = (await session.execute(
        select(Sucursal.codigoSucursal, Sucursal.nombre).where(Sucursal.idTenant == id_tenant).order_by(Sucursal.nombre)
    )).all()
    categorias = sorted(c for c in (await session.execute(
        select(Producto.tipo).where(Producto.idTenant == id_tenant, Producto.tipo.is_not(None)).distinct()
    )).scalars())
    salida = {
        "filtros": {"fecha_desde": desde.isoformat(), "fecha_hasta": hasta.isoformat(), "codigoSucursal": codigoSucursal, "categoria": categoria},
        "sucursales": [{"codigoSucursal": c, "nombre": n} for c, n in disponibles if visibles is None or c in visibles],
        "categorias": categorias, "restringido": visibles is not None,
        "indicadores": await _indicadores(session, id_tenant, desde, hasta, sucursales, categoria),
    }
    # Alternativo 3: sin IA en el plan, solo los indicadores convencionales.
    ctx = await cargar_contexto(session, id_tenant)
    if not ctx.permite("permiteIA"):
        salida.update(iaDisponible=False, motivoIA=f"Funcionalidad no incluida en su plan ({ctx.plan.nombre}). Mejore su plan para ver las predicciones.")
        return salida
    modelos = {m.tipo: m for m in (await session.execute(
        select(ModeloIA).where(ModeloIA.idTenant == id_tenant, ModeloIA.estado == "Publicado")
    )).scalars()}
    # Alternativo 1: sin modelos publicados, acceso al CU29.
    if not modelos:
        salida.update(iaDisponible=True, sinModelos=True, modelos=[])
        return salida

    def en_sucursal(cod) -> bool:
        return sucursales is None or cod in sucursales

    demanda = [p for p in (modelos["demanda"].resultados.get("predicciones", []) if "demanda" in modelos else [])
               if en_sucursal(p["codigoSucursal"]) and (not categoria or p["categoria"] == categoria)]
    devolucion = [d for d in (modelos["devolucion"].resultados.get("porTalla", []) if "devolucion" in modelos else [])
                  if not categoria or d["categoria"] == categoria]
    anomalias = [a for a in (modelos["anomalias"].resultados.get("anomalias", []) if "anomalias" in modelos else [])
                 if en_sucursal(a["codigoSucursal"]) and (not a["fecha"] or desde.isoformat() <= a["fecha"] <= hasta.isoformat())]
    segmentos = []
    if "segmentacion" in modelos:
        resultados = modelos["segmentacion"].resultados
        if sucursales is None:
            segmentos = resultados.get("segmentos", [])
        else:
            # Los segmentos del Encargado se recalculan con los clientes de sus sucursales.
            clientes = [c for c in resultados.get("clientes", []) if set(c["sucursales"]) & sucursales]
            por_segmento: dict[str, list] = {}
            for c in clientes:
                por_segmento.setdefault(c["segmento"], []).append(c)
            segmentos = [
                {"segmento": s, "clientes": len(cs), "recencia": round(sum(c["recencia"] for c in cs) / len(cs), 1),
                 "frecuencia": round(sum(c["frecuencia"] for c in cs) / len(cs), 1), "monto": round(sum(c["monto"] for c in cs) / len(cs), 1)}
                for s, cs in por_segmento.items()
            ]
    interpretacion, motor = await _interpretacion(salida["indicadores"], demanda, segmentos, anomalias, devolucion)
    salida.update(
        iaDisponible=True, sinModelos=False,
        semanasPrediccion=modelos["demanda"].resultados.get("semanas", []) if "demanda" in modelos else [],
        demanda=demanda[:20], devolucionPorTalla=devolucion[:12], segmentos=segmentos, anomalias=anomalias[:15],
        modelos=[{"tipo": m.tipo, "etiqueta": ml.ETIQUETAS[m.tipo], "version": m.version, "algoritmo": m.algoritmo, "metricas": m.metricas,
                  "conSinteticos": m.filasSinteticas > 0, "fechaEntrenamiento": m.fechaEntrenamiento} for m in modelos.values()],
        interpretacion=interpretacion, motorInterpretacion=motor,
    )
    return salida
