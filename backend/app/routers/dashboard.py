from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DetalleVenta, Inventario, Producto, Sucursal, Venta
from app.schemas.dashboard import (
    KpisOut,
    StockPorSucursalOut,
    StockSucursalFila,
    TopProductoFila,
    TopProductosOut,
    VentaDiariaFila,
    VentasDiariasOut,
)
from app.security import require_permiso
from app.services.horario import ZONA_BOLIVIA_SQL, fin_del_dia, inicio_del_dia
from app.services import reportes_ia
from app.services.alcance import alcance_sucursales
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# Umbral de "stock bajo" para el KPI de alerta: arbitrario, no configurable
# (no hay caso de uso que pida hacerlo ajustable todavia).
UMBRAL_STOCK_BAJO = 10


# Todas las queries de ventas de abajo usan el mismo join Venta ->
# DetalleVenta -> Producto (NO via Movimiento.motivo: ese motivo es
# identico para todos los items de una venta multi-item -- doble conteo --
# y las ventas confirmadas desde Reserva usan un motivo sin idVenta, canal
# que quedaria omitido). Ver reports.py:184-190 para el detalle completo.
#
# Multitenencia: una linea de venta es de la organizacion duena del
# producto (Producto.idTenant) y el stock, de la duena de la sucursal. Sin
# estos filtros el dashboard de cualquier empresa sumaba las de todas.


def _ventas_visibles(stmt, visibles: set[int] | None):
    """[CU30] alt. 2: el Encargado ve solo las ventas de sus sucursales."""
    if visibles is None:
        return stmt
    lineas = reportes_ia.lineas_venta_con_sucursal()
    return stmt.where(Venta.idVenta.in_(select(lineas.c.idVenta).where(lineas.c.codigoSucursal.in_(sorted(visibles)))))


def _stock_visible(stmt, visibles: set[int] | None):
    return stmt if visibles is None else stmt.where(Sucursal.codigoSucursal.in_(sorted(visibles)))


def _filtrar_fechas(stmt, fecha_desde: date | None, fecha_hasta: date | None):
    if fecha_desde is not None:
        stmt = stmt.where(Venta.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        stmt = stmt.where(Venta.fecha <= fin_del_dia(fecha_hasta))
    return stmt


@router.get("/kpis", response_model=KpisOut)
async def kpis(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    ventas_stmt = (
        select(
            func.coalesce(func.sum(DetalleVenta.cantidad * DetalleVenta.precio_unitario), 0),
            func.coalesce(func.sum(DetalleVenta.cantidad), 0),
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .where(Producto.idTenant == id_tenant)
    )
    visibles = await alcance_sucursales(session, auth)
    ventas_stmt = _ventas_visibles(_filtrar_fechas(ventas_stmt, fecha_desde, fecha_hasta), visibles)
    total_monto, total_items = (await session.execute(ventas_stmt)).one()

    stock_total = (
        await session.execute(
            _stock_visible(
                select(func.coalesce(func.sum(Inventario.cantidad_actual), 0))
                .select_from(Inventario)
                .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
                .where(Sucursal.idTenant == id_tenant),
                visibles,
            )
        )
    ).scalar_one()

    productos_bajo_stock = (
        await session.execute(
            _stock_visible(
                select(func.count())
                .select_from(Inventario)
                .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
                .where(
                    Sucursal.idTenant == id_tenant,
                    Inventario.cantidad_actual < UMBRAL_STOCK_BAJO,
                ),
                visibles,
            )
        )
    ).scalar_one()

    return KpisOut(
        total_ventas_monto=total_monto,
        total_ventas_items=total_items,
        stock_total=stock_total,
        productos_bajo_stock=productos_bajo_stock,
    )


@router.get("/ventas-diarias", response_model=VentasDiariasOut)
async def ventas_diarias(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    dia = func.date(func.timezone(ZONA_BOLIVIA_SQL, Venta.fecha)).label("dia")
    stmt = (
        select(
            dia,
            func.sum(DetalleVenta.cantidad * DetalleVenta.precio_unitario).label("monto"),
            func.sum(DetalleVenta.cantidad).label("cantidad"),
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .where(Producto.idTenant == id_tenant)
        .group_by(dia)
        .order_by(dia)
    )
    stmt = _ventas_visibles(_filtrar_fechas(stmt, fecha_desde, fecha_hasta), await alcance_sucursales(session, auth))

    rows = (await session.execute(stmt)).all()
    return VentasDiariasOut(
        dias=[
            VentaDiariaFila(fecha=r.dia, monto=r.monto, cantidad=int(r.cantidad))
            for r in rows
        ]
    )


@router.get("/top-productos", response_model=TopProductosOut)
async def top_productos(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    limit: int = Query(5, ge=1, le=20),
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    monto = func.sum(DetalleVenta.cantidad * DetalleVenta.precio_unitario).label("monto")
    stmt = (
        select(
            Producto.idProducto,
            Producto.nombre.label("producto_nombre"),
            monto,
            func.sum(DetalleVenta.cantidad).label("cantidad"),
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .where(Producto.idTenant == id_tenant)
        .group_by(Producto.idProducto, Producto.nombre)
        .order_by(monto.desc())
        .limit(limit)
    )
    stmt = _ventas_visibles(_filtrar_fechas(stmt, fecha_desde, fecha_hasta), await alcance_sucursales(session, auth))

    rows = (await session.execute(stmt)).all()
    return TopProductosOut(
        productos=[
            TopProductoFila(
                idProducto=r.idProducto,
                producto_nombre=r.producto_nombre,
                monto=r.monto,
                cantidad=int(r.cantidad),
            )
            for r in rows
        ]
    )


@router.get("/stock-por-sucursal", response_model=StockPorSucursalOut)
async def stock_por_sucursal(
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    stmt = (
        select(
            Sucursal.codigoSucursal,
            Sucursal.nombre.label("sucursal_nombre"),
            func.coalesce(func.sum(Inventario.cantidad_actual), 0).label("stock_total"),
        )
        .select_from(Sucursal)
        .outerjoin(Inventario, Inventario.codigoSucursal == Sucursal.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
        .group_by(Sucursal.codigoSucursal, Sucursal.nombre)
        .order_by(Sucursal.nombre)
    )
    stmt = _stock_visible(stmt, await alcance_sucursales(session, auth))
    rows = (await session.execute(stmt)).all()
    return StockPorSucursalOut(
        sucursales=[
            StockSucursalFila(
                codigoSucursal=r.codigoSucursal,
                sucursal_nombre=r.sucursal_nombre,
                stock_total=int(r.stock_total),
            )
            for r in rows
        ]
    )
