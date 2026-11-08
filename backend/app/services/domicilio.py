# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU31] Recoger a domicilio la prenda devuelta
# [CU32] Entregar a domicilio la prenda del cambio
# Control del diagrama: ControlDelivery
# En palabras simples: son DOS viajes del repartidor y van en este orden:
#   1. RECOJO (CU31): el repartidor busca en la casa del cliente la prenda que no
#      le quedo y la trae a la sucursal. Ahi se revisa (CU3).
#   2. ENTREGA (CU32): solo si la revision aprobo la prenda y el caso es un CAMBIO,
#      el repartidor le lleva la prenda nueva. El caso se completa cuando la entrega.
# Cada viaje cuesta lo que dice la politica (CU9), salvo que la culpa sea de la
# tienda (defecto de fabrica o prenda equivocada): ahi el delivery es gratis.
# El costo se descuenta del valor de la prenda devuelta (o suma a la diferencia).
# Pantallas: web/src/app/features/returns/return-delivery.component.ts (personal)
#            web/src/app/features/customer/returns/customer-returns.component.ts (cliente)
# ==================================================================
"""Recojo y entrega a domicilio de devoluciones y cambios."""

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Devolucion, EntregaDomicilio, Sucursal
from app.services import devoluciones as dv
from app.services import notificaciones as notif

RECOJO = "recojo"
ENTREGA = "entrega"
ACTIVOS = ("Solicitado", "Programado", "Fallido")
# Motivos en los que la culpa es de la tienda: el cliente no paga el delivery.
MOTIVOS_SIN_COSTO = ("defecto", "equivocado")
FRANJAS = {"manana": "la manana (9 a 13)", "tarde": "la tarde (14 a 19)"}
INTENTOS_ANTES_DE_SUCURSAL = 2


@dataclass
class DatosDomicilio:
    direccion: str
    telefono: str
    referencia: str | None = None
    fechaPreferida: date | None = None
    franja: str | None = None


# ==== [CU31] [CU32] ControlDelivery.calcularCosto() ================
def costo_viaje(politica: dv.Politica, motivo_categoria: str | None) -> Decimal:
    """Lo que paga el cliente por un viaje. Gratis si la culpa es de la tienda."""
    if motivo_categoria in MOTIVOS_SIN_COSTO:
        return Decimal("0.00")
    return dv.dinero(politica.costoDomicilio)


def _cargar_costo(caso: Devolucion, costo: Decimal) -> None:
    caso.costoDomicilio = dv.dinero(Decimal(str(caso.costoDomicilio or 0)) + costo)


async def viajes_del_caso(session: AsyncSession, id_devolucion: int) -> list[EntregaDomicilio]:
    return list(
        (
            await session.execute(
                select(EntregaDomicilio).where(EntregaDomicilio.idDevolucion == id_devolucion).order_by(EntregaDomicilio.idEntrega)
            )
        ).scalars()
    )


# ==== [CU31] ControlDelivery.solicitarRecojo() =====================
# CU2 con modalidad "domicilio": el cliente deja su direccion; el personal lo programa.
# ===================================================================
async def solicitar_recojo(
    session: AsyncSession, caso: Devolucion, datos: DatosDomicilio, politica: dv.Politica
) -> EntregaDomicilio:
    if not politica.permiteDomicilio:
        raise HTTPException(status_code=400, detail="La tienda no ofrece recojo a domicilio: elija una sucursal")
    if len(datos.direccion.strip()) < 8:
        raise HTTPException(status_code=400, detail="Indique la direccion completa para el recojo")
    if len("".join(c for c in datos.telefono if c.isdigit())) < 7:
        raise HTTPException(status_code=400, detail="Indique un telefono de contacto para el repartidor")
    if datos.franja is not None and datos.franja not in FRANJAS:
        raise HTTPException(status_code=400, detail="La franja horaria es manana o tarde")
    hoy = datetime.now(dv.HORA_BOLIVIA).date()
    if datos.fechaPreferida is not None and datos.fechaPreferida < hoy:
        raise HTTPException(status_code=400, detail="La fecha preferida no puede ser anterior a hoy")
    costo = costo_viaje(politica, caso.motivoCategoria)
    caso.modalidadEntrega = "domicilio"
    _cargar_costo(caso, costo)
    viaje = EntregaDomicilio(
        idDevolucion=caso.idDevolucion, idTenant=caso.idTenant, tipo=RECOJO, estado="Solicitado",
        codigoSucursal=caso.codigoSucursal, direccion=datos.direccion.strip()[:255],
        referencia=(datos.referencia or "").strip()[:255] or None, telefono=datos.telefono.strip()[:20],
        fechaPreferida=datos.fechaPreferida, franja=datos.franja, costo=costo,
    )
    session.add(viaje)
    await session.flush()
    await notif.notificar_personal(
        session, caso.idTenant, tipo="envio", referencia=caso.codigo,
        titulo=f"Recojo a domicilio por programar: {caso.codigo}",
        mensaje=f"El cliente pide que recojan la prenda en {viaje.direccion}. Programelo en Devoluciones > Recojos y entregas.",
    )
    return viaje


