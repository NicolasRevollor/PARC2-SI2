from datetime import date, datetime, time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Bitacora,
    Cliente,
    DetalleVenta,
    Historial,
    Inventario,
    Movimiento,
    Producto,
    Venta,
)
from app.schemas.fase2 import DetalleVentaOut, VentaIn, VentaOut
from app.security import get_current_payload, require_permiso
from app.services.disponibilidad import resolver_inventario
from app.services.recomendaciones_gemini import generar_recomendaciones_post_venta
from app.services.metodo_pago_guard import exigir_metodo_pago_consumible

router = APIRouter(prefix="/api/sales", tags=["sales"])


async def _registrar_bitacora(session: AsyncSession, accion: str, idUser: int, ip: str):
    now = datetime.now()
    b = Bitacora(
        accion=accion,
        hora=now.time(),
        fecha=now.date(),
        ip=ip,
        idUser=idUser,
    )
    session.add(b)


async def _serialize_detalle(d: DetalleVenta, session: AsyncSession) -> DetalleVentaOut:
    p = await session.get(Producto, d.idProducto)
    return DetalleVentaOut(
        codigoVenta=d.codigoVenta,
        cantidad=d.cantidad,
        precio_unitario=float(d.precio_unitario),
        idProducto=d.idProducto,
        producto_nombre=p.nombre if p else None,
        idVenta=d.idVenta,
    )


async def _cliente_del_caller(session: AsyncSession, auth: dict) -> Cliente | None:
    """Resuelve el `Cliente` propio del usuario autenticado (mismo patron que
    `reservations.py::_cliente_del_caller`)."""
    return (
        await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))
    ).scalar_one_or_none()


async def _serialize_venta(v: Venta, session: AsyncSession, detalles: list[DetalleVenta]) -> VentaOut:
    return VentaOut(
        idVenta=v.idVenta,
        fecha=v.fecha,
        total=float(v.total),
        idCliente=v.idCliente,
        idMetPago=v.idMetPago,
        detalles=[await _serialize_detalle(d, session) for d in detalles],
    )


