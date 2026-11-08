# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU14] Registrar venta de contado sin conexion  -> aplicar_venta()
# [CU15] Registrar reserva de prendas sin conexion -> aplicar_reserva(), aplicar_cancelacion()
# [CU17] Sincronizar operaciones pendientes        -> procesar_operacion()
# [CU19] Registrar cambio de prenda sin conexion   -> aplicar_cambio(), aplicar_custodia()
# [CU20] Gestionar apertura y cierre de caja       -> aplicar_apertura(), aplicar_cierre()
# Control del diagrama: ControlSincronizacion
# En palabras simples: recibe lo que el dispositivo hizo sin internet y, por cada
#   operacion, responde "Confirmada", "Rechazada" o "En conflicto". Cada una va en
#   su propia transaccion: si una falla, las demas del lote siguen.
# Reglas: una operacion ya procesada devuelve el resultado original sin registrar
#   nada nuevo (RNF05) y una en conflicto NO mueve stock hasta que se resuelve (CU18).
# ==================================================================
"""Aplicacion en el servidor de las operaciones registradas sin conexion."""

import logging
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Caja,
    Cliente,
    ConflictoSincronizacion,
    DetalleReserva,
    DetalleVenta,
    Devolucion,
    Historial,
    Inventario,
    MetodoPago,
    Movimiento,
    Producto,
    RegistroSincronizacion,
    Reserva,
    Rol,
    Sucursal,
    Suscripcion,
    Tenant,
    Usuario,
    Venta,
)
from app.schemas.sincronizacion import (
    DatosAperturaCaja,
    DatosCambio,
    DatosCancelarReserva,
    DatosCierreCaja,
    DatosCliente,
    DatosCustodia,
    DatosReserva,
    DatosVenta,
    OperacionIn,
)
from app.security import hash_password
from app.services import caja as caja_srv
from app.services import devoluciones as dv
from app.services import sincronizacion as sync
from app.services.alcance import sucursales_asignadas, sucursales_visibles
from app.services.bitacora import registrar_bitacora
from app.services.horario import HORA_BOLIVIA

logger = logging.getLogger("app.sincronizacion")

CONFIRMADA = "Confirmada"
RECHAZADA = "Rechazada"
EN_CONFLICTO = "En conflicto"
ANULADA = "Anulada"
REINTENTAR = "Reintentar"
DOMINIO_SIN_CORREO = "sin-correo.invalid"
PERMISO_POR_TIPO = {
    "venta": ("venta.crear",),
    "reserva": ("reserva.crear", "reserva.gestionar"),
    "cancelar_reserva": ("reserva.crear", "reserva.gestionar"),
    "cambio": ("devolucion.registrar",),
    "custodia": ("devolucion.registrar",),
    "caja_apertura": ("caja.operar",),
    "caja_cierre": ("caja.operar",),
}


@dataclass
class Contexto:
    session: AsyncSession
    id_tenant: int
    id_usuario: int
    permisos: list[str]
    ip: str = "0.0.0.0"
    dispositivo: str | None = None
    conflictos_nuevos: int = 0


@dataclass
class Resultado:
    estado: str
    id_servidor: int | None = None
    motivo: str | None = None
    tipo_conflicto: str | None = None


@dataclass(frozen=True)
class Autorizacion:
    """Lo que autorizo el Encargado al resolver un conflicto (CU18)."""

    ajustar_stock: bool = False
    respetar_precio: bool = False
    saltar_politica: bool = False
    id_cliente: int | None = None
    crear_cliente: bool = False


class Conflicto(Exception):
    """La operacion no se puede confirmar sola: la decide el Encargado."""

    def __init__(self, tipo: str, motivo: str, servidor: dict | None = None, monto=0):
        super().__init__(motivo)
        self.tipo = tipo
        self.motivo = motivo[:255]
        self.servidor = servidor or {}
        self.monto = monto


@dataclass
class LineaRevisada:
    id_producto: int
    nombre: str
    cantidad: int
    precio_local: Decimal
    precio_servidor: Decimal | None
    disponible: int
    existe: bool = True


# ==== [CU17] Paso 6 y [CU18] paso 2 ================================
# En palabras simples: compara lo que hizo el dispositivo con lo que dice el
# servidor. Devuelve el tipo de conflicto, o None si todo coincide.
# ===================================================================
def clasificar_lineas(lineas: list[LineaRevisada], *, es_reserva: bool = False) -> tuple[str, str] | None:
    faltantes = [l for l in lineas if not l.existe]
    if faltantes:
        return "producto_desactivado", "Producto no disponible: " + ", ".join(l.nombre for l in faltantes)
    sin_stock = [l for l in lineas if l.disponible < l.cantidad]
    if sin_stock:
        detalle = ", ".join(f"{l.nombre} (pedidas {l.cantidad}, hay {l.disponible})" for l in sin_stock)
        return ("reserva_sin_existencia" if es_reserva else "stock_insuficiente"), f"Sin existencia en el servidor: {detalle}"
    if not es_reserva:
        distintas = [l for l in lineas if l.precio_local != l.precio_servidor]
        if distintas:
            detalle = ", ".join(f"{l.nombre} (cobrado Bs {l.precio_local}, vigente Bs {l.precio_servidor})" for l in distintas)
            return "precio_desactualizado", f"Precio desactualizado: {detalle}"
    return None


