"""Devoluciones y cambios (CU1 a CU11 de docs/iconix/2do parcial SI2.md).

  CU1  POST /api/returns                    solicitud en tienda -> "EnInspeccion"
       GET  /api/returns/ventas?q=          identificar la venta (comprobante o cliente)
  CU2  POST /api/returns/solicitudes        solicitud en linea -> "PendienteEntrega" (codigo + QR)
       GET  /api/returns/mis-compras        compras del cliente con su elegibilidad
  CU3  POST /{id}/inspeccion                resultado de la inspeccion (aprobacion parcial,
       POST /{id}/revision                  disconformidad -> revision del Administrador)
       POST /{id}/autorizar                 autorizacion del Encargado (montos y limites)
  CU4  POST /{id}/resolver                  cambio de talla, color o medida
  CU5                                       cambio por otro producto (nueva venta enlazada)
  CU6                                       reembolso (+ /reembolso/reintentar y /confirmar)
  CU7                                       nota de credito (ver credit_notes.py)
  CU8  POST /{id}/completar-cambio          cambio pendiente por falta de stock
  CU9  GET/PUT /api/returns/politica        politica versionada
  CU10 GET /api/returns/inventario          inventario vendible y no vendible por devolucion
  CU11 GET /api/returns, /analisis, /export historial, indicadores y exportacion

Reglas transversales: nada cruza de empresa (un caso o una venta de otra
responde 404) y cada operacion queda en la bitacora.
"""

import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.models import (
    Cliente,
    DetalleVenta,
    Devolucion,
    InventarioNoVendible,
    MetodoPago,
    Movimiento,
    NotaCredito,
    NotaCreditoMovimiento,
    PoliticaDevolucion,
    Producto,
    Proveedor,
    Sucursal,
    Tenant,
    Usuario,
    Venta,
)
from app.schemas.returns import (
    AnalisisOut,
    AutorizacionIn,
    CompletarCambioIn,
    ConfirmarTransferenciaIn,
    ConteoOut,
    DevolucionDetalleOut,
    DevolucionOut,
    ElegibilidadOut,
    EventoOut,
    FotoOut,
    InspeccionIn,
    InventarioDevolucionFila,
    InventarioDevolucionOut,
    LineaDevolucionOut,
    NoVendibleOut,
    NoVendibleUpdateIn,
    PoliticaIn,
    PoliticaOut,
    QrOut,
    RegistroTiendaIn,
    ResolucionIn,
    RevisionIn,
    SolicitudIn,
    StockSucursalOut,
    TasaOut,
    VentaDevolucionOut,
)
from app.security import get_current_payload, require_permiso
from app.services import devoluciones as dv
from app.services.bitacora import registrar_bitacora
from app.services.disponibilidad import resolver_inventario
from app.services.horario import HORA_BOLIVIA, fin_del_dia, inicio_del_dia
from app.services.storage_supabase import SupabaseNoConfigurado, SupabaseStorageError, subir_foto_devolucion
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/returns", tags=["returns"])

# Compatibilidad: la regla historica de 24 h es el plazo por defecto de la
# politica de la plataforma (CU9); estos nombres los usan los tests de la ventana.
VENTANA_DEVOLUCION_HORAS = dv.POLITICA_PLATAFORMA.plazoCambioHoras


def horas_restantes(fecha_venta: datetime, ahora: datetime, plazo_horas: int = VENTANA_DEVOLUCION_HORAS) -> float:
    return (dv.como_utc(fecha_venta) + timedelta(hours=plazo_horas) - dv.como_utc(ahora)).total_seconds() / 3600


def dentro_de_ventana(fecha_venta: datetime, ahora: datetime, plazo_horas: int = VENTANA_DEVOLUCION_HORAS) -> bool:
    return horas_restantes(fecha_venta, ahora, plazo_horas) > 0


PERMISO_VER = "devolucion.ver"
PERMISO_REGISTRAR = "devolucion.registrar"
PERMISO_INSPECCIONAR = "devolucion.inspeccionar"
PERMISO_AUTORIZAR = "devolucion.autorizar"
PERMISO_ADMIN = "tenant.admin"


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


def _tiene(auth: dict, permiso: str) -> bool:
    return permiso in auth.get("permisos", [])


async def _cliente_del_caller(session: AsyncSession, auth: dict) -> Cliente | None:
    return (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()


# --- Lectura de casos ----------------------------------------------------------------

ProductoNuevo = aliased(Producto)
SucursalEntrega = aliased(Sucursal)
Registrador = aliased(Usuario)
Inspector = aliased(Usuario)
Autorizador = aliased(Usuario)


def _consulta_casos():
    return (
        select(
            Devolucion,
            Producto,
            ProductoNuevo.nombre,
            ProductoNuevo.color,
            Cliente.nombre,
            Sucursal.nombre,
            SucursalEntrega.nombre,
            Registrador.nombre,
            Inspector.nombre,
            Autorizador.nombre,
            NotaCredito.codigo,
            PoliticaDevolucion.version,
        )
        .join(Producto, Producto.idProducto == Devolucion.idProducto)
        .outerjoin(ProductoNuevo, ProductoNuevo.idProducto == Devolucion.idProductoNuevo)
        .join(Cliente, Cliente.idCliente == Devolucion.idCliente)
        .outerjoin(Sucursal, Sucursal.codigoSucursal == Devolucion.codigoSucursal)
        .outerjoin(SucursalEntrega, SucursalEntrega.codigoSucursal == Devolucion.sucursalEntrega)
        .outerjoin(Registrador, Registrador.idUser == Devolucion.idUsuario)
        .outerjoin(Inspector, Inspector.idUser == Devolucion.idInspector)
        .outerjoin(Autorizador, Autorizador.idUser == Devolucion.idAutorizador)
        .outerjoin(NotaCredito, NotaCredito.idNotaCredito == Devolucion.idNotaCredito)
        .outerjoin(PoliticaDevolucion, PoliticaDevolucion.idPolitica == Devolucion.idPolitica)
    )


def _fila_a_out(fila) -> DevolucionOut:
    (d, prod, prod_nuevo, color_nuevo, cliente, sucursal, sucursal_entrega,
     registrador, inspector, autorizador, nota, version) = fila
    precio = Decimal(str(d.precioPagado)) if d.precioPagado is not None else Decimal("0")
    valor = dv.dinero(precio * d.cantidad)
    return DevolucionOut(
        idDevolucion=d.idDevolucion,
        codigo=d.codigo,
        tipo=d.tipo,
        origen=d.origen,
        cantidad=d.cantidad,
        motivoCategoria=d.motivoCategoria,
        motivo=d.motivo,
        estado=d.estado,
        fecha=d.fecha,
        fechaVenta=d.fechaVenta,
        fechaLimiteEntrega=d.fechaLimiteEntrega,
        tallaOriginal=d.tallaOriginal,
        tallaNueva=d.tallaNueva,
        medidaOriginal=d.medidaOriginal,
        medidaNueva=d.medidaNueva,
        fechaEntregaAjuste=d.fechaEntregaAjuste,
        valor=float(valor),
        recargo=float(d.recargo),
        descuentoDeterioro=float(d.descuentoDeterioro),
        credito=float(dv.credito_del_caso(valor, d.recargo, d.descuentoDeterioro)),
        montoDevuelto=float(d.montoDevuelto),
        metodoReembolso=d.metodoReembolso,
        estadoReembolso=d.estadoReembolso,
        referenciaReembolso=d.referenciaReembolso,
        cuentaDestino=d.cuentaDestino,
        diferencia=float(d.diferencia),
        idMetPagoDiferencia=d.idMetPagoDiferencia,
        idVentaCambio=d.idVentaCambio,
        idNotaCredito=d.idNotaCredito,
        nota_codigo=nota,
        condicion=d.condicion,
        checklist=d.checklist,
        codigoEscaneado=d.codigoEscaneado,
        notasInspeccion=d.notasInspeccion,
        fotos=list(d.fotos or []),
        inspector_nombre=inspector,
        fechaInspeccion=d.fechaInspeccion,
        destinoInventario=d.destinoInventario,
        motivoRechazo=d.motivoRechazo,
        requiereAutorizacion=d.requiereAutorizacion,
        motivoAutorizacion=d.motivoAutorizacion,
        autorizador_nombre=autorizador,
        fechaAutorizacion=d.fechaAutorizacion,
        opcionSinStock=d.opcionSinStock,
        sucursalEntrega=d.sucursalEntrega,
        sucursal_entrega_nombre=sucursal_entrega,
        fechaLlegadaEstimada=d.fechaLlegadaEstimada,
        fechaLimiteRetiro=d.fechaLimiteRetiro,
        fechaResolucion=d.fechaResolucion,
        idVenta=d.idVenta,
        idProducto=d.idProducto,
        producto_nombre=prod.nombre,
        producto_color=prod.color,
        producto_tipo=prod.tipo,
        idProductoNuevo=d.idProductoNuevo,
        producto_nuevo_nombre=prod_nuevo,
        producto_nuevo_color=color_nuevo,
        precio_unitario=float(precio) if d.precioPagado is not None else None,
        idCliente=d.idCliente,
        cliente_nombre=cliente,
        codigoSucursal=d.codigoSucursal,
        sucursal_nombre=sucursal,
        idUsuario=d.idUsuario,
        usuario_nombre=registrador,
        politica_version=version,
    )


async def _caso_out(session: AsyncSession, id_devolucion: int) -> DevolucionOut:
    fila = (await session.execute(_consulta_casos().where(Devolucion.idDevolucion == id_devolucion))).first()
    return _fila_a_out(fila)


async def _caso_de_la_empresa(session: AsyncSession, id_devolucion: int, id_tenant: int) -> Devolucion:
    caso = await session.get(Devolucion, id_devolucion, with_for_update=True)
    if caso is None or caso.idTenant != id_tenant:
        # Un caso de otra organizacion se responde igual que uno inexistente.
        raise HTTPException(status_code=404, detail="El caso de devolucion no existe")
    return caso


async def _politica_del_caso(session: AsyncSession, caso: Devolucion) -> dv.Politica:
    """La version que regia cuando se hizo la venta (o la de la plataforma)."""
    if caso.idPolitica is not None:
        fila = await session.get(PoliticaDevolucion, caso.idPolitica)
        if fila is not None:
            return dv.politica_desde_fila(fila)
    return dv.POLITICA_PLATAFORMA


async def _linea_del_caso(session: AsyncSession, caso: Devolucion) -> dv.LineaVenta:
    producto = await session.get(Producto, caso.idProducto)
    precio = Decimal(str(caso.precioPagado)) if caso.precioPagado is not None else Decimal(str(producto.venta))
    return dv.LineaVenta(caso.idProducto, caso.cantidad, dv.dinero(precio), False, producto)


async def _nuevo_codigo(session: AsyncSession, caso: Devolucion) -> None:
    await session.flush()
    caso.codigo = dv.codigo_caso(caso.idDevolucion)


# --- CU9: politica -----------------------------------------------------------------------

async def _politica_out(session: AsyncSession, id_tenant: int, politica: dv.Politica, fila: PoliticaDevolucion | None) -> PoliticaOut:
    creador = await session.get(Usuario, fila.idUsuario) if fila and fila.idUsuario else None
    datos = {
        campo: (float(valor) if isinstance(valor, Decimal) else list(valor) if isinstance(valor, tuple) else valor)
        for campo, valor in ((c, getattr(politica, c)) for c in dv.CAMPOS_POLITICA)
    }
    return PoliticaOut(
        **datos,
        idTenant=id_tenant,
        version=fila.version if fila else 0,
        idPolitica=fila.idPolitica if fila else None,
        vigenteDesde=fila.vigenteDesde if fila else None,
        creadoEn=fila.creadoEn if fila else None,
        creadoPor=creador.nombre if creador else None,
    )


@router.get("/politica", response_model=PoliticaOut)
async def ver_politica(
    idTenant: int | None = None,
    session: AsyncSession = Depends(get_db),
    id_tenant: int = Depends(tenant_actual),
):
    """Politica vigente (CU9 paso 2). El cliente la ve antes de pedir; un
    `idTenant` explicito muestra la de la empresa que le vendio."""
    objetivo = idTenant or id_tenant
    politica, fila = await dv.politica_vigente(session, objetivo)
    return await _politica_out(session, objetivo, politica, fila)


@router.get("/politica/versiones", response_model=list[PoliticaOut])
async def versiones_politica(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_ADMIN)),
    id_tenant: int = Depends(tenant_actual),
):
    filas = (
        await session.execute(
            select(PoliticaDevolucion).where(PoliticaDevolucion.idTenant == id_tenant).order_by(PoliticaDevolucion.version.desc())
        )
    ).scalars().all()
    return [await _politica_out(session, id_tenant, dv.politica_desde_fila(f), f) for f in filas]


