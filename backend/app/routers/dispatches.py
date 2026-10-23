from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Inventario, Movimiento, Producto, Sucursal
from app.schemas.dispatches import (
    DispatchIn,
    DispatchOut,
    MovimientoOut,
)
from app.security import require_permiso
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/dispatches", tags=["dispatches"])


def _generar_referencia() -> str:
    return f"DSP-{datetime.now(timezone.utc):%Y%m%d-%H%M%S%f}"


async def _serialize_movimiento(mov: Movimiento, session: AsyncSession) -> MovimientoOut:
    inv = await session.get(Inventario, mov.idInv)
    suc = await session.get(Sucursal, inv.codigoSucursal) if inv else None
    prod = await session.get(Producto, inv.idProducto) if inv else None
    return MovimientoOut(
        idMov=mov.idMov,
        tipo=mov.tipo,
        cantidad=mov.cantidad,
        fecha=mov.fecha,
        motivo=mov.motivo,
        idInv=mov.idInv,
        sucursal_nombre=suc.nombre if suc else None,
        idProducto=inv.idProducto if inv else None,
        producto_nombre=prod.nombre if prod else None,
    )


@router.post("", response_model=DispatchOut, status_code=201)
async def create_dispatch(
    payload: DispatchIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("inventario.traspasar")),
    id_tenant: int = Depends(tenant_actual),
):
    if payload.origen == payload.destino:
        raise HTTPException(status_code=400, detail="Origen y destino deben ser distintos")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Debe enviar al menos un item")

    origen = await session.get(Sucursal, payload.origen)
    destino = await session.get(Sucursal, payload.destino)
    if (
        not origen
        or not destino
        or origen.idTenant != id_tenant
        or destino.idTenant != id_tenant
    ):
        raise HTTPException(status_code=404, detail="Sucursal origen o destino inexistente")

    referencia = _generar_referencia()
    movimientos_creados = []

    for item in payload.items:
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="cantidad debe ser > 0")

        inv_origen = (
            await session.execute(
                select(Inventario).where(
                    Inventario.codigoSucursal == payload.origen,
                    Inventario.idProducto == item.idProducto,
                )
            )
        ).scalar_one_or_none()
        inv_destino = (
            await session.execute(
                select(Inventario).where(
                    Inventario.codigoSucursal == payload.destino,
                    Inventario.idProducto == item.idProducto,
                )
            )
        ).scalar_one_or_none()

        if not inv_origen:
            raise HTTPException(
                status_code=404,
                detail=f"Sin inventario del producto {item.idProducto} en sucursal origen",
            )
        # Lo reservado no se puede trasladar: esas unidades ya estan
        # comprometidas con una reserva de ESTA sucursal.
        if inv_origen.cantidad_actual - inv_origen.cantidad_reservada < item.cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente del producto {item.idProducto} en origen",
            )

        inv_origen.cantidad_actual -= item.cantidad
        if inv_destino is None:
            inv_destino = Inventario(
                cantidad_actual=0,
                cantidad_reservada=0,
                codigoSucursal=payload.destino,
                idProducto=item.idProducto,
            )
            session.add(inv_destino)
            await session.flush()
        inv_destino.cantidad_actual += item.cantidad

        mov_salida = Movimiento(
            tipo="salida_traspaso",
            cantidad=-item.cantidad,
            motivo=payload.motivo,
            idInv=inv_origen.idInv,
            referencia=referencia,
        )
        mov_entrada = Movimiento(
            tipo="entrada_traspaso",
            cantidad=item.cantidad,
            motivo=payload.motivo,
            idInv=inv_destino.idInv,
            referencia=referencia,
        )
        session.add_all([mov_salida, mov_entrada])
        await session.flush()
        movimientos_creados.append(mov_salida)
        movimientos_creados.append(mov_entrada)

    await session.commit()

    movs_out = [await _serialize_movimiento(m, session) for m in movimientos_creados]
    return DispatchOut(
        referencia=referencia,
        motivo=payload.motivo,
        fecha=movimientos_creados[-1].fecha,
        movimientos=movs_out,
    )


@router.get("", response_model=list[DispatchOut])
async def list_dispatches(session: AsyncSession = Depends(get_db),
                          _=Depends(require_permiso("inventario.ver")),
                          id_tenant: int = Depends(tenant_actual)):
    # Solo traspasos ("DSP-..."): "referencia" tambien la usan los ingresos de
    # lote ("Proveedor N"), devoluciones ("DEV-N") y cambios ("CAM-N"), que
    # antes aparecian aca agrupados como si fueran despachos.
    stmt = (
        select(Movimiento)
        .join(Inventario, Inventario.idInv == Movimiento.idInv)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .where(
            Movimiento.referencia.like("DSP-%"),
            Movimiento.tipo.in_(("salida_traspaso", "entrada_traspaso")),
            Sucursal.idTenant == id_tenant,
        )
        .order_by(Movimiento.fecha.desc())
    )
    movimientos = (await session.execute(stmt)).scalars().all()

    grupos: dict[str, list[Movimiento]] = {}
    for mov in movimientos:
        grupos.setdefault(mov.referencia, []).append(mov)

    resultado = []
    for ref in sorted(grupos.keys(), key=lambda r: r, reverse=True):
        grupo = grupos[ref]
        grupo.sort(key=lambda m: m.idMov)
        movs_out = [await _serialize_movimiento(m, session) for m in grupo]
        resultado.append(
            DispatchOut(
                referencia=ref,
                motivo=grupo[0].motivo,
                fecha=grupo[-1].fecha,
                movimientos=movs_out,
            )
        )
    return resultado