# ==== [CU17] Flujo alternativo 5 ===================================
# Suscripcion suspendida: se aceptan las operaciones hechas antes de la
# suspension (ventas reales) y se rechazan las posteriores.
# ===================================================================
def rechazo_por_suscripcion(estado_tenant: str, fecha_suspension: datetime | None, fecha_operacion: datetime) -> str | None:
    if estado_tenant == "Activo":
        return None
    if fecha_suspension is not None and dv.como_utc(fecha_operacion) < dv.como_utc(fecha_suspension):
        return None
    return "La suscripcion de la empresa estaba suspendida cuando se registro la operacion"


def fecha_real(op: OperacionIn) -> datetime:
    """Hora real del dispositivo. Un reloj adelantado no crea operaciones del futuro."""
    return min(dv.como_utc(op.fechaOperacion), datetime.now(timezone.utc))


def resultado_de_registro(fila: RegistroSincronizacion, conflicto: ConflictoSincronizacion | None, id_tenant: int) -> Resultado:
    if fila.idTenant != id_tenant:
        return Resultado(RECHAZADA, motivo="Ese identificador de operacion ya fue usado")
    if conflicto is not None:
        if conflicto.estado == "Pendiente":
            return Resultado(EN_CONFLICTO, motivo=conflicto.motivo, tipo_conflicto=conflicto.tipoConflicto)
        return Resultado(conflicto.resultado or CONFIRMADA, id_servidor=conflicto.idReferencia, motivo=conflicto.observaciones)
    if fila.resultado == "Rechazada":
        return Resultado(RECHAZADA, motivo=fila.detalle)
    return Resultado(CONFIRMADA, id_servidor=fila.idReferencia)


async def resultado_previo(session: AsyncSession, uuid: str, id_tenant: int) -> Resultado | None:
    """[CU17] paso 5: si el UUID ya fue procesado, el resultado anterior."""
    fila = await session.scalar(
        select(RegistroSincronizacion)
        .where(RegistroSincronizacion.uuidOperacion == uuid, RegistroSincronizacion.resultado != "Duplicada")
        .order_by(RegistroSincronizacion.idRegistro.desc())
        .limit(1)
    )
    if fila is None:
        return None
    conflicto = await session.scalar(select(ConflictoSincronizacion).where(ConflictoSincronizacion.uuidOperacion == uuid))
    return resultado_de_registro(fila, conflicto, id_tenant)


async def _validar_contexto(ctx: Contexto, op: OperacionIn) -> str | None:
    """[CU17] paso 4: la empresa y la sucursal deben ser del usuario autenticado."""
    session = ctx.session
    if op.idTenant is not None and op.idTenant != ctx.id_tenant:
        return "La operacion pertenece a otra empresa"
    if not any(p in ctx.permisos for p in PERMISO_POR_TIPO[op.tipo]):
        return "El usuario no tiene permiso para esta operacion"
    if op.codigoSucursal is not None:
        sucursal = await session.get(Sucursal, op.codigoSucursal)
        if sucursal is None or sucursal.idTenant != ctx.id_tenant:
            return "La sucursal no pertenece a la empresa"
        visibles = sucursales_visibles(ctx.permisos, await sucursales_asignadas(session, ctx.id_usuario))
        if visibles is not None and op.codigoSucursal not in visibles:
            return "El usuario no esta asignado a esa sucursal"
    estado = await session.scalar(select(Tenant.estado).where(Tenant.idTenant == ctx.id_tenant))
    if estado != "Activo":
        suspension = await session.scalar(
            select(Suscripcion.fechaSuspension)
            .where(Suscripcion.idTenant == ctx.id_tenant, Suscripcion.fechaSuspension.is_not(None))
            .order_by(Suscripcion.fechaSuspension.desc())
            .limit(1)
        )
        return rechazo_por_suscripcion(estado, suspension, op.fechaOperacion)
    return None


# ==== [CU24] Flujo alternativo 3 ===================================
# La operacion queda a nombre de quien la registro en el dispositivo, aunque la
# envie otro usuario de la empresa. Si ese empleado fue dado de baja, se acepta lo
# que registro ANTES de la baja y se rechaza lo posterior.
# ===================================================================
def rechazo_por_baja(activo: bool, fecha_baja: datetime | None, fecha_operacion: datetime) -> str | None:
    if activo or fecha_baja is None or dv.como_utc(fecha_operacion) < dv.como_utc(fecha_baja):
        return None
    return "La operacion se registro despues de la baja del empleado"


async def autor_de(ctx: Contexto, op: OperacionIn) -> tuple[int, str | None]:
    if op.idUsuario is None or op.idUsuario == ctx.id_usuario:
        return ctx.id_usuario, None
    autor = await ctx.session.get(Usuario, op.idUsuario)
    if autor is None or autor.idTenant != ctx.id_tenant:
        return ctx.id_usuario, None
    return autor.idUser, rechazo_por_baja(autor.activo, autor.fechaBaja, op.fechaOperacion)


