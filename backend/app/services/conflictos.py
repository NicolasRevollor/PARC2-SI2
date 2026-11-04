# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU18] Resolver conflictos de sincronizacion
# Control del diagrama: ControlConflictos
# Pantalla (boundary) que lo usa: web/src/app/features/offline/conflicts.component.ts
# En palabras simples: el Encargado decide que pasa con una operacion que el
#   servidor no pudo confirmar. La decision vuelve a aplicar la operacion con la
#   autorizacion correspondiente, o la anula devolviendo el efectivo.
# ==================================================================
"""Resolucion de los conflictos de sincronizacion (CU18)."""

from datetime import datetime, timezone

from fastapi import HTTPException

from app.models import ConflictoSincronizacion, Producto, Sucursal
from app.schemas.sincronizacion import OperacionIn, ResolverConflictoIn
from app.services import caja as caja_srv
from app.services import notificaciones as notif
from app.services import operaciones_offline as ofl
from app.services.bitacora import registrar_bitacora

ETIQUETAS = {
    "stock_insuficiente": "Stock insuficiente en el servidor",
    "precio_desactualizado": "Precio local desactualizado",
    "producto_desactivado": "Producto desactivado",
    "cliente_duplicado": "Cliente duplicado",
    "reserva_sin_existencia": "Reserva sin existencia",
    "politica_incumplida": "No cumple la politica",
    "dependencia_pendiente": "Depende de otra operacion",
    "recepcion_custodia": "Prenda en custodia",
}

DECISIONES = {
    "stock_insuficiente": ("aceptar_ajuste", "anular"),
    "precio_desactualizado": ("respetar_precio", "anular"),
    "producto_desactivado": ("anular",),
    "cliente_duplicado": ("fusionar_cliente", "crear_cliente", "anular"),
    "reserva_sin_existencia": ("reasignar", "anular"),
    "politica_incumplida": ("aceptar_cambio", "anular"),
    "dependencia_pendiente": ("reintentar", "anular"),
    "recepcion_custodia": ("vincular_venta", "devolver_prenda"),
}


def decisiones_de(tipo_conflicto: str) -> tuple[str, ...]:
    return DECISIONES.get(tipo_conflicto, ("anular",))


# ==== [CU18] Flujo alternativo 4 ===================================
# Si el conflicto supera el umbral de monto, solo el Administrador lo resuelve.
# ===================================================================
def solo_administrador(monto, umbral) -> bool:
    return caja_srv.dinero(monto) > caja_srv.dinero(umbral)


def autorizacion_de(decision: str, conflicto: ConflictoSincronizacion) -> ofl.Autorizacion:
    if decision == "aceptar_ajuste":
        return ofl.Autorizacion(ajustar_stock=True, respetar_precio=True)
    if decision == "respetar_precio":
        return ofl.Autorizacion(respetar_precio=True)
    if decision == "aceptar_cambio":
        return ofl.Autorizacion(saltar_politica=True, ajustar_stock=True, respetar_precio=True)
    if decision == "fusionar_cliente":
        return ofl.Autorizacion(id_cliente=(conflicto.datosServidor or {}).get("idCliente"))
    if decision == "crear_cliente":
        return ofl.Autorizacion(crear_cliente=True)
    return ofl.Autorizacion()


async def _anular(ctx: ofl.Contexto, conflicto: ConflictoSincronizacion, op: OperacionIn) -> None:
    """[CU18] flujo alternativo 1: la venta no se concreto, el efectivo que
    entro en caja sale como egreso. Como la operacion en conflicto nunca se
    aplico, no hay inventario que revertir."""
    datos = op.datos
    conceptos = {"venta": ("anulacion_venta", datos.get("total", 0)), "reserva": ("devolucion_deposito", datos.get("deposito", 0)),
                 "cambio": ("anulacion_venta", datos.get("montoCobrado", 0))}
    concepto, monto = conceptos.get(op.tipo, (None, 0))
    if concepto is None or caja_srv.dinero(monto) <= 0:
        return
    caja = await caja_srv.caja_de_operacion(ctx.session, ctx.id_tenant, op.codigoSucursal, datos.get("uuidCaja"), ofl.fecha_real(op))
    if caja is not None:
        # El ingreso nunca se registro porque la operacion no se aplico: se deja
        # el par ingreso/egreso para que el arqueo cuadre con lo que paso en la tienda.
        ingreso = {"venta": "venta", "reserva": "deposito_reserva", "cambio": "diferencia_cambio"}[op.tipo]
        await caja_srv.registrar_movimiento(
            ctx.session, caja, concepto=ingreso, monto=monto, referencia=f"Sin conexion {conflicto.uuidOperacion[:8]}",
            id_usuario=ctx.id_usuario, uuid_operacion=conflicto.uuidOperacion,
        )
        await caja_srv.registrar_movimiento(
            ctx.session, caja, concepto=concepto, monto=monto, referencia=f"Anulada {conflicto.uuidOperacion[:8]}",
            id_usuario=ctx.id_usuario, uuid_operacion=conflicto.uuidOperacion,
        )