@router.put("/politica", response_model=PoliticaOut)
async def guardar_politica(
    payload: PoliticaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_ADMIN)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU9 pasos 3-5: valida y guarda una NUEVA version vigente desde ahora;
    las ventas anteriores conservan la version que regia al venderse."""
    datos = payload.model_dump()
    datos["categoriasNoRetornables"] = tuple(sorted({c.strip() for c in datos["categoriasNoRetornables"] if c.strip()}))
    for campo in ("recargoValor", "umbralAutorizacion", "descuentoDeterioroPct", "costoAjusteMedida"):
        datos[campo] = Decimal(str(datos[campo]))
    politica = dv.Politica(**datos)
    errores = dv.errores_politica(politica)
    if errores:
        raise HTTPException(status_code=422, detail={"mensaje": "Revise los valores marcados", "campos": errores})
    ultima = await session.scalar(
        select(func.coalesce(func.max(PoliticaDevolucion.version), 0)).where(PoliticaDevolucion.idTenant == id_tenant)
    )
    fila = PoliticaDevolucion(
        idTenant=id_tenant,
        version=int(ultima or 0) + 1,
        vigenteDesde=datetime.now(timezone.utc),
        idUsuario=int(auth["sub"]),
        **{c: (list(v) if isinstance(v, tuple) else v) for c, v in ((c, getattr(politica, c)) for c in dv.CAMPOS_POLITICA)},
    )
    session.add(fila)
    await session.flush()
    await registrar_bitacora(
        session,
        f"Politica de devoluciones v{fila.version}: plazo {dv.texto_plazo(politica.plazoCambioHoras)}, "
        f"garantia {politica.plazoGarantiaDias} dias",
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    return await _politica_out(session, id_tenant, politica, fila)


# --- CU1 / CU2: ventas y elegibilidad -------------------------------------------------------

async def _cambios_previos(session: AsyncSession, id_venta: int, id_producto: int) -> int:
    """Cambios que ya tuvo esta prenda fisica: se recorre la cadena de cambios
    de variante de la venta hacia atras (la prenda recibida en un cambio hereda
    los cambios de la original)."""
    casos = (
        await session.execute(
            select(Devolucion.idProducto, Devolucion.idProductoNuevo).where(
                Devolucion.idVenta == id_venta,
                Devolucion.tipo.in_(dv.TIPOS_CAMBIO),
                Devolucion.estado.in_(("Completada", "CambioPendiente")),
                Devolucion.idProductoNuevo.is_not(None),
            )
        )
    ).all()
    origen = {nuevo: original for original, nuevo in casos}
    cambios, actual, vistos = 0, id_producto, set()
    while actual in origen and actual not in vistos:
        vistos.add(actual)
        cambios += 1
        actual = origen[actual]
    return cambios


async def _venta_para_devolucion(session: AsyncSession, venta: Venta, ahora: datetime) -> VentaDevolucionOut | None:
    lineas = await dv.lineas_de_venta(session, venta)
    if not lineas:
        return None
    id_tenant = lineas[0].producto.idTenant
    politica, fila_pol = await dv.politica_vigente(session, id_tenant, venta.fecha)
    abiertas = {
        p: c
        for p, c in (
            await session.execute(
                select(Devolucion.idProducto, Devolucion.codigo).where(
                    Devolucion.idVenta == venta.idVenta, Devolucion.estado.in_(dv.ESTADOS_ABIERTOS)
                )
            )
        ).all()
    }
    completadas = await session.scalar(
        select(func.coalesce(func.sum(Devolucion.cantidad), 0)).where(
            Devolucion.idVenta == venta.idVenta, Devolucion.estado == "Completada"
        )
    )
    salida: list[LineaDevolucionOut] = []
    for l in lineas:
        ocupadas = await dv.cantidad_ocupada(session, venta.idVenta, l.idProducto)
        disponibles = max(l.cantidad - ocupadas, 0)
        reglas = dict(
            fecha_venta=venta.fecha,
            ahora=ahora,
            politica=politica,
            valor=l.precio_pagado,
            categoria=l.producto.tipo,
            cambios_realizados=await _cambios_previos(session, venta.idVenta, l.idProducto),
            disponibles=disponibles,
        )
        eleg = dv.evaluar_elegibilidad(es_defecto=False, **reglas)
        solo_defecto = (
            not eleg.puede
            and eleg.estado in ("fuera_plazo", "no_retornable")
            and dv.evaluar_elegibilidad(es_defecto=True, **reglas).puede
        )
        salida.append(
            LineaDevolucionOut(
                idProducto=l.idProducto,
                producto=l.producto.nombre,
                talla=l.producto.talla,
                color=l.producto.color,
                tipoPrenda=l.producto.tipo,
                codigoProducto=dv.codigo_de_producto(l.idProducto),
                cantidad=l.cantidad,
                precioPagado=float(l.precio_pagado),
                ocupadas=ocupadas,
                disponibles=disponibles,
                recibidaPorCambio=l.recibida_por_cambio,
                elegibilidad=ElegibilidadOut(
                    estado=eleg.estado,
                    puede=eleg.puede,
                    horasRestantes=eleg.horasRestantes,
                    fechaLimite=eleg.fechaLimite,
                    garantiaHasta=eleg.garantiaHasta,
                    recargo=float(eleg.recargo),
                    mensaje=eleg.mensaje,
                    soloDefecto=solo_defecto,
                ),
                solicitudAbierta=abiertas.get(l.idProducto),
            )
        )
    vendidas = sum(l.cantidad for l in lineas if not l.recibida_por_cambio)
    completadas = int(completadas or 0)
    estado = "Sin devoluciones" if completadas == 0 else ("Devuelta" if completadas >= vendidas else "Parcialmente devuelta")
    cliente = await session.get(Cliente, venta.idCliente)
    pago = await session.get(MetodoPago, venta.idMetPago)
    codigo_sucursal = await dv.sucursal_de_venta(session, venta.idVenta, lineas[0].idProducto)
    sucursal = await session.get(Sucursal, codigo_sucursal) if codigo_sucursal else None
    tenant = await session.get(Tenant, id_tenant)
    return VentaDevolucionOut(
        idVenta=venta.idVenta,
        fecha=venta.fecha,
        idCliente=venta.idCliente,
        cliente=cliente.nombre if cliente else None,
        codigoSucursal=codigo_sucursal,
        sucursal=sucursal.nombre if sucursal else "Compra en linea",
        formaPago=pago.tipo if pago else None,
        total=float(venta.total),
        estadoDevolucion=estado,
        idTenant=id_tenant,
        empresa=tenant.nombre if tenant else None,
        politica_version=fila_pol.version if fila_pol else None,
        lineas=salida,
    )


@router.get("/ventas", response_model=list[VentaDevolucionOut])
async def buscar_ventas(
    q: str,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU1 pasos 2-4: la venta por numero de comprobante (o su QR) o por el
    cliente (nombre, telefono o correo). Una venta de otra empresa no aparece."""
    texto = q.strip()
    if not texto:
        return []
    stmt = select(Venta).join(Cliente, Cliente.idCliente == Venta.idCliente).order_by(Venta.fecha.desc())
    numero = texto.upper().removeprefix("VENTA").removeprefix("#").strip()
    if numero.isdigit():
        stmt = stmt.where(Venta.idVenta == int(numero))
    else:
        patron = f"%{texto}%"
        stmt = (
            stmt.join(Usuario, Usuario.idUser == Cliente.idUser)
            .where(or_(Cliente.nombre.ilike(patron), Cliente.telefono.ilike(patron), Usuario.correo.ilike(patron)))
            .where(Venta.fecha >= datetime.now(timezone.utc) - timedelta(days=120))
            .limit(60)
        )
    ventas = (await session.execute(stmt)).scalars().all()
    ahora = datetime.now(timezone.utc)
    salida = []
    for venta in ventas:
        datos = await _venta_para_devolucion(session, venta, ahora)
        if datos is not None and datos.idTenant == id_tenant:
            salida.append(datos)
        if len(salida) >= 15:
            break
    if numero.isdigit() and not salida:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return salida


