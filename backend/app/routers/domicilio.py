# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU31] Recoger a domicilio la prenda devuelta
#   GET  /api/returns/domicilio                     viajes por hacer (recojos y entregas)
#   POST /api/returns/domicilio/{id}/programar      fecha, franja y repartidor
#   POST /api/returns/domicilio/{id}/completar      la prenda llego a la sucursal -> CU3
#   POST /api/returns/domicilio/{id}/fallido        el cliente no estaba (se reprograma)
#   POST /api/returns/domicilio/{id}/cancelar       el cliente la llevara a la sucursal
# [CU32] Entregar a domicilio la prenda del cambio
#   Los mismos endpoints con un viaje de tipo "entrega"; completar cierra el caso.
# [CU35] Entregar a domicilio una compra en linea
#   Los mismos endpoints con un viaje de tipo "pedido" (ligado a la venta).
#   GET  /api/pedidos/mios                          el cliente sigue sus envios
# [CU7] Emitir nota de devolucion
#   GET  /api/returns/{id}/nota-devolucion          lo que se devolvio y cuanto dinero
#   GET  /api/returns/{id}/nota-devolucion.pdf
# Control: services/domicilio.py (ControlDelivery) y services/nota_devolucion.py
# ==================================================================
"""Delivery de devoluciones y cambios, y nota de devolucion."""

from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente, DetalleVenta, Devolucion, EntregaDomicilio, Producto, Sucursal, Tenant, Venta
from app.routers import returns as rr
from app.security import get_current_payload, require_permiso
from app.services import domicilio as dom
from app.services import nota_devolucion as nota_srv
from app.services import notificaciones as notif
from app.services.alcance import alcance_sucursales
from app.services.bitacora import registrar_bitacora
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/returns", tags=["devoluciones-domicilio"])
router_pedidos = APIRouter(prefix="/api/pedidos", tags=["pedidos-domicilio"])


class ProgramarIn(BaseModel):
    fecha: date
    franja: str = Field(pattern="^(manana|tarde)$")
    repartidor: str = Field(min_length=3, max_length=100)


class CompletarIn(BaseModel):
    observaciones: str | None = Field(default=None, max_length=255)
    # El cliente vino a la sucursal en vez de esperar al repartidor.
    enSucursal: bool = False


class FallidoIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=255)


def _viaje_out(v: EntregaDomicilio, caso: Devolucion | None = None, extra: dict | None = None) -> dict:
    salida = {
        "idEntrega": v.idEntrega, "idDevolucion": v.idDevolucion, "tipo": v.tipo, "estado": v.estado,
        "direccion": v.direccion, "referencia": v.referencia, "telefono": v.telefono, "fechaPreferida": v.fechaPreferida,
        "franja": v.franja, "fechaProgramada": v.fechaProgramada, "repartidor": v.repartidor, "costo": float(v.costo),
        "intentos": v.intentos, "observaciones": v.observaciones, "fechaRegistro": v.fechaRegistro,
        "fechaCompletado": v.fechaCompletado, "codigoSucursal": v.codigoSucursal,
    }
    if caso is not None:
        salida.update(codigo=caso.codigo, estadoCaso=caso.estado, tipoCaso=caso.tipo)
    elif v.tipo == dom.PEDIDO:
        salida.update(codigo=f"VTA-{v.idVenta}", estadoCaso="Pedido", tipoCaso="pedido", idVenta=v.idVenta)
    if extra:
        salida.update(extra)
    return salida


async def _viaje_de_la_empresa(session: AsyncSession, id_entrega: int, id_tenant: int, auth: dict) -> tuple[EntregaDomicilio, Devolucion]:
    viaje = await session.get(EntregaDomicilio, id_entrega, with_for_update=True)
    if viaje is None or viaje.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    visibles = await alcance_sucursales(session, auth)
    if visibles is not None and viaje.codigoSucursal not in visibles:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
    caso = await session.get(Devolucion, viaje.idDevolucion, with_for_update=True) if viaje.idDevolucion else None
    return viaje, caso