def registro_para(op: OperacionIn, resultado: Resultado) -> tuple[str, str | None]:
    if resultado.estado == CONFIRMADA:
        return "Aplicada", f"Confirmada ({op.tipo})"
    if resultado.estado == EN_CONFLICTO:
        return "Conflicto", resultado.motivo
    return "Rechazada", resultado.motivo


async def _registrar(ctx: Contexto, op: OperacionIn, resultado: str, detalle: str | None, id_referencia: int | None) -> None:
    await sync.registrar(
        ctx.session, uuid_operacion=op.uuidOperacion, tipo=op.tipo, resultado=resultado, detalle=detalle,
        id_referencia=id_referencia, fecha_operacion=op.fechaOperacion, id_usuario=ctx.id_usuario,
        id_tenant=ctx.id_tenant, dispositivo=ctx.dispositivo, codigo_sucursal=op.codigoSucursal,
    )


async def _guardar_conflicto(ctx: Contexto, op: OperacionIn, c: Conflicto) -> Resultado:
    ctx.session.add(
        ConflictoSincronizacion(
            uuidOperacion=str(op.uuidOperacion), tipoOperacion=op.tipo[:12], tipoConflicto=c.tipo, motivo=c.motivo,
            datosDispositivo=op.model_dump(mode="json"), datosServidor=c.servidor, monto=caja_srv.dinero(c.monto),
            codigoSucursal=op.codigoSucursal, idUsuario=ctx.id_usuario, idTenant=ctx.id_tenant,
            fechaOperacion=op.fechaOperacion,
        )
    )
    ctx.conflictos_nuevos += 1
    return Resultado(EN_CONFLICTO, motivo=c.motivo, tipo_conflicto=c.tipo)


# ==== [CU17] Sincronizar operaciones pendientes ====================
# Pasos 4 a 7 del flujo normal, por cada operacion del lote.
# ===================================================================
async def procesar_operacion(ctx: Contexto, op: OperacionIn) -> Resultado:
    session = ctx.session
    uuid = str(op.uuidOperacion)
    # Paso 5: ya procesada -> el resultado anterior, sin registrar nada nuevo.
    previo = await resultado_previo(session, uuid, ctx.id_tenant)
    if previo is not None:
        await _registrar(ctx, op, "Duplicada", f"Reenvio: {previo.estado}", previo.id_servidor)
        await session.commit()
        return previo

    rechazo = await _validar_contexto(ctx, op)
    autor, rechazo_autor = await autor_de(ctx, op)
    rechazo = rechazo or rechazo_autor
    ctx = replace(ctx, id_usuario=autor) if autor != ctx.id_usuario else ctx
    if rechazo:
        resultado = Resultado(RECHAZADA, motivo=rechazo)
    else:
        try:
            resultado = await APLICADORES[op.tipo](ctx, op)
        except Conflicto as c:
            await session.rollback()
            resultado = await _guardar_conflicto(ctx, op, c)
        except (HTTPException, ValidationError) as exc:
            await session.rollback()
            detalle = exc.detail if isinstance(exc, HTTPException) else "Los datos de la operacion no son validos"
            resultado = Resultado(RECHAZADA, motivo=str(detalle))
        except IntegrityError:
            # Otro envio simultaneo del mismo UUID o de la misma apertura de caja.
            await session.rollback()
            previo = await resultado_previo(session, uuid, ctx.id_tenant)
            return previo or Resultado(REINTENTAR, motivo="La operacion choco con otra simultanea")
    tipo_registro, detalle = registro_para(op, resultado)
    await _registrar(ctx, op, tipo_registro, detalle, resultado.id_servidor)
    await registrar_bitacora(ctx.session, f"Sincronizacion {op.tipo} {uuid[:8]}: {resultado.estado}", ctx.id_usuario, ctx.ip)
    await session.commit()
    return resultado


# --- Clientes (CU14 paso 4) --------------------------------------------------

async def crear_cliente_sin_cuenta(session: AsyncSession, id_tenant: int, nombre: str, ci: str | None, clave: str) -> Cliente:
    """Cliente sin cuenta de la tienda: el modelo exige un Usuario, asi que se
    crea uno que no puede iniciar sesion ni recibe correos."""
    rol = await session.scalar(select(Rol.codigoRol).where(Rol.nombreRol == "Cliente"))
    usuario = Usuario(
        nombre=nombre[:100], correo=f"{clave}@{DOMINIO_SIN_CORREO}", contraseña=hash_password(uuid4().hex),
        codigoRol=rol, requiereActivacion=True, idTenant=id_tenant,
    )
    session.add(usuario)
    await session.flush()
    cliente = Cliente(nombre=nombre[:100], idUser=usuario.idUser, ci=ci)
    session.add(cliente)
    await session.flush()
    return cliente


async def cliente_generico(session: AsyncSession, id_tenant: int) -> Cliente:
    """"Cliente generico" de la empresa, uno solo (CU14 paso 4)."""
    clave = f"cliente-generico-{id_tenant}"
    cliente = await session.scalar(
        select(Cliente).join(Usuario, Usuario.idUser == Cliente.idUser).where(Usuario.correo == f"{clave}@{DOMINIO_SIN_CORREO}")
    )
    return cliente or await crear_cliente_sin_cuenta(session, id_tenant, "Cliente generico", None, clave)