@router.get("", response_model=list[VentaOut])
async def list_sales(
    idCliente: int | None = None,
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    permisos = payload.get("permisos", [])

    if "venta.ver" in permisos:
        stmt = select(Venta).order_by(Venta.fecha.desc())
        if idCliente is not None:
            stmt = stmt.where(Venta.idCliente == idCliente)
        ventas = (await session.execute(stmt)).scalars().all()
    else:
        if idCliente is not None and "cliente.ver" not in permisos:
            raise HTTPException(status_code=403, detail="No autorizado")
        user_id = int(payload["sub"])
        cliente = (
            await session.execute(select(Cliente).where(Cliente.idUser == user_id))
        ).scalar_one_or_none()
        if cliente is None:
            return []
        ventas = (
            await session.execute(
                select(Venta).where(Venta.idCliente == cliente.idCliente).order_by(Venta.fecha.desc())
            )
        ).scalars().all()

    resultado = []
    for v in ventas:
        detalles = (
            await session.execute(select(DetalleVenta).where(DetalleVenta.idVenta == v.idVenta))
        ).scalars().all()
        resultado.append(await _serialize_venta(v, session, detalles))
    return resultado


@router.get("/{idVenta}", response_model=VentaOut)
async def get_sale(idVenta: int, session: AsyncSession = Depends(get_db),
                   _=Depends(require_permiso("venta.ver"))):
    v = await session.get(Venta, idVenta)
    if not v:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    detalles = (
        await session.execute(select(DetalleVenta).where(DetalleVenta.idVenta == idVenta))
    ).scalars().all()
    return await _serialize_venta(v, session, detalles)


@router.post("", response_model=VentaOut, status_code=201)
async def create_sale(
    payload: VentaIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.crear")),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Debe enviar al menos un item")

    # Ownership: un caller sin "venta.ver" (Cliente) solo puede comprar para
    # si mismo — idCliente se deriva de su propio JWT, mismo patron que
    # `reservations.py::create_reservation`. Un caller staff con "venta.ver"
    # sigue especificando idCliente explicitamente (POS/CU19 sin cambios).
    es_autocompra = "venta.ver" not in auth.get("permisos", [])
    if es_autocompra:
        cliente = await _cliente_del_caller(session, auth)
        if cliente is None:
            raise HTTPException(status_code=403, detail="La cuenta no tiene un cliente asociado")
        if payload.idCliente is not None and payload.idCliente != cliente.idCliente:
            raise HTTPException(status_code=403, detail="No puede comprar en nombre de otro cliente")
        id_cliente = cliente.idCliente
    else:
        id_cliente = payload.idCliente

    if id_cliente is None or not await session.get(Cliente, id_cliente):
        raise HTTPException(status_code=400, detail="Cliente inexistente")

    # Guard centralizado (Payment Method Single-Use Across Sales / Cross-Table
    # Single-Use): ownership + origen tarjeta_stripe para autocompra, y ahora
    # ademas rechaza un idMetPago ya consumido por CUALQUIER Venta O Reserva
    # (antes solo se miraba Venta). exigir_tarjeta == es_autocompra: mismo
    # criterio previo ("venta.ver" not in permisos), sin cambio de semantica.
    await exigir_metodo_pago_consumible(session, payload.idMetPago, int(auth["sub"]), es_autocompra)

    total = 0.0
    venta = Venta(total=0.0, idCliente=id_cliente, idMetPago=payload.idMetPago)
    session.add(venta)
    await session.flush()

    for item in payload.items:
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="cantidad debe ser > 0")
        producto = await session.get(Producto, item.idProducto)
        if not producto:
            raise HTTPException(status_code=400, detail=f"Producto {item.idProducto} inexistente")

        if payload.codigoSucursal is not None:
            inv = (
                await session.execute(
                    select(Inventario).where(
                        Inventario.idProducto == item.idProducto,
                        Inventario.codigoSucursal == payload.codigoSucursal,
                        Inventario.cantidad_reservada < Inventario.cantidad_actual,
                    ).order_by(Inventario.idInv)
                )
            ).scalars().first()
            if inv is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente del producto {item.idProducto} "
                        f"en la sucursal {payload.codigoSucursal}"
                    ),
                )

            if inv.cantidad_actual - inv.cantidad_reservada < item.cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock disponible insuficiente del producto {item.idProducto} "
                        f"en la sucursal {payload.codigoSucursal}"
                    ),
                )
        else:
            # Compra en linea sin sucursal explicita (D4): se resuelve la
            # UNICA fila de Inventario, entre todas las sucursales, cuya
            # disponibilidad por si sola cubre la cantidad pedida — nunca se
            # suma disponibilidad entre sucursales.
            inv = await resolver_inventario(session, item.idProducto, item.cantidad, None)
            if inv is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Ninguna sucursal tiene stock disponible suficiente del "
                        f"producto {item.idProducto} para la cantidad solicitada"
                    ),
                )

        precio_unitario = float(producto.venta)
        inv.cantidad_actual -= item.cantidad
        total += precio_unitario * item.cantidad

        detalle = DetalleVenta(
            cantidad=item.cantidad,
            precio_unitario=precio_unitario,
            idProducto=item.idProducto,
            idVenta=venta.idVenta,
        )
        session.add(detalle)

        session.add(
            Movimiento(
                tipo="venta",
                cantidad=-item.cantidad,
                motivo=f"Venta {venta.idVenta}",
                idInv=inv.idInv,
            )
        )

        session.add(
            Historial(
                idProducto=item.idProducto,
                idCliente=id_cliente,
                idVenta=venta.idVenta,
            )
        )
        await session.flush()

    venta.total = total
    await _registrar_bitacora(session, f"Venta {venta.idVenta} creada", int(auth["sub"]), request.client.host if request.client else "0.0.0.0")
    await session.commit()
    await session.refresh(venta)

    # CU22: recomendaciones generadas en background, DESPUES del commit —
    # nunca demora la respuesta de la venta, y si Gemini falla la venta ya
    # quedo persistida de todos modos (ver recomendaciones_gemini.py).
    background_tasks.add_task(generar_recomendaciones_post_venta, id_cliente=id_cliente)

    detalles = (
        await session.execute(select(DetalleVenta).where(DetalleVenta.idVenta == venta.idVenta))
    ).scalars().all()
    return await _serialize_venta(venta, session, detalles)
