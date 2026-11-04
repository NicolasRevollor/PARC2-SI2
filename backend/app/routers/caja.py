# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU20] Gestionar apertura y cierre de caja
# Pantalla (boundary) que lo usa: web/src/app/features/caja/caja.component.ts
# Reglas: services/caja.py
# ==================================================================
"""Apertura, arqueo y cierre de caja (CU20)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Caja, MovimientoCaja, Sucursal, Usuario
from app.schemas.sincronizacion import AbrirCajaIn, CajaOut, CerrarCajaIn, MovimientoCajaOut
from app.security import require_permiso
from app.services import caja as srv
from app.services.alcance import alcance_sucursales
from app.services.bitacora import Actor, actor_actual, auditar
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/caja", tags=["caja"])

PERMISO_OPERAR = "caja.operar"
PERMISO_APROBAR = "caja.aprobar"


async def _nombre(session: AsyncSession, id_user: int | None) -> str | None:
    usuario = await session.get(Usuario, id_user) if id_user else None
    return usuario.nombre if usuario else None


async def _caja_out(session: AsyncSession, caja: Caja) -> CajaOut:
    ingresos, egresos = await srv.totales(session, caja.idCaja)
    sucursal = await session.get(Sucursal, caja.codigoSucursal)
    esperado = srv.dinero(caja.montoInicial) + ingresos - egresos
    config = await srv.configuracion(session, caja.idTenant)
    return CajaOut(
        idCaja=caja.idCaja,
        uuidOperacion=str(caja.uuidOperacion),
        origenRegistro=caja.origenRegistro,
        codigoSucursal=caja.codigoSucursal,
        sucursal=sucursal.nombre if sucursal else None,
        estado=caja.estado,
        montoInicial=float(caja.montoInicial),
        fechaApertura=caja.fechaApertura,
        usuarioApertura=await _nombre(session, caja.idUsuarioApertura),
        fechaCierre=caja.fechaCierre,
        usuarioCierre=await _nombre(session, caja.idUsuarioCierre),
        efectivoContado=float(caja.efectivoContado) if caja.efectivoContado is not None else None,
        ingresos=float(ingresos),
        egresos=float(egresos),
        montoEsperado=float(esperado),
        diferencia=float(caja.diferencia) if caja.diferencia is not None else None,
        justificacion=caja.justificacion,
        aprobador=await _nombre(session, caja.idAprobador),
        operacionesPendientes=len(caja.operacionesPendientes or []),
        resumen=await srv.resumen_por_concepto(session, caja.idCaja),
        umbralDiferencia=float(config.umbralDiferenciaCaja),
    )


async def _exigir_sucursal(session: AsyncSession, auth: dict, id_tenant: int, codigo: int) -> None:
    sucursal = await session.get(Sucursal, codigo)
    visibles = await alcance_sucursales(session, auth)
    if sucursal is None or sucursal.idTenant != id_tenant or (visibles is not None and codigo not in visibles):
        raise HTTPException(status_code=403, detail="No esta asignado a esa sucursal")


async def _caja_de_la_empresa(session: AsyncSession, id_caja: int, auth: dict, id_tenant: int) -> Caja:
    caja = await session.get(Caja, id_caja)
    if caja is None or caja.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Caja no encontrada")
    await _exigir_sucursal(session, auth, id_tenant, caja.codigoSucursal)
    return caja


@router.get("/actual", response_model=CajaOut | None)
async def caja_actual(
    codigoSucursal: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_OPERAR)),
    id_tenant: int = Depends(tenant_actual),
):
    await _exigir_sucursal(session, auth, id_tenant, codigoSucursal)
    caja = await session.scalar(select(Caja).where(Caja.codigoSucursal == codigoSucursal, Caja.estado == srv.ABIERTA))
    return await _caja_out(session, caja) if caja else None


# ==== [CU20] ControlCaja.abrirCaja() ===============================
# Pasos 1-2. Flujo alternativo 3: si ya esta abierta, se muestra la existente.
# ===================================================================
@router.post("/abrir", response_model=CajaOut)
async def abrir_caja(
    payload: AbrirCajaIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    auth: dict = Depends(require_permiso(PERMISO_OPERAR)),
    id_tenant: int = Depends(tenant_actual),
):
    await _exigir_sucursal(session, auth, id_tenant, payload.codigoSucursal)
    caja = await srv.caja_abierta(session, payload.codigoSucursal)
    if caja is None:
        caja = Caja(
            codigoSucursal=payload.codigoSucursal, idTenant=id_tenant, idUsuarioApertura=actor.id_user,
            montoInicial=srv.dinero(payload.montoInicial),
        )
        session.add(caja)
        await session.flush()
        await auditar(session, actor, f"Caja {caja.idCaja} abierta con Bs {payload.montoInicial:.2f}")
    await session.commit()
    return await _caja_out(session, caja)


# ==== [CU20] ControlCaja.cerrarCaja() ==============================
# Pasos 4-6 y flujos alternativos 1 y 2.
# ===================================================================
@router.post("/{idCaja}/cerrar", response_model=CajaOut)
async def cerrar_caja(
    idCaja: int,
    payload: CerrarCajaIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    auth: dict = Depends(require_permiso(PERMISO_OPERAR)),
    id_tenant: int = Depends(tenant_actual),
):
    caja = await _caja_de_la_empresa(session, idCaja, auth, id_tenant)
    if caja.estado != srv.ABIERTA:
        raise HTTPException(status_code=409, detail=f"La caja ya esta {caja.estado}")
    await srv.cerrar_caja(
        session, caja, contado=payload.efectivoContado, justificacion=payload.justificacion, id_usuario=actor.id_user,
        puede_aprobar=PERMISO_APROBAR in auth.get("permisos", []),
        pendientes=[str(u) for u in payload.operacionesPendientes], exigir_justificacion=True,
    )
    await auditar(session, actor, f"Caja {caja.idCaja}: {caja.estado}, diferencia Bs {caja.diferencia}")
    await session.commit()
    return await _caja_out(session, caja)


@router.post("/{idCaja}/aprobar", response_model=CajaOut)
async def aprobar_cierre(
    idCaja: int,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    auth: dict = Depends(require_permiso(PERMISO_APROBAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """[CU20] flujo alternativo 1: el Encargado aprueba la diferencia."""
    caja = await _caja_de_la_empresa(session, idCaja, auth, id_tenant)
    if caja.estado != srv.POR_APROBAR:
        raise HTTPException(status_code=409, detail="La caja no espera aprobacion")
    caja.estado = srv.CERRADA
    caja.idAprobador = actor.id_user
    caja.fechaAprobacion = datetime.now(timezone.utc)
    await auditar(session, actor, f"Cierre de caja {caja.idCaja} aprobado (diferencia Bs {caja.diferencia})")
    await session.commit()
    return await _caja_out(session, caja)


@router.get("/historial", response_model=list[CajaOut])
async def historial(
    codigoSucursal: int | None = None,
    limite: int = Query(default=30, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_OPERAR)),
    id_tenant: int = Depends(tenant_actual),
):
    stmt = select(Caja).where(Caja.idTenant == id_tenant).order_by(Caja.fechaApertura.desc()).limit(limite)
    visibles = await alcance_sucursales(session, auth)
    if codigoSucursal is not None:
        await _exigir_sucursal(session, auth, id_tenant, codigoSucursal)
        stmt = stmt.where(Caja.codigoSucursal == codigoSucursal)
    elif visibles is not None:
        stmt = stmt.where(Caja.codigoSucursal.in_(visibles))
    return [await _caja_out(session, c) for c in (await session.execute(stmt)).scalars().all()]


@router.get("/{idCaja}/movimientos", response_model=list[MovimientoCajaOut])
async def movimientos(
    idCaja: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_OPERAR)),
    id_tenant: int = Depends(tenant_actual),
):
    await _caja_de_la_empresa(session, idCaja, auth, id_tenant)
    filas = (
        await session.execute(
            select(MovimientoCaja, Usuario.nombre)
            .outerjoin(Usuario, Usuario.idUser == MovimientoCaja.idUsuario)
            .where(MovimientoCaja.idCaja == idCaja)
            .order_by(MovimientoCaja.fecha)
        )
    ).all()
    return [
        MovimientoCajaOut(
            idMovimientoCaja=m.idMovimientoCaja, tipo=m.tipo, concepto=m.concepto, etiqueta=srv.ETIQUETAS.get(m.concepto, m.concepto),
            monto=float(m.monto), referencia=m.referencia, fecha=m.fecha, usuario=nombre,
        )
        for m, nombre in filas
    ]
