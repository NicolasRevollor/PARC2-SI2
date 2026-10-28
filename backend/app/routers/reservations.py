from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Cliente,
    DetalleReserva,
    DetalleVenta,
    Historial,
    Inventario,
    Movimiento,
    Producto,
    Reserva,
    Sucursal,
    Venta,
)
from app.schemas.fase2 import (
    ReservaConfirmarIn,
    ReservaIn,
    ReservaOut,
    VentaOut,
)
from app.security import get_current_payload, require_permiso
from app.services.metodo_pago_guard import exigir_metodo_pago_consumible
from app.services.tenancy import tenant_actual
from app.services.bitacora import Actor, actor_actual, auditar, registrar_bitacora
from app.services import sincronizacion as sync

router = APIRouter(prefix="/api/reservations", tags=["reservations"])


def _parse_hora(valor) -> time:
    if isinstance(valor, time):
        return valor
    if isinstance(valor, str):
        try:
            return time.fromisoformat(valor)
        except ValueError:
            # "25:00" o "abc" antes tiraban ValueError sin capturar (500).
            pass
    raise HTTPException(status_code=400, detail="horario invalido")


async def _reserva_de_mi_tenant(session: AsyncSession, codigoReserva: int, id_tenant: int) -> Reserva:
    """La Reserva es de la organizacion duena de su sucursal."""
    reserva = await session.get(Reserva, codigoReserva)
    sucursal = await session.get(Sucursal, reserva.codigoSucursal) if reserva else None
    if not reserva or not sucursal or sucursal.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    return reserva


async def _serialize_reserva(r: Reserva, session: AsyncSession) -> ReservaOut:
    p = await session.get(Producto, r.idProducto)
    s = await session.get(Sucursal, r.codigoSucursal)
    return ReservaOut(
        codigoReserva=r.codigoReserva,
        fecha=r.fecha,
        horario=r.horario.isoformat(),
        estado=r.estado,
        idCliente=r.idCliente,
        codigoSucursal=r.codigoSucursal,
        idProducto=r.idProducto,
        producto_nombre=p.nombre if p else None,
        sucursal_nombre=s.nombre if s else None,
        idMetPago=r.idMetPago,
        montoDeposito=float(r.montoDeposito) if r.montoDeposito is not None else None,
        uuidOperacion=str(r.uuidOperacion) if r.uuidOperacion else None,
        origenRegistro=r.origenRegistro,
    )


async def _cliente_del_caller(session: AsyncSession, auth: dict) -> Cliente | None:
    """Resuelve el `Cliente` propio del usuario autenticado (mismo patron que list_reservations)."""
    return (
        await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))
    ).scalar_one_or_none()