async def _reasignar(ctx: ofl.Contexto, op: OperacionIn, payload: ResolverConflictoIn) -> ofl.Resultado:
    """[CU18] flujo alternativo 2: la reserva pasa a otra variante o sucursal."""
    datos = dict(op.datos)
    if payload.idProductoNuevo is not None:
        nuevo = await ctx.session.get(Producto, payload.idProductoNuevo)
        if nuevo is None or nuevo.idTenant != ctx.id_tenant:
            raise HTTPException(status_code=400, detail="La variante elegida no existe")
        items = datos["items"]
        items[0] = {**items[0], "idProducto": nuevo.idProducto, "nombre": nuevo.nombre, "precioUnitario": float(nuevo.venta)}
    sucursal = op.codigoSucursal
    if payload.codigoSucursalNueva is not None:
        destino = await ctx.session.get(Sucursal, payload.codigoSucursalNueva)
        if destino is None or destino.idTenant != ctx.id_tenant:
            raise HTTPException(status_code=400, detail="La sucursal elegida no existe")
        sucursal = destino.codigoSucursal
    return await ofl.aplicar_reserva(ctx, op.model_copy(update={"datos": datos, "codigoSucursal": sucursal}))


async def _vincular_custodia(ctx: ofl.Contexto, op: OperacionIn, payload: ResolverConflictoIn) -> ofl.Resultado:
    """[CU19] flujo alternativo 3: la prenda en custodia se registra sobre su
    venta como solicitud del CU1, y sigue por la inspeccion del CU3."""
    from app.routers import returns as rt

    if payload.idVenta is None or payload.idProducto is None:
        raise HTTPException(status_code=400, detail="Indique la venta y la prenda")
    venta, lineas = await rt._venta_de_la_empresa(ctx.session, payload.idVenta, ctx.id_tenant)
    linea = next((l for l in lineas if l.idProducto == payload.idProducto), None)
    if linea is None:
        raise HTTPException(status_code=400, detail="La prenda no pertenece a esa venta")
    politica, fila = await rt.dv.politica_vigente(ctx.session, ctx.id_tenant, venta.fecha)
    caso, _ = await rt._nuevo_caso(
        ctx.session, venta=venta, linea=linea, cantidad=1, politica=politica, fila_politica=fila,
        motivo_categoria="talla", tipo="cambio_talla", ahora=ofl.fecha_real(op),
    )
    caso.estado, caso.origen, caso.origenRegistro = "EnInspeccion", "tienda", "sin_conexion"
    caso.uuidOperacion = str(op.uuidOperacion)
    caso.motivo = (op.datos.get("descripcionPrenda") or "Prenda en custodia")[:255]
    caso.codigoSucursal, caso.idUsuario = op.codigoSucursal, ctx.id_usuario
    ctx.session.add(caso)
    await rt._nuevo_codigo(ctx.session, caso)
    await ctx.session.flush()
    return ofl.Resultado(ofl.CONFIRMADA, id_servidor=caso.idDevolucion)