async def _resolver_cliente(ctx: Contexto, datos: DatosCliente, autorizacion: Autorizacion | None) -> int:
    session = ctx.session
    if autorizacion is not None and autorizacion.id_cliente is not None:
        return autorizacion.id_cliente
    if datos.clienteNuevo is not None:
        nuevo = datos.clienteNuevo
        existente = await session.scalar(
            select(Cliente)
            .join(Usuario, Usuario.idUser == Cliente.idUser)
            .where(Cliente.ci == nuevo.ci.strip(), Usuario.idTenant == ctx.id_tenant)
            .limit(1)
        )
        if existente is not None and not (autorizacion and autorizacion.crear_cliente):
            if existente.nombre.strip().lower() == nuevo.nombre.strip().lower():
                return existente.idCliente
            raise Conflicto(
                "cliente_duplicado",
                f"El CI {nuevo.ci} ya es de {existente.nombre}",
                {"idCliente": existente.idCliente, "nombre": existente.nombre, "ci": existente.ci},
            )
        cliente = await crear_cliente_sin_cuenta(session, ctx.id_tenant, nuevo.nombre, nuevo.ci.strip(), f"cliente-{uuid4().hex[:16]}")
        return cliente.idCliente
    if datos.idCliente is not None:
        if await session.get(Cliente, datos.idCliente) is None:
            raise HTTPException(status_code=400, detail="Cliente inexistente")
        return datos.idCliente
    return (await cliente_generico(session, ctx.id_tenant)).idCliente


# --- Inventario --------------------------------------------------------------

async def _revisar_lineas(ctx: Contexto, codigo_sucursal: int, items) -> list[LineaRevisada]:
    lineas = []
    for item in items:
        producto = await ctx.session.get(Producto, item.idProducto)
        nombre = item.nombre or (producto.nombre if producto else f"Producto {item.idProducto}")
        local = caja_srv.dinero(item.precioUnitario)
        if producto is None or producto.idTenant != ctx.id_tenant:
            lineas.append(LineaRevisada(item.idProducto, nombre, item.cantidad, local, None, 0, existe=False))
            continue
        inv = await ctx.session.scalar(
            select(Inventario)
            .where(Inventario.idProducto == item.idProducto, Inventario.codigoSucursal == codigo_sucursal)
            .with_for_update()
        )
        disponible = inv.cantidad_actual - inv.cantidad_reservada if inv else 0
        lineas.append(LineaRevisada(item.idProducto, nombre, item.cantidad, local, caja_srv.dinero(producto.venta), disponible))
    return lineas


def _datos_lineas(lineas: list[LineaRevisada]) -> dict:
    return {
        "lineas": [
            {
                "idProducto": l.id_producto, "nombre": l.nombre, "cantidad": l.cantidad,
                "precioCobrado": float(l.precio_local),
                "precioVigente": float(l.precio_servidor) if l.precio_servidor is not None else None,
                "disponible": l.disponible,
            }
            for l in lineas
        ]
    }


async def _ajustar_faltante(session: AsyncSession, id_producto: int, codigo_sucursal: int, cantidad: int, referencia: str) -> Inventario:
    """[CU18] paso 4: la prenda ya se entrego; el faltante entra como ajuste con
    alerta de discrepancia para que alguien cuente esa prenda."""
    inv = await dv._fila_inventario(session, id_producto, codigo_sucursal)
    faltante = cantidad - (inv.cantidad_actual - inv.cantidad_reservada)
    if faltante > 0:
        inv.cantidad_actual += faltante
        session.add(
            Movimiento(
                tipo="ajuste_discrepancia", cantidad=faltante, motivo=f"Discrepancia por operacion sin conexion {referencia}",
                idInv=inv.idInv, referencia=referencia,
            )
        )
    return inv


async def _pago_efectivo(ctx: Contexto, monto, fecha: datetime) -> MetodoPago:
    pago = MetodoPago(tipo="Efectivo", estado="Activo", monto=caja_srv.dinero(monto), fecha=fecha, idUserPago=ctx.id_usuario, consumidoEn=fecha)
    ctx.session.add(pago)
    await ctx.session.flush()
    return pago


async def _caja(ctx: Contexto, op: OperacionIn, uuid_caja) -> Caja | None:
    return await caja_srv.caja_de_operacion(
        ctx.session, ctx.id_tenant, op.codigoSucursal, str(uuid_caja) if uuid_caja else None, fecha_real(op)
    )


def _exigir_sucursal(op: OperacionIn) -> int:
    if op.codigoSucursal is None:
        raise HTTPException(status_code=400, detail="La operacion no indica la sucursal")
    return op.codigoSucursal


