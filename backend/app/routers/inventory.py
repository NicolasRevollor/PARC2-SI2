from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ciudad, Inventario, Movimiento, Producto, Proveedor, Sucursal
from app.schemas.inventory import (
    LocationOut,
    StockAdjustIn,
    StockIngresoIn,
    StockOut,
)
from app.security import get_optional_payload, require_permiso
from app.services.tenancy import resolver_tenant_publico, tenant_actual
from app.services.bitacora import Actor, actor_actual, auditar

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


async def _serialize_stock(inv: Inventario, session: AsyncSession) -> StockOut:
    suc = await session.get(Sucursal, inv.codigoSucursal)
    prod = await session.get(Producto, inv.idProducto)
    return StockOut(
        idInv=inv.idInv,
        cantidad_actual=inv.cantidad_actual,
        cantidad_reservada=inv.cantidad_reservada,
        codigoSucursal=inv.codigoSucursal,
        sucursal_nombre=suc.nombre if suc else None,
        idProducto=inv.idProducto,
        producto_nombre=prod.nombre if prod else None,
        producto_tipo=prod.tipo if prod else None,
        producto_talla=prod.talla if prod else None,
        producto_color=prod.color if prod else None,
        producto_imagen=prod.imagen_url if prod else None,
    )


async def _inventario_de_mi_tenant(session: AsyncSession, idInv: int, id_tenant: int) -> Inventario:
    inv = await session.get(Inventario, idInv)
    suc = await session.get(Sucursal, inv.codigoSucursal) if inv else None
    if not inv or not suc or suc.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Registro de inventario no encontrado")
    return inv


@router.get("/locations", response_model=list[LocationOut])
async def list_locations(
    idTenant: int | None = None,
    session: AsyncSession = Depends(get_db),
    sesion: dict | None = Depends(get_optional_payload),
):
    # Publico (reservas desde la vitrina/app). Antes listaba las sucursales de
    # TODAS las empresas: el POS de la empresa 2 ofrecia sucursales de la 1.
    stmt = (
        select(Sucursal, Ciudad)
        .join(Ciudad, Ciudad.idCiudad == Sucursal.idCiudad)
        .where(Sucursal.idTenant == resolver_tenant_publico(idTenant, sesion))
        .order_by(Sucursal.nombre)
    )
    rows = (await session.execute(stmt)).all()
    return [LocationOut.from_row(s, c.nombCiudad) for s, c in rows]


@router.get("/stock", response_model=list[StockOut])
async def list_stock(
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("inventario.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    stmt = (
        select(Inventario, Sucursal, Producto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .join(Producto, Producto.idProducto == Inventario.idProducto)
        .where(Sucursal.idTenant == id_tenant)
    )
    if codigoSucursal is not None:
        stmt = stmt.where(Inventario.codigoSucursal == codigoSucursal)
    if idProducto is not None:
        stmt = stmt.where(Inventario.idProducto == idProducto)

    rows = (await session.execute(stmt)).all()
    result = []
    for inv, suc, prod in rows:
        result.append(
            StockOut(
                idInv=inv.idInv,
                cantidad_actual=inv.cantidad_actual,
                cantidad_reservada=inv.cantidad_reservada,
                codigoSucursal=inv.codigoSucursal,
                sucursal_nombre=suc.nombre,
                idProducto=inv.idProducto,
                producto_nombre=prod.nombre,
                producto_tipo=prod.tipo,
                producto_talla=prod.talla,
                producto_color=prod.color,
                producto_imagen=prod.imagen_url,
            )
        )
    return result


@router.patch("/stock/{idInv}/adjust", response_model=StockOut)
async def adjust_stock(
    idInv: int,
    payload: StockAdjustIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("inventario.ajustar")),
    id_tenant: int = Depends(tenant_actual),
):
    inv = await _inventario_de_mi_tenant(session, idInv, id_tenant)

    cantidad = payload.cantidad
    if cantidad < 0:
        raise HTTPException(status_code=400, detail="cantidad debe ser >= 0")
    if payload.signo == "set":
        nuevo = cantidad
    elif payload.signo == "add":
        nuevo = inv.cantidad_actual + cantidad
    elif payload.signo == "subtract":
        nuevo = inv.cantidad_actual - cantidad
    else:
        raise HTTPException(status_code=400, detail="signo invalido")

    if nuevo < 0:
        raise HTTPException(status_code=400, detail="La cantidad resultante no puede ser negativa")
    if nuevo < inv.cantidad_reservada:
        # La restriccion de la base solo exige >= 0; dejar menos stock que lo
        # reservado haria imposible confirmar esas reservas.
        raise HTTPException(
            status_code=400,
            detail=f"No se puede dejar menos stock que lo reservado ({inv.cantidad_reservada} unidad(es))",
        )

    # El movimiento guarda la DIFERENCIA con signo (como venta = -n, ingreso =
    # +n). Antes guardaba el valor absoluto pedido: un "set 5" sobre 10
    # unidades quedaba en el kardex como +5 en vez de -5.
    delta = nuevo - inv.cantidad_actual
    inv.cantidad_actual = nuevo
    movimiento = Movimiento(
        tipo=payload.tipo,
        cantidad=delta,
        motivo=payload.motivo,
        idInv=inv.idInv,
    )
    session.add(movimiento)
    await auditar(session, actor, f"Ajuste de stock del inventario #{inv.idInv}: {nuevo - delta} -> {nuevo} unidades ({payload.motivo or 'sin motivo'})")
    await session.commit()
    await session.refresh(inv)

    return await _serialize_stock(inv, session)


@router.post("/stock/ingreso", response_model=StockOut, status_code=201)
async def ingreso_lote(
    payload: StockIngresoIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("inventario.ajustar")),
    id_tenant: int = Depends(tenant_actual),
):
    # Unico camino para darle stock INICIAL a un producto: adjust_stock
    # requiere un idInv ya existente y dispatches.py requiere stock en la
    # sucursal origen para transferir. Sin este endpoint, un producto recien
    # creado en el catalogo nunca puede llegar a tener inventario (ver
    # odd/tasks/cu07-ingreso-lote.md).
    producto = await session.get(Producto, payload.idProducto)
    if not producto or producto.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    sucursal = await session.get(Sucursal, payload.codigoSucursal)
    if not sucursal or sucursal.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    if payload.idProveedor is not None:
        proveedor = await session.get(Proveedor, payload.idProveedor)
        if not proveedor or proveedor.idTenant != id_tenant:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    inv = (
        await session.execute(
            select(Inventario).where(
                Inventario.codigoSucursal == payload.codigoSucursal,
                Inventario.idProducto == payload.idProducto,
            )
        )
    ).scalar_one_or_none()
    if inv is None:
        inv = Inventario(
            cantidad_actual=0,
            cantidad_reservada=0,
            codigoSucursal=payload.codigoSucursal,
            idProducto=payload.idProducto,
        )
        session.add(inv)
        await session.flush()

    inv.cantidad_actual += payload.cantidad
    movimiento = Movimiento(
        tipo="entrada_lote",
        cantidad=payload.cantidad,
        motivo=payload.motivo or "Ingreso de lote",
        idInv=inv.idInv,
        referencia=f"Proveedor {payload.idProveedor}" if payload.idProveedor else None,
    )
    session.add(movimiento)
    await auditar(session, actor, f"Ingreso de lote: +{payload.cantidad} de {producto.nombre} talla {producto.talla} en {sucursal.nombre}")
    await session.commit()
    await session.refresh(inv)

    return await _serialize_stock(inv, session)