# ==== [CU32] ControlDelivery.prepararEntrega() =====================
# Despues de la inspeccion aprobada y de resolver el cambio (CU4, CU5 o CU8):
# la prenda nueva sale a la direccion donde se recogio la devuelta.
# ===================================================================
async def preparar_entrega(session: AsyncSession, caso: Devolucion, politica: dv.Politica) -> EntregaDomicilio:
    viajes = await viajes_del_caso(session, caso.idDevolucion)
    previa = next((v for v in viajes if v.tipo == ENTREGA and v.estado != "Cancelado"), None)
    if previa is not None:
        return previa
    origen = next((v for v in viajes if v.tipo == RECOJO), None)
    if origen is None:
        raise HTTPException(status_code=409, detail="El caso no tiene direccion de delivery")
    viaje = EntregaDomicilio(
        idDevolucion=caso.idDevolucion, idTenant=caso.idTenant, tipo=ENTREGA, estado="Solicitado",
        codigoSucursal=caso.sucursalEntrega or caso.codigoSucursal, direccion=origen.direccion,
        referencia=origen.referencia, telefono=origen.telefono, franja=origen.franja,
        costo=Decimal("0.00"),  # el costo ya se cargo al resolver (cargar_costo_entrega)
    )
    session.add(viaje)
    caso.estado = "EnvioDomicilio"
    await session.flush()
    await notif.notificar_cliente(
        session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
        titulo=f"Su prenda nueva ira a su domicilio ({caso.codigo})",
        mensaje="Revisamos la prenda que nos devolvio y esta en orden. Le avisaremos el dia en que el repartidor le lleve la prenda nueva.",
    )
    return viaje


def cargar_costo_entrega(caso: Devolucion, politica: dv.Politica) -> Decimal:
    """Antes de calcular la diferencia del cambio se suma el viaje de la entrega."""
    costo = costo_viaje(politica, caso.motivoCategoria)
    _cargar_costo(caso, costo)
    return costo


# ==== [CU31] [CU32] ControlDelivery.programar() ====================
async def programar(
    session: AsyncSession, viaje: EntregaDomicilio, caso: Devolucion, *, fecha: date, franja: str, repartidor: str, id_usuario: int
) -> None:
    if viaje.estado not in ACTIVOS:
        raise HTTPException(status_code=409, detail=f"El viaje esta {viaje.estado}: ya no se puede programar")
    if franja not in FRANJAS:
        raise HTTPException(status_code=400, detail="La franja horaria es manana o tarde")
    if fecha < datetime.now(dv.HORA_BOLIVIA).date():
        raise HTTPException(status_code=400, detail="La fecha del viaje no puede ser anterior a hoy")
    if len(repartidor.strip()) < 3:
        raise HTTPException(status_code=400, detail="Indique quien hace el viaje")
    viaje.fechaProgramada, viaje.franja, viaje.repartidor = fecha, franja, repartidor.strip()[:100]
    viaje.estado, viaje.idUsuario = "Programado", id_usuario
    cuando = f"el {notif.fecha_texto(datetime.combine(fecha, datetime.min.time(), dv.HORA_BOLIVIA))} por {FRANJAS[franja]}"
    if viaje.tipo == RECOJO:
        titulo = f"Pasaremos a recoger su prenda {cuando}"
        mensaje = (f"El repartidor {viaje.repartidor} pasara por {viaje.direccion} {cuando}. Tenga lista la prenda "
                   f"con sus etiquetas y el codigo {caso.codigo}.")
    else:
        titulo = f"Su prenda nueva llega {cuando}"
        mensaje = f"El repartidor {viaje.repartidor} le llevara la prenda a {viaje.direccion} {cuando}. Muestre el codigo {caso.codigo}."
    await notif.notificar_cliente(session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo, titulo=titulo, mensaje=mensaje)


