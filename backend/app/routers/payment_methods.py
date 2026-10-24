from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import MetodoPago
from app.schemas.fase2 import MetodoPagoIn, MetodoPagoOut, MetodoPagoUpdate
from app.security import get_current_payload, require_permiso
from app.services.bitacora import Actor, actor_actual, auditar

router = APIRouter(prefix="/api/payment-methods", tags=["payment-methods"])


def _solo_staff(payload: dict = Depends(get_current_payload)) -> dict:
    """Crear o editar un metodo de pago es tarea de caja (staff). El Cliente
    tiene "venta.crear" para la compra en linea (migracion 007), y con solo
    ese permiso podia editar el monto/estado de CUALQUIER fila de metodo_pago,
    incluidos los cobros con tarjeta de otros clientes."""
    permisos = payload.get("permisos", [])
    es_caja = "venta.crear" in permisos and "venta.ver" in permisos
    # El Encargado cobra el saldo al confirmar una reserva en sucursal.
    if not es_caja and "reserva.gestionar" not in permisos:
        raise HTTPException(status_code=403, detail="No tiene permiso para registrar cobros")
    return payload


@router.get("", response_model=list[MetodoPagoOut])
async def list_payment_methods(
    todos: bool = False,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.ver")),
):
    """Por defecto, solo los metodos que todavia se pueden usar: cada fila es
    de un solo uso (metodo_pago_guard), y antes la lista traia tambien las ya
    consumidas, asi que confirmar una reserva eligiendo una fallaba con
    "El metodo de pago ya fue utilizado". `todos=true` devuelve el historial."""
    stmt = select(MetodoPago).order_by(MetodoPago.idMetPago)
    if not todos:
        stmt = stmt.where(
            MetodoPago.consumidoEn.is_(None),
            or_(MetodoPago.idUserPago.is_(None), MetodoPago.idUserPago == int(auth["sub"])),
        )
    rows = (await session.execute(stmt)).scalars().all()
    return rows


@router.post("", response_model=MetodoPagoOut, status_code=201)
async def create_payment_method(
    payload: MetodoPagoIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(_solo_staff),
):
    if payload.monto < 0:
        raise HTTPException(status_code=400, detail="monto no puede ser negativo")
    m = MetodoPago(**payload.model_dump())
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@router.put("/{idMetPago}", response_model=MetodoPagoOut)
async def update_payment_method(
    idMetPago: int,
    payload: MetodoPagoUpdate,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(_solo_staff),
):
    m = await session.get(MetodoPago, idMetPago)
    if not m:
        raise HTTPException(status_code=404, detail="Metodo de pago no encontrado")
    if m.origen == "tarjeta_stripe" or m.consumidoEn is not None:
        # Un cobro de Stripe refleja lo que Stripe confirmo y uno consumido ya
        # respalda una venta/reserva: cambiarlos falsearia la conciliacion.
        raise HTTPException(status_code=409, detail="Este metodo de pago ya no se puede modificar")
    data = payload.model_dump(exclude_unset=True)
    if "monto" in data and data["monto"] < 0:
        raise HTTPException(status_code=400, detail="monto no puede ser negativo")
    for k, v in data.items():
        setattr(m, k, v)
    await auditar(session, actor, f"Método de pago #{idMetPago} modificado")
    await session.commit()
    await session.refresh(m)
    return m


@router.delete("/{idMetPago}", status_code=204)
async def delete_payment_method(
    idMetPago: int,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("usuario.admin")),
):
    m = await session.get(MetodoPago, idMetPago)
    if not m:
        raise HTTPException(status_code=404, detail="Metodo de pago no encontrado")
    if m.consumidoEn is not None:
        # Lo referencia una Venta/Reserva: borrarlo violaba la FK (500).
        raise HTTPException(status_code=409, detail="El metodo de pago ya fue utilizado y no se puede eliminar")
    await session.delete(m)
    await auditar(session, actor, f"Método de pago #{idMetPago} eliminado")
    await session.commit()