# --- [CU31] [CU32] ------------------------------------------------------------

@router.get("/domicilio")
async def listar_viajes(
    estado: str | None = None,
    tipo: str | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_VER)),
    id_tenant: int = Depends(tenant_actual),
):
    """Los viajes por hacer primero; el Encargado ve solo los de sus sucursales."""
    stmt = (
        select(EntregaDomicilio, Devolucion, Venta, Cliente.nombre, Producto.nombre, Sucursal.nombre)
        .outerjoin(Devolucion, Devolucion.idDevolucion == EntregaDomicilio.idDevolucion)
        .outerjoin(Venta, Venta.idVenta == EntregaDomicilio.idVenta)
        .join(Cliente, Cliente.idCliente == func.coalesce(Devolucion.idCliente, Venta.idCliente))
        .outerjoin(Producto, Producto.idProducto == Devolucion.idProducto)
        .outerjoin(Sucursal, Sucursal.codigoSucursal == EntregaDomicilio.codigoSucursal)
        .where(EntregaDomicilio.idTenant == id_tenant)
        .order_by(EntregaDomicilio.fechaProgramada.asc().nulls_first(), EntregaDomicilio.idEntrega.desc())
        .limit(200)
    )
    if estado == "activos":
        stmt = stmt.where(EntregaDomicilio.estado.in_(dom.ACTIVOS))
    elif estado:
        stmt = stmt.where(EntregaDomicilio.estado == estado)
    if tipo:
        stmt = stmt.where(EntregaDomicilio.tipo == tipo)
    visibles = await alcance_sucursales(session, auth)
    if visibles is not None:
        stmt = stmt.where(EntregaDomicilio.codigoSucursal.in_(sorted(visibles)))
    filas = (await session.execute(stmt)).all()
    salida = []
    for v, c, venta, cliente, producto, sucursal in filas:
        extra = {"cliente": cliente, "producto": producto, "sucursal": sucursal,
                 "tallaOriginal": c.tallaOriginal if c else None, "tallaNueva": c.tallaNueva if c else None}
        if venta is not None:
            # [CU35] que lleva el pedido
            extra["producto"] = await _resumen_pedido(session, venta.idVenta)
            extra["total"] = float(venta.total)
        salida.append(_viaje_out(v, c, extra))
    return salida


async def _resumen_pedido(session: AsyncSession, id_venta: int) -> str:
    lineas = (await session.execute(
        select(Producto.nombre, Producto.talla, DetalleVenta.cantidad)
        .join(DetalleVenta, DetalleVenta.idProducto == Producto.idProducto).where(DetalleVenta.idVenta == id_venta)
    )).all()
    return ", ".join(f"{n} {t or ''} x{c}".replace("  ", " ") for n, t, c in lineas)


# --- [CU35] el cliente sigue sus envios ------------------------------------------

