# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU12] Preparar dispositivo para operacion sin conexion
# Control del diagrama: ControlPreparacion
# Pantalla (boundary) que lo usa: web/src/app/features/offline/prepare-device.component.ts
# En palabras simples: arma por secciones y por paginas lo que el dispositivo
#   guarda para trabajar sin internet. Al ir por paginas, si la conexion se corta
#   lo descargado se conserva y se sigue desde donde quedo (flujo alternativo 4).
# ==================================================================
"""Datos que descarga el dispositivo (CU12 paso 4)."""

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cliente, DetalleReserva, DetalleVenta, Inventario, Producto, Reserva, Sucursal, Usuario, Venta
from app.services import devoluciones as dv

SECCIONES = ("sucursales", "productos", "inventario", "clientes", "reservas", "ventas", "politica")
DIAS_VENTAS_RECIENTES = 30
ESTADOS_RESERVA_VIGENTE = ("Pendiente", "Preparada en Sucursal")


def _ventas_de_la_empresa(id_tenant: int):
    return (
        select(DetalleVenta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .where(Producto.idTenant == id_tenant)
    )


def _consultas(id_tenant: int, sucursal: int, autorizadas: set[int] | None) -> dict:
    """Consulta base de cada seccion (se cuenta y se pagina igual)."""
    sucursales = select(Sucursal).where(Sucursal.idTenant == id_tenant)
    if autorizadas is not None:
        sucursales = sucursales.where(Sucursal.codigoSucursal.in_(autorizadas))
    desde = datetime.now(timezone.utc) - timedelta(days=DIAS_VENTAS_RECIENTES)
    return {
        "sucursales": sucursales.order_by(Sucursal.nombre),
        "inventario": select(Inventario).where(Inventario.codigoSucursal == sucursal).order_by(Inventario.idInv),
        "clientes": select(Cliente).join(Usuario, Usuario.idUser == Cliente.idUser).where(Usuario.idTenant == id_tenant).order_by(Cliente.nombre),
        "reservas": select(Reserva).where(Reserva.codigoSucursal == sucursal, Reserva.estado.in_(ESTADOS_RESERVA_VIGENTE)).order_by(Reserva.fecha),
        "ventas": select(Venta).where(Venta.idVenta.in_(_ventas_de_la_empresa(id_tenant)), Venta.fecha >= desde).order_by(Venta.fecha.desc()),
    }


async def contar(session: AsyncSession, id_tenant: int, sucursal: int, autorizadas: set[int] | None) -> dict[str, int]:
    totales = {
        seccion: int(await session.scalar(select(func.count()).select_from(consulta.order_by(None).subquery())) or 0)
        for seccion, consulta in _consultas(id_tenant, sucursal, autorizadas).items()
    }
    totales["productos"] = int(await session.scalar(select(func.count()).select_from(Producto).where(Producto.idTenant == id_tenant)) or 0)
    totales["politica"] = 1
    return totales


def _producto(p: Producto, rotacion: int) -> dict:
    return {
        "idProducto": p.idProducto, "codigo": dv.codigo_de_producto(p.idProducto), "nombre": p.nombre, "tipo": p.tipo,
        "talla": p.talla, "color": p.color, "venta": float(p.venta), "idModelo": p.idModelo, "imagen_url": p.imagen_url,
        "rotacion": rotacion,
    }


async def _pagina_productos(session: AsyncSession, id_tenant: int, offset: int, tam: int) -> list[dict]:
    """Primero los de mayor rotacion: si el espacio no alcanza quedan los que mas
    se venden (flujo alternativo 3)."""
    vendidas = func.coalesce(func.sum(DetalleVenta.cantidad), 0)
    filas = (
        await session.execute(
            select(Producto, vendidas)
            .outerjoin(DetalleVenta, DetalleVenta.idProducto == Producto.idProducto)
            .where(Producto.idTenant == id_tenant)
            .group_by(Producto.idProducto)
            .order_by(vendidas.desc(), Producto.idProducto)
            .offset(offset)
            .limit(tam)
        )
    ).all()
    return [_producto(p, int(r)) for p, r in filas]


async def _reserva(session: AsyncSession, r: Reserva) -> dict:
    detalles = (await session.execute(select(DetalleReserva).where(DetalleReserva.codigoReserva == r.codigoReserva))).scalars().all()
    cliente = await session.get(Cliente, r.idCliente)
    return {
        "codigoReserva": r.codigoReserva, "uuidOperacion": str(r.uuidOperacion), "estado": r.estado,
        "fecha": r.fecha.isoformat(), "horario": r.horario.isoformat(), "idCliente": r.idCliente,
        "cliente": cliente.nombre if cliente else None, "montoDeposito": float(r.montoDeposito or 0),
        "lineas": [{"idProducto": d.idProducto, "cantidad": d.cantidad} for d in detalles],
    }


async def _venta(session: AsyncSession, v: Venta) -> dict:
    from app.routers import returns as rt

    cliente = await session.get(Cliente, v.idCliente)
    lineas = []
    for linea in await dv.lineas_de_venta(session, v):
        ocupadas = await dv.cantidad_ocupada(session, v.idVenta, linea.idProducto)
        p = linea.producto
        lineas.append({
            "idProducto": linea.idProducto, "nombre": p.nombre, "talla": p.talla, "color": p.color, "tipo": p.tipo,
            "idModelo": p.idModelo, "cantidad": linea.cantidad, "precioPagado": float(linea.precio_pagado),
            "disponibles": max(linea.cantidad - ocupadas, 0),
            "cambios": await rt._cambios_previos(session, v.idVenta, linea.idProducto),
        })
    return {
        "idVenta": v.idVenta, "uuidOperacion": str(v.uuidOperacion), "fecha": v.fecha.isoformat(), "idCliente": v.idCliente,
        "cliente": cliente.nombre if cliente else None, "ci": cliente.ci if cliente else None, "total": float(v.total), "lineas": lineas,
    }


async def _politica(session: AsyncSession, id_tenant: int) -> dict:
    politica, _ = await dv.politica_vigente(session, id_tenant, datetime.now(timezone.utc))
    valores = asdict(politica)
    return {
        k: float(v) if isinstance(v, Decimal) else list(v) if isinstance(v, tuple) else v
        for k, v in valores.items() if k != "condiciones"
    }


async def pagina(
    session: AsyncSession, seccion: str, id_tenant: int, sucursal: int, autorizadas: set[int] | None, numero: int, tam: int
) -> tuple[int, list[dict]]:
    if seccion == "politica":
        return 1, [await _politica(session, id_tenant)] if numero == 1 else []
    offset = (numero - 1) * tam
    totales = await contar(session, id_tenant, sucursal, autorizadas)
    if seccion == "productos":
        return totales["productos"], await _pagina_productos(session, id_tenant, offset, tam)
    filas = (await session.execute(_consultas(id_tenant, sucursal, autorizadas)[seccion].offset(offset).limit(tam))).scalars().all()
    if seccion == "sucursales":
        items = [{"codigoSucursal": s.codigoSucursal, "nombre": s.nombre, "direccion": s.direccion} for s in filas]
    elif seccion == "inventario":
        items = [
            {"idInv": i.idInv, "idProducto": i.idProducto, "codigoSucursal": i.codigoSucursal,
             "cantidad_actual": i.cantidad_actual, "cantidad_reservada": i.cantidad_reservada}
            for i in filas
        ]
    elif seccion == "clientes":
        items = [{"idCliente": c.idCliente, "nombre": c.nombre, "telefono": c.telefono, "ci": c.ci} for c in filas]
    elif seccion == "reservas":
        items = [await _reserva(session, r) for r in filas]
    else:
        items = [await _venta(session, v) for v in filas]
    return totales[seccion], items
