# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU33] Obtener y usar cupon de descuento por compras
# Control del diagrama: ControlCupones
#   contarCompras()   -> compras_validas(): compras del cliente en la empresa desde
#                        que arranco el programa, sin las devueltas por completo.
#   emitirCupon()     -> registrar_compra(): despues de cada compra; al llegar a 3,
#                        6, 9... compras genera un cupon y le avisa al cliente.
#   validarCupon()    -> cupon_para_compra(): es suyo, de esta empresa, esta
#                        disponible y no vencio.
#   aplicarDescuento()-> precio_con_descuento(): 30% sobre cada prenda (el precio
#                        con descuento queda en el detalle de la venta, asi una
#                        devolucion reembolsa lo que de verdad se pago).
#   marcarUsado()     -> marcar_usado(): un cupon sirve una sola vez.
# Pantallas: checkout de la tienda en linea (web y app) y POS.
# ==================================================================
"""Cupones de fidelidad: cada 3 compras, 30% en la siguiente."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cupon, DetalleVenta, Devolucion, Producto, Tenant, Venta
from app.services import notificaciones as notif

COMPRAS_POR_CUPON = 3
PORCENTAJE = Decimal("30")
VIGENCIA_DIAS = 90
ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I: se dicta sin confusion


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def precio_con_descuento(precio, porcentaje) -> Decimal:
    """[CU33] aplicarDescuento: el precio de una prenda con el cupon."""
    factor = (Decimal("100") - Decimal(str(porcentaje))) / Decimal("100")
    return (Decimal(str(precio)) * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def faltan_para_cupon(compras: int) -> int:
    """Cuantas compras le faltan para el proximo cupon (1, 2 o 3)."""
    return COMPRAS_POR_CUPON - (compras % COMPRAS_POR_CUPON)


def cupones_que_corresponden(compras: int) -> int:
    return compras // COMPRAS_POR_CUPON


def _ventas_de_la_empresa(id_tenant: int):
    """Ventas con al menos una prenda de la empresa."""
    return exists().where(
        DetalleVenta.idVenta == Venta.idVenta,
        DetalleVenta.idProducto == Producto.idProducto,
        Producto.idTenant == id_tenant,
    )


# ==== [CU33] ControlCupones.contarCompras() ========================
async def compras_validas(session: AsyncSession, id_cliente: int, id_tenant: int) -> int:
    """Compras desde el inicio del programa; una compra devuelta por completo no cuenta."""
    inicio = await session.scalar(select(Tenant.inicioFidelidad).where(Tenant.idTenant == id_tenant))
    if inicio is None:
        return 0
    unidades = (
        select(func.coalesce(func.sum(DetalleVenta.cantidad), 0)).where(DetalleVenta.idVenta == Venta.idVenta).scalar_subquery()
    )
    devueltas = (
        select(func.coalesce(func.sum(Devolucion.cantidad), 0))
        .where(Devolucion.idVenta == Venta.idVenta, Devolucion.tipo == "devolucion", Devolucion.estado == "Completada")
        .scalar_subquery()
    )
    return int(
        await session.scalar(
            select(func.count(Venta.idVenta)).where(
                Venta.idCliente == id_cliente, Venta.fecha >= inicio, _ventas_de_la_empresa(id_tenant), unidades > devueltas,
            )
        )
        or 0
    )


async def vencer(session: AsyncSession, **filtros) -> None:
    """Un cupon disponible que paso su fecha queda Vencido (se aplica al consultar)."""
    condiciones = [Cupon.estado == "Disponible", Cupon.fechaVencimiento < _ahora()]
    condiciones += [getattr(Cupon, campo) == valor for campo, valor in filtros.items() if valor is not None]
    for cupon in (await session.execute(select(Cupon).where(*condiciones))).scalars():
        cupon.estado = "Vencido"
    await session.flush()


async def _codigo_nuevo(session: AsyncSession) -> str:
    while True:
        codigo = "CUP-" + "".join(secrets.choice(ALFABETO) for _ in range(6))
        if not await session.scalar(select(exists().where(Cupon.codigo == codigo))):
            return codigo


# ==== [CU33] ControlCupones.emitirCupon() ==========================
async def registrar_compra(session: AsyncSession, *, id_cliente: int, id_tenant: int, id_venta: int) -> Cupon | None:
    """Se llama despues de cada compra. Si las compras llegaron a otro multiplo
    de 3, emite el cupon que corresponde (nunca dos por la misma vuelta)."""
    await session.flush()
    compras = await compras_validas(session, id_cliente, id_tenant)
    emitidos = int(
        await session.scalar(select(func.count(Cupon.idCupon)).where(Cupon.idCliente == id_cliente, Cupon.idTenant == id_tenant)) or 0
    )
    if cupones_que_corresponden(compras) <= emitidos:
        return None
    ahora = _ahora()
    cupon = Cupon(
        codigo=await _codigo_nuevo(session), idTenant=id_tenant, idCliente=id_cliente, numero=emitidos + 1,
        porcentaje=PORCENTAJE, estado="Disponible", fechaEmision=ahora,
        fechaVencimiento=ahora + timedelta(days=VIGENCIA_DIAS), idVentaOrigen=id_venta,
    )
    session.add(cupon)
    await session.flush()
    empresa = await session.scalar(select(Tenant.nombre).where(Tenant.idTenant == id_tenant))
    await notif.notificar_cliente(
        session, id_cliente, id_tenant, tipo="cupon", referencia=cupon.codigo,
        titulo=f"Ganaste un cupon del {int(PORCENTAJE)}% en {empresa}",
        mensaje=(f"Por tus {compras} compras te regalamos el cupon {cupon.codigo}: {int(PORCENTAJE)}% de descuento en tu "
                 f"proxima compra de cualquier producto. Vence el {notif.fecha_texto(cupon.fechaVencimiento)}."),
    )
    return cupon


# ==== [CU33] ControlCupones.validarCupon() =========================
async def cupon_para_compra(session: AsyncSession, id_cupon: int, *, id_cliente: int | None, id_tenant: int | None) -> Cupon:
    """El cupon tiene que ser del cliente, de la empresa de la compra, estar
    disponible y no vencido. Se bloquea la fila: dos compras no pueden usarlo."""
    cupon = await session.get(Cupon, id_cupon, with_for_update=True)
    if cupon is None or (id_cliente is not None and cupon.idCliente != id_cliente):
        raise HTTPException(status_code=404, detail="Cupon no encontrado")
    if id_tenant is not None and cupon.idTenant != id_tenant:
        raise HTTPException(status_code=400, detail="El cupon es de otra tienda: solo vale para las prendas de esa empresa")
    if cupon.estado == "Disponible" and cupon.fechaVencimiento < _ahora():
        cupon.estado = "Vencido"
    if cupon.estado == "Usado":
        raise HTTPException(status_code=409, detail=f"El cupon {cupon.codigo} ya fue usado")
    if cupon.estado == "Vencido":
        raise HTTPException(status_code=409, detail=f"El cupon {cupon.codigo} vencio")
    return cupon


# ==== [CU33] ControlCupones.marcarUsado() ==========================
def marcar_usado(cupon: Cupon, id_venta: int, descuento: Decimal) -> None:
    cupon.estado, cupon.idVentaUso, cupon.fechaUso = "Usado", id_venta, _ahora()
    cupon.montoDescontado = descuento


@dataclass
class Cotizacion:
    id_tenant: int
    subtotal: Decimal
    descuento: Decimal
    total: Decimal


async def tenant_de_los_items(session: AsyncSession, items: list) -> int:
    tenants = set()
    for item in items:
        producto = await session.get(Producto, item.idProducto)
        if producto is None:
            raise HTTPException(status_code=400, detail=f"Producto {item.idProducto} inexistente")
        tenants.add(producto.idTenant)
    if len(tenants) != 1:
        raise HTTPException(status_code=400, detail="Todas las prendas de una compra deben ser de la misma tienda")
    return tenants.pop()


async def cotizar(session: AsyncSession, items: list, cupon: Cupon | None) -> Cotizacion:
    """Subtotal, descuento y total de unos items, con o sin cupon (mismo calculo que la venta)."""
    subtotal, total = Decimal("0.00"), Decimal("0.00")
    id_tenant = await tenant_de_los_items(session, items)
    for item in items:
        producto = await session.get(Producto, item.idProducto)
        precio = Decimal(str(producto.venta))
        subtotal += precio * item.cantidad
        total += (precio_con_descuento(precio, cupon.porcentaje) if cupon else precio) * item.cantidad
    return Cotizacion(id_tenant, subtotal, subtotal - total, total)


def cupon_out(c: Cupon, empresa: str | None = None) -> dict:
    return {
        "idCupon": c.idCupon, "codigo": c.codigo, "idTenant": c.idTenant, "empresa": empresa, "idCliente": c.idCliente,
        "porcentaje": float(c.porcentaje), "estado": c.estado, "fechaEmision": c.fechaEmision,
        "fechaVencimiento": c.fechaVencimiento, "idVentaOrigen": c.idVentaOrigen, "idVentaUso": c.idVentaUso,
        "montoDescontado": float(c.montoDescontado), "fechaUso": c.fechaUso,
    }