@router_pedidos.get("/mios")
async def mis_pedidos(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    cliente = (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=403, detail="Solo un cliente tiene pedidos")
    filas = (await session.execute(
        select(EntregaDomicilio, Venta).join(Venta, Venta.idVenta == EntregaDomicilio.idVenta)
        .where(Venta.idCliente == cliente.idCliente).order_by(EntregaDomicilio.idEntrega.desc()).limit(30)
    )).all()
    return [_viaje_out(v, None, {"producto": await _resumen_pedido(session, venta.idVenta), "total": float(venta.total),
                                 "fechaCompra": venta.fecha}) for v, venta in filas]


@router.get("/domicilio/caso/{idDevolucion}")
async def viajes_del_caso(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """El cliente sigue su recojo y su entrega; el personal ve el historial del caso."""
    caso = await rr._caso_visible(session, idDevolucion, auth, id_tenant)
    return [_viaje_out(v, caso) for v in await dom.viajes_del_caso(session, caso.idDevolucion)]


async def _accion(session, request, background_tasks, auth, texto: str, caso: Devolucion | None, viaje: EntregaDomicilio):
    codigo = caso.codigo if caso is not None else f"VTA-{viaje.idVenta}"
    await registrar_bitacora(session, f"{texto} ({codigo})"[:150], int(auth["sub"]), rr._ip(request))
    await session.commit()
    notif.programar_correos(background_tasks)


@router.post("/domicilio/{idEntrega}/programar")
async def programar(
    idEntrega: int, payload: ProgramarIn, request: Request, background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    viaje, caso = await _viaje_de_la_empresa(session, idEntrega, id_tenant, auth)
    await dom.programar(session, viaje, caso, fecha=payload.fecha, franja=payload.franja, repartidor=payload.repartidor, id_usuario=int(auth["sub"]))
    await _accion(session, request, background_tasks, auth, f"Delivery: {viaje.tipo} programado para el {payload.fecha:%d/%m}", caso, viaje)
    return _viaje_out(viaje, caso)


@router.post("/domicilio/{idEntrega}/completar")
async def completar(
    idEntrega: int, payload: CompletarIn, request: Request, background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    viaje, caso = await _viaje_de_la_empresa(session, idEntrega, id_tenant, auth)
    await dom.completar(session, viaje, caso, observaciones=payload.observaciones, en_sucursal=payload.enSucursal, id_usuario=int(auth["sub"]))
    texto = {dom.RECOJO: "Delivery: prenda recogida, pasa a inspeccion", dom.PEDIDO: "Delivery: pedido entregado"}.get(viaje.tipo, "Delivery: prenda nueva entregada")
    await _accion(session, request, background_tasks, auth, texto, caso, viaje)
    return _viaje_out(viaje, caso)


@router.post("/domicilio/{idEntrega}/fallido")
async def fallido(
    idEntrega: int, payload: FallidoIn, request: Request, background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    viaje, caso = await _viaje_de_la_empresa(session, idEntrega, id_tenant, auth)
    await dom.fallido(session, viaje, caso, motivo=payload.motivo, id_usuario=int(auth["sub"]))
    await _accion(session, request, background_tasks, auth, f"Delivery: {viaje.tipo} fallido", caso, viaje)
    return _viaje_out(viaje, caso)


@router.post("/domicilio/{idEntrega}/cancelar")
async def cancelar_recojo(
    idEntrega: int, request: Request, background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    viaje, caso = await _viaje_de_la_empresa(session, idEntrega, id_tenant, auth)
    politica = await rr._politica_del_caso(session, caso)
    await dom.cancelar_recojo(session, viaje, caso, politica, int(auth["sub"]))
    await _accion(session, request, background_tasks, auth, "Delivery: recojo cancelado, el cliente la lleva a la sucursal", caso, viaje)
    return _viaje_out(viaje, caso)


# --- [CU7] ------------------------------------------------------------------------

async def _nota(session: AsyncSession, id_devolucion: int, auth: dict, id_tenant: int) -> dict:
    caso = await rr._caso_visible(session, id_devolucion, auth, id_tenant)
    d = await rr._caso_out(session, caso.idDevolucion)
    tenant = await session.get(Tenant, caso.idTenant)
    return nota_srv.armar_nota(d, tenant.nombre if tenant else "YouShop", await dom.viajes_del_caso(session, caso.idDevolucion))


@router.get("/{idDevolucion:int}/nota-devolucion")
async def nota_devolucion(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """[CU7] Lo que el cliente devolvio y el dinero que se le devolvio."""
    return await _nota(session, idDevolucion, auth, id_tenant)


@router.get("/{idDevolucion:int}/nota-devolucion.pdf")
async def nota_devolucion_pdf(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    nota = await _nota(session, idDevolucion, auth, id_tenant)
    return Response(
        content=nota_srv.pdf(nota), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="nota-devolucion-{nota["numero"]}.pdf"'},
    )