# ==== [CU18] ControlConflictos.resolver() ==========================
# Pasos 4 a 6 del flujo normal y flujos alternativos 1 a 4.
# ===================================================================
async def resolver(
    ctx: ofl.Contexto, conflicto: ConflictoSincronizacion, payload: ResolverConflictoIn, *, umbral
) -> ConflictoSincronizacion:
    if conflicto.estado != "Pendiente":
        raise HTTPException(status_code=409, detail="El conflicto ya fue resuelto")
    if payload.decision not in decisiones_de(conflicto.tipoConflicto):
        raise HTTPException(status_code=400, detail=f"Decision no valida para un conflicto de {ETIQUETAS.get(conflicto.tipoConflicto, 'este tipo')}")
    if solo_administrador(conflicto.monto, umbral) and "tenant.admin" not in ctx.permisos:
        raise HTTPException(status_code=403, detail=f"El conflicto supera Bs {umbral}: solo lo resuelve el Administrador de empresa")

    op = OperacionIn.model_validate(conflicto.datosDispositivo)
    decision = payload.decision
    conflicto.alertaDiscrepancia = decision in ("aceptar_ajuste", "aceptar_cambio")
    try:
        if decision in ("anular", "devolver_prenda"):
            await _anular(ctx, conflicto, op)
            resultado = ofl.Resultado(ofl.ANULADA)
        elif decision == "reasignar":
            resultado = await _reasignar(ctx, op, payload)
        elif decision == "vincular_venta":
            resultado = await _vincular_custodia(ctx, op, payload)
        else:
            resultado = await ofl.APLICADORES[op.tipo](ctx, op, autorizacion_de(decision, conflicto))
    except ofl.Conflicto as otro:
        # La decision resolvio una parte pero el dato sigue chocando (por ejemplo,
        # fusionado el cliente, falta stock): queda pendiente con el motivo nuevo.
        await ctx.session.rollback()
        conflicto.tipoConflicto, conflicto.motivo = otro.tipo, otro.motivo
        conflicto.datosServidor = otro.servidor
        await ctx.session.commit()
        raise HTTPException(status_code=409, detail=f"Sigue en conflicto: {otro.motivo}")

    ahora = datetime.now(timezone.utc)
    conflicto.estado = "Resuelto"
    conflicto.resultado = ofl.CONFIRMADA if resultado.estado == ofl.CONFIRMADA else ofl.ANULADA
    conflicto.decision = decision
    conflicto.observaciones = payload.observaciones
    conflicto.idReferencia = resultado.id_servidor
    conflicto.idResolvio = ctx.id_usuario
    conflicto.fechaResolucion = ahora
    await ofl._registrar(ctx, op, "Aplicada" if resultado.estado == ofl.CONFIRMADA else "Rechazada",
                         f"Conflicto resuelto: {decision}", resultado.id_servidor)
    await registrar_bitacora(
        ctx.session, f"Conflicto {conflicto.idConflicto} ({conflicto.tipoConflicto}): {decision}", ctx.id_usuario, ctx.ip
    )
    await _avisar(ctx, conflicto, op, decision)
    await caja_srv.revisar_cierres_provisionales(ctx.session, ctx.id_tenant)
    await ctx.session.commit()
    return conflicto


async def _avisar(ctx: ofl.Contexto, conflicto: ConflictoSincronizacion, op: OperacionIn, decision: str) -> None:
    id_cliente = op.datos.get("idCliente")
    if decision == "anular":
        # Correccion de la ingeniera: se le avisa que se le devuelve su dinero.
        monto = op.datos.get("total") or op.datos.get("deposito") or op.datos.get("montoCobrado") or 0
        if monto:
            await notif.notificar_cliente(
                ctx.session, id_cliente, ctx.id_tenant, tipo="venta_sin_conexion", referencia=conflicto.uuidOperacion[:40],
                titulo=f"Le devolvemos Bs {float(monto):.2f}",
                mensaje=f"Su operacion hecha sin conexion no se pudo confirmar ({conflicto.motivo}). Puede retirar su dinero en la sucursal.",
            )
    elif decision == "reasignar":
        await notif.notificar_cliente(
            ctx.session, id_cliente, ctx.id_tenant, tipo="reserva", referencia=conflicto.uuidOperacion[:40],
            titulo="Su reserva cambio", mensaje="La prenda que reservo no tenia existencia: la reasignamos. Consulte en la sucursal.",
        )
    if conflicto.alertaDiscrepancia:
        await notif.notificar_personal(
            ctx.session, ctx.id_tenant, tipo="sincronizacion", referencia=conflicto.uuidOperacion[:40],
            titulo="Discrepancia de inventario", mensaje=f"Revise el stock: {conflicto.motivo}",
        )