@router.get("/mis-compras", response_model=list[VentaDevolucionOut])
async def mis_compras(
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
):
    """CU2 pasos 1-2: compras del cliente con el estado de elegibilidad y el
    tiempo restante de cada prenda (las vencidas muestran la fecha limite)."""
    propio = await _cliente_del_caller(session, auth)
    if propio is None:
        return []
    await dv.aplicar_vencimientos(session, id_cliente=propio.idCliente)
    ventas = (
        await session.execute(
            select(Venta)
            .where(Venta.idCliente == propio.idCliente, Venta.fecha >= datetime.now(timezone.utc) - timedelta(days=90))
            .order_by(Venta.fecha.desc())
            .limit(30)
        )
    ).scalars().all()
    ahora = datetime.now(timezone.utc)
    return [d for v in ventas if (d := await _venta_para_devolucion(session, v, ahora)) is not None]


@router.get("/stock/{idProducto}", response_model=list[StockSucursalOut])
async def stock_reemplazo(
    idProducto: int,
    session: AsyncSession = Depends(get_db),
    id_tenant: int = Depends(tenant_actual),
    auth: dict = Depends(get_current_payload),
):
    """Existencia de una variante en cada sucursal (CU4 paso 1, CU2 paso 4, CU8)."""
    producto = await session.get(Producto, idProducto)
    if producto is None or (_tiene(auth, PERMISO_VER) and producto.idTenant != id_tenant):
        raise HTTPException(status_code=404, detail="El producto no existe")
    return await dv.stock_por_sucursal(session, idProducto, producto.idTenant)


# --- CU10: inventario por devolucion -----------------------------------------------------------

