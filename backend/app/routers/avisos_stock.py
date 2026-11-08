# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU34] Avisar cuando vuelve el stock de una talla
#   POST   /api/avisos-stock            el cliente pide que le avisen (la talla esta agotada)
#   GET    /api/avisos-stock/mios       sus pedidos de aviso y si ya volvio
#   DELETE /api/avisos-stock/{id}       ya no le interesa
#   GET    /api/avisos-stock            personal: que tallas esperan mas clientes (para reponer)
# Control: ControlAvisoStock (este archivo). El aviso en si lo dispara la base:
#   trigger "trg_avisar_reposicion" sobre Inventario (migracion 031), venga de
#   donde venga el stock (lote, traslado, devolucion, reserva cancelada...).
# ==================================================================
"""Avisos de reposicion de stock."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AvisoStock, Cliente, Inventario, Producto, Sucursal
from app.security import get_current_payload, require_permiso
from app.services import notificaciones as notif
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/avisos-stock", tags=["avisos-stock"])


class AvisoIn(BaseModel):
    idProducto: int


async def _cliente(session: AsyncSession, auth: dict) -> Cliente:
    cliente = (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=403, detail="Solo un cliente puede pedir avisos de stock")
    return cliente


async def disponible_total(session: AsyncSession, id_producto: int) -> int:
    return int(await session.scalar(
        select(func.coalesce(func.sum(Inventario.cantidad_actual - Inventario.cantidad_reservada), 0))
        .where(Inventario.idProducto == id_producto, Inventario.cantidad_actual > Inventario.cantidad_reservada)
    ) or 0)


def _out(a: AvisoStock, p: Producto, sucursal: str | None) -> dict:
    return {
        "idAviso": a.idAviso, "idProducto": a.idProducto, "producto": p.nombre, "talla": p.talla, "color": p.color,
        "precio": float(p.venta), "imagen_url": p.imagen_url, "estado": a.estado, "fechaRegistro": a.fechaRegistro,
        "fechaAviso": a.fechaAviso, "sucursal": sucursal,
    }


# ==== [CU34] ControlAvisoStock.registrarAviso() ====================
@router.post("", status_code=201)
async def pedir_aviso(
    payload: AvisoIn, background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload),
):
    cliente = await _cliente(session, auth)
    producto = await session.get(Producto, payload.idProducto)
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    # Alternativo: si ya hay stock, no tiene sentido esperar.
    if await disponible_total(session, producto.idProducto) > 0:
        raise HTTPException(status_code=409, detail="Esa talla ya tiene stock: podes comprarla ahora")
    existente = await session.scalar(
        select(AvisoStock).where(AvisoStock.idCliente == cliente.idCliente, AvisoStock.idProducto == producto.idProducto,
                                 AvisoStock.estado == "Pendiente")
    )
    if existente is None:
        existente = AvisoStock(idTenant=producto.idTenant, idCliente=cliente.idCliente, idProducto=producto.idProducto)
        session.add(existente)
        await session.flush()
        await notif.notificar_cliente(
            session, cliente.idCliente, producto.idTenant, tipo="stock", referencia=f"STK-{existente.idAviso}",
            titulo=f"Te avisaremos cuando vuelva {producto.nombre} talla {producto.talla or '-'}",
            mensaje="Apenas haya stock de nuevo te llega un aviso en la app y por correo.",
        )
    await session.commit()
    notif.programar_correos(background_tasks)
    return _out(existente, producto, None)


@router.get("/estado/{idProducto}")
async def estado_producto(idProducto: int, session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    """[CU34] paso 1: si la talla esta agotada (sin mostrar cantidades) y si ya pidio el aviso."""
    cliente = await _cliente(session, auth)
    pendiente = await session.scalar(
        select(AvisoStock).where(AvisoStock.idCliente == cliente.idCliente, AvisoStock.idProducto == idProducto,
                                 AvisoStock.estado == "Pendiente")
    )
    return {"agotado": await disponible_total(session, idProducto) <= 0,
            "idAviso": pendiente.idAviso if pendiente else None}


@router.get("/mios")
async def mis_avisos(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    cliente = await _cliente(session, auth)
    filas = (await session.execute(
        select(AvisoStock, Producto, Sucursal.nombre)
        .join(Producto, Producto.idProducto == AvisoStock.idProducto)
        .outerjoin(Sucursal, Sucursal.codigoSucursal == AvisoStock.codigoSucursal)
        .where(AvisoStock.idCliente == cliente.idCliente, AvisoStock.estado != "Cancelado")
        .order_by(AvisoStock.fechaRegistro.desc()).limit(50)
    )).all()
    return [_out(a, p, s) for a, p, s in filas]


@router.delete("/{idAviso}", status_code=204)
async def cancelar_aviso(idAviso: int, session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    cliente = await _cliente(session, auth)
    aviso = await session.get(AvisoStock, idAviso)
    if aviso is None or aviso.idCliente != cliente.idCliente:
        raise HTTPException(status_code=404, detail="Aviso no encontrado")
    if aviso.estado == "Pendiente":
        aviso.estado = "Cancelado"
    await session.commit()


@router.get("")
async def tallas_esperadas(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso("inventario.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    """Para reponer: que prendas agotadas esperan mas clientes."""
    filas = (await session.execute(
        select(Producto.idProducto, Producto.nombre, Producto.talla, Producto.color, func.count(AvisoStock.idAviso).label("clientes"))
        .join(AvisoStock, AvisoStock.idProducto == Producto.idProducto)
        .where(AvisoStock.idTenant == id_tenant, AvisoStock.estado == "Pendiente")
        .group_by(Producto.idProducto).order_by(func.count(AvisoStock.idAviso).desc()).limit(50)
    )).mappings().all()
    return [dict(f) for f in filas]