# ==== [CU14] Registrar venta de contado sin conexion ===============
# RN02: solo de contado. Si los datos del dispositivo no coinciden con los del
# servidor, queda en conflicto sin mover nada.
# ===================================================================
async def aplicar_venta(ctx: Contexto, op: OperacionIn, autorizacion: Autorizacion | None = None) -> Resultado:
    session = ctx.session
    datos = DatosVenta.model_validate(op.datos)
    if datos.formaPago != "Efectivo":
        raise HTTPException(status_code=400, detail="Sin conexion solo se aceptan pagos en efectivo")
    sucursal = _exigir_sucursal(op)
    id_cliente = await _resolver_cliente(ctx, datos, autorizacion)
    lineas = await _revisar_lineas(ctx, sucursal, datos.items)
    conflicto = clasificar_lineas(lineas)
    autoriza = autorizacion or Autorizacion()
    if conflicto is not None and not ((conflicto[0] == "stock_insuficiente" and autoriza.ajustar_stock)
                                      or (conflicto[0] == "precio_desactualizado" and autoriza.respetar_precio)):
        raise Conflicto(conflicto[0], conflicto[1], _datos_lineas(lineas), datos.total)

    fecha = fecha_real(op)
    total = sum((l.precio_local * l.cantidad for l in lineas), Decimal("0.00"))
    descuento = sum((max(l.precio_servidor - l.precio_local, Decimal("0")) * l.cantidad for l in lineas), Decimal("0.00"))
    pago = await _pago_efectivo(ctx, total, fecha)
    venta = Venta(
        total=total, idCliente=id_cliente, idMetPago=pago.idMetPago, fecha=fecha, descuentoAutorizado=descuento,
        **sync.campos_sincronizacion(op.uuidOperacion, op.fechaOperacion),
    )
    session.add(venta)
    await session.flush()
    for linea in lineas:
        inv = await _ajustar_faltante(session, linea.id_producto, sucursal, linea.cantidad, str(op.uuidOperacion)[:8])
        inv.cantidad_actual -= linea.cantidad
        session.add(DetalleVenta(cantidad=linea.cantidad, precio_unitario=linea.precio_local, idProducto=linea.id_producto, idVenta=venta.idVenta))
        # El motivo es exactamente "Venta N": asi lo buscan los reportes por sucursal,
        # el CU1 y el CU11. Que vino sin conexion lo dice la referencia.
        session.add(
            Movimiento(tipo="venta", cantidad=-linea.cantidad, motivo=f"Venta {venta.idVenta}", idInv=inv.idInv, referencia="sin_conexion")
        )
        session.add(Historial(idProducto=linea.id_producto, idCliente=id_cliente, idVenta=venta.idVenta))
    caja = await _caja(ctx, op, datos.uuidCaja)
    if caja is not None:
        await caja_srv.registrar_movimiento(
            session, caja, concepto="venta", monto=total, referencia=f"Venta {venta.idVenta}",
            id_usuario=ctx.id_usuario, uuid_operacion=str(op.uuidOperacion), fecha=fecha,
        )
    await session.flush()
    return Resultado(CONFIRMADA, id_servidor=venta.idVenta)


# ==== [CU15] Registrar reserva de prendas sin conexion =============
# ===================================================================
async def aplicar_reserva(ctx: Contexto, op: OperacionIn, autorizacion: Autorizacion | None = None) -> Resultado:
    session = ctx.session
    datos = DatosReserva.model_validate(op.datos)
    sucursal = _exigir_sucursal(op)
    id_cliente = await _resolver_cliente(ctx, datos, autorizacion)
    lineas = await _revisar_lineas(ctx, sucursal, datos.items)
    conflicto = clasificar_lineas(lineas, es_reserva=True)
    if conflicto is not None:
        servidor = _datos_lineas(lineas)
        if conflicto[0] == "reserva_sin_existencia":
            servidor["alternativas"] = await alternativas_reserva(ctx, sucursal, lineas[0].id_producto)
        raise Conflicto(conflicto[0], conflicto[1], servidor, datos.deposito)

    fecha = fecha_real(op)
    # La hora de retiro se guarda en la de Bolivia: es la que ve el cliente.
    limite = (datos.fechaLimite if datos.fechaLimite.tzinfo else datos.fechaLimite.replace(tzinfo=timezone.utc)).astimezone(HORA_BOLIVIA)
    pago = await _pago_efectivo(ctx, datos.deposito, fecha) if datos.deposito > 0 else None
    reserva = Reserva(
        fecha=limite.date(), horario=limite.time().replace(microsecond=0, tzinfo=None), estado="Pendiente", idCliente=id_cliente,
        codigoSucursal=sucursal, idProducto=lineas[0].id_producto, idMetPago=pago.idMetPago if pago else None,
        montoDeposito=caja_srv.dinero(datos.deposito) if pago else None,
        **sync.campos_sincronizacion(op.uuidOperacion, op.fechaOperacion),
    )
    session.add(reserva)
    await session.flush()
    for linea in lineas:
        inv = await dv._fila_inventario(session, linea.id_producto, sucursal)
        inv.cantidad_reservada += linea.cantidad
        session.add(
            DetalleReserva(
                codigoReserva=reserva.codigoReserva, idProducto=linea.id_producto, cantidad=linea.cantidad,
                precioUnitario=linea.precio_servidor,
            )
        )
    caja = await _caja(ctx, op, datos.uuidCaja)
    if caja is not None and pago is not None:
        await caja_srv.registrar_movimiento(
            session, caja, concepto="deposito_reserva", monto=datos.deposito, referencia=f"Reserva {reserva.codigoReserva}",
            id_usuario=ctx.id_usuario, uuid_operacion=str(op.uuidOperacion), fecha=fecha,
        )
    await session.flush()
    return Resultado(CONFIRMADA, id_servidor=reserva.codigoReserva)