@router.get("/inventario", response_model=InventarioDevolucionOut)
async def inventario_por_devolucion(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_VER)),
    id_tenant: int = Depends(tenant_actual),
):
    filtros = [Devolucion.idTenant == id_tenant, Devolucion.destinoInventario.is_not(None)]
    if fecha_desde is not None:
        filtros.append(Devolucion.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        filtros.append(Devolucion.fecha <= fin_del_dia(fecha_hasta))

    def suma(destino: str):
        return func.coalesce(func.sum(case((Devolucion.destinoInventario == destino, Devolucion.cantidad), else_=0)), 0)

    filas = (
        await session.execute(
            select(
                Producto.idProducto, Producto.nombre, Producto.talla, Producto.color,
                Sucursal.codigoSucursal, Sucursal.nombre.label("sucursal"),
                suma("vendible").label("vendible"), suma("no_vendible").label("no_vendible"),
            )
            .select_from(Devolucion)
            .join(Producto, Producto.idProducto == Devolucion.idProducto)
            .outerjoin(Sucursal, Sucursal.codigoSucursal == Devolucion.codigoSucursal)
            .where(*filtros)
            .group_by(Producto.idProducto, Producto.nombre, Producto.talla, Producto.color, Sucursal.codigoSucursal, Sucursal.nombre)
            .order_by(Producto.nombre, Producto.talla)
        )
    ).all()
    no_vend_filtros = [InventarioNoVendible.idTenant == id_tenant]
    if fecha_desde is not None:
        no_vend_filtros.append(InventarioNoVendible.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        no_vend_filtros.append(InventarioNoVendible.fecha <= fin_del_dia(fecha_hasta))
    no_vendibles = (
        await session.execute(
            select(InventarioNoVendible, Producto, Sucursal.nombre, Proveedor.nombre, Devolucion.codigo)
            .join(Producto, Producto.idProducto == InventarioNoVendible.idProducto)
            .outerjoin(Sucursal, Sucursal.codigoSucursal == InventarioNoVendible.codigoSucursal)
            .outerjoin(Proveedor, Proveedor.idProveedor == InventarioNoVendible.idProveedor)
            .outerjoin(Devolucion, Devolucion.idDevolucion == InventarioNoVendible.idDevolucion)
            .where(*no_vend_filtros)
            .order_by(InventarioNoVendible.fecha.desc())
        )
    ).all()
    por_recibir = await session.scalar(
        select(func.coalesce(func.sum(Devolucion.cantidad), 0)).where(
            Devolucion.idTenant == id_tenant, Devolucion.estado.in_(("PendienteEntrega", "EnInspeccion", "EnRevision"))
        )
    )
    lista = [
        NoVendibleOut(
            idNoVendible=n.idNoVendible, idProducto=p.idProducto, producto=p.nombre, talla=p.talla, color=p.color,
            codigoSucursal=n.codigoSucursal, sucursal=suc, cantidad=n.cantidad, motivo=n.motivo, estado=n.estado,
            proveedor=prov, observaciones=n.observaciones, fecha=n.fecha, codigoCaso=cod,
        )
        for n, p, suc, prov, cod in no_vendibles
    ]
    salida = [
        InventarioDevolucionFila(
            idProducto=f.idProducto, producto=f.nombre, talla=f.talla, color=f.color, codigoSucursal=f.codigoSucursal,
            sucursal=f.sucursal, vendible=int(f.vendible), noVendible=int(f.no_vendible),
        )
        for f in filas
    ]
    return InventarioDevolucionOut(
        vendible=sum(f.vendible for f in salida),
        noVendible=sum(f.noVendible for f in salida),
        defecto=sum(n.cantidad for n in lista if n.motivo == "defecto"),
        deterioro=sum(n.cantidad for n in lista if n.motivo == "deterioro"),
        porRecibir=int(por_recibir or 0),
        reclamosPendientes=sum(1 for n in lista if n.motivo == "defecto" and n.proveedor and n.estado == "Pendiente"),
        filas=salida,
        noVendibles=lista,
    )


@router.patch("/no-vendible/{idNoVendible}", response_model=NoVendibleOut)
async def actualizar_no_vendible(
    idNoVendible: int,
    payload: NoVendibleUpdateIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_INSPECCIONAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """Seguimiento del reclamo al proveedor o destino de la merma (CU10)."""
    fila = await session.get(InventarioNoVendible, idNoVendible, with_for_update=True)
    if fila is None or fila.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="El registro no existe")
    fila.estado = payload.estado
    if payload.observaciones:
        fila.observaciones = payload.observaciones
    await registrar_bitacora(session, f"Inventario no vendible #{idNoVendible}: {payload.estado}", int(auth["sub"]), _ip(request))
    await session.commit()
    producto = await session.get(Producto, fila.idProducto)
    sucursal = await session.get(Sucursal, fila.codigoSucursal)
    proveedor = await session.get(Proveedor, fila.idProveedor) if fila.idProveedor else None
    caso = await session.get(Devolucion, fila.idDevolucion) if fila.idDevolucion else None
    return NoVendibleOut(
        idNoVendible=fila.idNoVendible, idProducto=producto.idProducto, producto=producto.nombre, talla=producto.talla,
        color=producto.color, codigoSucursal=fila.codigoSucursal, sucursal=sucursal.nombre if sucursal else None,
        cantidad=fila.cantidad, motivo=fila.motivo, estado=fila.estado, proveedor=proveedor.nombre if proveedor else None,
        observaciones=fila.observaciones, fecha=fila.fecha, codigoCaso=caso.codigo if caso else None,
    )


# --- CU11: historial, indicadores y exportacion ---------------------------------------------------

def _filtros_historial(
    id_tenant: int,
    *,
    idCliente: int | None,
    fecha_desde: date | None,
    fecha_hasta: date | None,
    codigoSucursal: int | None,
    tipo: str | None,
    estado: str | None,
    origen: str | None,
    motivo: str | None,
    idProducto: int | None,
    talla: str | None,
) -> list:
    filtros = [Devolucion.idTenant == id_tenant]
    if idCliente is not None:
        filtros.append(Devolucion.idCliente == idCliente)
    if fecha_desde is not None:
        filtros.append(Devolucion.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        filtros.append(Devolucion.fecha <= fin_del_dia(fecha_hasta))
    if codigoSucursal is not None:
        filtros.append(Devolucion.codigoSucursal == codigoSucursal)
    if tipo:
        filtros.append(Devolucion.tipo == tipo)
    if estado:
        filtros.append(Devolucion.estado.in_(estado.split(",")))
    if origen:
        filtros.append(Devolucion.origen == origen)
    if motivo:
        filtros.append(Devolucion.motivoCategoria == motivo)
    if idProducto is not None:
        filtros.append(Devolucion.idProducto == idProducto)
    if talla:
        filtros.append(Devolucion.tallaOriginal == talla)
    return filtros


@router.get("", response_model=list[DevolucionOut])
async def listar_devoluciones(
    idCliente: int | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    tipo: str | None = None,
    estado: str | None = None,
    origen: str | None = None,
    motivo: str | None = None,
    idProducto: int | None = None,
    talla: str | None = None,
    limite: int = 500,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """CU11 pasos 2-3. Un caller sin `devolucion.ver` (Cliente) ve los suyos."""
    stmt = _consulta_casos().order_by(Devolucion.fecha.desc()).limit(min(max(limite, 1), 2000))
    if _tiene(auth, PERMISO_VER):
        await dv.aplicar_vencimientos(session, id_tenant=id_tenant)
        stmt = stmt.where(
            *_filtros_historial(
                id_tenant, idCliente=idCliente, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
                codigoSucursal=codigoSucursal, tipo=tipo, estado=estado, origen=origen, motivo=motivo,
                idProducto=idProducto, talla=talla,
            )
        )
    else:
        propio = await _cliente_del_caller(session, auth)
        if propio is None:
            return []
        if idCliente is not None and idCliente != propio.idCliente:
            raise HTTPException(status_code=403, detail="No autorizado")
        await dv.aplicar_vencimientos(session, id_cliente=propio.idCliente)
        stmt = stmt.where(Devolucion.idCliente == propio.idCliente)
        if estado:
            stmt = stmt.where(Devolucion.estado.in_(estado.split(",")))
    return [_fila_a_out(f) for f in (await session.execute(stmt)).all()]


@router.get("/analisis", response_model=AnalisisOut)
async def analisis(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_VER)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU11 paso 4: tasa de devolucion por producto y talla, motivos mas
    frecuentes, monto reembolsado, notas emitidas y clientes frecuentes."""
    filtros = _filtros_historial(
        id_tenant, idCliente=None, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, codigoSucursal=codigoSucursal,
        tipo=None, estado=None, origen=None, motivo=None, idProducto=None, talla=None,
    )
    validos = Devolucion.estado.not_in(("Cancelada", "Anulada"))
    resumen = (
        await session.execute(
            select(
                func.count().filter(validos),
                func.coalesce(func.sum(Devolucion.cantidad).filter(Devolucion.estado == "Completada"), 0),
                func.coalesce(func.sum(Devolucion.montoDevuelto), 0),
                func.count().filter(Devolucion.estado == "Completada", Devolucion.tipo.in_(dv.TIPOS_CAMBIO + ("cambio_medida",))),
                func.count().filter(Devolucion.estado == "Rechazada"),
            ).where(*filtros)
        )
    ).one()
    nota_filtros = [NotaCredito.idTenant == id_tenant]
    if fecha_desde is not None:
        nota_filtros.append(NotaCredito.fechaEmision >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        nota_filtros.append(NotaCredito.fechaEmision <= fin_del_dia(fecha_hasta))
    notas = (await session.execute(select(func.count(), func.coalesce(func.sum(NotaCredito.monto), 0)).where(*nota_filtros))).one()

    # Vendidas en el mismo periodo, para la tasa.
    venta_filtros = [Producto.idTenant == id_tenant]
    if fecha_desde is not None:
        venta_filtros.append(Venta.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        venta_filtros.append(Venta.fecha <= fin_del_dia(fecha_hasta))
    vendidas_prod = dict(
        (
            await session.execute(
                select(DetalleVenta.idProducto, func.sum(DetalleVenta.cantidad))
                .join(Venta, Venta.idVenta == DetalleVenta.idVenta)
                .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
                .where(*venta_filtros)
                .group_by(DetalleVenta.idProducto)
            )
        ).all()
    )
    devueltas = (
        await session.execute(
            select(Producto.idProducto, Producto.nombre, Producto.talla, func.sum(Devolucion.cantidad))
            .join(Producto, Producto.idProducto == Devolucion.idProducto)
            .where(*filtros, validos, Devolucion.estado != "Rechazada")
            .group_by(Producto.idProducto, Producto.nombre, Producto.talla)
        )
    ).all()
    por_producto = []
    por_talla: dict[str, list[int]] = {}
    tallas_vendidas = dict(
        (
            await session.execute(
                select(Producto.talla, func.sum(DetalleVenta.cantidad))
                .join(Venta, Venta.idVenta == DetalleVenta.idVenta)
                .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
                .where(*venta_filtros)
                .group_by(Producto.talla)
            )
        ).all()
    )
    for id_producto, nombre, talla, cantidad in devueltas:
        vendidas = int(vendidas_prod.get(id_producto, 0) or 0)
        por_producto.append(
            TasaOut(clave=f"{nombre} talla {talla}", detalle=str(id_producto), vendidas=vendidas, devueltas=int(cantidad),
                    tasa=round(int(cantidad) * 100 / vendidas, 1) if vendidas else 0)
        )
        por_talla.setdefault(talla or "-", [0])[0] += int(cantidad)
    motivos = (
        await session.execute(
            select(Devolucion.motivoCategoria, func.count()).where(*filtros, validos)
            .group_by(Devolucion.motivoCategoria).order_by(func.count().desc())
        )
    ).all()
    clientes = (
        await session.execute(
            select(Cliente.idCliente, Cliente.nombre, func.count(), func.coalesce(func.sum(Devolucion.montoDevuelto), 0))
            .join(Cliente, Cliente.idCliente == Devolucion.idCliente)
            .where(*filtros, validos)
            .group_by(Cliente.idCliente, Cliente.nombre)
            .having(func.count() >= 2)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    return AnalisisOut(
        casos=int(resumen[0]),
        unidadesDevueltas=int(resumen[1]),
        montoReembolsado=float(resumen[2]),
        cambios=int(resumen[3]),
        rechazadas=int(resumen[4]),
        notasEmitidas=int(notas[0]),
        montoNotas=float(notas[1]),
        porProducto=sorted(por_producto, key=lambda t: (-t.devueltas, -t.tasa))[:12],
        porTalla=sorted(
            (
                TasaOut(clave=t, vendidas=int(tallas_vendidas.get(t, 0) or 0), devueltas=v[0],
                        tasa=round(v[0] * 100 / int(tallas_vendidas.get(t)), 1) if tallas_vendidas.get(t) else 0)
                for t, v in por_talla.items()
            ),
            key=lambda t: -t.tasa,
        ),
        motivos=[ConteoOut(clave=m or "sin_motivo", detalle=dv.MOTIVOS.get(m or "", "Sin motivo"), casos=n) for m, n in motivos],
        clientesFrecuentes=[ConteoOut(clave=str(i), detalle=n, casos=c, monto=float(m)) for i, n, c, m in clientes],
    )


async def _filas_export(session: AsyncSession, id_tenant: int, **filtros) -> list[DevolucionOut]:
    stmt = _consulta_casos().where(*_filtros_historial(id_tenant, **filtros)).order_by(Devolucion.fecha.desc())
    return [_fila_a_out(f) for f in (await session.execute(stmt)).all()]


ENCABEZADOS_EXPORT = ["Codigo", "Fecha", "Cliente", "Venta", "Prenda", "Talla", "Tipo", "Motivo", "Inspeccion",
                      "Estado", "Reembolsado", "Diferencia", "Nota", "Responsable"]


def _fila_export(d: DevolucionOut) -> list[str]:
    return [
        d.codigo or "", d.fecha.astimezone(HORA_BOLIVIA).strftime("%d/%m/%Y %H:%M"), d.cliente_nombre or "",
        str(d.idVenta), d.producto_nombre or "", d.tallaOriginal or "", dv.ETIQUETAS.get(d.tipo, d.tipo),
        dv.MOTIVOS.get(d.motivoCategoria or "", ""), d.condicion or "", d.estado, f"{d.montoDevuelto:.2f}",
        f"{d.diferencia:.2f}", d.nota_codigo or "", d.usuario_nombre or "",
    ]


@router.get("/export.csv")
async def exportar_csv(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    tipo: str | None = None,
    estado: str | None = None,
    motivo: str | None = None,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_VER)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU11 paso 6: exportacion para Excel (CSV con separador ;)."""
    filas = await _filas_export(
        session, id_tenant, idCliente=None, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        codigoSucursal=codigoSucursal, tipo=tipo, estado=estado, origen=None, motivo=motivo, idProducto=None, talla=None,
    )
    buffer = io.StringIO()
    escritor = csv.writer(buffer, delimiter=";")
    escritor.writerow(ENCABEZADOS_EXPORT)
    for d in filas:
        escritor.writerow(_fila_export(d))
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="devoluciones.csv"'},
    )


@router.get("/export.pdf")
async def exportar_pdf(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    tipo: str | None = None,
    estado: str | None = None,
    motivo: str | None = None,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_VER)),
    id_tenant: int = Depends(tenant_actual),
):
    from app.routers.reports import _build_pdf_bytes

    filas = await _filas_export(
        session, id_tenant, idCliente=None, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        codigoSucursal=codigoSucursal, tipo=tipo, estado=estado, origen=None, motivo=motivo, idProducto=None, talla=None,
    )
    periodo = f"Del {fecha_desde or 'inicio'} al {fecha_hasta or 'hoy'}"
    columnas = [0, 1, 2, 4, 5, 6, 9, 10, 12]
    contenido = _build_pdf_bytes(
        "Historial de devoluciones y cambios",
        f"{periodo} - {len(filas)} caso(s)",
        [ENCABEZADOS_EXPORT[i] for i in columnas],
        [[_fila_export(d)[i] for i in columnas] for d in filas],
    )
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="devoluciones.pdf"'},
    )