@router.get("", response_model=list[ReservaOut])
async def list_reservations(
    idCliente: int | None = None,
    estado: str | None = None,
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    permisos = payload.get("permisos", [])
    stmt = select(Reserva).order_by(Reserva.fecha.desc())
    if estado is not None:
        stmt = stmt.where(Reserva.estado == estado)
    if "reserva.gestionar" in permisos:
        stmt = stmt.join(Sucursal, Sucursal.codigoSucursal == Reserva.codigoSucursal).where(
            Sucursal.idTenant == tenant_actual(payload)
        )
        if idCliente is not None:
            stmt = stmt.where(Reserva.idCliente == idCliente)
    else:
        user_id = int(payload["sub"])
        cliente = (
            await session.execute(select(Cliente).where(Cliente.idUser == user_id))
        ).scalar_one_or_none()
        if cliente is None:
            return []
        stmt = stmt.where(Reserva.idCliente == cliente.idCliente)
    reservas = (await session.execute(stmt)).scalars().all()
    return [await _serialize_reserva(r, session) for r in reservas]


@router.post("", response_model=ReservaOut, status_code=201)
async def create_reservation(
    payload: ReservaIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    auth: dict = Depends(require_permiso("reserva.crear")),
):
    if payload.uuidOperacion is None:
        return await _crear_reserva(payload, session, actor, auth, request)

    # Reserva que llega de la cola sin conexion (CU15/CU17): idempotente por UUID.
    id_usuario = int(auth["sub"])
    existente = await session.scalar(select(Reserva).where(Reserva.uuidOperacion == str(payload.uuidOperacion)))
    if existente is not None:
        if "reserva.gestionar" in auth.get("permisos", []):
            sucursal = await session.get(Sucursal, existente.codigoSucursal)
            propia = sucursal is not None and sucursal.idTenant == tenant_actual(auth)
        else:
            propia = existente.idCliente == getattr(await _cliente_del_caller(session, auth), "idCliente", None)
        if not propia:
            raise HTTPException(status_code=409, detail="Ese identificador de operacion ya fue usado")
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="reserva", resultado="Duplicada",
            detalle=f"Ya estaba registrada como reserva {existente.codigoReserva}", id_referencia=existente.codigoReserva,
            fecha_operacion=payload.fechaOperacion, request=request, id_usuario=id_usuario, id_tenant=tenant_actual(auth),
        )
        await session.commit()
        response.status_code = 200
        return await _serialize_reserva(existente, session)
    try:
        return await _crear_reserva(payload, session, actor, auth, request)
    except HTTPException as exc:
        await session.rollback()
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="reserva", resultado="Rechazada",
            detalle=str(exc.detail), fecha_operacion=payload.fechaOperacion, request=request,
            id_usuario=id_usuario, id_tenant=tenant_actual(auth),
        )
        await session.commit()
        raise