async def alternativas_reserva(ctx: Contexto, sucursal: int, id_producto: int) -> dict:
    """[CU18] alt. 2: otras variantes del mismo modelo en la sucursal y otras
    sucursales con la misma prenda, con su existencia."""
    producto = await ctx.session.get(Producto, id_producto)
    variantes = []
    if producto is not None and producto.idModelo is not None:
        filas = (
            await ctx.session.execute(
                select(Producto.idProducto, Producto.nombre, Producto.talla, Producto.color,
                       (Inventario.cantidad_actual - Inventario.cantidad_reservada).label("disponible"))
                .join(Inventario, Inventario.idProducto == Producto.idProducto)
                .where(Producto.idModelo == producto.idModelo, Inventario.codigoSucursal == sucursal,
                       Inventario.cantidad_actual - Inventario.cantidad_reservada > 0)
            )
        ).mappings().all()
        variantes = [dict(f) for f in filas]
    otras = (
        await ctx.session.execute(
            select(Sucursal.codigoSucursal, Sucursal.nombre, (Inventario.cantidad_actual - Inventario.cantidad_reservada).label("disponible"))
            .join(Inventario, Inventario.codigoSucursal == Sucursal.codigoSucursal)
            .where(Inventario.idProducto == id_producto, Sucursal.idTenant == ctx.id_tenant, Sucursal.codigoSucursal != sucursal,
                   Inventario.cantidad_actual - Inventario.cantidad_reservada > 0)
        )
    ).mappings().all()
    return {"variantes": variantes, "sucursales": [dict(f) for f in otras]}


async def liberar_prendas_reserva(session: AsyncSession, reserva: Reserva) -> None:
    """Suelta todo lo apartado por la reserva (las reservas viejas no tienen detalle)."""
    detalles = (await session.execute(select(DetalleReserva).where(DetalleReserva.codigoReserva == reserva.codigoReserva))).scalars().all()
    pares = [(d.idProducto, d.cantidad) for d in detalles] or [(reserva.idProducto, 1)]
    for id_producto, cantidad in pares:
        inv = await session.scalar(
            select(Inventario)
            .where(Inventario.codigoSucursal == reserva.codigoSucursal, Inventario.idProducto == id_producto)
            .with_for_update()
        )
        if inv is not None:
            inv.cantidad_reservada = max(inv.cantidad_reservada - cantidad, 0)


# ==== [CU15] Flujo alternativo 3: cancelar antes de sincronizar ====
# ===================================================================
async def aplicar_cancelacion(ctx: Contexto, op: OperacionIn) -> Resultado:
    session = ctx.session
    datos = DatosCancelarReserva.model_validate(op.datos)
    fecha = fecha_real(op)
    uuid_reserva = str(datos.uuidReserva) if datos.uuidReserva else None
    if uuid_reserva:
        conflicto = await session.scalar(
            select(ConflictoSincronizacion).where(
                ConflictoSincronizacion.uuidOperacion == uuid_reserva,
                ConflictoSincronizacion.idTenant == ctx.id_tenant,
                ConflictoSincronizacion.estado == "Pendiente",
            )
        )
        if conflicto is not None:
            # La reserva nunca se aplico: se cierra su conflicto y no hay nada que liberar.
            conflicto.estado, conflicto.resultado, conflicto.decision = "Resuelto", ANULADA, "cancelada_en_dispositivo"
            conflicto.idResolvio, conflicto.fechaResolucion = ctx.id_usuario, fecha
    reserva = None
    if uuid_reserva:
        reserva = await session.scalar(select(Reserva).where(Reserva.uuidOperacion == uuid_reserva))
    elif datos.codigoReserva is not None:
        reserva = await session.get(Reserva, datos.codigoReserva)
    if reserva is None:
        return Resultado(CONFIRMADA, motivo="La reserva nunca llego a registrarse en el servidor")
    sucursal = await session.get(Sucursal, reserva.codigoSucursal)
    if sucursal is None or sucursal.idTenant != ctx.id_tenant:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    if reserva.estado in ("Pendiente", "Preparada en Sucursal"):
        await liberar_prendas_reserva(session, reserva)
        reserva.estado = "Cancelada"
        caja = await _caja(ctx, op, datos.uuidCaja)
        if caja is not None and datos.devolverDeposito > 0:
            await caja_srv.registrar_movimiento(
                session, caja, concepto="devolucion_deposito", monto=datos.devolverDeposito,
                referencia=f"Reserva {reserva.codigoReserva}", id_usuario=ctx.id_usuario,
                uuid_operacion=str(op.uuidOperacion), fecha=fecha,
            )
    await session.flush()
    return Resultado(CONFIRMADA, id_servidor=reserva.codigoReserva)


