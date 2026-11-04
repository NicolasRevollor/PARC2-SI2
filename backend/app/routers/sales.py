from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Cliente,
    DetalleVenta,
    Historial,
    Inventario,
    MetodoPago,
    Movimiento,
    Producto,
    Sucursal,
    Venta,
)
from app.schemas.fase2 import DetalleVentaOut, VentaIn, VentaOut
from app.security import get_current_payload, require_permiso
from app.services.disponibilidad import resolver_inventario
from app.services.recomendaciones_gemini import generar_recomendaciones_post_venta
from app.services.metodo_pago_guard import exigir_metodo_pago_consumible
from app.services.bitacora import registrar_bitacora
from app.services import caja as caja_srv
from app.services import sincronizacion as sync
from app.services import notificaciones as notif
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/sales", tags=["sales"])


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


def _ventas_del_tenant(id_tenant: int):
    """ids de las ventas de una organizacion. La Venta no tiene "idTenant": es
    de la empresa duena de los productos vendidos (el Cliente se registra en
    la vitrina y no pertenece a ninguna empresa en particular)."""
    return (
        select(DetalleVenta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .where(Producto.idTenant == id_tenant)
    )


async def venta_es_del_tenant(session: AsyncSession, idVenta: int, id_tenant: int) -> bool:
    return bool(
        await session.scalar(
            select(func.count())
            .select_from(DetalleVenta)
            .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
            .where(DetalleVenta.idVenta == idVenta, Producto.idTenant == id_tenant)
        )
    )


async def _serialize_venta(v: Venta, session: AsyncSession, detalles: list[DetalleVenta]) -> VentaOut:
    return VentaOut(
        idVenta=v.idVenta,
        fecha=v.fecha,
        total=float(v.total),
        idCliente=v.idCliente,
        idMetPago=v.idMetPago,
        detalles=[await _serialize_detalle(d, session) for d in detalles],
        uuidOperacion=str(v.uuidOperacion) if v.uuidOperacion else None,
        origenRegistro=v.origenRegistro,
        estadoSincronizacion=v.estadoSincronizacion,
        fechaOperacion=v.fechaOperacion,
        fechaSincronizacion=v.fechaSincronizacion,
    )


@router.get("", response_model=list[VentaOut])
async def list_sales(
    idCliente: int | None = None,
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    permisos = payload.get("permisos", [])

    if "venta.ver" in permisos:
        stmt = (
            select(Venta)
            .where(Venta.idVenta.in_(_ventas_del_tenant(tenant_actual(payload))))
            .order_by(Venta.fecha.desc())
        )
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
                   _=Depends(require_permiso("venta.ver")),
                   id_tenant: int = Depends(tenant_actual)):
    v = await session.get(Venta, idVenta)
    if not v or not await venta_es_del_tenant(session, idVenta, id_tenant):
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    detalles = (
        await session.execute(select(DetalleVenta).where(DetalleVenta.idVenta == idVenta))
    ).scalars().all()
    return await _serialize_venta(v, session, detalles)


@router.post("", response_model=VentaOut, status_code=201)
async def create_sale(
    payload: VentaIn,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.crear")),
):
    if payload.uuidOperacion is None:
        return await _crear_venta(payload, request, background_tasks, session, auth)

    # Venta que llega de la cola sin conexion (CU17): idempotente por UUID.
    id_usuario = int(auth["sub"])
    existente = await session.scalar(select(Venta).where(Venta.uuidOperacion == str(payload.uuidOperacion)))
    if existente is not None:
        propia = (
            existente.idCliente == getattr(await _cliente_del_caller(session, auth), "idCliente", None)
            if "venta.ver" not in auth.get("permisos", [])
            else await venta_es_del_tenant(session, existente.idVenta, tenant_actual(auth))
        )
        if not propia:
            raise HTTPException(status_code=409, detail="Ese identificador de operacion ya fue usado")
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="venta", resultado="Duplicada",
            detalle=f"Ya estaba registrada como venta {existente.idVenta}", id_referencia=existente.idVenta,
            fecha_operacion=payload.fechaOperacion, request=request, id_usuario=id_usuario, id_tenant=tenant_actual(auth),
        )
        await session.commit()
        response.status_code = 200
        detalles = (
            await session.execute(select(DetalleVenta).where(DetalleVenta.idVenta == existente.idVenta))
        ).scalars().all()
        return await _serialize_venta(existente, session, detalles)
    try:
        return await _crear_venta(payload, request, background_tasks, session, auth)
    except HTTPException as exc:
        # Rechazo definitivo de la operacion: queda en el log para revisarla.
        await session.rollback()
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="venta", resultado="Rechazada",
            detalle=str(exc.detail), fecha_operacion=payload.fechaOperacion, request=request,
            id_usuario=id_usuario, id_tenant=tenant_actual(auth),
        )
        # CORRECCION DE LA INGENIERA: "se le devuelve el dinero, si es que compro algo sin internet".
        # En palabras simples: el cliente ya pago en efectivo cuando no habia internet, pero al volver
        # la conexion el servidor no pudo confirmar la venta (por ejemplo, ya no habia stock).
        # Entonces: (1) al cliente le llega un aviso (app + correo) diciendo que se le devuelve su dinero,
        # y (2) al personal le llega un aviso para que se lo entregue.
        await _avisar_devolucion_venta_sin_conexion(session, payload, auth, str(exc.detail))
        await session.commit()
        notif.programar_correos(background_tasks)
        raise


