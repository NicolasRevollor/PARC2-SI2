# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU33] Obtener y usar cupon de descuento por compras
#   GET  /api/cupones/mios        cliente: sus cupones y cuantas compras le faltan
#   POST /api/cupones/cotizar     cliente o POS: total de un carrito con y sin cupon
#   GET  /api/cupones             personal: cupones de los clientes de la empresa
# La emision y el uso del cupon van dentro de la venta (routers/sales.py) y el
# cobro con tarjeta (routers/payments.py). Reglas: services/cupones.py
# ==================================================================
"""Cupones de fidelidad."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente, Cupon, DetalleVenta, Producto, Tenant, Venta
from app.security import get_current_payload, require_permiso
from app.services import cupones as cs
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/cupones", tags=["cupones"])


class ItemIn(BaseModel):
    idProducto: int
    cantidad: int = Field(gt=0)


class CotizarIn(BaseModel):
    items: list[ItemIn] = Field(min_length=1)
    idCupon: int | None = None
    # Solo el personal (POS) indica el cliente; el cliente usa el suyo.
    idCliente: int | None = None


async def _cliente_del_caller(session: AsyncSession, auth: dict) -> Cliente | None:
    return (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()


def _es_personal(auth: dict) -> bool:
    return "venta.ver" in auth.get("permisos", [])


@router.get("/mios")
async def mis_cupones(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    """Cupones del cliente y su avance hacia el proximo en cada tienda donde compro."""
    cliente = await _cliente_del_caller(session, auth)
    if cliente is None:
        raise HTTPException(status_code=403, detail="Solo un cliente tiene cupones")
    await cs.vencer(session, idCliente=cliente.idCliente)
    filas = (
        await session.execute(
            select(Cupon, Tenant.nombre).join(Tenant, Tenant.idTenant == Cupon.idTenant)
            .where(Cupon.idCliente == cliente.idCliente).order_by(Cupon.fechaEmision.desc())
        )
    ).all()
    tiendas = (
        await session.execute(
            select(Tenant.idTenant, Tenant.nombre).distinct()
            .join(Producto, Producto.idTenant == Tenant.idTenant)
            .join(DetalleVenta, DetalleVenta.idProducto == Producto.idProducto)
            .join(Venta, Venta.idVenta == DetalleVenta.idVenta)
            .where(Venta.idCliente == cliente.idCliente, Venta.fecha >= Tenant.inicioFidelidad)
        )
    ).all()
    progreso = []
    for id_tenant, nombre in tiendas:
        compras = await cs.compras_validas(session, cliente.idCliente, id_tenant)
        progreso.append({"idTenant": id_tenant, "empresa": nombre, "compras": compras,
                         "faltan": cs.faltan_para_cupon(compras), "comprasPorCupon": cs.COMPRAS_POR_CUPON})
    await session.commit()
    return {
        "cupones": [cs.cupon_out(c, empresa) for c, empresa in filas],
        "progreso": progreso,
        "regla": f"Cada {cs.COMPRAS_POR_CUPON} compras en una tienda ganas un cupon del {int(cs.PORCENTAJE)}% "
                 f"para tu siguiente compra de cualquier producto (vence a los {cs.VIGENCIA_DIAS} dias).",
    }


@router.post("/cotizar")
async def cotizar(
    payload: CotizarIn,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.crear")),
):
    """Total del carrito con el cupon elegido, y los cupones que sirven para esa tienda."""
    if _es_personal(auth):
        if payload.idCliente is None:
            raise HTTPException(status_code=400, detail="Indique el cliente")
        id_cliente = payload.idCliente
        id_tenant_staff = tenant_actual(auth)
    else:
        cliente = await _cliente_del_caller(session, auth)
        if cliente is None:
            raise HTTPException(status_code=403, detail="La cuenta no tiene un cliente asociado")
        id_cliente, id_tenant_staff = cliente.idCliente, None
    id_tenant = await cs.tenant_de_los_items(session, payload.items)
    if id_tenant_staff is not None and id_tenant != id_tenant_staff:
        raise HTTPException(status_code=400, detail="Las prendas no son de su empresa")
    cupon = await cs.cupon_para_compra(session, payload.idCupon, id_cliente=id_cliente, id_tenant=id_tenant) if payload.idCupon else None
    c = await cs.cotizar(session, payload.items, cupon)
    await cs.vencer(session, idCliente=id_cliente, idTenant=id_tenant)
    disponibles = (
        await session.execute(
            select(Cupon).where(Cupon.idCliente == id_cliente, Cupon.idTenant == id_tenant, Cupon.estado == "Disponible")
            .order_by(Cupon.fechaVencimiento)
        )
    ).scalars().all()
    compras = await cs.compras_validas(session, id_cliente, id_tenant)
    salida = {
        "subtotal": float(c.subtotal), "descuento": float(c.descuento), "total": float(c.total),
        "idCupon": payload.idCupon, "cuponesDisponibles": [cs.cupon_out(x) for x in disponibles],
        "compras": compras, "faltan": cs.faltan_para_cupon(compras),
    }
    await session.commit()  # guarda los vencimientos y suelta el bloqueo del cupon
    return salida


@router.get("")
async def cupones_de_la_empresa(
    idCliente: int | None = None,
    estado: str | None = None,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso("venta.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    await cs.vencer(session, idTenant=id_tenant)
    stmt = (
        select(Cupon, Cliente.nombre).join(Cliente, Cliente.idCliente == Cupon.idCliente)
        .where(Cupon.idTenant == id_tenant).order_by(Cupon.fechaEmision.desc()).limit(300)
    )
    if idCliente is not None:
        stmt = stmt.where(Cupon.idCliente == idCliente)
    if estado:
        stmt = stmt.where(Cupon.estado == estado)
    filas = (await session.execute(stmt)).all()
    await session.commit()
    return [{**cs.cupon_out(c), "cliente": nombre} for c, nombre in filas]
