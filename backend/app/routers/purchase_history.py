from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente, DetalleVenta, Historial, Producto, Venta
from app.schemas.fase2 import PurchaseHistoryItem
from app.security import get_current_payload

router = APIRouter(prefix="/api/purchase-history", tags=["purchase-history"])


@router.get("", response_model=list[PurchaseHistoryItem])
async def purchase_history(
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    permisos = payload.get("permisos", [])
    user_id = int(payload["sub"])

    if "venta.ver" in permisos:
        historial = (
            await session.execute(select(Historial).order_by(Historial.fecha.desc()))
        ).scalars().all()
    else:
        cliente = (
            await session.execute(select(Cliente).where(Cliente.idUser == user_id))
        ).scalar_one_or_none()
        if cliente is None:
            return []
        historial = (
            await session.execute(
                select(Historial)
                .where(Historial.idCliente == cliente.idCliente)
                .order_by(Historial.fecha.desc())
            )
        ).scalars().all()

    resultado = []
    for h in historial:
        venta = await session.get(Venta, h.idVenta)
        producto = await session.get(Producto, h.idProducto)
        detalle = (
            await session.execute(
                select(DetalleVenta).where(
                    DetalleVenta.idVenta == h.idVenta,
                    DetalleVenta.idProducto == h.idProducto,
                )
            )
        ).scalar_one_or_none()
        resultado.append(
            PurchaseHistoryItem(
                idVenta=h.idVenta,
                fecha=venta.fecha if venta else h.fecha,
                total=float(venta.total) if venta else 0.0,
                idProducto=h.idProducto,
                producto_nombre=producto.nombre if producto else None,
                cantidad=detalle.cantidad if detalle else 0,
                precio_unitario=float(detalle.precio_unitario) if detalle else 0.0,
                codigoHistorial=h.codigoHistorial,
            )
        )
    return resultado