async def _venta_del_cambio(ctx: Contexto, datos: DatosCambio, op: OperacionIn) -> Venta:
    session = ctx.session
    venta = None
    if datos.uuidVenta is not None:
        venta = await session.scalar(select(Venta).where(Venta.uuidOperacion == str(datos.uuidVenta)))
        if venta is None:
            # [CU17] flujo alternativo 4: la venta de la que depende aun no se confirmo.
            raise Conflicto(
                "dependencia_pendiente", "La venta original sin conexion todavia no esta confirmada",
                {"uuidVenta": str(datos.uuidVenta)}, datos.montoCobrado,
            )
    elif datos.idVenta is not None:
        venta = await session.get(Venta, datos.idVenta)
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return venta


# ==== [CU19] Registrar cambio de prenda sin conexion ===============
# El servidor reaplica la politica con la fecha real del cambio. Si no la
# cumple, queda en conflicto (flujo alternativo 4). El saldo a favor no se
# entrega sin conexion: al sincronizar queda como reembolso en efectivo
# pendiente con su nota de devolucion (ya no existen las notas de credito).
# ===================================================================
async def aplicar_cambio(ctx: Contexto, op: OperacionIn, autorizacion: Autorizacion | None = None) -> Resultado:
    from app.routers import returns as rt  # evita importar los routers al cargar los servicios

    session = ctx.session
    datos = DatosCambio.model_validate(op.datos)
    sucursal = _exigir_sucursal(op)
    autoriza = autorizacion or Autorizacion()
    venta = await _venta_del_cambio(ctx, datos, op)
    lineas = await dv.lineas_de_venta(session, venta)
    linea = next((l for l in lineas if l.idProducto == datos.idProducto), None)
    if linea is None or linea.producto.idTenant != ctx.id_tenant:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    fecha = fecha_real(op)
    politica, fila_politica = await dv.politica_vigente(session, ctx.id_tenant, venta.fecha)
    if autoriza.saltar_politica:
        politica = _sin_limites(politica)

    nuevo = await session.get(Producto, datos.idProductoNuevo)
    if nuevo is None or nuevo.idTenant != ctx.id_tenant:
        raise Conflicto("producto_desactivado", "La prenda entregada ya no existe en el catalogo", monto=datos.montoCobrado)
    inv_nuevo = await session.scalar(
        select(Inventario)
        .where(Inventario.idProducto == nuevo.idProducto, Inventario.codigoSucursal == sucursal)
        .with_for_update()
    )
    disponible = inv_nuevo.cantidad_actual - inv_nuevo.cantidad_reservada if inv_nuevo else 0
    if disponible < datos.cantidad:
        if not autoriza.ajustar_stock:
            raise Conflicto(
                "stock_insuficiente", f"Sin existencia de {nuevo.nombre} talla {nuevo.talla} (hay {disponible})",
                {"idProducto": nuevo.idProducto, "disponible": disponible}, datos.montoCobrado,
            )
        await _ajustar_faltante(session, nuevo.idProducto, sucursal, datos.cantidad, str(op.uuidOperacion)[:8])

    try:
        async with session.begin_nested():
            caso, _ = await rt._nuevo_caso(
                session, venta=venta, linea=linea, cantidad=datos.cantidad, politica=politica, fila_politica=fila_politica,
                motivo_categoria="defecto" if datos.condicion == "defectuosa" else datos.motivoCategoria,
                tipo=datos.tipo, ahora=fecha,
            )
            decision = dv.decidir_inspeccion(datos.condicion, politica, coincide=True, acepta_descuento=True)
            if decision.estado == "Rechazada":
                raise HTTPException(status_code=409, detail=decision.motivo_rechazo)
            caso.estado, caso.origen, caso.origenRegistro = "Aprobada", "tienda", "sin_conexion"
            caso.uuidOperacion = str(op.uuidOperacion)
            caso.motivo = datos.motivo
            caso.codigoSucursal = sucursal
            caso.idUsuario = caso.idInspector = ctx.id_usuario
            caso.condicion, caso.fechaInspeccion = datos.condicion, fecha
            if decision.descuento_pct > 0:
                valor = Decimal(str(caso.precioPagado or 0)) * caso.cantidad
                caso.descuentoDeterioro = dv.dinero(valor * decision.descuento_pct / 100)
            session.add(caso)
            await rt._nuevo_codigo(session, caso)

            credito = dv.credito_del_caso(dv.dinero(linea.precio_pagado * caso.cantidad), caso.recargo, caso.descuentoDeterioro, caso.costoDomicilio)
            diferencia = dv.diferencia_variante(
                precio_pagado=linea.precio_pagado, precio_actual_original=linea.producto.venta,
                precio_actual_nueva=nuevo.venta, cantidad=caso.cantidad, credito=credito,
                respetar_precio_original=politica.respetarPrecioOriginal,
            )
            cobrado = dv.dinero(datos.montoCobrado)
            if diferencia > cobrado and not autoriza.respetar_precio:
                raise Conflicto(
                    "precio_desactualizado", f"La diferencia real es Bs {diferencia} y se cobraron Bs {cobrado}",
                    {"diferenciaServidor": float(diferencia), "cobrado": float(cobrado)}, diferencia,
                )
            pago = await _pago_diferencia(ctx, diferencia, cobrado, fecha)
            await dv.resolver_caso(
                session, caso, venta=venta, linea=linea,
                res=dv.Resolucion(
                    tipo=datos.tipo, id_producto_nuevo=nuevo.idProducto, sucursal_entrega=sucursal,
                    id_met_pago_diferencia=pago, sin_conexion=True,
                ),
                politica=politica, id_usuario=ctx.id_usuario, puede_autorizar=True,
            )
            # Se cobro de mas contra lo que calculo el servidor: tambien se devuelve.
            sobrante = cobrado - max(diferencia, Decimal("0.00"))
            if sobrante > 0:
                dv.dejar_saldo_pendiente(caso, dv.dinero(caso.montoDevuelto) + sobrante)
    except (HTTPException, dv.AutorizacionRequerida) as exc:
        motivo = exc.detail if isinstance(exc, HTTPException) else exc.motivo
        raise Conflicto("politica_incumplida", str(motivo), {"politica": politica.plazoCambioHoras}, datos.montoCobrado)

    caja = await _caja(ctx, op, datos.uuidCaja)
    if caja is not None and cobrado > 0:
        await caja_srv.registrar_movimiento(
            session, caja, concepto="diferencia_cambio", monto=cobrado, referencia=caso.codigo,
            id_usuario=ctx.id_usuario, uuid_operacion=str(op.uuidOperacion), fecha=fecha,
        )
    await session.flush()
    return Resultado(CONFIRMADA, id_servidor=caso.idDevolucion)