@router.get("/reembolsos-pendientes", response_model=list[DevolucionOut])
async def reembolsos_pendientes(
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU6 flujos alternativos 3 y 4: reembolsos con tarjeta que la pasarela no
    confirmo y transferencias que esperan su comprobante."""
    stmt = _consulta_casos().where(
        Devolucion.idTenant == id_tenant,
        Devolucion.estadoReembolso.in_(("Pendiente", "EnProceso", "TransferenciaPendiente")),
    ).order_by(Devolucion.fecha)
    return [_fila_a_out(f) for f in (await session.execute(stmt)).all()]


@router.get("/codigo/{codigo}", response_model=DevolucionOut)
async def buscar_por_codigo(
    codigo: str,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """CU3 paso 1: abrir la solicitud por su codigo o QR."""
    caso = (await session.execute(select(Devolucion).where(Devolucion.codigo == codigo.strip().upper()))).scalars().first()
    if caso is not None and not await _puede_ver(session, caso, auth, id_tenant):
        caso = None
    if caso is None:
        raise HTTPException(status_code=404, detail="No existe una solicitud con ese codigo")
    return await _caso_out(session, caso.idDevolucion)


@router.post("/fotos", response_model=FotoOut, status_code=201)
async def subir_foto(
    archivo: UploadFile = File(...),
    _: dict = Depends(get_current_payload),
):
    """Foto de la prenda (CU2 paso 3, CU3 paso 3). Es opcional: sin
    almacenamiento configurado responde 503 y la solicitud sigue sin fotos."""
    if not (archivo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se aceptan imagenes")
    contenido = await archivo.read()
    if len(contenido) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="La imagen supera los 5MB")
    try:
        url = await subir_foto_devolucion(archivo.filename or "foto.jpg", contenido)
    except SupabaseNoConfigurado:
        raise HTTPException(status_code=503, detail="Almacenamiento de imagenes no configurado: la foto es opcional")
    except SupabaseStorageError:
        raise HTTPException(status_code=502, detail="No se pudo guardar la foto")
    return FotoOut(url=url)


# --- CU1: solicitud en tienda ----------------------------------------------------------------

async def _venta_de_la_empresa(session: AsyncSession, id_venta: int, id_tenant: int | None) -> tuple[Venta, list[dv.LineaVenta]]:
    venta = await session.get(Venta, id_venta)
    if venta is None:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    # Dos solicitudes simultaneas de la misma venta podian pasar ambas el
    # chequeo de unidades disponibles: se serializan bloqueando la venta.
    await session.execute(select(Venta.idVenta).where(Venta.idVenta == id_venta).with_for_update())
    lineas = await dv.lineas_de_venta(session, venta)
    if not lineas or (id_tenant is not None and lineas[0].producto.idTenant != id_tenant):
        # No revela informacion de otra empresa (CU1 flujo alternativo 1).
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return venta, lineas


async def _validar_sucursal(session: AsyncSession, codigo: int | None, id_tenant: int) -> None:
    if codigo is None:
        return
    sucursal = await session.get(Sucursal, codigo)
    if sucursal is None or sucursal.idTenant != id_tenant:
        raise HTTPException(status_code=400, detail="Sucursal inexistente")


async def _nuevo_caso(
    session: AsyncSession,
    *,
    venta: Venta,
    linea: dv.LineaVenta,
    cantidad: int,
    politica: dv.Politica,
    fila_politica: PoliticaDevolucion | None,
    motivo_categoria: str,
    tipo: str,
    ahora: datetime,
) -> tuple[Devolucion, dv.Elegibilidad]:
    """Valida la elegibilidad (CU1 paso 6) y arma el caso sin guardarlo."""
    if tipo == "devolucion" and not politica.permiteReembolso and motivo_categoria != "defecto":
        raise HTTPException(
            status_code=400,
            detail="La politica de la empresa solo admite cambios o nota de credito (el reembolso es solo por defecto de fabrica)",
        )
    ocupadas = await dv.cantidad_ocupada(session, venta.idVenta, linea.idProducto)
    disponibles = linea.cantidad - ocupadas
    if cantidad > max(disponibles, 0):
        raise HTTPException(
            status_code=400,
            detail=f"Solo quedan {max(disponibles, 0)} unidad(es) elegibles de esa prenda "
            f"(vendidas {linea.cantidad}, devueltas o en tramite {ocupadas})",
        )
    eleg = dv.evaluar_elegibilidad(
        fecha_venta=venta.fecha,
        ahora=ahora,
        politica=politica,
        valor=dv.dinero(linea.precio_pagado * cantidad),
        categoria=linea.producto.tipo,
        es_defecto=motivo_categoria == "defecto",
        cambios_realizados=await _cambios_previos(session, venta.idVenta, linea.idProducto),
        disponibles=disponibles,
    )
    if not eleg.puede:
        raise HTTPException(status_code=409, detail=eleg.mensaje)
    caso = Devolucion(
        tipo=tipo,
        cantidad=cantidad,
        motivoCategoria=motivo_categoria,
        fecha=ahora,
        fechaVenta=venta.fecha,
        tallaOriginal=linea.producto.talla,
        precioPagado=linea.precio_pagado,
        montoDevuelto=0,
        idVenta=venta.idVenta,
        idProducto=linea.idProducto,
        idCliente=venta.idCliente,
        idTenant=linea.producto.idTenant,
        idPolitica=fila_politica.idPolitica if fila_politica else None,
        recargo=eleg.recargo,
        fotos=[],
    )
    return caso, eleg


async def _controlar_limite_mensual(
    session: AsyncSession, caso: Devolucion, politica: dv.Politica, auth: dict, ahora: datetime
) -> None:
    """CU1 flujo alternativo 8: superado el maximo de devoluciones del mes,
    hace falta la autorizacion del Encargado para continuar."""
    previas = await dv.devoluciones_del_mes(session, caso.idCliente, caso.idTenant, ahora)
    if previas >= politica.maxDevolucionesMes:
        caso.requiereAutorizacion = True
        caso.motivoAutorizacion = f"El cliente ya tiene {previas} devolucion(es) este mes (maximo {politica.maxDevolucionesMes})"
        if _tiene(auth, PERMISO_AUTORIZAR):
            caso.idAutorizador = int(auth["sub"])
            caso.fechaAutorizacion = ahora


@router.post("", response_model=list[DevolucionOut], status_code=201)
async def registrar_en_tienda(
    payload: RegistroTiendaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU1: registra una solicitud por prenda en estado "EnInspeccion" y
    deriva al CU3."""
    venta, lineas = await _venta_de_la_empresa(session, payload.idVenta, id_tenant)
    await _validar_sucursal(session, payload.codigoSucursal, id_tenant)
    politica, fila_politica = await dv.politica_vigente(session, id_tenant, venta.fecha)
    ahora = datetime.now(timezone.utc)
    yo = int(auth["sub"])
    casos: list[Devolucion] = []
    for item in payload.items:
        linea = next((l for l in lineas if l.idProducto == item.idProducto), None)
        if linea is None:
            raise HTTPException(status_code=400, detail="La prenda no pertenece a esa venta")
        caso, _ = await _nuevo_caso(
            session, venta=venta, linea=linea, cantidad=item.cantidad, politica=politica, fila_politica=fila_politica,
            motivo_categoria=payload.motivoCategoria, tipo=payload.tipo, ahora=ahora,
        )
        caso.estado = "EnInspeccion"
        caso.origen = "tienda"
        caso.motivo = payload.motivo
        caso.codigoSucursal = payload.codigoSucursal
        caso.idUsuario = yo
        session.add(caso)
        await _nuevo_codigo(session, caso)
        await _controlar_limite_mensual(session, caso, politica, auth, ahora)
        await session.flush()
        casos.append(caso)
        await registrar_bitacora(
            session, f"Solicitud {caso.codigo} registrada en tienda sobre la venta {venta.idVenta}", yo, _ip(request)
        )
    await session.commit()
    return [await _caso_out(session, c.idDevolucion) for c in casos]


# --- CU2: solicitud desde la tienda en linea ---------------------------------------------------

@router.post("/solicitudes", response_model=DevolucionOut, status_code=201)
async def solicitar_en_linea(
    payload: SolicitudIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
):
    propio = await _cliente_del_caller(session, auth)
    if propio is None:
        raise HTTPException(status_code=403, detail="Solo un cliente puede solicitar una devolucion en linea")
    venta = await session.get(Venta, payload.idVenta)
    if venta is None or venta.idCliente != propio.idCliente:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    venta, lineas = await _venta_de_la_empresa(session, payload.idVenta, None)
    linea = next((l for l in lineas if l.idProducto == payload.idProducto), None)
    if linea is None:
        raise HTTPException(status_code=400, detail="La prenda no pertenece a esa compra")
    id_tenant = linea.producto.idTenant
    politica, fila_politica = await dv.politica_vigente(session, id_tenant, venta.fecha)
    if not politica.permiteSolicitudEnLinea:
        raise HTTPException(status_code=400, detail="La tienda no recibe solicitudes en linea: acerquese a una sucursal")

    # CU2 flujo alternativo 2: una prenda con solicitud abierta muestra esa solicitud.
    abierta = await session.scalar(
        select(Devolucion.codigo).where(
            Devolucion.idVenta == venta.idVenta, Devolucion.idProducto == linea.idProducto,
            Devolucion.estado.in_(dv.ESTADOS_ABIERTOS),
        )
    )
    if abierta:
        raise HTTPException(status_code=409, detail=f"Ya tenes la solicitud {abierta} abierta para esta prenda")
    await _validar_sucursal(session, payload.codigoSucursal, id_tenant)

    ahora = datetime.now(timezone.utc)
    caso, _ = await _nuevo_caso(
        session, venta=venta, linea=linea, cantidad=payload.cantidad, politica=politica, fila_politica=fila_politica,
        motivo_categoria=payload.motivoCategoria, tipo=payload.tipo, ahora=ahora,
    )
    nuevo = None
    if payload.tipo in dv.TIPOS_CAMBIO and payload.idProductoNuevo is not None:
        nuevo = await session.get(Producto, payload.idProductoNuevo)
        if nuevo is None or nuevo.idTenant != id_tenant:
            raise HTTPException(status_code=400, detail="La prenda que pidio a cambio no existe")
        error = dv.error_de_clasificacion(payload.tipo, linea.producto, nuevo)
        if error:
            raise HTTPException(status_code=400, detail=error)
    caso.estado = "PendienteEntrega"
    caso.origen = "en_linea"
    caso.motivo = payload.motivo
    caso.codigoSucursal = payload.codigoSucursal
    caso.sucursalEntrega = payload.codigoSucursal
    caso.idUsuario = int(auth["sub"])
    caso.fotos = payload.fotos
    caso.fechaLimiteEntrega = ahora + timedelta(days=politica.diasEntregaEnLinea)
    if nuevo is not None:
        caso.idProductoNuevo, caso.tallaNueva = nuevo.idProducto, nuevo.talla
    session.add(caso)
    await _nuevo_codigo(session, caso)
    # CU2 paso 6: la variante pedida se aparta a su nombre hasta la fecha limite.
    if nuevo is not None:
        inv = await resolver_inventario(session, nuevo.idProducto, caso.cantidad, payload.codigoSucursal)
        if inv is not None:
            await dv.reservar(session, caso, inv)
    await _controlar_limite_mensual(session, caso, politica, auth, ahora)
    await session.flush()
    await registrar_bitacora(
        session, f"Solicitud {caso.codigo} en linea sobre la venta {venta.idVenta}", int(auth["sub"]), _ip(request)
    )
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


# --- Detalle, QR y comprobante --------------------------------------------------------------

async def _puede_ver(session: AsyncSession, caso: Devolucion, auth: dict, id_tenant: int) -> bool:
    if _tiene(auth, PERMISO_VER) or _tiene(auth, PERMISO_REGISTRAR):
        return caso.idTenant == id_tenant
    propio = await _cliente_del_caller(session, auth)
    return propio is not None and caso.idCliente == propio.idCliente


async def _caso_visible(session: AsyncSession, id_devolucion: int, auth: dict, id_tenant: int) -> Devolucion:
    caso = await session.get(Devolucion, id_devolucion)
    if caso is None or not await _puede_ver(session, caso, auth, id_tenant):
        raise HTTPException(status_code=404, detail="El caso de devolucion no existe")
    return caso


async def _linea_tiempo(session: AsyncSession, caso: Devolucion, out: DevolucionOut) -> list[EventoOut]:
    eventos = [
        EventoOut(
            fecha=caso.fecha,
            etapa="Solicitud",
            detalle=(
                f"{'Pedida en linea' if caso.origen == 'en_linea' else 'Registrada en tienda'}: "
                f"{dv.MOTIVOS.get(caso.motivoCategoria or '', 'sin motivo')}, pide {dv.ETIQUETAS.get(caso.tipo, caso.tipo)}"
            ),
            usuario=out.usuario_nombre,
        )
    ]
    if caso.fechaAutorizacion:
        eventos.append(EventoOut(fecha=caso.fechaAutorizacion, etapa="Autorizacion",
                                 detalle=caso.motivoAutorizacion or "Autorizada", usuario=out.autorizador_nombre))
    if caso.fechaInspeccion:
        detalle = f"Resultado: {caso.condicion}"
        if Decimal(str(caso.descuentoDeterioro)) > 0:
            detalle += f", descuento por deterioro Bs {caso.descuentoDeterioro:.2f}"
        eventos.append(EventoOut(fecha=caso.fechaInspeccion, etapa="Inspeccion", detalle=detalle, usuario=out.inspector_nombre))
    for mov in (
        await session.execute(select(Movimiento).where(Movimiento.referencia.in_((caso.codigo, f"DSP-{caso.codigo}"))).order_by(Movimiento.fecha))
    ).scalars().all():
        eventos.append(EventoOut(fecha=mov.fecha, etapa="Inventario", detalle=f"{mov.motivo} ({mov.cantidad:+d})"))
    for nv in (await session.execute(select(InventarioNoVendible).where(InventarioNoVendible.idDevolucion == caso.idDevolucion))).scalars().all():
        eventos.append(EventoOut(fecha=nv.fecha, etapa="Inventario", detalle=f"Inventario no vendible ({nv.motivo}): {nv.cantidad} u., {nv.estado}"))
    for mov in (
        await session.execute(
            select(NotaCreditoMovimiento, NotaCredito.codigo)
            .join(NotaCredito, NotaCredito.idNotaCredito == NotaCreditoMovimiento.idNotaCredito)
            .where(NotaCreditoMovimiento.idDevolucion == caso.idDevolucion)
        )
    ).all():
        m, codigo = mov
        eventos.append(EventoOut(fecha=m.fecha, etapa="Nota de credito", detalle=f"{codigo}: {m.tipo} Bs {m.monto:.2f}"))
    if caso.fechaResolucion:
        detalle = f"{caso.estado}: {dv.ETIQUETAS.get(caso.tipo, caso.tipo)}"
        if caso.motivoRechazo:
            detalle += f" ({caso.motivoRechazo})"
        if Decimal(str(caso.montoDevuelto)) > 0:
            detalle += f", reembolso Bs {caso.montoDevuelto:.2f} ({caso.metodoReembolso}, {caso.estadoReembolso})"
        eventos.append(EventoOut(fecha=caso.fechaResolucion, etapa="Resolucion", detalle=detalle))
    return sorted(eventos, key=lambda e: dv.como_utc(e.fecha))


@router.get("/{idDevolucion:int}", response_model=DevolucionDetalleOut)
async def ver_caso(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    caso = await _caso_visible(session, idDevolucion, auth, id_tenant)
    out = await _caso_out(session, idDevolucion)
    datos = out.model_dump()
    if caso.estado == "CambioPendiente" and caso.idProductoNuevo and caso.sucursalEntrega:
        stock = await dv.stock_por_sucursal(session, caso.idProductoNuevo, caso.idTenant)
        datos["stockDisponibleReemplazo"] = next((s["disponible"] for s in stock if s["codigoSucursal"] == caso.sucursalEntrega), 0)
    return DevolucionDetalleOut(**datos, lineaTiempo=await _linea_tiempo(session, caso, out))


@router.get("/{idDevolucion:int}/qr", response_model=QrOut)
async def qr_del_caso(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """CU2 paso 6: matriz del codigo QR de la solicitud (la dibuja la web o la app)."""
    from reportlab.graphics.barcode import qrencoder

    caso = await _caso_visible(session, idDevolucion, auth, id_tenant)
    qr = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.M)
    qr.addData(caso.codigo)
    qr.make()
    n = qr.getModuleCount()
    return QrOut(codigo=caso.codigo, modulos=["".join("1" if qr.isDark(f, c) else "0" for c in range(n)) for f in range(n)])


@router.get("/{idDevolucion:int}/comprobante.pdf")
async def comprobante(
    idDevolucion: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """Comprobante de la solicitud, del cambio (CU4/CU5) o nota de devolucion (CU6), con QR."""
    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.pagesizes import A5
    from reportlab.pdfgen import canvas

    caso = await _caso_visible(session, idDevolucion, auth, id_tenant)
    d = await _caso_out(session, idDevolucion)
    tenant = await session.get(Tenant, caso.idTenant)
    titulo = {
        "PendienteEntrega": "Solicitud de devolucion",
        "EnInspeccion": "Solicitud de devolucion",
        "Rechazada": "Devolucion rechazada",
    }.get(d.estado) or (
        "Nota de devolucion" if d.tipo == "devolucion" else "Nota de credito" if d.tipo == "nota_credito" else "Comprobante de cambio"
    )
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A5)
    ancho, alto = A5
    y = alto - 40
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(30, y, tenant.nombre if tenant else "YouShop")
    y -= 20
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(30, y, f"{titulo} {d.codigo}")
    y -= 18
    pdf.setFont("Helvetica", 9)
    lineas = [
        f"Fecha: {d.fecha.astimezone(HORA_BOLIVIA):%d/%m/%Y %H:%M}",
        f"Cliente: {d.cliente_nombre or ''}",
        f"Venta original: #{d.idVenta} del {d.fechaVenta.astimezone(HORA_BOLIVIA):%d/%m/%Y}",
        f"Prenda: {d.producto_nombre} talla {d.tallaOriginal or '-'} x{d.cantidad} (Bs {d.precio_unitario or 0:.2f} c/u)",
        f"Motivo: {dv.MOTIVOS.get(d.motivoCategoria or '', '-')}{' - ' + d.motivo if d.motivo else ''}",
        f"Estado: {d.estado}",
    ]
    if d.fechaLimiteEntrega and d.estado == "PendienteEntrega":
        lineas.append(f"Entregar la prenda en {d.sucursal_nombre} hasta el {d.fechaLimiteEntrega.astimezone(HORA_BOLIVIA):%d/%m/%Y}")
    if d.condicion:
        lineas.append(f"Inspeccion: {d.condicion}")
    if d.producto_nuevo_nombre:
        lineas.append(f"Entregado: {d.producto_nuevo_nombre} talla {d.tallaNueva or '-'}")
    if d.recargo or d.descuentoDeterioro:
        lineas.append(f"Recargo por demora: Bs {d.recargo:.2f} - Descuento por deterioro: Bs {d.descuentoDeterioro:.2f}")
    if d.diferencia:
        lineas.append(f"Diferencia {'cobrada' if d.diferencia > 0 else 'a favor'}: Bs {abs(d.diferencia):.2f}")
    if d.montoDevuelto:
        lineas.append(f"Reembolso: Bs {d.montoDevuelto:.2f} por {d.metodoReembolso} ({d.estadoReembolso})")
    if d.nota_codigo:
        lineas.append(f"Nota de credito: {d.nota_codigo}")
    if d.motivoRechazo:
        lineas.append(f"Motivo del rechazo: {d.motivoRechazo}")
    for texto in lineas:
        pdf.drawString(30, y, texto[:95])
        y -= 13
    widget = QrCodeWidget(d.codigo)
    x0, y0, x1, y1 = widget.getBounds()
    lado = 110
    dibujo = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    dibujo.add(widget)
    renderPDF.draw(dibujo, pdf, ancho - lado - 30, 40)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(30, 50, "Presente este comprobante en la sucursal.")
    pdf.showPage()
    pdf.save()
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{d.codigo}.pdf"'},
    )


# --- Autorizacion del Encargado ---------------------------------------------------------------

@router.post("/{idDevolucion:int}/autorizar", response_model=DevolucionOut)
async def autorizar(
    idDevolucion: int,
    payload: AutorizacionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_AUTORIZAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU1 alt. 8, CU4 alt. 6 y CU6 alt. 5: el Encargado autoriza continuar."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estado in ("Completada", "Rechazada", "Anulada", "Cancelada"):
        raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado.lower()}")
    caso.idAutorizador = int(auth["sub"])
    caso.fechaAutorizacion = datetime.now(timezone.utc)
    if payload.motivo:
        caso.motivoAutorizacion = f"{caso.motivoAutorizacion or ''} | Autorizado: {payload.motivo}"[:255]
    await registrar_bitacora(session, f"Caso {caso.codigo} autorizado", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


def _exigir_autorizacion_previa(caso: Devolucion, auth: dict) -> None:
    if caso.requiereAutorizacion and caso.idAutorizador is None and not _tiene(auth, PERMISO_AUTORIZAR):
        raise HTTPException(
            status_code=403,
            detail=f"{caso.motivoAutorizacion or 'El caso'}: requiere la autorizacion del Encargado de sucursal",
        )


# --- CU3: inspeccion ---------------------------------------------------------------------------

@router.post("/{idDevolucion:int}/inspeccion", response_model=list[DevolucionOut])
async def inspeccionar(
    idDevolucion: int,
    payload: InspeccionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_INSPECCIONAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """Devuelve el caso inspeccionado y, con aprobacion parcial, tambien el
    caso nuevo con las unidades rechazadas."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estado not in ("EnInspeccion", "PendienteEntrega"):
        raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado}: solo se inspecciona una solicitud pendiente")
    _exigir_autorizacion_previa(caso, auth)
    politica = await _politica_del_caso(session, caso)
    ahora = datetime.now(timezone.utc)
    coincide = dv.codigo_coincide(payload.codigoEscaneado, caso.idProducto)
    resultado = payload.resultado if coincide else "no_corresponde"
    decision = dv.decidir_inspeccion(resultado, politica, coincide=coincide, acepta_descuento=payload.aceptaDescuento)

    caso.condicion = resultado
    caso.checklist = payload.checklist.model_dump()
    caso.codigoEscaneado = payload.codigoEscaneado
    caso.notasInspeccion = payload.notasInspeccion
    caso.fotos = list(caso.fotos or []) + payload.fotos
    caso.idInspector = int(auth["sub"])
    caso.fechaInspeccion = ahora
    if caso.codigoSucursal is None:
        caso.codigoSucursal = await dv.sucursal_de_venta(session, caso.idVenta, caso.idProducto)

    casos = [caso]
    aprobadas = caso.cantidad if payload.cantidadAprobada is None else min(payload.cantidadAprobada, caso.cantidad)
    if payload.disconforme:
        # CU3 flujo alternativo 5: el Administrador decide.
        caso.estado = "EnRevision"
        caso.motivoRechazo = payload.motivoRechazo or decision.motivo_rechazo
    elif decision.estado == "Rechazada" or aprobadas == 0:
        caso.estado = "Rechazada"
        caso.motivoRechazo = payload.motivoRechazo or decision.motivo_rechazo or "Ninguna unidad paso la inspeccion"
        caso.fechaResolucion = ahora
        await dv.liberar_reserva(session, caso)
    else:
        if aprobadas < caso.cantidad:
            # CU3 flujo alternativo 4: aprobacion parcial.
            rechazadas = caso.cantidad - aprobadas
            recargo_total = Decimal(str(caso.recargo))
            rechazo = Devolucion(
                tipo=caso.tipo, cantidad=rechazadas, motivo=caso.motivo, motivoCategoria=caso.motivoCategoria,
                estado="Rechazada", fecha=caso.fecha, fechaVenta=caso.fechaVenta, tallaOriginal=caso.tallaOriginal,
                precioPagado=caso.precioPagado, montoDevuelto=0, idVenta=caso.idVenta, idProducto=caso.idProducto,
                idCliente=caso.idCliente, codigoSucursal=caso.codigoSucursal, idUsuario=caso.idUsuario,
                idTenant=caso.idTenant, origen=caso.origen, idPolitica=caso.idPolitica, condicion=caso.condicion,
                checklist=caso.checklist, notasInspeccion=caso.notasInspeccion, fotos=list(caso.fotos),
                idInspector=caso.idInspector, fechaInspeccion=ahora, fechaResolucion=ahora,
                recargo=dv.dinero(recargo_total * rechazadas / caso.cantidad),
                motivoRechazo=payload.motivoRechazo or "Unidad no aprobada en la inspeccion",
            )
            if caso.idInvReservado is not None:
                inv = await dv.liberar_reserva(session, caso)
                caso.cantidad = aprobadas
                if inv is not None:
                    await dv.reservar(session, caso, inv)
            caso.cantidad = aprobadas
            caso.recargo = dv.dinero(recargo_total - rechazo.recargo)
            session.add(rechazo)
            await _nuevo_codigo(session, rechazo)
            casos.append(rechazo)
        caso.estado = "Aprobada"
        if decision.descuento_pct > 0:
            valor = Decimal(str(caso.precioPagado or 0)) * caso.cantidad
            caso.descuentoDeterioro = dv.dinero(valor * decision.descuento_pct / 100)
    await session.flush()
    await registrar_bitacora(
        session, f"Inspeccion de {caso.codigo}: {resultado}, {caso.estado}", int(auth["sub"]), _ip(request)
    )
    await session.commit()
    return [await _caso_out(session, c.idDevolucion) for c in casos]


@router.post("/{idDevolucion:int}/revision", response_model=DevolucionOut)
async def revisar(
    idDevolucion: int,
    payload: RevisionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_ADMIN)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU3 flujo alternativo 5: el Administrador resuelve la disconformidad."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estado != "EnRevision":
        raise HTTPException(status_code=409, detail="El caso no esta en revision")
    politica = await _politica_del_caso(session, caso)
    ahora = datetime.now(timezone.utc)
    if payload.aprobada:
        caso.estado = "Aprobada"
        caso.motivoRechazo = None
        if caso.condicion == "deteriorada" and payload.aplicarDescuento:
            valor = Decimal(str(caso.precioPagado or 0)) * caso.cantidad
            caso.descuentoDeterioro = dv.dinero(valor * politica.descuentoDeterioroPct / 100)
    else:
        caso.estado = "Rechazada"
        caso.motivoRechazo = payload.motivo
        caso.fechaResolucion = ahora
        await dv.liberar_reserva(session, caso)
    caso.notasInspeccion = f"{caso.notasInspeccion or ''} | Revision: {payload.motivo}"[:255]
    await registrar_bitacora(session, f"Revision de {caso.codigo}: {caso.estado}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


# --- CU4 a CU8: resolucion -----------------------------------------------------------------------

def _resolucion(payload) -> dv.Resolucion:
    return dv.Resolucion(
        tipo=getattr(payload, "tipo", "devolucion"),
        id_producto_nuevo=getattr(payload, "idProductoNuevo", None),
        productos=[(p.idProducto, p.cantidad) for p in getattr(payload, "productos", [])],
        sucursal_entrega=payload.codigoSucursal,
        metodo_reembolso=payload.metodoReembolso,
        cuenta_destino=payload.cuentaDestino,
        id_met_pago_diferencia=payload.idMetPagoDiferencia,
        saldo_a_favor=payload.saldoAFavor,
        sin_stock=getattr(payload, "sinStock", None),
        sucursal_origen=getattr(payload, "sucursalOrigen", None),
        medida_original=getattr(payload, "medidaOriginal", None),
        medida_nueva=getattr(payload, "medidaNueva", None),
        fecha_entrega_ajuste=getattr(payload, "fechaEntregaAjuste", None),
    )


async def _marcar_autorizacion(session: AsyncSession, id_devolucion: int, motivo: str) -> None:
    """Deja el caso a la vista del Encargado (en otra transaccion: la
    resolucion fallida se revierte)."""
    await session.rollback()
    caso = await session.get(Devolucion, id_devolucion)
    caso.requiereAutorizacion = True
    caso.motivoAutorizacion = motivo[:255]
    await session.commit()


def _resumen(caso: Devolucion) -> str:
    texto = f"{caso.codigo}: {dv.ETIQUETAS.get(caso.tipo, caso.tipo)} sobre la venta {caso.idVenta}, {caso.estado}"
    if caso.destinoInventario == "no_vendible":
        texto += ", prenda al inventario no vendible"
    return texto


@router.post("/{idDevolucion:int}/resolver", response_model=DevolucionOut)
async def resolver(
    idDevolucion: int,
    payload: ResolucionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estado != "Aprobada":
        raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado}: primero hay que inspeccionar la prenda (CU3)")
    await _validar_sucursal(session, payload.codigoSucursal, id_tenant)
    venta = await session.get(Venta, caso.idVenta)
    try:
        await dv.resolver_caso(
            session,
            caso,
            venta=venta,
            linea=await _linea_del_caso(session, caso),
            res=_resolucion(payload),
            politica=await _politica_del_caso(session, caso),
            id_usuario=int(auth["sub"]),
            puede_autorizar=_tiene(auth, PERMISO_AUTORIZAR),
        )
    except dv.AutorizacionRequerida as exc:
        await _marcar_autorizacion(session, idDevolucion, exc.motivo)
        raise HTTPException(status_code=403, detail=exc.motivo)
    await session.flush()
    await registrar_bitacora(session, f"Devolucion resuelta: {_resumen(caso)}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


@router.post("/{idDevolucion:int}/completar-cambio", response_model=DevolucionOut)
async def completar_cambio(
    idDevolucion: int,
    payload: CompletarCambioIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU8 paso 5: el cliente retira el cambio pendiente (o prefiere nota o dinero)."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estado != "CambioPendiente":
        raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado}: no hay un cambio pendiente")
    await _validar_sucursal(session, payload.codigoSucursal, id_tenant)
    venta = await session.get(Venta, caso.idVenta)
    await dv.completar_cambio_pendiente(
        session,
        caso,
        venta=venta,
        linea=await _linea_del_caso(session, caso),
        accion=payload.accion,
        res=_resolucion(payload),
        politica=await _politica_del_caso(session, caso),
        id_usuario=int(auth["sub"]),
    )
    await session.flush()
    await registrar_bitacora(session, f"Cambio pendiente cerrado: {_resumen(caso)}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


@router.post("/{idDevolucion:int}/cancelar", response_model=DevolucionOut)
async def cancelar(
    idDevolucion: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """El cliente desiste de una solicitud que todavia no entrego; el personal
    cancela una solicitud abierta devolviendole la prenda (CU4 alternativo 2)."""
    caso = await session.get(Devolucion, idDevolucion, with_for_update=True)
    permitidos: tuple[str, ...] = ("PendienteEntrega",)
    if caso is not None and _tiene(auth, PERMISO_REGISTRAR):
        if caso.idTenant != id_tenant:
            caso = None
        permitidos = ("PendienteEntrega", "EnInspeccion", "EnRevision", "Aprobada")
    elif caso is not None:
        propio = await _cliente_del_caller(session, auth)
        if propio is None or caso.idCliente != propio.idCliente:
            caso = None
    if caso is None:
        raise HTTPException(status_code=404, detail="El caso de devolucion no existe")
    if caso.estado not in permitidos:
        raise HTTPException(status_code=409, detail=f"Un caso en estado {caso.estado} ya no se puede cancelar")
    await dv.liberar_reserva(session, caso)
    caso.estado = "Cancelada"
    caso.fechaResolucion = datetime.now(timezone.utc)
    await registrar_bitacora(session, f"Caso {caso.codigo} cancelado", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


@router.post("/{idDevolucion:int}/reembolso/reintentar", response_model=DevolucionOut)
async def reintentar_reembolso(
    idDevolucion: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU6 flujo alternativo 3: reintenta un reembolso con tarjeta pendiente."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estadoReembolso not in ("Pendiente", "EnProceso") or caso.metodoReembolso != "tarjeta":
        raise HTTPException(status_code=409, detail="No hay un reembolso con tarjeta pendiente")
    venta = await session.get(Venta, caso.idVenta)
    pago = await session.get(MetodoPago, venta.idMetPago)
    await dv.intentar_reembolso_tarjeta(caso, pago, dv.dinero(caso.montoDevuelto))
    await registrar_bitacora(session, f"Reintento de reembolso {caso.codigo}: {caso.estadoReembolso}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)


@router.post("/{idDevolucion:int}/reembolso/confirmar", response_model=DevolucionOut)
async def confirmar_transferencia(
    idDevolucion: int,
    payload: ConfirmarTransferenciaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO_REGISTRAR)),
    id_tenant: int = Depends(tenant_actual),
):
    """CU6 flujo alternativo 4: se adjunta el comprobante de la transferencia."""
    caso = await _caso_de_la_empresa(session, idDevolucion, id_tenant)
    if caso.estadoReembolso != "TransferenciaPendiente":
        raise HTTPException(status_code=409, detail="No hay una transferencia pendiente")
    caso.estadoReembolso = "Completado"
    caso.referenciaReembolso = payload.comprobante
    await registrar_bitacora(session, f"Transferencia del reembolso {caso.codigo} confirmada", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _caso_out(session, caso.idDevolucion)