# ==== [CU31] ControlDelivery.registrarRecojo() =====================
# [CU32] ControlDelivery.registrarEntrega()
# ===================================================================
async def completar(
    session: AsyncSession, viaje: EntregaDomicilio, caso: Devolucion, *, observaciones: str | None, en_sucursal: bool, id_usuario: int
) -> None:
    if viaje.estado not in ("Programado", "Fallido") and not (en_sucursal and viaje.estado in ACTIVOS):
        raise HTTPException(status_code=409, detail="Primero programe el viaje")
    ahora = datetime.now(timezone.utc)
    viaje.estado, viaje.fechaCompletado, viaje.idUsuario = "Completado", ahora, id_usuario
    viaje.observaciones = ((observaciones or "").strip() or ("Resuelto en la sucursal" if en_sucursal else None))
    if viaje.tipo == RECOJO:
        # CU31 paso final: la prenda llego a la sucursal; sigue la inspeccion (CU3).
        if caso.estado != "PendienteEntrega":
            raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado}: la prenda ya fue recibida")
        caso.estado = "EnInspeccion"
        if viaje.codigoSucursal:
            caso.codigoSucursal = viaje.codigoSucursal
        sucursal = await session.get(Sucursal, caso.codigoSucursal) if caso.codigoSucursal else None
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
            titulo=f"Recogimos su prenda ({caso.codigo})",
            mensaje=(f"Su prenda llego a la sucursal {sucursal.nombre if sucursal else ''}. La revisaremos y le avisaremos "
                     "el resultado; si es un cambio, despues le enviaremos la prenda nueva."),
        )
        return
    # CU32 paso final: el cliente recibio la prenda nueva; el caso termina.
    if caso.estado != "EnvioDomicilio":
        raise HTTPException(status_code=409, detail=f"El caso esta {caso.estado}: no hay prenda en camino")
    caso.estado = "Completada"
    caso.fechaResolucion = ahora
    await dv.avisar_resultado(session, caso)


# ==== [CU31] [CU32] ControlDelivery.registrarIntentoFallido() ======
async def fallido(session: AsyncSession, viaje: EntregaDomicilio, caso: Devolucion, *, motivo: str, id_usuario: int) -> None:
    if viaje.estado != "Programado":
        raise HTTPException(status_code=409, detail="Solo un viaje programado puede fallar")
    if len(motivo.strip()) < 3:
        raise HTTPException(status_code=400, detail="Indique por que no se pudo hacer el viaje")
    viaje.estado, viaje.intentos, viaje.idUsuario = "Fallido", viaje.intentos + 1, id_usuario
    viaje.observaciones = motivo.strip()[:255]
    que = "recoger su prenda" if viaje.tipo == RECOJO else "entregarle la prenda nueva"
    extra = (
        " Tambien puede acercarse a la sucursal con su codigo."
        if viaje.intentos >= INTENTOS_ANTES_DE_SUCURSAL else " Lo volveremos a programar."
    )
    await notif.notificar_cliente(
        session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
        titulo=f"No pudimos {que} ({caso.codigo})", mensaje=f"Motivo: {viaje.observaciones}.{extra}",
    )


# ==== [CU31] alternativo: el cliente prefiere llevarla a la sucursal ===
async def cancelar_recojo(session: AsyncSession, viaje: EntregaDomicilio, caso: Devolucion, politica: dv.Politica, id_usuario: int) -> None:
    if viaje.tipo != RECOJO or viaje.estado not in ACTIVOS:
        raise HTTPException(status_code=409, detail="Ese recojo ya no se puede cancelar")
    viaje.estado, viaje.idUsuario = "Cancelado", id_usuario
    # No hubo viaje: no se cobra.
    caso.costoDomicilio = max(dv.dinero(Decimal(str(caso.costoDomicilio)) - Decimal(str(viaje.costo))), Decimal("0.00"))
    caso.modalidadEntrega = "sucursal"
    if caso.estado == "PendienteEntrega":
        from datetime import timedelta

        caso.fechaLimiteEntrega = datetime.now(timezone.utc) + timedelta(days=politica.diasEntregaEnLinea)
        sucursal = await session.get(Sucursal, caso.codigoSucursal) if caso.codigoSucursal else None
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
            titulo=f"Lleve su prenda a la sucursal ({caso.codigo})",
            mensaje=(f"Cancelamos el recojo a domicilio. Lleve la prenda a la sucursal {sucursal.nombre if sucursal else ''} "
                     f"hasta el {notif.fecha_texto(caso.fechaLimiteEntrega)} con el codigo {caso.codigo}."),
        )


def cancelar_viajes_abiertos(viajes: list[EntregaDomicilio]) -> None:
    """Si el caso se cancela o se anula, los viajes pendientes ya no se hacen."""
    for v in viajes:
        if v.estado in ACTIVOS:
            v.estado = "Cancelado"
