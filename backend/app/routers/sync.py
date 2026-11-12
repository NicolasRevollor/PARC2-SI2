# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU12] Preparar dispositivo   -> GET /api/sync/preparacion, GET /api/sync/snapshot/{seccion}
# [CU16] Consultar resultado    -> POST /api/sync/estado, GET /api/sync/registro
# [CU17] Sincronizar            -> POST /api/sync/lote
# [CU18] Resolver conflictos    -> GET /api/sync/conflictos, POST /api/sync/conflictos/{id}/resolver
# Reglas: services/operaciones_offline.py, services/conflictos.py, services/preparacion.py
# ==================================================================
"""Operacion sin conexion: preparacion, sincronizacion y conflictos (CU12, CU16-CU18, RNF10)."""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ConflictoSincronizacion, RegistroSincronizacion, Sucursal, Usuario
from app.schemas.sincronizacion import (
    ConfiguracionIn,
    ConfiguracionOut,
    ConflictoOut,
    EstadoOperacionesIn,
    LoteIn,
    LoteOut,
    PaginaSnapshotOut,
    PreparacionOut,
    ResolverConflictoIn,
    ResultadoOperacionOut,
)
from app.security import get_current_payload, require_permiso
from app.services import caja as caja_srv
from app.services import conflictos as conf
from app.services import notificaciones as notif
from app.services import operaciones_offline as ofl
from app.services import preparacion as prep
from app.services import sincronizacion as sync
from app.services.alcance import alcance_sucursales
from app.services.bitacora import Actor, actor_actual, auditar
from app.services.tenancy import ContextoTenant, require_feature, tenant_actual

router = APIRouter(prefix="/api/sync", tags=["sync"])

PERMISO_RESOLVER = "sync.resolver"


class RegistroSincronizacionOut(BaseModel):
    idRegistro: int
    uuidOperacion: str
    tipoOperacion: str
    resultado: str
    detalle: str | None
    idReferencia: int | None
    fechaOperacion: datetime | None
    fechaRecepcion: datetime
    dispositivo: str | None
    usuario: str | None


