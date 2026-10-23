"""Devoluciones y cambios de talla/medida dentro de las 24 h (migracion 015).

Reglas que impone este router:
  1. Solo se puede devolver/cambiar antes de que pasen 24 h desde
     `Venta.fecha` (`VENTANA_DEVOLUCION_HORAS`).
  2. Nunca se puede devolver mas unidades de las que se vendieron en esa
     venta, descontando lo ya devuelto antes.
  3. Un cambio de talla mueve stock en DOS direcciones dentro de la misma
     transaccion: devuelve la prenda original al inventario y descuenta la
     prenda de la talla nueva. Si la talla nueva no tiene stock, no se
     registra nada (la transaccion no se commitea).

El historial resultante responde literalmente "el 13 de octubre este cliente
cambio esta talla": `GET /api/returns?fecha_desde=&fecha_hasta=&idCliente=`.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Cliente,
    DetalleVenta,
    Devolucion,
    Inventario,
    Movimiento,
    Producto,
    Sucursal,
    Venta,
)
from app.schemas.returns import DevolucionIn, DevolucionOut, ItemElegibleOut
from app.security import get_current_payload, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services.disponibilidad import resolver_inventario
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/returns", tags=["returns"])

VENTANA_DEVOLUCION_HORAS = 24


# --- Helpers puros (sin DB, testeables sin Postgres) ---------------------

def _como_utc(valor: datetime) -> datetime:
    """Normaliza a UTC con tz. `Venta.fecha` se escribe con `datetime.utcnow()`
    (naive) pero la columna es TIMESTAMPTZ, asi que al releerla puede volver
    con o sin tzinfo segun el driver. Comparar naive contra aware explota con
    TypeError, de ahi esta normalizacion en un solo lugar."""
    return valor.replace(tzinfo=timezone.utc) if valor.tzinfo is None else valor.astimezone(timezone.utc)


def horas_restantes(fecha_venta: datetime, ahora: datetime) -> float:
    """Horas que faltan para que venza la ventana de devolucion (negativo si ya vencio)."""
    limite = _como_utc(fecha_venta) + timedelta(hours=VENTANA_DEVOLUCION_HORAS)
    return (limite - _como_utc(ahora)).total_seconds() / 3600


def dentro_de_ventana(fecha_venta: datetime, ahora: datetime) -> bool:
    return horas_restantes(fecha_venta, ahora) > 0


# --- Consultas -----------------------------------------------------------

async def _cantidad_ya_devuelta(session: AsyncSession, id_venta: int, id_producto: int) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(Devolucion.cantidad), 0)).where(
            Devolucion.idVenta == id_venta,
            Devolucion.idProducto == id_producto,
            Devolucion.estado == "Completada",
        )
    )
    return int(total or 0)


async def _cliente_del_caller(session: AsyncSession, auth: dict) -> Cliente | None:
    return (
        await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))
    ).scalar_one_or_none()


def _fila_a_out(d: Devolucion, prod, prod_nuevo, cliente, sucursal) -> DevolucionOut:
    return DevolucionOut(
        idDevolucion=d.idDevolucion,
        tipo=d.tipo,
        cantidad=d.cantidad,
        motivo=d.motivo,
        estado=d.estado,
        fecha=d.fecha,
        fechaVenta=d.fechaVenta,
        tallaOriginal=d.tallaOriginal,
        tallaNueva=d.tallaNueva,
        medidaOriginal=d.medidaOriginal,
        medidaNueva=d.medidaNueva,
        montoDevuelto=float(d.montoDevuelto),
        idVenta=d.idVenta,
        idProducto=d.idProducto,
        producto_nombre=prod,
        idProductoNuevo=d.idProductoNuevo,
        producto_nuevo_nombre=prod_nuevo,
        idCliente=d.idCliente,
        cliente_nombre=cliente,
        codigoSucursal=d.codigoSucursal,
        sucursal_nombre=sucursal,
        idUsuario=d.idUsuario,
    )


# --- Endpoints -----------------------------------------------------------

@router.get("", response_model=list[DevolucionOut])
async def listar_devoluciones(
    idCliente: int | None = None,
    fecha_desde: datetime | None = None,
    fecha_hasta: datetime | None = None,
    codigoSucursal: int | None = None,
    tipo: str | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """Historial de devoluciones y cambios.

    Un caller sin `devolucion.ver` (Cliente) solo ve las suyas — mismo
    fallback por idCliente que usa `sales.py::list_sales`.
    """
    filtro_cliente = idCliente
    if "devolucion.ver" not in auth.get("permisos", []):
        propio = await _cliente_del_caller(session, auth)
        if propio is None:
            return []
        if idCliente is not None and idCliente != propio.idCliente:
            raise HTTPException(status_code=403, detail="No autorizado")
        filtro_cliente = propio.idCliente

    ProductoNuevo = aliased(Producto)
    stmt = (
        select(Devolucion, Producto.nombre, ProductoNuevo.nombre, Cliente.nombre, Sucursal.nombre)
        .join(Producto, Producto.idProducto == Devolucion.idProducto)
        .outerjoin(ProductoNuevo, ProductoNuevo.idProducto == Devolucion.idProductoNuevo)
        .join(Cliente, Cliente.idCliente == Devolucion.idCliente)
        .outerjoin(Sucursal, Sucursal.codigoSucursal == Devolucion.codigoSucursal)
        .where(Devolucion.idTenant == id_tenant)
        .order_by(Devolucion.fecha.desc())
    )
    if filtro_cliente is not None:
        stmt = stmt.where(Devolucion.idCliente == filtro_cliente)
    if fecha_desde is not None:
        stmt = stmt.where(Devolucion.fecha >= fecha_desde)
    if fecha_hasta is not None:
        stmt = stmt.where(Devolucion.fecha <= fecha_hasta)
    if codigoSucursal is not None:
        stmt = stmt.where(Devolucion.codigoSucursal == codigoSucursal)
    if tipo is not None:
        stmt = stmt.where(Devolucion.tipo == tipo)

    filas = (await session.execute(stmt)).all()
    return [_fila_a_out(d, prod, prod_nuevo, cli, suc) for d, prod, prod_nuevo, cli, suc in filas]


@router.get("/elegibles", response_model=list[ItemElegibleOut])
async def items_elegibles(
    idCliente: int | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
):
    """Items vendidos que todavia estan dentro de la ventana de 24 h.

    Alimenta el selector del formulario de cambio: evita que el operador
    tenga que adivinar que venta sigue siendo elegible.
    """
    filtro_cliente = idCliente
    es_staff = "devolucion.ver" in auth.get("permisos", [])
    if not es_staff:
        propio = await _cliente_del_caller(session, auth)
        if propio is None:
            return []
        filtro_cliente = propio.idCliente

    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(hours=VENTANA_DEVOLUCION_HORAS)

    stmt = (
        select(
            Venta.idVenta,
            Venta.fecha,
            Venta.idCliente,
            Cliente.nombre.label("cliente_nombre"),
            DetalleVenta.idProducto,
            Producto.nombre.label("producto_nombre"),
            Producto.talla,
            DetalleVenta.cantidad,
            DetalleVenta.precio_unitario,
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .join(Cliente, Cliente.idCliente == Venta.idCliente)
        .where(Venta.fecha >= desde)
        .order_by(Venta.fecha.desc())
    )
    if filtro_cliente is not None:
        stmt = stmt.where(Venta.idCliente == filtro_cliente)
    if es_staff:
        # El staff solo ve (y puede cambiar) prendas de SU organizacion.
        stmt = stmt.where(Producto.idTenant == tenant_actual(auth))

    resultado: list[ItemElegibleOut] = []
    for fila in (await session.execute(stmt)).all():
        restantes = horas_restantes(fila.fecha, ahora)
        if restantes <= 0:
            continue
        devueltas = await _cantidad_ya_devuelta(session, fila.idVenta, fila.idProducto)
        disponible = int(fila.cantidad) - devueltas
        if disponible <= 0:
            continue
        resultado.append(
            ItemElegibleOut(
                idVenta=fila.idVenta,
                fechaVenta=fila.fecha,
                horasRestantes=round(restantes, 2),
                idProducto=fila.idProducto,
                producto_nombre=fila.producto_nombre,
                talla=fila.talla,
                cantidadVendida=int(fila.cantidad),
                cantidadDevuelta=devueltas,
                cantidadDisponible=disponible,
                precio_unitario=float(fila.precio_unitario),
                idCliente=fila.idCliente,
                cliente_nombre=fila.cliente_nombre,
            )
        )
    return resultado


@router.post("", response_model=DevolucionOut, status_code=201)
async def registrar_devolucion(
    payload: DevolucionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("devolucion.crear")),
    id_tenant: int = Depends(tenant_actual),
):
    venta = await session.get(Venta, payload.idVenta)
    if venta is None:
        raise HTTPException(status_code=404, detail="La venta no existe")

    # Dos devoluciones simultaneas de la misma linea podian pasar ambas el
    # chequeo de "unidades disponibles": se serializan bloqueando la venta.
    await session.execute(select(Venta.idVenta).where(Venta.idVenta == payload.idVenta).with_for_update())

    ahora = datetime.now(timezone.utc)
    if not dentro_de_ventana(venta.fecha, ahora):
        vencio_hace = abs(horas_restantes(venta.fecha, ahora))
        raise HTTPException(
            status_code=409,
            detail=(
                f"La ventana de {VENTANA_DEVOLUCION_HORAS} h para devolver o cambiar esta venta "
                f"vencio hace {vencio_hace:.1f} h"
            ),
        )

    detalle = (
        await session.execute(
            select(DetalleVenta).where(
                DetalleVenta.idVenta == payload.idVenta,
                DetalleVenta.idProducto == payload.idProducto,
            )
        )
    ).scalars().first()
    if detalle is None:
        raise HTTPException(status_code=400, detail="El producto no pertenece a esa venta")

    ya_devuelta = await _cantidad_ya_devuelta(session, payload.idVenta, payload.idProducto)
    disponible = int(detalle.cantidad) - ya_devuelta
    if payload.cantidad > disponible:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Solo quedan {disponible} unidad(es) devolvibles de ese producto en la venta "
                f"(vendidas {detalle.cantidad}, ya devueltas {ya_devuelta})"
            ),
        )

    producto = await session.get(Producto, payload.idProducto)
    if producto is None or producto.idTenant != id_tenant:
        # Una venta de otra organizacion se responde igual que una inexistente.
        raise HTTPException(status_code=400, detail="El producto no existe")

    if payload.codigoSucursal is not None:
        sucursal_pedida = await session.get(Sucursal, payload.codigoSucursal)
        if sucursal_pedida is None or sucursal_pedida.idTenant != id_tenant:
            raise HTTPException(status_code=400, detail="Sucursal inexistente")

    producto_nuevo = None
    if payload.tipo == "cambio_talla":
        if payload.idProductoNuevo is None:
            raise HTTPException(status_code=400, detail="Un cambio de talla requiere idProductoNuevo")
        if payload.idProductoNuevo == payload.idProducto:
            raise HTTPException(status_code=400, detail="La talla nueva debe ser una prenda distinta")
        producto_nuevo = await session.get(Producto, payload.idProductoNuevo)
        if producto_nuevo is None or producto_nuevo.idTenant != id_tenant:
            raise HTTPException(status_code=400, detail="La prenda de reemplazo no existe")

    # 1) Devolver al inventario la prenda original. Un cambio de medida es un
    # ajuste de confeccion sobre la misma prenda: no mueve stock, asi que no
    # necesita fila de inventario (antes se rechazaba si no habia ninguna).
    inv_original = None
    if payload.tipo != "cambio_medida":
        inv_original = (
            await session.execute(
                select(Inventario)
                .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
                .where(
                    Inventario.idProducto == payload.idProducto,
                    Sucursal.idTenant == id_tenant,
                    *(
                        [Inventario.codigoSucursal == payload.codigoSucursal]
                        if payload.codigoSucursal is not None
                        else []
                    ),
                )
                .order_by(Inventario.idInv)
            )
        ).scalars().first()
        if inv_original is None:
            raise HTTPException(
                status_code=400,
                detail="No hay una fila de inventario donde reingresar la prenda devuelta",
            )

    monto_devuelto = 0.0
    if inv_original is not None:
        inv_original.cantidad_actual += payload.cantidad
        session.add(
            Movimiento(
                tipo="devolucion",
                cantidad=payload.cantidad,
                motivo=f"Devolucion venta {payload.idVenta}",
                idInv=inv_original.idInv,
                referencia=f"DEV-{payload.idVenta}",
            )
        )

    # 2) Cambio de talla: descontar la prenda de reemplazo.
    if payload.tipo == "cambio_talla":
        inv_nuevo = await resolver_inventario(
            session, payload.idProductoNuevo, payload.cantidad, payload.codigoSucursal
        )
        if inv_nuevo is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No hay stock disponible de la talla {producto_nuevo.talla or 'solicitada'} "
                    "para completar el cambio"
                ),
            )
        inv_nuevo.cantidad_actual -= payload.cantidad
        session.add(
            Movimiento(
                tipo="cambio_talla",
                cantidad=-payload.cantidad,
                motivo=f"Cambio de talla venta {payload.idVenta}",
                idInv=inv_nuevo.idInv,
                referencia=f"CAM-{payload.idVenta}",
            )
        )
    elif payload.tipo == "devolucion":
        monto_devuelto = float(detalle.precio_unitario) * payload.cantidad

    devolucion = Devolucion(
        tipo=payload.tipo,
        cantidad=payload.cantidad,
        motivo=payload.motivo,
        estado="Completada",
        fechaVenta=venta.fecha,
        tallaOriginal=producto.talla,
        tallaNueva=producto_nuevo.talla if producto_nuevo is not None else None,
        medidaOriginal=payload.medidaOriginal,
        medidaNueva=payload.medidaNueva,
        montoDevuelto=monto_devuelto,
        idVenta=payload.idVenta,
        idProducto=payload.idProducto,
        idProductoNuevo=payload.idProductoNuevo,
        idCliente=venta.idCliente,
        codigoSucursal=payload.codigoSucursal or (inv_original.codigoSucursal if inv_original else None),
        idUsuario=int(auth["sub"]),
        idTenant=id_tenant,
    )
    session.add(devolucion)

    await registrar_bitacora(
        session,
        f"{payload.tipo} registrado sobre la venta {payload.idVenta} (producto {payload.idProducto})",
        int(auth["sub"]),
        request.client.host if request.client else "0.0.0.0",
    )
    await session.commit()
    await session.refresh(devolucion)

    cliente = await session.get(Cliente, devolucion.idCliente)
    sucursal = (
        await session.get(Sucursal, devolucion.codigoSucursal)
        if devolucion.codigoSucursal is not None
        else None
    )
    return _fila_a_out(
        devolucion,
        producto.nombre,
        producto_nuevo.nombre if producto_nuevo is not None else None,
        cliente.nombre if cliente else None,
        sucursal.nombre if sucursal else None,
    )
