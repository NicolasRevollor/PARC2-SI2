"""Compras de demostracion para clientes existentes, sin cobros ni correos.

Desde backend/: python -m app.demo_cupones --tenant 1 --clientes 5
Las tres compras por cuenta descuentan stock real de la base seleccionada.
Una sola transaccion; los UUID estables evitan duplicarlas al reejecutar.
"""

import argparse
import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

class DemoError(ValueError):
    """Mensaje del generador que puede mostrarse sin exponer configuracion."""


def uuid_compra(id_tenant: int, id_cliente: int, numero: int) -> str:
    return str(uuid5(NAMESPACE_URL, f"youshop:demo-cupones:v1:{id_tenant}:{id_cliente}:{numero}"))


async def preparar(session, id_tenant: int, cantidad_clientes: int) -> list[dict]:
    from app.models import (
        Cliente, Cupon, DetalleVenta, Historial, Inventario, MetodoPago,
        Movimiento, Notificacion, Producto, Rol, Sucursal, Tenant, Usuario, Venta,
    )
    from app.services import cupones
    from app.services.bitacora import registrar_bitacora

    # Serializa dos ejecuciones del generador en la misma tienda.
    tenant = await session.get(Tenant, id_tenant, with_for_update=True)
    if tenant is None or tenant.estado != "Activo":
        raise DemoError("La empresa indicada no existe o no esta activa")
    ahora = datetime.now(timezone.utc)
    if tenant.inicioFidelidad is None or tenant.inicioFidelidad > ahora:
        raise DemoError("El programa de fidelidad de esta empresa todavia no inicio")

    clientes = (await session.execute(
        select(Cliente, Usuario).join(Usuario, Usuario.idUser == Cliente.idUser)
        .join(Rol, Rol.codigoRol == Usuario.codigoRol)
        .where(Usuario.idTenant == id_tenant, Usuario.activo.is_(True),
               Usuario.cuentaActivada.is_(True), Usuario.requiereActivacion.is_(False),
               Rol.nombreRol == "Cliente")
        .order_by(Cliente.idCliente).limit(cantidad_clientes)
    )).all()
    if len(clientes) < cantidad_clientes:
        raise DemoError(f"Se necesitan {cantidad_clientes} clientes activos con cuenta habilitada en esta tienda; hay {len(clientes)}")

    resumen = []
    for cliente, usuario in clientes:
        creadas = []
        for numero in range(1, 4):
            uuid = uuid_compra(id_tenant, cliente.idCliente, numero)
            if await session.scalar(select(Venta.idVenta).where(Venta.uuidOperacion == uuid)):
                continue
            # Se utiliza una prenda disponible; nunca se crea stock artificial.
            fila = (await session.execute(
                select(Inventario, Producto)
                .join(Producto, Producto.idProducto == Inventario.idProducto)
                .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
                .where(Producto.idTenant == id_tenant, Sucursal.idTenant == id_tenant,
                       Producto.venta > 0,
                       Inventario.cantidad_actual - Inventario.cantidad_reservada > 0)
                .order_by(Producto.venta, Inventario.idInv)
                .limit(1).with_for_update(of=Inventario)
            )).first()
            if fila is None:
                raise DemoError("Stock insuficiente para preparar todas las compras. Se revierte la transaccion completa")
            inventario, producto = fila
            precio = Decimal(str(producto.venta))
            pago = MetodoPago(
                tipo="Compra demo (sin cobro)", estado="Activo", monto=precio,
                moneda="BOB", origen="demo_cupon", idUserPago=usuario.idUser,
                consumidoEn=ahora,
            )
            session.add(pago)
            await session.flush()
            venta = Venta(
                fecha=ahora, total=precio, idCliente=cliente.idCliente,
                idMetPago=pago.idMetPago, uuidOperacion=uuid,
                origenRegistro="en_linea", estadoSincronizacion="Sincronizada",
            )
            session.add(venta)
            await session.flush()
            inventario.cantidad_actual -= 1
            session.add_all([
                DetalleVenta(cantidad=1, precio_unitario=precio,
                             idProducto=producto.idProducto, idVenta=venta.idVenta),
                Movimiento(tipo="venta", cantidad=-1, idInv=inventario.idInv,
                           motivo=f"DEMO CUPONES: venta {venta.idVenta}, sin cobro real",
                           referencia=f"DEMO-CUP-{venta.idVenta}"),
                Historial(idProducto=producto.idProducto, idCliente=cliente.idCliente, idVenta=venta.idVenta),
            ])
            # Misma regla de emision que las compras de la tienda, no cupones regalados a mano.
            await cupones.registrar_compra(
                session, id_cliente=cliente.idCliente, id_tenant=id_tenant, id_venta=venta.idVenta,
            )
            # El generador solo deja avisos en la app; no encola correos de demo.
            for objeto in session.new:
                if isinstance(objeto, Notificacion):
                    objeto.porCorreo = False
            await registrar_bitacora(
                session, f"DEMO CUPONES: venta {venta.idVenta} sin cobro real", usuario.idUser, "127.0.0.1",
            )
            await session.flush()
            creadas.append(venta.idVenta)

        disponibles = (await session.execute(
            select(Cupon).where(Cupon.idCliente == cliente.idCliente, Cupon.idTenant == id_tenant,
                                Cupon.estado == "Disponible", Cupon.fechaVencimiento > ahora)
            .order_by(Cupon.idCupon.desc())
        )).scalars().all()
        comprobacion = None
        if disponibles:
            cupon = await cupones.cupon_para_compra(
                session, disponibles[0].idCupon, id_cliente=cliente.idCliente, id_tenant=id_tenant,
            )
            producto = await session.scalar(select(Producto).where(
                Producto.idTenant == id_tenant, Producto.venta > 0,
            ).order_by(Producto.idProducto).limit(1))
            cotizacion = await cupones.cotizar(session, [SimpleNamespace(idProducto=producto.idProducto, cantidad=1)], cupon)
            comprobacion = {
                "idProducto": producto.idProducto, "subtotal": str(cotizacion.subtotal),
                "descuento": str(cotizacion.descuento), "total": str(cotizacion.total),
            }
        resumen.append({
            "idUser": usuario.idUser, "idCliente": cliente.idCliente,
            "cliente": cliente.nombre, "correo": usuario.correo,
            "ventasDemoCreadas": creadas,
            "comprasValidas": await cupones.compras_validas(session, cliente.idCliente, id_tenant),
            "cuponesDisponibles": [{"idCupon": c.idCupon, "codigo": c.codigo, "porcentaje": str(c.porcentaje)} for c in disponibles],
            "cotizacionConCupon": comprobacion,
        })
    return resumen


async def main(id_tenant: int, clientes: int):
    from app.database import AsyncSessionLocal, engine

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                resumen = await preparar(session, id_tenant, clientes)
        # Solo se informa exito despues del commit.
        print(json.dumps(resumen, ensure_ascii=False, indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant", type=int, default=1)
    parser.add_argument("--clientes", type=int, default=5)
    args = parser.parse_args()
    if args.clientes < 5:
        parser.error("Prepare al menos cinco clientes")
    try:
        asyncio.run(main(args.tenant, args.clientes))
    except Exception as exc:
        # No imprimir excepciones de conexion: pueden incluir credenciales/URL.
        mensaje = str(exc) if isinstance(exc, DemoError) else type(exc).__name__
        raise SystemExit(f"No se completaron las compras demo: {mensaje}") from None