# ==== Compra sin internet que no se pudo confirmar: se devuelve el dinero =====
# Correccion de la ingeniera (avisos tipo push o correo + devolver el dinero de una compra hecha sin internet).
# ==================================================================
async def _avisar_devolucion_venta_sin_conexion(session: AsyncSession, payload: VentaIn, auth: dict, motivo: str) -> None:
    id_tenant = tenant_actual(auth)
    # Paso 1: cuanto pago el cliente (el pago en efectivo que se registro sin internet).
    pago = await session.get(MetodoPago, payload.idMetPago)
    monto = float(pago.monto) if pago is not None and pago.monto is not None else 0.0
    # Paso 2: quien es el cliente (si la compro el mismo, sale de su sesion).
    id_cliente = payload.idCliente
    if id_cliente is None:
        propio = await _cliente_del_caller(session, auth)
        id_cliente = propio.idCliente if propio else None
    # Paso 3: aviso al cliente (app + correo).
    await notif.notificar_cliente(
        session, id_cliente, id_tenant, tipo="venta_sin_conexion", referencia=str(payload.uuidOperacion)[:40],
        titulo=f"Le devolvemos Bs {monto:.2f} de su compra",
        mensaje=(f"Su compra hecha sin conexion no se pudo confirmar ({motivo}). "
                 f"Le devolvemos Bs {monto:.2f}: puede retirarlo en la sucursal donde compro."),
    )
    # Paso 4: aviso al personal para que le entregue el dinero.
    await notif.notificar_personal(
        session, id_tenant, tipo="venta_sin_conexion", referencia=str(payload.uuidOperacion)[:40],
        titulo=f"Devolver Bs {monto:.2f} de una venta sin conexion",
        mensaje=f"Una venta registrada sin internet fue rechazada al sincronizar ({motivo}). Devuelva Bs {monto:.2f} al cliente.",
    )


async def _crear_venta(
    payload: VentaIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    auth: dict,
) -> VentaOut:
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
    metodo = await exigir_metodo_pago_consumible(
        session, payload.idMetPago, int(auth["sub"]), es_autocompra
    )
    if es_autocompra and metodo.idProducto is not None:
        # Un anticipo de reserva (ligado a un producto/sucursal) no paga una compra.
        raise HTTPException(status_code=403, detail="Ese pago corresponde al anticipo de una reserva")

    # Organizacion de la venta: la del staff que la registra, o (compra en
    # linea) la del primer producto. Todo el ticket debe ser de esa empresa.
    id_tenant_venta = None if es_autocompra else tenant_actual(auth)
    if payload.codigoSucursal is not None:
        sucursal = await session.get(Sucursal, payload.codigoSucursal)
        if sucursal is None or (id_tenant_venta is not None and sucursal.idTenant != id_tenant_venta):
            raise HTTPException(status_code=400, detail="Sucursal inexistente")
        id_tenant_venta = sucursal.idTenant

    total = 0.0
    venta = Venta(
        total=0.0,
        idCliente=id_cliente,
        idMetPago=payload.idMetPago,
        **sync.campos_sincronizacion(payload.uuidOperacion, payload.fechaOperacion),
    )
    session.add(venta)
    await session.flush()

    for item in payload.items:
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail="cantidad debe ser > 0")
        producto = await session.get(Producto, item.idProducto)
        if not producto or (id_tenant_venta is not None and producto.idTenant != id_tenant_venta):
            raise HTTPException(status_code=400, detail=f"Producto {item.idProducto} inexistente")
        id_tenant_venta = producto.idTenant

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

    # Compra en linea: el cobro con tarjeta tiene que cubrir el total que se
    # calcula aca. Sin esto se podia pagar un intento de Bs 10 y usar ese
    # idMetPago para llevarse un carrito de Bs 1000 (el intento y la venta
    # reciben los items por separado). El POS (staff) registra efectivo con un
    # monto indicativo, por eso no aplica ahi.
    if es_autocompra and round(total, 2) > round(float(metodo.monto), 2):
        raise HTTPException(
            status_code=400,
            detail=(
                f"El pago verificado (Bs {float(metodo.monto):.2f}) no cubre el total "
                f"de la compra (Bs {total:.2f})"
            ),
        )

    venta.total = total
    # [CU20] paso 3: la venta en efectivo del POS entra a la caja abierta de la sucursal.
    if not es_autocompra and metodo.tipo == "Efectivo" and payload.uuidOperacion is None:
        await caja_srv.efectivo_en_linea(
            session, payload.codigoSucursal, concepto="venta", monto=total, referencia=f"Venta {venta.idVenta}", id_usuario=int(auth["sub"])
        )
    if payload.uuidOperacion is not None:
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="venta", resultado="Aplicada",
            detalle=f"Venta {venta.idVenta} registrada sin conexion", id_referencia=venta.idVenta,
            fecha_operacion=payload.fechaOperacion, request=request, id_usuario=int(auth["sub"]),
            id_tenant=id_tenant_venta,
        )
    await registrar_bitacora(session, f"Venta {venta.idVenta} creada", int(auth["sub"]), request.client.host if request.client else "0.0.0.0")
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