def _sin_limites(politica: dv.Politica) -> dv.Politica:
    """El Encargado acepto el cambio: las prendas ya se entregaron."""
    return replace(politica, plazoCambioHoras=24 * 3650, plazoGarantiaDias=3650, maxCambiosPorPrenda=999, accionDeterioro="descuento")


async def _pago_diferencia(ctx: Contexto, diferencia: Decimal, cobrado: Decimal, fecha: datetime) -> int | None:
    if diferencia <= 0:
        return None
    pago = MetodoPago(tipo="Efectivo", estado="Activo", monto=max(diferencia, cobrado), fecha=fecha, idUserPago=ctx.id_usuario)
    ctx.session.add(pago)
    await ctx.session.flush()
    return pago.idMetPago


# ==== [CU19] Flujo alternativo 3: recepcion en custodia ============
# La venta no estaba en el dispositivo: la prenda queda en custodia y el
# Encargado completa el tramite al recuperar la conexion (CU18).
# ===================================================================
async def aplicar_custodia(ctx: Contexto, op: OperacionIn) -> Resultado:
    datos = DatosCustodia.model_validate(op.datos)
    raise Conflicto(
        "recepcion_custodia", f"Prenda en custodia de {datos.clienteNombre}: {datos.descripcionPrenda}"[:255],
        {"comprobante": datos.comprobante},
    )


# ==== [CU20] Apertura y cierre registrados sin conexion ============
# ===================================================================
async def aplicar_apertura(ctx: Contexto, op: OperacionIn) -> Resultado:
    datos = DatosAperturaCaja.model_validate(op.datos)
    sucursal = _exigir_sucursal(op)
    existente = await caja_srv.caja_abierta(ctx.session, sucursal)
    if existente is not None:
        # Flujo alternativo 3: la caja ya estaba abierta; las operaciones se suman a ella.
        return Resultado(CONFIRMADA, id_servidor=existente.idCaja, motivo="La caja ya estaba abierta en otro dispositivo")
    caja = Caja(
        uuidOperacion=str(op.uuidOperacion), origenRegistro="sin_conexion", codigoSucursal=sucursal, idTenant=ctx.id_tenant,
        idUsuarioApertura=ctx.id_usuario, montoInicial=caja_srv.dinero(datos.montoInicial), fechaApertura=fecha_real(op),
    )
    ctx.session.add(caja)
    await ctx.session.flush()
    return Resultado(CONFIRMADA, id_servidor=caja.idCaja)


async def aplicar_cierre(ctx: Contexto, op: OperacionIn) -> Resultado:
    datos = DatosCierreCaja.model_validate(op.datos)
    caja = await _caja(ctx, op, datos.uuidCaja)
    if caja is None:
        raise HTTPException(status_code=404, detail="La caja de esta operacion no existe en el servidor")
    if caja.estado != caja_srv.ABIERTA:
        return Resultado(CONFIRMADA, id_servidor=caja.idCaja, motivo="La caja ya estaba cerrada")
    await caja_srv.cerrar_caja(
        ctx.session, caja, contado=datos.efectivoContado, justificacion=datos.justificacion, id_usuario=ctx.id_usuario,
        puede_aprobar="caja.aprobar" in ctx.permisos, pendientes=[str(u) for u in datos.pendientes], fecha=fecha_real(op),
    )
    return Resultado(CONFIRMADA, id_servidor=caja.idCaja)


APLICADORES = {
    "venta": aplicar_venta,
    "reserva": aplicar_reserva,
    "cancelar_reserva": aplicar_cancelacion,
    "cambio": aplicar_cambio,
    "custodia": aplicar_custodia,
    "caja_apertura": aplicar_apertura,
    "caja_cierre": aplicar_cierre,
}