@router.get("/registro", response_model=list[RegistroSincronizacionOut])
async def registro_sincronizacion(
    resultado: str | None = Query(default=None, description="Aplicada, Duplicada, Rechazada o Conflicto"),
    limite: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso("venta.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    """Operaciones recibidas de la cola de los dispositivos de la empresa, la
    mas reciente primero, con su resultado."""
    stmt = (
        select(RegistroSincronizacion, Usuario.nombre)
        .outerjoin(Usuario, Usuario.idUser == RegistroSincronizacion.idUsuario)
        .where(RegistroSincronizacion.idTenant == id_tenant)
        .order_by(RegistroSincronizacion.fechaRecepcion.desc())
        .limit(limite)
    )
    if resultado:
        stmt = stmt.where(RegistroSincronizacion.resultado == resultado)
    return [
        RegistroSincronizacionOut(
            idRegistro=r.idRegistro,
            uuidOperacion=str(r.uuidOperacion),
            tipoOperacion=r.tipoOperacion,
            resultado=r.resultado,
            detalle=r.detalle,
            idReferencia=r.idReferencia,
            fechaOperacion=r.fechaOperacion,
            fechaRecepcion=r.fechaRecepcion,
            dispositivo=r.dispositivo,
            usuario=nombre,
        )
        for r, nombre in (await session.execute(stmt)).all()
    ]


# --- [CU12] Preparar dispositivo ---------------------------------------------

async def _sucursal_autorizada(session: AsyncSession, auth: dict, id_tenant: int, codigo: int) -> set[int] | None:
    sucursal = await session.get(Sucursal, codigo)
    autorizadas = await alcance_sucursales(session, auth)
    if sucursal is None or sucursal.idTenant != id_tenant or (autorizadas is not None and codigo not in autorizadas):
        raise HTTPException(status_code=403, detail="No esta asignado a esa sucursal")
    return autorizadas


def _configuracion_out(fila) -> ConfiguracionOut:
    return ConfiguracionOut(
        horasDatosVigentes=fila.horasDatosVigentes,
        horasSesionSinConexion=fila.horasSesionSinConexion,
        permiteVentaSinStock=fila.permiteVentaSinStock,
        umbralDiferenciaCaja=float(fila.umbralDiferenciaCaja),
        umbralConflicto=float(fila.umbralConflicto),
        horasRetiroReserva=fila.horasRetiroReserva,
    )


@router.get("/sucursales")
async def mis_sucursales(
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """[CU12] [CU20]: las sucursales en las que trabaja el usuario (todas si no tiene asignadas)."""
    visibles = await alcance_sucursales(session, auth)
    stmt = select(Sucursal.codigoSucursal, Sucursal.nombre).where(Sucursal.idTenant == id_tenant).order_by(Sucursal.nombre)
    if visibles is not None:
        stmt = stmt.where(Sucursal.codigoSucursal.in_(sorted(visibles)))
    return [{"codigoSucursal": c, "nombre": n} for c, n in (await session.execute(stmt)).all()]


@router.get("/preparacion", response_model=PreparacionOut)
async def preparacion(
    codigoSucursal: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("inventario.ver")),
    id_tenant: int = Depends(tenant_actual),
    # [CU12] flujo alternativo 1: sin la funcion en el plan responde 402.
    _plan: ContextoTenant = Depends(require_feature("permiteOffline")),
):
    autorizadas = await _sucursal_autorizada(session, auth, id_tenant, codigoSucursal)
    sucursal = await session.get(Sucursal, codigoSucursal)
    config = await caja_srv.configuracion(session, id_tenant)
    generico = await ofl.cliente_generico(session, id_tenant)
    await session.commit()
    return PreparacionOut(
        idTenant=id_tenant,
        codigoSucursal=codigoSucursal,
        sucursalNombre=sucursal.nombre,
        idClienteGenerico=generico.idCliente,
        configuracion=_configuracion_out(config),
        secciones=await prep.contar(session, id_tenant, codigoSucursal, autorizadas),
        generadoEn=datetime.now(timezone.utc),
    )


@router.get("/snapshot/{seccion}", response_model=PaginaSnapshotOut)
async def snapshot(
    seccion: str,
    codigoSucursal: int,
    pagina: int = Query(default=1, ge=1),
    tam: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("inventario.ver")),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteOffline")),
):
    if seccion not in prep.SECCIONES:
        raise HTTPException(status_code=404, detail="Seccion desconocida")
    autorizadas = await _sucursal_autorizada(session, auth, id_tenant, codigoSucursal)
    total, items = await prep.pagina(session, seccion, id_tenant, codigoSucursal, autorizadas, pagina, tam)
    return PaginaSnapshotOut(seccion=seccion, pagina=pagina, total=total, hayMas=pagina * tam < total, items=items)


@router.get("/configuracion", response_model=ConfiguracionOut)
async def ver_configuracion(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    fila = await caja_srv.configuracion(session, id_tenant)
    await session.commit()
    return _configuracion_out(fila)


@router.put("/configuracion", response_model=ConfiguracionOut)
async def guardar_configuracion(
    payload: ConfiguracionIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _: dict = Depends(require_permiso("tenant.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    fila = await caja_srv.configuracion(session, id_tenant)
    for campo, valor in payload.model_dump().items():
        setattr(fila, campo, valor)
    await auditar(session, actor, "Configuracion de la operacion sin conexion actualizada")
    await session.commit()
    return _configuracion_out(fila)


# --- [CU17] Sincronizar operaciones pendientes -------------------------------

def _resultado_out(uuid: str, r: ofl.Resultado | None) -> ResultadoOperacionOut:
    if r is None:
        return ResultadoOperacionOut(uuidOperacion=uuid, estado="Desconocida")
    return ResultadoOperacionOut(
        uuidOperacion=uuid, estado=r.estado, idServidor=r.id_servidor, motivo=r.motivo, tipoConflicto=r.tipo_conflicto
    )


@router.post("/lote", response_model=LoteOut)
async def sincronizar_lote(
    payload: LoteIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """Procesa la cola del dispositivo en el orden en que se registro. Cada
    operacion va en su transaccion; si una falla por un error del servidor
    responde "Reintentar" y el dispositivo la conserva."""
    ctx = ofl.Contexto(
        session=session,
        id_tenant=id_tenant,
        id_usuario=int(auth["sub"]),
        # Token de sincronizacion de una empresa suspendida (/api/auth/refresh-sincronizacion).
        permisos=auth.get("permisosSync") or auth.get("permisos", []),
        ip=request.client.host if request.client else "0.0.0.0",
        dispositivo=sync.dispositivo(request),
    )
    resultados = []
    for operacion in payload.operaciones:
        uuid = str(operacion.uuidOperacion)
        try:
            resultados.append(_resultado_out(uuid, await ofl.procesar_operacion(ctx, operacion)))
        except Exception as exc:  # noqa: BLE001 — [CU17] flujo alternativo 3: nunca se pierde la operacion
            await session.rollback()
            ofl.logger.exception("Error al sincronizar %s", uuid)
            resultados.append(ResultadoOperacionOut(uuidOperacion=uuid, estado=ofl.REINTENTAR, motivo=type(exc).__name__))
    await caja_srv.revisar_cierres_provisionales(session, id_tenant)
    if ctx.conflictos_nuevos:
        # Una sola campanita por empresa y por dia: si el dispositivo reintenta
        # la sincronizacion, no se repite el mismo aviso (lo deduplica la referencia).
        hoy = datetime.now(timezone.utc).date().isoformat()
        await notif.notificar_personal(
            session, id_tenant, tipo="sincronizacion", referencia=f"conflictos-sync-{id_tenant}-{hoy}",
            titulo="Conflictos de sincronizacion",
            mensaje="Tenes operaciones sin conexion por revisar en Conflictos de sincronizacion.",
        )
    await session.commit()
    notif.programar_correos(background_tasks)
    return LoteOut(resultados=resultados, fechaServidor=datetime.now(timezone.utc))


@router.post("/estado", response_model=list[ResultadoOperacionOut])
async def estado_operaciones(
    payload: EstadoOperacionesIn,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """[CU16]: el dispositivo pregunta como quedaron sus operaciones (un conflicto
    pudo resolverse desde otro equipo)."""
    return [
        _resultado_out(str(u), await ofl.resultado_previo(session, str(u), id_tenant))
        for u in payload.uuids
    ]


# --- [CU18] Resolver conflictos ----------------------------------------------

async def _conflicto_out(session: AsyncSession, c: ConflictoSincronizacion, umbral) -> ConflictoOut:
    sucursal = await session.get(Sucursal, c.codigoSucursal) if c.codigoSucursal else None
    usuario = await session.get(Usuario, c.idUsuario) if c.idUsuario else None
    return ConflictoOut(
        idConflicto=c.idConflicto,
        uuidOperacion=str(c.uuidOperacion),
        tipoOperacion=c.tipoOperacion,
        tipoConflicto=c.tipoConflicto,
        etiqueta=conf.ETIQUETAS.get(c.tipoConflicto, c.tipoConflicto),
        motivo=c.motivo,
        monto=float(c.monto),
        estado=c.estado,
        resultado=c.resultado,
        decision=c.decision,
        observaciones=c.observaciones,
        alertaDiscrepancia=c.alertaDiscrepancia,
        idReferencia=c.idReferencia,
        codigoSucursal=c.codigoSucursal,
        sucursal=sucursal.nombre if sucursal else None,
        usuario=usuario.nombre if usuario else None,
        fechaOperacion=c.fechaOperacion,
        fechaRegistro=c.fechaRegistro,
        fechaResolucion=c.fechaResolucion,
        datosDispositivo=c.datosDispositivo,
        datosServidor=c.datosServidor or {},
        decisiones=list(conf.decisiones_de(c.tipoConflicto)),
        soloAdministrador=conf.solo_administrador(c.monto, umbral),
    )


async def _conflicto_visible(session: AsyncSession, id_conflicto: int, auth: dict, id_tenant: int) -> ConflictoSincronizacion:
    conflicto = await session.get(ConflictoSincronizacion, id_conflicto)
    visibles = await alcance_sucursales(session, auth)
    fuera = visibles is not None and conflicto is not None and conflicto.codigoSucursal not in visibles
    if conflicto is None or conflicto.idTenant != id_tenant or fuera:
        raise HTTPException(status_code=404, detail="Conflicto no encontrado")
    return conflicto


@router.get("/conflictos", response_model=list[ConflictoOut])
async def listar_conflictos(
    estado: str | None = Query(default="Pendiente"),
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_RESOLVER)),
    id_tenant: int = Depends(tenant_actual),
):
    stmt = (
        select(ConflictoSincronizacion)
        .where(ConflictoSincronizacion.idTenant == id_tenant)
        .order_by(ConflictoSincronizacion.fechaRegistro.desc())
        .limit(200)
    )
    if estado:
        stmt = stmt.where(ConflictoSincronizacion.estado == estado)
    visibles = await alcance_sucursales(session, auth)
    if visibles is not None:
        stmt = stmt.where(ConflictoSincronizacion.codigoSucursal.in_(visibles))
    umbral = (await caja_srv.configuracion(session, id_tenant)).umbralConflicto
    return [await _conflicto_out(session, c, umbral) for c in (await session.execute(stmt)).scalars().all()]


@router.post("/conflictos/{idConflicto}/resolver", response_model=ConflictoOut)
async def resolver_conflicto(
    idConflicto: int,
    payload: ResolverConflictoIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_RESOLVER)),
    id_tenant: int = Depends(tenant_actual),
):
    conflicto = await _conflicto_visible(session, idConflicto, auth, id_tenant)
    umbral = (await caja_srv.configuracion(session, id_tenant)).umbralConflicto
    ctx = ofl.Contexto(
        session=session, id_tenant=id_tenant, id_usuario=int(auth["sub"]), permisos=auth.get("permisos", []),
        ip=request.client.host if request.client else "0.0.0.0", dispositivo=sync.dispositivo(request),
    )
    conflicto = await conf.resolver(ctx, conflicto, payload, umbral=umbral)
    notif.programar_correos(background_tasks)
    return await _conflicto_out(session, conflicto, umbral)