async def _crear_reserva(
    payload: ReservaIn, session: AsyncSession, actor: Actor, auth: dict, request: Request
) -> ReservaOut:
    if "reserva.gestionar" not in auth.get("permisos", []):
        cliente = await _cliente_del_caller(session, auth)
        if cliente is None:
            raise HTTPException(status_code=403, detail="La cuenta no tiene un cliente asociado")
        if payload.idCliente is not None and payload.idCliente != cliente.idCliente:
            raise HTTPException(status_code=403, detail="No puede reservar en nombre de otro cliente")
        id_cliente = cliente.idCliente
    else:
        id_cliente = payload.idCliente

    if id_cliente is None or not await session.get(Cliente, id_cliente):
        raise HTTPException(status_code=400, detail="Cliente inexistente")
    sucursal = await session.get(Sucursal, payload.codigoSucursal)
    es_staff = "reserva.gestionar" in auth.get("permisos", [])
    if not sucursal or (es_staff and sucursal.idTenant != tenant_actual(auth)):
        raise HTTPException(status_code=400, detail="Sucursal inexistente")
    producto = await session.get(Producto, payload.idProducto)
    if not producto or producto.idTenant != sucursal.idTenant:
        raise HTTPException(status_code=400, detail="Producto inexistente")
    # Margen de un dia: el servidor corre en UTC y en Bolivia (UTC-4) "hoy"
    # puede ser "ayer" en UTC durante la noche.
    if payload.fecha < date.today() - timedelta(days=1):
        raise HTTPException(status_code=400, detail="La fecha de la reserva no puede ser pasada")

    # Anticipo obligatorio (Mandatory Server-Computed Deposit / Card-Only
    # Deposit With Ownership Guard): un caller sin reserva.gestionar SOLO
    # puede pagar con un MetodoPago propio y de origen tarjeta_stripe; un
    # caller staff puede usar cualquier MetodoPago (paridad POS). Se corre
    # ANTES de mutar Inventario para no reservar stock si el deposito falla.
    exigir_tarjeta = "reserva.gestionar" not in auth.get("permisos", [])
    metodo = await exigir_metodo_pago_consumible(
        session,
        payload.idMetPago,
        int(auth["sub"]),
        exigir_tarjeta,
        id_producto=payload.idProducto,
        codigo_sucursal=payload.codigoSucursal,
    )
    if exigir_tarjeta and metodo.idProducto is None:
        # El guard solo compara la ligadura si el pago la tiene. Un cobro de
        # COMPRA (sin ligadura) de Bs 1 servia como "anticipo" de cualquier
        # prenda: el cliente debe pagar el anticipo de ESTA reserva.
        raise HTTPException(
            status_code=403,
            detail="El pago no es un anticipo de reserva: inicia el pago desde el formulario de reserva",
        )

    inv = (
        await session.execute(
            select(Inventario)
            .where(
                Inventario.codigoSucursal == payload.codigoSucursal,
                Inventario.idProducto == payload.idProducto,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if inv is None or inv.cantidad_actual - inv.cantidad_reservada <= 0:
        raise HTTPException(status_code=400, detail="No hay stock disponible para reservar")

    inv.cantidad_reservada += 1

    reserva = Reserva(
        fecha=payload.fecha,
        horario=_parse_hora(payload.horario),
        estado="Pendiente",
        idCliente=id_cliente,
        codigoSucursal=payload.codigoSucursal,
        idProducto=payload.idProducto,
        idMetPago=metodo.idMetPago,
        montoDeposito=metodo.monto,
        **sync.campos_sincronizacion(payload.uuidOperacion, payload.fechaOperacion),
    )
    session.add(reserva)
    await session.flush()
    session.add(
        DetalleReserva(codigoReserva=reserva.codigoReserva, idProducto=producto.idProducto, cantidad=1, precioUnitario=producto.venta)
    )
    if payload.uuidOperacion is not None:
        await sync.registrar(
            session, uuid_operacion=payload.uuidOperacion, tipo="reserva", resultado="Aplicada",
            detalle=f"Reserva {reserva.codigoReserva} registrada sin conexion", id_referencia=reserva.codigoReserva,
            fecha_operacion=payload.fechaOperacion, request=request, id_usuario=int(auth["sub"]),
            id_tenant=sucursal.idTenant,
        )
    await auditar(session, actor, f"Reserva creada: {producto.nombre} talla {producto.talla} en {sucursal.nombre} para el {payload.fecha}")
    await session.commit()
    await session.refresh(reserva)
    return await _serialize_reserva(reserva, session)


@router.put("/{codigoReserva}/prepare", response_model=ReservaOut)
async def prepare_reservation(
    codigoReserva: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reserva.gestionar")),
):
    reserva = await _reserva_de_mi_tenant(session, codigoReserva, tenant_actual(auth))
    if reserva.estado != "Pendiente":
        raise HTTPException(
            status_code=400,
            detail=f"Reserva en estado {reserva.estado}, solo se puede preparar una reserva Pendiente",
        )

    reserva.estado = "Preparada en Sucursal"
    await registrar_bitacora(
        session,
        f"Reserva {codigoReserva} preparada en sucursal",
        int(auth["sub"]),
        request.client.host if request.client else "0.0.0.0",
    )
    await session.commit()
    await session.refresh(reserva)
    return await _serialize_reserva(reserva, session)


@router.put("/{codigoReserva}/confirm", response_model=VentaOut)
async def confirm_reservation(
    codigoReserva: int,
    payload: ReservaConfirmarIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("reserva.gestionar")),
):
    reserva = await _reserva_de_mi_tenant(session, codigoReserva, tenant_actual(auth))
    if reserva.estado != "Preparada en Sucursal":
        if reserva.estado == "Pendiente":
            raise HTTPException(
                status_code=400,
                detail="La reserva aún no fue preparada en sucursal; primero debe prepararse",
            )
        raise HTTPException(status_code=400, detail=f"Reserva en estado {reserva.estado}, no se puede confirmar")
    # Guard centralizado (Cross-Table Single-Use / Confirm Requires Preparada
    # en Sucursal): antes solo se validaba que el MetodoPago existiera; ahora
    # tambien se exige ownership (tolerante a NULL para filas Efectivo/QR) y
    # que no este ya consumido por otra Venta/Reserva. exigir_tarjeta=False:
    # el saldo puede pagarse con cualquier origen, paridad POS.
    await exigir_metodo_pago_consumible(session, payload.idMetPago, int(auth["sub"]), False)

    inv = (
        await session.execute(
            select(Inventario)
            .where(
                Inventario.codigoSucursal == reserva.codigoSucursal,
                Inventario.idProducto == reserva.idProducto,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=400, detail="Inventario no encontrado para la reserva")
    if inv.cantidad_reservada <= 0:
        raise HTTPException(status_code=400, detail="La reserva no tiene stock reservado")

    producto = await session.get(Producto, reserva.idProducto)
    if producto is None:
        raise HTTPException(status_code=400, detail="El producto de la reserva ya no existe")

    inv.cantidad_reservada -= 1
    inv.cantidad_actual -= 1

    # Confirm Requires Preparada en Sucursal (delta staff-reservation-management):
    # el cliente nunca paga mas del 100% entre el anticipo y el saldo. Una
    # reserva pre-migracion 009 (montoDeposito NULL) mantiene el total previo
    # sin deduccion. Clampeado en 0 para nunca generar un total negativo.
    if reserva.montoDeposito is not None:
        total_confirmacion = max(float(producto.venta) - float(reserva.montoDeposito), 0.0)
    else:
        total_confirmacion = float(producto.venta)

    venta = Venta(total=total_confirmacion, idCliente=reserva.idCliente, idMetPago=payload.idMetPago)
    session.add(venta)
    await session.flush()

    detalle = DetalleVenta(
        cantidad=1,
        precio_unitario=float(producto.venta),
        idProducto=reserva.idProducto,
        idVenta=venta.idVenta,
        codigoReserva=codigoReserva,
    )
    session.add(detalle)

    session.add(
        Movimiento(
            tipo="venta_reserva",
            cantidad=-1,
            motivo=f"Confirmacion reserva {codigoReserva}",
            idInv=inv.idInv,
        )
    )
    session.add(
        Historial(
            idProducto=reserva.idProducto,
            idCliente=reserva.idCliente,
            idVenta=venta.idVenta,
        )
    )

    reserva.estado = "Confirmada"
    await registrar_bitacora(session, f"Reserva {codigoReserva} confirmada", int(auth["sub"]), request.client.host if request.client else "0.0.0.0")
    await session.commit()
    await session.refresh(venta)
    return VentaOut(
        idVenta=venta.idVenta,
        fecha=venta.fecha,
        total=float(venta.total),
        idCliente=venta.idCliente,
        idMetPago=venta.idMetPago,
        detalles=[],
    )


@router.put("/{codigoReserva}/cancel", response_model=ReservaOut)
async def cancel_reservation(
    codigoReserva: int,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    auth: dict = Depends(get_current_payload),
):
    es_staff = "reserva.gestionar" in auth.get("permisos", [])
    if es_staff:
        reserva = await _reserva_de_mi_tenant(session, codigoReserva, tenant_actual(auth))
    else:
        reserva = await session.get(Reserva, codigoReserva)
        if not reserva:
            raise HTTPException(status_code=404, detail="Reserva no encontrada")
    if not es_staff:
        cliente = await _cliente_del_caller(session, auth)
        if cliente is None or reserva.idCliente != cliente.idCliente:
            raise HTTPException(status_code=403, detail="No tiene permiso para cancelar esta reserva")
    estados_ok = ("Pendiente", "Preparada en Sucursal") if es_staff else ("Pendiente",)
    if reserva.estado not in estados_ok:
        if es_staff:
            raise HTTPException(
                status_code=400,
                detail=f"Reserva en estado {reserva.estado}, solo se pueden cancelar reservas Pendiente o Preparada en Sucursal",
            )
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar reservas pendientes")

    inv = (
        await session.execute(
            select(Inventario)
            .where(
                Inventario.codigoSucursal == reserva.codigoSucursal,
                Inventario.idProducto == reserva.idProducto,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if inv and inv.cantidad_reservada > 0:
        inv.cantidad_reservada -= 1

    reserva.estado = "Cancelada"
    await auditar(session, actor, f"Reserva #{codigoReserva} cancelada")
    await session.commit()
    await session.refresh(reserva)
    return await _serialize_reserva(reserva, session)
