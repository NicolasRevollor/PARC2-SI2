from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import MetodoPago
from app.schemas.fase2 import MetodoPagoIn, MetodoPagoOut, MetodoPagoUpdate
from app.security import require_permiso

router = APIRouter(prefix="/api/payment-methods", tags=["payment-methods"])


@router.get("", response_model=list[MetodoPagoOut])
async def list_payment_methods(session: AsyncSession = Depends(get_db),
                               _=Depends(require_permiso("venta.ver"))):
    rows = (await session.execute(select(MetodoPago).order_by(MetodoPago.idMetPago))).scalars().all()
    return rows


@router.post("", response_model=MetodoPagoOut, status_code=201)
async def create_payment_method(
    payload: MetodoPagoIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("venta.crear")),
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
    _=Depends(require_permiso("venta.crear")),
):
    m = await session.get(MetodoPago, idMetPago)
    if not m:
        raise HTTPException(status_code=404, detail="Metodo de pago no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "monto" in data and data["monto"] < 0:
        raise HTTPException(status_code=400, detail="monto no puede ser negativo")
    for k, v in data.items():
        setattr(m, k, v)
    await session.commit()
    await session.refresh(m)
    return m


@router.delete("/{idMetPago}", status_code=204)
async def delete_payment_method(
    idMetPago: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    m = await session.get(MetodoPago, idMetPago)
    if not m:
        raise HTTPException(status_code=404, detail="Metodo de pago no encontrado")
    await session.delete(m)
    await session.commit()
