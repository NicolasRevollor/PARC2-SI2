"""Reglas del modulo de devoluciones y cambios (CU1 a CU11).

Implementa la especificacion de `docs/iconix/2do parcial SI2.md`:

  - CU1/CU2: una solicitud se registra en tienda ("EnInspeccion") o desde la
    tienda en linea ("PendienteEntrega"), validando la elegibilidad contra la
    politica vigente al momento de la venta (plazo de cambio, plazo de
    garantia por defecto de fabrica, recargo por demora, categorias no
    retornables, maximo de cambios y unidades disponibles).
  - CU3: la inspeccion decide si se acepta (apta, defecto de fabrica o
    deteriorada con descuento) o se rechaza (no corresponde, deteriorada).
  - CU4 a CU8: la resolucion entrega otra variante, otros productos (nueva
    venta enlazada), el dinero o una nota de credito; sin stock ofrece
    traslado, atencion en otra sucursal o lista de espera.
  - CU9: la politica es versionada; sin version rige la de la plataforma.
  - CU10: cada prenda recibida va al inventario vendible o al no vendible,
    en la misma transaccion que el resto de la resolucion.

La parte pura (plazos, recargo, inspeccion, diferencias, saldo a favor) no
toca la base y se testea sin Postgres. Las funciones async mueven stock y
dinero dentro de la transaccion del llamador: si algo falla, no queda nada a
medias (CU10, flujo alternativo 1).
"""

import math
from dataclasses import dataclass, field, fields
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DetalleVenta,
    Devolucion,
    Historial,
    Inventario,
    InventarioNoVendible,
    MetodoPago,
    Movimiento,
    NotaCredito,
    NotaCreditoMovimiento,
    PoliticaDevolucion,
    Producto,
    Sucursal,
    Venta,
)
from app.services.disponibilidad import resolver_inventario
from app.services.horario import HORA_BOLIVIA
from app.services.metodo_pago_guard import exigir_metodo_pago_consumible
from app.services.pagos_stripe import StripeNoConfigurado, StripePagoError, reembolsar_payment_intent

CENTAVO = Decimal("0.01")


def dinero(valor) -> Decimal:
    return Decimal(str(valor)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def como_utc(valor: datetime) -> datetime:
    """Normaliza a UTC con tz (las ventas viejas se guardaron naive)."""
    return valor.replace(tzinfo=timezone.utc) if valor.tzinfo is None else valor.astimezone(timezone.utc)


# --- CU9: politica -------------------------------------------------------------

CONDICIONES_POR_DEFECTO = (
    "La prenda debe estar sin uso, limpia, con sus etiquetas y se presenta con el comprobante de compra. "
    "Una prenda con defecto de fabrica siempre se acepta dentro del plazo de garantia."
)


@dataclass(frozen=True)
class Politica:
    """Valores por defecto = politica de la plataforma (CU9, flujo alternativo 3)."""

    plazoCambioHoras: int = 24
    plazoGarantiaDias: int = 30
    accionFueraPlazo: str = "rechazar"
    recargoTipo: str = "porcentaje"
    recargoValor: Decimal = Decimal("5")
    recargoUnidad: str = "dia"
    categoriasNoRetornables: tuple[str, ...] = ()
    maxCambiosPorPrenda: int = 2
    saldoAFavor: str = "cliente_elige"
    permiteReembolso: bool = True
    vigenciaNotaCreditoDias: int = 90
    respetarPrecioOriginal: bool = True
    umbralAutorizacion: Decimal = Decimal("500")
    maxDevolucionesMes: int = 3
    accionDeterioro: str = "rechazar"
    descuentoDeterioroPct: Decimal = Decimal("30")
    permiteSolicitudEnLinea: bool = True
    diasEntregaEnLinea: int = 3
    diasRetiroCambio: int = 7
    costoAjusteMedida: Decimal = Decimal("20")
    condiciones: str = CONDICIONES_POR_DEFECTO


CAMPOS_POLITICA = tuple(f.name for f in fields(Politica))
POLITICA_PLATAFORMA = Politica()


def politica_desde_fila(fila: PoliticaDevolucion) -> Politica:
    valores = {campo: getattr(fila, campo) for campo in CAMPOS_POLITICA}
    for campo in ("recargoValor", "umbralAutorizacion", "descuentoDeterioroPct", "costoAjusteMedida"):
        valores[campo] = Decimal(str(valores[campo]))
    valores["categoriasNoRetornables"] = tuple(valores["categoriasNoRetornables"] or ())
    return Politica(**valores)


def errores_politica(p: Politica) -> dict[str, str]:
    """CU9 paso 4: plazos y montos positivos y coherentes. Campo -> mensaje."""
    errores: dict[str, str] = {}
    if not 1 <= p.plazoCambioHoras <= 720:
        errores["plazoCambioHoras"] = "El plazo de cambio debe estar entre 1 y 720 horas"
    if p.plazoGarantiaDias * 24 < p.plazoCambioHoras:
        errores["plazoGarantiaDias"] = "El plazo de garantia no puede ser menor que el plazo de cambio"
    elif p.plazoGarantiaDias > 730:
        errores["plazoGarantiaDias"] = "El plazo de garantia no puede superar 730 dias"
    if p.recargoValor < 0 or (p.recargoTipo == "porcentaje" and p.recargoValor > 100):
        errores["recargoValor"] = "El recargo debe ser positivo (y un porcentaje, de 0 a 100)"
    if not 0 <= p.descuentoDeterioroPct <= 100:
        errores["descuentoDeterioroPct"] = "El descuento por deterioro es un porcentaje de 0 a 100"
    if p.maxCambiosPorPrenda < 1:
        errores["maxCambiosPorPrenda"] = "Debe permitirse al menos un cambio por prenda"
    if p.maxDevolucionesMes < 1:
        errores["maxDevolucionesMes"] = "El maximo de devoluciones por mes debe ser al menos 1"
    if p.umbralAutorizacion < 0:
        errores["umbralAutorizacion"] = "El umbral de autorizacion no puede ser negativo"
    if p.costoAjusteMedida < 0:
        errores["costoAjusteMedida"] = "El costo del ajuste no puede ser negativo"
    if not 1 <= p.vigenciaNotaCreditoDias <= 730:
        errores["vigenciaNotaCreditoDias"] = "La validez de las notas debe estar entre 1 y 730 dias"
    if not 1 <= p.diasEntregaEnLinea <= 60:
        errores["diasEntregaEnLinea"] = "El plazo para entregar la prenda debe estar entre 1 y 60 dias"
    if not 1 <= p.diasRetiroCambio <= 60:
        errores["diasRetiroCambio"] = "El plazo de retiro debe estar entre 1 y 60 dias"
    if p.saldoAFavor == "reembolso" and not p.permiteReembolso:
        errores["saldoAFavor"] = "Si no se devuelve dinero, el saldo a favor debe entregarse como nota de credito"
    return errores


async def politica_vigente(
    session: AsyncSession, id_tenant: int, fecha: datetime | None = None
) -> tuple[Politica, PoliticaDevolucion | None]:
    """La version vigente en `fecha` (la de la venta, CU9 flujo alternativo 2)
    o la ultima. Sin version: la politica de la plataforma."""
    stmt = select(PoliticaDevolucion).where(PoliticaDevolucion.idTenant == id_tenant)
    if fecha is not None:
        stmt = stmt.where(PoliticaDevolucion.vigenteDesde <= fecha)
    fila = (
        await session.execute(
            stmt.order_by(PoliticaDevolucion.vigenteDesde.desc(), PoliticaDevolucion.version.desc()).limit(1)
        )
    ).scalars().first()
    return (politica_desde_fila(fila), fila) if fila else (POLITICA_PLATAFORMA, None)


def texto_plazo(horas: int) -> str:
    return f"{horas // 24} dias" if horas % 24 == 0 and horas >= 48 else f"{horas} h"


# --- CU1/CU2: elegibilidad -------------------------------------------------------

MOTIVOS = {
    "talla": "No le quedo la talla",
    "medida": "Ajuste de medida",
    "color": "Cambio de color",
    "defecto": "Defecto de fabrica",
    "equivocado": "Producto equivocado",
    "no_desea": "Ya no lo desea",
}


def calcular_recargo(valor: Decimal, politica: Politica, horas_demora: float) -> Decimal:
    """Recargo por demora (CU1 flujo alternativo 2): porcentaje del valor o
    monto fijo por cada hora o dia (iniciado) de demora, nunca mas que el valor."""
    if horas_demora <= 0:
        return Decimal("0.00")
    unidades = math.ceil(horas_demora / 24) if politica.recargoUnidad == "dia" else math.ceil(horas_demora)
    valor = Decimal(str(valor))
    if politica.recargoTipo == "porcentaje":
        recargo = valor * politica.recargoValor / 100 * unidades
    else:
        recargo = politica.recargoValor * unidades
    return dinero(min(recargo, valor))


@dataclass(frozen=True)
class Elegibilidad:
    estado: str  # en_plazo | garantia | recargo | fuera_plazo | no_retornable | max_cambios | sin_unidades
    puede: bool
    horasRestantes: float
    fechaLimite: datetime
    garantiaHasta: datetime
    recargo: Decimal
    mensaje: str


def evaluar_elegibilidad(
    *,
    fecha_venta: datetime,
    ahora: datetime,
    politica: Politica,
    valor: Decimal,
    categoria: str | None,
    es_defecto: bool,
    cambios_realizados: int,
    disponibles: int,
) -> Elegibilidad:
    """Reglas del CU1 paso 6 y sus flujos alternativos. El plazo se cuenta
    desde la venta original (tambien para una prenda recibida por cambio)."""
    venta = como_utc(fecha_venta)
    ahora = como_utc(ahora)
    limite = venta + timedelta(hours=politica.plazoCambioHoras)
    garantia = venta + timedelta(days=politica.plazoGarantiaDias)
    cero = Decimal("0.00")

    def resultado(estado: str, puede: bool, hasta: datetime, mensaje: str, recargo: Decimal = cero) -> Elegibilidad:
        horas = round((hasta - ahora).total_seconds() / 3600, 2)
        return Elegibilidad(estado, puede, horas, limite, garantia, recargo, mensaje)

    if disponibles <= 0:
        return resultado("sin_unidades", False, limite, "No quedan unidades elegibles: ya se devolvieron o estan en tramite")
    if cambios_realizados >= politica.maxCambiosPorPrenda:
        return resultado(
            "max_cambios", False, limite,
            f"La prenda alcanzo el maximo de {politica.maxCambiosPorPrenda} cambio(s) que admite la politica",
        )
    if categoria and categoria in politica.categoriasNoRetornables and not es_defecto:
        return resultado("no_retornable", False, limite, f"{categoria} no admite devolucion: solo por defecto de fabrica")
    if es_defecto:
        if ahora < garantia:
            return resultado("garantia", True, garantia, "Dentro del plazo de garantia por defecto de fabrica")
        return resultado(
            "fuera_plazo", False, garantia,
            f"La garantia vencio el {garantia.astimezone(HORA_BOLIVIA):%d/%m/%Y %H:%M}",
        )
    if ahora < limite:
        return resultado("en_plazo", True, limite, "Dentro del plazo de cambio")
    if politica.accionFueraPlazo == "recargo":
        recargo = calcular_recargo(valor, politica, (ahora - limite).total_seconds() / 3600)
        return resultado("recargo", True, limite, f"Fuera de plazo: se aplica un recargo por demora de Bs {recargo:.2f}", recargo)
    return resultado(
        "fuera_plazo", False, limite,
        f"Fuera de plazo: la fecha limite era el {limite.astimezone(HORA_BOLIVIA):%d/%m/%Y %H:%M}",
    )


# --- CU3: inspeccion -------------------------------------------------------------

RESULTADOS_INSPECCION = ("apta", "defectuosa", "deteriorada", "no_corresponde")
CHECKLIST = ("etiquetas", "sinUso", "sinManchas", "sinRoturas", "accesorios")


def codigo_de_producto(id_producto: int) -> str:
    """Codigo impreso en la etiqueta de la prenda (lo que se escanea en el CU3)."""
    return f"YS-{id_producto:06d}"


def codigo_coincide(escaneado: str | None, id_producto: int) -> bool:
    if not escaneado:
        return True
    limpio = escaneado.strip().upper()
    return limpio in (codigo_de_producto(id_producto), str(id_producto))


@dataclass(frozen=True)
class DecisionInspeccion:
    estado: str  # Aprobada | Rechazada
    descuento_pct: Decimal
    motivo_rechazo: str | None


def decidir_inspeccion(resultado: str, politica: Politica, *, coincide: bool, acepta_descuento: bool) -> DecisionInspeccion:
    """CU3 pasos 4-6 y flujos alternativos 1 a 3."""
    if not coincide or resultado == "no_corresponde":
        return DecisionInspeccion("Rechazada", Decimal("0"), "La prenda no corresponde a la vendida: se devuelve al cliente")
    if resultado == "deteriorada":
        if politica.accionDeterioro == "rechazar":
            return DecisionInspeccion("Rechazada", Decimal("0"), "Prenda deteriorada por uso: la politica no la acepta")
        if not acepta_descuento:
            return DecisionInspeccion("Rechazada", Decimal("0"), "El cliente no acepto el descuento por deterioro")
        return DecisionInspeccion("Aprobada", politica.descuentoDeterioroPct, None)
    # Apta, o defecto de fabrica: se acepta aunque el motivo inicial fuera otro.
    return DecisionInspeccion("Aprobada", Decimal("0"), None)


def destino_por_condicion(condicion: str) -> str:
    """CU10: solo una prenda apta vuelve al stock vendible."""
    return "vendible" if condicion == "apta" else "no_vendible"


def credito_del_caso(valor, recargo, descuento) -> Decimal:
    """Valor a favor del cliente: lo que pago, menos recargo y deterioro."""
    return max(dinero(Decimal(str(valor)) - Decimal(str(recargo)) - Decimal(str(descuento))), Decimal("0.00"))


# --- CU4/CU5: cambios ------------------------------------------------------------

TIPOS_CAMBIO = ("cambio_talla", "cambio_color", "cambio_producto")
TIPOS_VARIANTE = ("cambio_talla", "cambio_color")
ETIQUETAS = {
    "cambio_talla": "cambio de talla",
    "cambio_color": "cambio de color",
    "cambio_medida": "cambio de medida",
    "cambio_producto": "cambio por otro producto",
    "devolucion": "reembolso",
    "nota_credito": "nota de credito",
}


def tipo_de_cambio(original, nuevo) -> str:
    """Misma prenda en otra talla: cambio de talla; en otro color: de color;
    cualquier otra cosa: cambio por otro producto (CU5)."""
    mismo_modelo = (original.tipo or "") == (nuevo.tipo or "")
    misma_talla = (original.talla or "") == (nuevo.talla or "")
    mismo_color = (original.color or "") == (nuevo.color or "")
    if mismo_modelo and mismo_color and not misma_talla:
        return "cambio_talla"
    if mismo_modelo and misma_talla and not mismo_color:
        return "cambio_color"
    return "cambio_producto"


def error_de_clasificacion(tipo_pedido: str, original, nuevo) -> str | None:
    if getattr(original, "idProducto", None) == getattr(nuevo, "idProducto", object()):
        return "La prenda de reemplazo debe ser distinta de la devuelta"
    if tipo_pedido == "cambio_producto":
        return None
    real = tipo_de_cambio(original, nuevo)
    if real != tipo_pedido:
        return f"La prenda elegida no corresponde a un {ETIQUETAS[tipo_pedido]}: es un {ETIQUETAS[real]}"
    return None


def diferencia_variante(
    *,
    precio_pagado,
    precio_actual_original,
    precio_actual_nueva,
    cantidad: int,
    credito,
    respetar_precio_original: bool,
) -> Decimal:
    """CU4 paso 3. Con "respetar precio original" (flujo alternativo 3) no se
    cobra el aumento general del modelo: solo la diferencia propia de la
    variante. Positiva: cobra la tienda; negativa: saldo a favor del cliente."""
    pagado = Decimal(str(precio_pagado))
    nueva = Decimal(str(precio_actual_nueva))
    if respetar_precio_original:
        nueva = pagado + (nueva - Decimal(str(precio_actual_original)))
    return dinero(nueva * cantidad - Decimal(str(credito)))


def destino_saldo_a_favor(politica: Politica, preferencia: str | None, es_defecto: bool) -> str:
    """"reembolso" o "nota_credito" para un saldo a favor (CU4 paso 6, CU5
    flujo alternativo 2). Con defecto de fabrica el cliente puede pedir el
    dinero aunque la politica solo admita notas (CU3 flujo alternativo 3)."""
    puede_dinero = politica.permiteReembolso or es_defecto
    if politica.saldoAFavor == "reembolso":
        return "reembolso" if puede_dinero else "nota_credito"
    if politica.saldoAFavor == "nota_credito" and not es_defecto:
        return "nota_credito"
    return "reembolso" if preferencia == "reembolso" and puede_dinero else "nota_credito"


# --- CU6/CU7: medios y notas -------------------------------------------------------

def medio_de_pago(pago: MetodoPago | None) -> str:
    """Medio por el que se reembolsa por defecto (CU6 paso 2): el de la venta."""
    if pago is None:
        return "efectivo"
    if pago.origen == "nota_credito":
        return "nota_credito"
    if pago.origen == "tarjeta_stripe" and pago.stripePaymentIntentId:
        return "tarjeta"
    tipo = (pago.tipo or "").lower()
    if "qr" in tipo or "transfer" in tipo:
        return "qr"
    return "efectivo"


def codigo_caso(id_devolucion: int) -> str:
    return f"DEV-{id_devolucion:06d}"


def codigo_nota(id_nota: int) -> str:
    return f"NC-{id_nota:06d}"


def estado_nota(estado: str, fecha_vencimiento: datetime, ahora: datetime) -> str:
    """Estado visible: una nota vigente con la fecha pasada esta "Vencida"."""
    if estado == "Vigente" and como_utc(fecha_vencimiento) <= como_utc(ahora):
        return "Vencida"
    return estado


def supera_umbral(monto, politica: Politica) -> bool:
    return Decimal(str(monto)) > politica.umbralAutorizacion


# --- Consultas compartidas ----------------------------------------------------------

# Estados en los que el caso ocupa unidades de la venta: una solicitud abierta
# tambien cuenta, para que no se pida dos veces la misma prenda.
ESTADOS_ABIERTOS = ("PendienteEntrega", "EnInspeccion", "EnRevision", "Aprobada", "CambioPendiente")
ESTADOS_QUE_OCUPAN = ESTADOS_ABIERTOS + ("Completada",)


@dataclass
class LineaVenta:
    idProducto: int
    cantidad: int
    precio_pagado: Decimal
    recibida_por_cambio: bool
    producto: Producto


async def lineas_de_venta(session: AsyncSession, venta: Venta) -> list[LineaVenta]:
    """Prendas de una venta: las vendidas y las recibidas por un cambio de
    variante (CU1 flujo alternativo 5: su plazo sigue siendo el de la venta)."""
    lineas: dict[int, LineaVenta] = {}
    for d, p in (
        await session.execute(
            select(DetalleVenta, Producto).join(Producto, Producto.idProducto == DetalleVenta.idProducto)
            .where(DetalleVenta.idVenta == venta.idVenta).order_by(DetalleVenta.codigoVenta)
        )
    ).all():
        if d.idProducto in lineas:
            lineas[d.idProducto].cantidad += d.cantidad
        else:
            lineas[d.idProducto] = LineaVenta(d.idProducto, d.cantidad, dinero(d.precio_unitario), False, p)
    recibidas = (
        await session.execute(
            select(Devolucion, Producto)
            .join(Producto, Producto.idProducto == Devolucion.idProductoNuevo)
            .where(
                Devolucion.idVenta == venta.idVenta,
                Devolucion.estado == "Completada",
                Devolucion.tipo.in_(TIPOS_VARIANTE),
            )
            .order_by(Devolucion.idDevolucion)
        )
    ).all()
    for caso, p in recibidas:
        original = lineas.get(caso.idProducto)
        base = original.precio_pagado if original else dinero(p.venta)
        precio = dinero(base + Decimal(str(caso.diferencia)) / caso.cantidad)
        if p.idProducto in lineas:
            if lineas[p.idProducto].recibida_por_cambio:
                lineas[p.idProducto].cantidad += caso.cantidad
        else:
            lineas[p.idProducto] = LineaVenta(p.idProducto, caso.cantidad, precio, True, p)
    return list(lineas.values())


async def linea_de_venta(session: AsyncSession, venta: Venta, id_producto: int) -> LineaVenta | None:
    return next((l for l in await lineas_de_venta(session, venta) if l.idProducto == id_producto), None)


async def cantidad_ocupada(session: AsyncSession, id_venta: int, id_producto: int) -> int:
    return int(
        await session.scalar(
            select(func.coalesce(func.sum(Devolucion.cantidad), 0)).where(
                Devolucion.idVenta == id_venta,
                Devolucion.idProducto == id_producto,
                Devolucion.estado.in_(ESTADOS_QUE_OCUPAN),
            )
        )
        or 0
    )


async def cambios_de_la_venta(session: AsyncSession, id_venta: int) -> int:
    return int(
        await session.scalar(
            select(func.count()).select_from(Devolucion).where(
                Devolucion.idVenta == id_venta,
                Devolucion.tipo.in_(TIPOS_CAMBIO),
                Devolucion.estado.in_(("Completada", "CambioPendiente")),
            )
        )
        or 0
    )


async def devoluciones_del_mes(session: AsyncSession, id_cliente: int, id_tenant: int, ahora: datetime) -> int:
    local = como_utc(ahora).astimezone(HORA_BOLIVIA)
    inicio = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return int(
        await session.scalar(
            select(func.count()).select_from(Devolucion).where(
                Devolucion.idCliente == id_cliente,
                Devolucion.idTenant == id_tenant,
                Devolucion.fecha >= inicio,
                Devolucion.estado.not_in(("Anulada", "Cancelada")),
            )
        )
        or 0
    )


async def sucursal_de_venta(session: AsyncSession, id_venta: int, id_producto: int) -> int | None:
    return await session.scalar(
        select(Inventario.codigoSucursal)
        .select_from(Movimiento)
        .join(Inventario, Inventario.idInv == Movimiento.idInv)
        .where(Movimiento.tipo == "venta", Movimiento.motivo == f"Venta {id_venta}", Inventario.idProducto == id_producto)
        .limit(1)
    )


async def stock_por_sucursal(session: AsyncSession, id_producto: int, id_tenant: int) -> list[dict]:
    """Disponible de un producto en cada sucursal de la empresa (CU4 paso 1, CU8)."""
    filas = (
        await session.execute(
            select(Sucursal.codigoSucursal, Sucursal.nombre, Inventario.cantidad_actual, Inventario.cantidad_reservada)
            .join(Inventario, Inventario.codigoSucursal == Sucursal.codigoSucursal)
            .where(Inventario.idProducto == id_producto, Sucursal.idTenant == id_tenant)
            .order_by(Sucursal.nombre)
        )
    ).all()
    return [
        {"codigoSucursal": f.codigoSucursal, "sucursal": f.nombre, "disponible": int(f.cantidad_actual - f.cantidad_reservada)}
        for f in filas
    ]


async def _fila_inventario(session: AsyncSession, id_producto: int, codigo_sucursal: int) -> Inventario:
    """La fila de inventario de un producto en una sucursal (la crea vacia si falta)."""
    inv = (
        await session.execute(
            select(Inventario)
            .where(Inventario.idProducto == id_producto, Inventario.codigoSucursal == codigo_sucursal)
            .with_for_update()
        )
    ).scalars().first()
    if inv is None:
        inv = Inventario(cantidad_actual=0, cantidad_reservada=0, codigoSucursal=codigo_sucursal, idProducto=id_producto)
        session.add(inv)
        await session.flush()
    return inv


async def disponible_en(session: AsyncSession, id_producto: int, codigo_sucursal: int | None, cantidad: int) -> Inventario | None:
    if codigo_sucursal is None:
        return None
    return await resolver_inventario(session, id_producto, cantidad, codigo_sucursal)


# --- Reservas (CU2 paso 6, CU8) -------------------------------------------------------

async def reservar(session: AsyncSession, caso: Devolucion, inv: Inventario) -> None:
    inv.cantidad_reservada += caso.cantidad
    caso.idInvReservado = inv.idInv


async def liberar_reserva(session: AsyncSession, caso: Devolucion) -> Inventario | None:
    if caso.idInvReservado is None:
        return None
    inv = await session.get(Inventario, caso.idInvReservado, with_for_update=True)
    if inv is not None:
        inv.cantidad_reservada = max(inv.cantidad_reservada - caso.cantidad, 0)
    caso.idInvReservado = None
    return inv


# --- CU10: inventario ----------------------------------------------------------------

async def recibir_prenda(session: AsyncSession, caso: Devolucion, producto: Producto) -> None:
    """La prenda devuelta entra al inventario de la sucursal receptora: la
    apta al stock vendible ("Entrada por devolucion"), la defectuosa o
    deteriorada al inventario no vendible, con reclamo al proveedor si es un
    defecto de fabrica (CU10 pasos 2-3 y flujo alternativo 2)."""
    if caso.codigoSucursal is None:
        caso.codigoSucursal = await sucursal_de_venta(session, caso.idVenta, caso.idProducto)
    if caso.codigoSucursal is None:
        raise HTTPException(status_code=400, detail="Indique la sucursal que recibe la prenda")
    destino = destino_por_condicion(caso.condicion or "apta")
    if destino == "vendible":
        inv = await _fila_inventario(session, caso.idProducto, caso.codigoSucursal)
        inv.cantidad_actual += caso.cantidad
        session.add(
            Movimiento(
                tipo="devolucion",
                cantidad=caso.cantidad,
                motivo=f"Entrada por devolucion {caso.codigo}",
                idInv=inv.idInv,
                referencia=caso.codigo,
            )
        )
    else:
        defecto = caso.condicion == "defectuosa"
        session.add(
            InventarioNoVendible(
                codigoSucursal=caso.codigoSucursal,
                idProducto=caso.idProducto,
                cantidad=caso.cantidad,
                motivo="defecto" if defecto else "deterioro",
                idDevolucion=caso.idDevolucion,
                idProveedor=producto.idProveedor if defecto else None,
                observaciones=caso.notasInspeccion,
                idTenant=caso.idTenant,
            )
        )
    caso.destinoInventario = destino


async def entregar_prenda(session: AsyncSession, caso: Devolucion, inv: Inventario, cantidad: int) -> None:
    """Salida de la prenda entregada en un cambio (CU10 paso 4)."""
    if caso.idInvReservado == inv.idInv:
        await liberar_reserva(session, caso)
    if inv.cantidad_actual - inv.cantidad_reservada < cantidad:
        raise HTTPException(status_code=409, detail="El stock de la prenda de reemplazo cambio: vuelva a intentar")
    inv.cantidad_actual -= cantidad
    session.add(
        Movimiento(
            tipo="salida_cambio",
            cantidad=-cantidad,
            motivo=f"Salida por cambio {caso.codigo}",
            idInv=inv.idInv,
            referencia=caso.codigo,
        )
    )


# --- CU7: notas de credito --------------------------------------------------------------

async def movimiento_nota(session: AsyncSession, nota: NotaCredito, tipo: str, monto, id_usuario: int, **extra) -> NotaCreditoMovimiento:
    mov = NotaCreditoMovimiento(
        idNotaCredito=nota.idNotaCredito,
        tipo=tipo,
        monto=dinero(monto),
        saldoResultante=dinero(nota.saldo),
        idUsuario=id_usuario,
        **extra,
    )
    session.add(mov)
    return mov


async def emitir_nota(
    session: AsyncSession, caso: Devolucion, monto: Decimal, politica: Politica, id_usuario: int, detalle: str
) -> NotaCredito:
    """CU7 paso 1: codigo unico, cliente, monto, vencimiento segun la politica
    y la devolucion de origen."""
    if monto <= 0:
        raise HTTPException(status_code=400, detail="No hay saldo a favor para emitir una nota de credito")
    ahora = datetime.now(timezone.utc)
    nota = NotaCredito(
        codigo=f"TMP-{uuid4().hex[:12]}",
        monto=dinero(monto),
        saldo=dinero(monto),
        estado="Vigente",
        fechaEmision=ahora,
        fechaVencimiento=ahora + timedelta(days=politica.vigenciaNotaCreditoDias),
        motivo=f"{detalle} ({caso.codigo})"[:255],
        idCliente=caso.idCliente,
        idDevolucion=caso.idDevolucion,
        idUsuario=id_usuario,
        idTenant=caso.idTenant,
    )
    session.add(nota)
    await session.flush()
    nota.codigo = codigo_nota(nota.idNotaCredito)
    caso.idNotaCredito = nota.idNotaCredito
    await movimiento_nota(session, nota, "emision", monto, id_usuario, idDevolucion=caso.idDevolucion, detalle=detalle)
    return nota


# --- CU6: reembolso ------------------------------------------------------------------------

async def _reintegrar_a_nota(
    session: AsyncSession, caso: Devolucion, pago: MetodoPago, monto: Decimal, id_usuario: int
) -> tuple[Decimal, str | None]:
    """CU7 flujo alternativo 5: lo pagado con una nota vuelve a esa nota.
    Devuelve (monto reintegrado, medio del complemento para el resto)."""
    consumo = (
        await session.execute(
            select(NotaCreditoMovimiento).where(
                NotaCreditoMovimiento.idMetPago == pago.idMetPago, NotaCreditoMovimiento.tipo == "consumo"
            )
        )
    ).scalars().first()
    if consumo is None:
        return Decimal("0.00"), None
    ya = Decimal(
        str(
            await session.scalar(
                select(func.coalesce(func.sum(NotaCreditoMovimiento.monto), 0)).where(
                    NotaCreditoMovimiento.idMetPago == pago.idMetPago, NotaCreditoMovimiento.tipo == "reintegro"
                )
            )
            or 0
        )
    )
    a_nota = min(monto, Decimal(str(consumo.monto)) - ya)
    if a_nota <= 0:
        return Decimal("0.00"), consumo.metodoComplemento
    nota = await session.get(NotaCredito, consumo.idNotaCredito, with_for_update=True)
    nota.saldo = dinero(Decimal(str(nota.saldo)) + a_nota)
    if nota.estado == "Usada":
        nota.estado = "Vigente"
    await movimiento_nota(
        session, nota, "reintegro", a_nota, id_usuario,
        idMetPago=pago.idMetPago, idDevolucion=caso.idDevolucion, detalle=f"Devolucion {caso.codigo}",
    )
    caso.idNotaCredito = nota.idNotaCredito
    return dinero(a_nota), consumo.metodoComplemento


async def reembolsar(
    session: AsyncSession,
    caso: Devolucion,
    venta: Venta,
    monto: Decimal,
    metodo: str | None,
    cuenta_destino: str | None,
    id_usuario: int,
) -> None:
    """CU6: devuelve `monto` por el medio de la venta (o el indicado). En
    efectivo queda completado; por QR/transferencia queda pendiente hasta
    adjuntar el comprobante; con tarjeta se pide a la pasarela y, si falla o
    no responde, queda "Pendiente" para reintentar."""
    monto = dinero(monto)
    caso.montoDevuelto = monto
    if monto <= 0:
        caso.metodoReembolso, caso.estadoReembolso = "efectivo", "Completado"
        return
    pago = await session.get(MetodoPago, venta.idMetPago)
    original = medio_de_pago(pago)
    if original == "nota_credito":
        a_nota, complemento = await _reintegrar_a_nota(session, caso, pago, monto, id_usuario)
        nota = await session.get(NotaCredito, caso.idNotaCredito) if caso.idNotaCredito else None
        resto = monto - a_nota
        if resto <= 0:
            caso.metodoReembolso, caso.estadoReembolso = "nota_credito", "Completado"
            caso.referenciaReembolso = f"Reintegrado a {nota.codigo}" if nota else None
            return
        if nota and a_nota > 0:
            caso.referenciaReembolso = f"Bs {a_nota:.2f} reintegrados a {nota.codigo}"
        metodo = metodo if metodo in ("efectivo", "qr") else (complemento or "efectivo")
    metodo = metodo or original
    if metodo == "nota_credito":
        raise HTTPException(status_code=400, detail="Para entregar una nota de credito elija la resolucion 'nota de credito'")
    caso.metodoReembolso = metodo
    if metodo == "efectivo":
        caso.estadoReembolso = "Completado"
        return
    if metodo == "qr":
        if not (cuenta_destino or "").strip():
            raise HTTPException(status_code=400, detail="Indique la cuenta de destino de la transferencia")
        caso.cuentaDestino = cuenta_destino.strip()[:120]
        caso.estadoReembolso = "TransferenciaPendiente"
        return
    if pago is None or pago.origen != "tarjeta_stripe" or not pago.stripePaymentIntentId:
        raise HTTPException(
            status_code=400,
            detail="La venta no se cobro con tarjeta en linea: el reembolso debe ser en efectivo o por transferencia",
        )
    await intentar_reembolso_tarjeta(caso, pago, monto)


async def intentar_reembolso_tarjeta(caso: Devolucion, pago: MetodoPago, monto: Decimal) -> None:
    try:
        reembolso = await reembolsar_payment_intent(
            payment_intent_id=pago.stripePaymentIntentId,
            monto=monto,
            clave_idempotencia=f"re:{caso.codigo}:{monto}",
        )
    except StripeNoConfigurado:
        caso.estadoReembolso = "Pendiente"
        caso.referenciaReembolso = "Pasarela de pagos no configurada: reintentar"
        return
    except StripePagoError as exc:
        caso.estadoReembolso = "Pendiente"
        caso.referenciaReembolso = f"La pasarela no respondio: {exc}"[:150]
        return
    caso.referenciaReembolso = reembolso["id"]
    caso.estadoReembolso = "Completado" if reembolso["status"] == "succeeded" else "EnProceso"


# --- Resolucion (CU4 a CU8) -------------------------------------------------------------------

@dataclass
class Resolucion:
    tipo: str
    id_producto_nuevo: int | None = None
    productos: list[tuple[int, int]] = field(default_factory=list)
    sucursal_entrega: int | None = None
    metodo_reembolso: str | None = None
    cuenta_destino: str | None = None
    id_met_pago_diferencia: int | None = None
    saldo_a_favor: str | None = None
    # CU8: traslado | otra_sucursal | espera | nota_credito | reembolso
    sin_stock: str | None = None
    sucursal_origen: int | None = None
    medida_original: str | None = None
    medida_nueva: str | None = None
    fecha_entrega_ajuste: date | None = None


class AutorizacionRequerida(Exception):
    """El monto supera el umbral: hace falta la autorizacion del Encargado."""

    def __init__(self, motivo: str):
        super().__init__(motivo)
        self.motivo = motivo


def exigir_autorizacion(caso: Devolucion, monto, politica: Politica, puede_autorizar: bool, que: str) -> None:
    """CU4 flujo alternativo 6 y CU6 flujo alternativo 5."""
    if not supera_umbral(monto, politica) or caso.idAutorizador is not None or puede_autorizar:
        return
    raise AutorizacionRequerida(
        f"{que} de Bs {Decimal(str(monto)):.2f} supera el umbral de Bs {politica.umbralAutorizacion:.2f}: "
        "requiere la autorizacion del Encargado de sucursal"
    )


async def _cobrar_diferencia(session: AsyncSession, caso: Devolucion, diferencia: Decimal, id_pago: int | None, id_usuario: int) -> None:
    if id_pago is None:
        raise HTTPException(
            status_code=400,
            detail=f"El cliente debe pagar una diferencia de Bs {diferencia:.2f}: registre el pago (efectivo, tarjeta o QR)",
        )
    pago = await exigir_metodo_pago_consumible(session, id_pago, id_usuario, False)
    if dinero(pago.monto) < diferencia:
        raise HTTPException(
            status_code=400,
            detail=f"El pago registrado (Bs {float(pago.monto):.2f}) no cubre la diferencia de Bs {diferencia:.2f}",
        )
    caso.idMetPagoDiferencia = pago.idMetPago


async def _liquidar(
    session: AsyncSession, caso: Devolucion, venta: Venta, diferencia: Decimal, res: Resolucion, politica: Politica, id_usuario: int
) -> None:
    """Cobra la diferencia o entrega el saldo a favor (CU4 pasos 4-6, CU5 paso 5)."""
    caso.diferencia = diferencia
    if diferencia > 0:
        await _cobrar_diferencia(session, caso, diferencia, res.id_met_pago_diferencia, id_usuario)
    elif diferencia < 0:
        favor = -diferencia
        if destino_saldo_a_favor(politica, res.saldo_a_favor, caso.condicion == "defectuosa") == "reembolso":
            await reembolsar(session, caso, venta, favor, res.metodo_reembolso, res.cuenta_destino, id_usuario)
        else:
            await emitir_nota(session, caso, favor, politica, id_usuario, "Saldo a favor del cambio")


async def _crear_venta_cambio(
    session: AsyncSession,
    caso: Devolucion,
    venta: Venta,
    productos: list[tuple[Producto, int, Inventario]],
    credito: Decimal,
) -> Venta:
    """CU5 paso 7: la devolucion queda vinculada a una nueva venta por los
    productos entregados, pagada con el credito de la prenda devuelta (la
    diferencia se registra aparte, en el caso)."""
    total = dinero(sum(Decimal(str(p.venta)) * cantidad for p, cantidad, _ in productos))
    pago = MetodoPago(
        tipo=f"Credito por devolucion {caso.codigo}",
        estado="Activo",
        monto=min(credito, total),
        origen="credito_devolucion",
        consumidoEn=datetime.now(timezone.utc),
    )
    session.add(pago)
    await session.flush()
    nueva = Venta(total=total, idCliente=venta.idCliente, idMetPago=pago.idMetPago)
    session.add(nueva)
    await session.flush()
    for producto, cantidad, inv in productos:
        if caso.idInvReservado == inv.idInv:
            await liberar_reserva(session, caso)
        if inv.cantidad_actual - inv.cantidad_reservada < cantidad:
            raise HTTPException(status_code=409, detail=f"El stock de {producto.nombre} cambio: vuelva a intentar")
        inv.cantidad_actual -= cantidad
        session.add(DetalleVenta(cantidad=cantidad, precio_unitario=producto.venta, idProducto=producto.idProducto, idVenta=nueva.idVenta))
        # Mismo formato que una venta comun: los reportes atribuyen la
        # sucursal por este movimiento.
        session.add(
            Movimiento(tipo="venta", cantidad=-cantidad, motivo=f"Venta {nueva.idVenta}", idInv=inv.idInv, referencia=caso.codigo)
        )
        session.add(Historial(idProducto=producto.idProducto, idCliente=venta.idCliente, idVenta=nueva.idVenta))
    await session.flush()
    caso.idVentaCambio = nueva.idVenta
    return nueva


async def _sin_stock(
    session: AsyncSession,
    caso: Devolucion,
    venta: Venta,
    nuevo: Producto,
    sucursal_entrega: int | None,
    diferencia: Decimal,
    credito: Decimal,
    res: Resolucion,
    politica: Politica,
    id_usuario: int,
) -> None:
    """CU8: la variante no tiene existencia en la sucursal del actor."""
    otras = [
        s for s in await stock_por_sucursal(session, nuevo.idProducto, caso.idTenant)
        if s["codigoSucursal"] != sucursal_entrega and s["disponible"] >= caso.cantidad
    ]
    opcion = res.sin_stock
    if opcion is None:
        donde = (
            "Hay en: " + ", ".join(f"{s['sucursal']} ({s['disponible']})" for s in otras)
            if otras
            else "Ninguna sucursal tiene existencia: puede elegir otra prenda, la lista de espera, nota de credito o reembolso"
        )
        raise HTTPException(
            status_code=409,
            detail=f"No hay stock de {nuevo.nombre} talla {nuevo.talla or '-'} en la sucursal. {donde}",
        )
    if opcion == "nota_credito":
        caso.tipo, caso.idProductoNuevo, caso.tallaNueva = "nota_credito", None, None
        await emitir_nota(session, caso, credito, politica, id_usuario, "Cambio sin stock")
        return
    if opcion == "reembolso":
        # Se permite aunque la politica solo admita cambios: la tienda no
        # puede entregar lo pedido (CU8 flujo alternativo 2).
        caso.tipo, caso.idProductoNuevo, caso.tallaNueva = "devolucion", None, None
        await reembolsar(session, caso, venta, credito, res.metodo_reembolso, res.cuenta_destino, id_usuario)
        return
    if sucursal_entrega is None:
        raise HTTPException(status_code=400, detail="Indique la sucursal donde el cliente retira el cambio")

    ahora = datetime.now(timezone.utc)
    caso.idProductoNuevo = nuevo.idProducto
    caso.tallaNueva = nuevo.talla
    caso.diferencia = diferencia
    caso.opcionSinStock = opcion
    caso.estado = "CambioPendiente"
    caso.sucursalEntrega = sucursal_entrega
    if opcion == "espera":
        # Lista de espera: se avisa cuando haya reposicion (sin apartar nada).
        return
    origen = next((s for s in otras if s["codigoSucursal"] == res.sucursal_origen), None) if res.sucursal_origen else None
    origen = origen or (max(otras, key=lambda s: s["disponible"]) if otras else None)
    if origen is None:
        raise HTTPException(status_code=409, detail="Ninguna otra sucursal tiene existencia: use la lista de espera")
    inv_origen = await _fila_inventario(session, nuevo.idProducto, origen["codigoSucursal"])
    caso.fechaLimiteRetiro = ahora + timedelta(days=politica.diasRetiroCambio)
    if opcion == "otra_sucursal":
        # Se aparta en la otra sucursal, que completa el cambio con el codigo.
        caso.sucursalEntrega = origen["codigoSucursal"]
        await reservar(session, caso, inv_origen)
        return
    # Traslado: transferencia entre sucursales y la prenda queda apartada en
    # la sucursal del cliente hasta que la retire.
    inv_destino = await _fila_inventario(session, nuevo.idProducto, sucursal_entrega)
    inv_origen.cantidad_actual -= caso.cantidad
    inv_destino.cantidad_actual += caso.cantidad
    referencia = f"DSP-{caso.codigo}"
    session.add_all(
        [
            Movimiento(tipo="salida_traspaso", cantidad=-caso.cantidad, motivo=f"Traslado para el cambio {caso.codigo}",
                       idInv=inv_origen.idInv, referencia=referencia),
            Movimiento(tipo="entrada_traspaso", cantidad=caso.cantidad, motivo=f"Traslado para el cambio {caso.codigo}",
                       idInv=inv_destino.idInv, referencia=referencia),
        ]
    )
    await reservar(session, caso, inv_destino)
    caso.fechaLlegadaEstimada = ahora + timedelta(days=2)


async def resolver_caso(
    session: AsyncSession,
    caso: Devolucion,
    *,
    venta: Venta,
    linea: LineaVenta,
    res: Resolucion,
    politica: Politica,
    id_usuario: int,
    puede_autorizar: bool,
) -> None:
    """Ejecuta la resolucion de un caso aprobado en la transaccion del llamador."""
    producto = linea.producto
    valor = dinero(linea.precio_pagado * caso.cantidad)
    credito = credito_del_caso(valor, caso.recargo, caso.descuentoDeterioro)
    es_defecto = caso.condicion == "defectuosa"
    tipo = res.tipo
    if tipo == "devolucion" and not (politica.permiteReembolso or es_defecto):
        raise HTTPException(
            status_code=400,
            detail="La politica de la empresa solo admite cambios o nota de credito (el reembolso es solo por defecto de fabrica)",
        )
    sucursal_entrega = res.sucursal_entrega or caso.sucursalEntrega or caso.codigoSucursal

    # Montos que pueden requerir autorizacion, antes de mover nada.
    nuevo: Producto | None = None
    diferencia = Decimal("0.00")
    productos: list[tuple[Producto, int]] = []
    if tipo in TIPOS_VARIANTE:
        if res.id_producto_nuevo is None:
            raise HTTPException(status_code=400, detail="Elija la nueva talla o color")
        nuevo = await session.get(Producto, res.id_producto_nuevo)
        if nuevo is None or nuevo.idTenant != caso.idTenant:
            raise HTTPException(status_code=400, detail="La prenda de reemplazo no existe")
        error = error_de_clasificacion(tipo, producto, nuevo)
        if error:
            raise HTTPException(status_code=400, detail=error)
        diferencia = diferencia_variante(
            precio_pagado=linea.precio_pagado,
            precio_actual_original=producto.venta,
            precio_actual_nueva=nuevo.venta,
            cantidad=caso.cantidad,
            credito=credito,
            respetar_precio_original=politica.respetarPrecioOriginal,
        )
        exigir_autorizacion(caso, diferencia, politica, puede_autorizar, "La diferencia a cobrar")
    elif tipo == "cambio_producto":
        pedidos = res.productos or ([(res.id_producto_nuevo, caso.cantidad)] if res.id_producto_nuevo else [])
        if not pedidos:
            raise HTTPException(status_code=400, detail="Agregue el o los productos que se lleva el cliente")
        for id_producto, cantidad in pedidos:
            p = await session.get(Producto, id_producto)
            if p is None or p.idTenant != caso.idTenant or cantidad < 1:
                raise HTTPException(status_code=400, detail=f"El producto {id_producto} no existe")
            if p.idProducto == producto.idProducto:
                raise HTTPException(status_code=400, detail="El producto nuevo debe ser distinto del devuelto")
            productos.append((p, cantidad))
        total = dinero(sum(Decimal(str(p.venta)) * c for p, c in productos))
        diferencia = dinero(total - credito)
        exigir_autorizacion(caso, diferencia, politica, puede_autorizar, "La diferencia a cobrar")
    elif tipo == "devolucion":
        exigir_autorizacion(caso, credito, politica, puede_autorizar, "El reembolso")

    # CU10: la prenda devuelta se recibe (un ajuste de medida no vuelve a la tienda).
    if tipo != "cambio_medida" and caso.destinoInventario is None:
        await recibir_prenda(session, caso, producto)
    sucursal_entrega = sucursal_entrega or caso.codigoSucursal
    caso.tipo = tipo
    await session.flush()

    if tipo in TIPOS_VARIANTE:
        inv = None
        if caso.idInvReservado is not None:
            reservado = await session.get(Inventario, caso.idInvReservado)
            if reservado is not None and reservado.idProducto == nuevo.idProducto:
                inv = reservado
        if inv is None:
            inv = await disponible_en(session, nuevo.idProducto, sucursal_entrega, caso.cantidad)
        if inv is None:
            await liberar_reserva(session, caso)
            await _sin_stock(session, caso, venta, nuevo, sucursal_entrega, diferencia, credito, res, politica, id_usuario)
            if caso.estado == "CambioPendiente":
                return
        else:
            await entregar_prenda(session, caso, inv, caso.cantidad)
            caso.idProductoNuevo, caso.tallaNueva = nuevo.idProducto, nuevo.talla
            await _liquidar(session, caso, venta, diferencia, res, politica, id_usuario)
    elif tipo == "cambio_producto":
        con_stock: list[tuple[Producto, int, Inventario]] = []
        faltantes: list[Producto] = []
        for p, cantidad in productos:
            inv = None
            if caso.idInvReservado is not None:
                reservado = await session.get(Inventario, caso.idInvReservado)
                if reservado is not None and reservado.idProducto == p.idProducto:
                    inv = reservado
            inv = inv or await disponible_en(session, p.idProducto, sucursal_entrega, cantidad)
            if inv is None:
                faltantes.append(p)
            else:
                con_stock.append((p, cantidad, inv))
        if faltantes:
            if len(productos) != 1:
                raise HTTPException(
                    status_code=409,
                    detail="Sin existencia en la sucursal de: "
                    + ", ".join(f"{p.nombre} talla {p.talla}" for p in faltantes)
                    + ". Quitelos o consulte otras sucursales",
                )
            await liberar_reserva(session, caso)
            await _sin_stock(session, caso, venta, faltantes[0], sucursal_entrega, diferencia, credito, res, politica, id_usuario)
            if caso.estado == "CambioPendiente":
                return
        else:
            await _crear_venta_cambio(session, caso, venta, con_stock, credito)
            caso.idProductoNuevo, caso.tallaNueva = con_stock[0][0].idProducto, con_stock[0][0].talla
            await _liquidar(session, caso, venta, diferencia, res, politica, id_usuario)
    elif tipo == "cambio_medida":
        if not (res.medida_nueva or "").strip():
            raise HTTPException(status_code=400, detail="Indique la medida nueva del ajuste")
        caso.medidaOriginal, caso.medidaNueva = res.medida_original, res.medida_nueva
        caso.fechaEntregaAjuste = res.fecha_entrega_ajuste or (datetime.now(HORA_BOLIVIA) + timedelta(days=3)).date()
        # El ajuste solo se cobra fuera del plazo libre de recargo (CU4 alternativo 5).
        costo = dinero(politica.costoAjusteMedida) if Decimal(str(caso.recargo)) > 0 else Decimal("0.00")
        caso.diferencia = costo
        if costo > 0:
            await _cobrar_diferencia(session, caso, costo, res.id_met_pago_diferencia, id_usuario)
    elif tipo == "devolucion":
        await reembolsar(session, caso, venta, credito, res.metodo_reembolso, res.cuenta_destino, id_usuario)
    elif tipo == "nota_credito":
        await emitir_nota(session, caso, credito, politica, id_usuario, "Devolucion")

    caso.estado = "Completada"
    caso.fechaResolucion = datetime.now(timezone.utc)


async def completar_cambio_pendiente(
    session: AsyncSession,
    caso: Devolucion,
    *,
    venta: Venta,
    linea: LineaVenta,
    accion: str,
    res: Resolucion,
    politica: Politica,
    id_usuario: int,
) -> None:
    """CU8 paso 5: el cliente retira la prenda trasladada o apartada (o la
    reposicion de la lista de espera); tambien puede preferir nota o dinero."""
    credito = credito_del_caso(dinero(linea.precio_pagado * caso.cantidad), caso.recargo, caso.descuentoDeterioro)
    if accion != "entregar":
        await liberar_reserva(session, caso)
        caso.idProductoNuevo, caso.tallaNueva, caso.diferencia = None, None, Decimal("0.00")
        if accion == "nota_credito":
            caso.tipo = "nota_credito"
            await emitir_nota(session, caso, credito, politica, id_usuario, "Cambio pendiente compensado")
        else:
            caso.tipo = "devolucion"
            await reembolsar(session, caso, venta, credito, res.metodo_reembolso, res.cuenta_destino, id_usuario)
    else:
        nuevo = await session.get(Producto, caso.idProductoNuevo)
        inv = await session.get(Inventario, caso.idInvReservado) if caso.idInvReservado else None
        if inv is None:
            inv = await disponible_en(session, nuevo.idProducto, res.sucursal_entrega or caso.sucursalEntrega, caso.cantidad)
        if inv is None:
            otras = [s for s in await stock_por_sucursal(session, nuevo.idProducto, caso.idTenant) if s["disponible"] >= caso.cantidad]
            raise HTTPException(
                status_code=409,
                detail="Todavia no hay stock de la prenda de reemplazo en esa sucursal"
                + (". Hay en: " + ", ".join(s["sucursal"] for s in otras) if otras else ""),
            )
        if caso.tipo == "cambio_producto":
            await _crear_venta_cambio(session, caso, venta, [(nuevo, caso.cantidad, inv)], credito)
        else:
            await entregar_prenda(session, caso, inv, caso.cantidad)
        await _liquidar(session, caso, venta, dinero(caso.diferencia), res, politica, id_usuario)
    caso.estado = "Completada"
    caso.fechaResolucion = datetime.now(timezone.utc)


# --- Vencimientos (CU2 alternativo 3, CU8 alternativo 3) ----------------------------------

async def aplicar_vencimientos(session: AsyncSession, *, id_tenant: int | None = None, id_cliente: int | None = None) -> int:
    """Anula las solicitudes en linea no entregadas a tiempo (libera la
    variante apartada) y compensa con nota de credito los cambios cuyo plazo
    de retiro vencio. Se ejecuta al consultar; devuelve cuantos casos cerro."""
    ahora = datetime.now(timezone.utc)
    filtros = []
    if id_tenant is not None:
        filtros.append(Devolucion.idTenant == id_tenant)
    if id_cliente is not None:
        filtros.append(Devolucion.idCliente == id_cliente)
    vencidos = (
        await session.execute(
            select(Devolucion)
            .where(
                *filtros,
                ((Devolucion.estado == "PendienteEntrega") & (Devolucion.fechaLimiteEntrega < ahora))
                | ((Devolucion.estado == "CambioPendiente") & (Devolucion.fechaLimiteRetiro < ahora)),
            )
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()
    for caso in vencidos:
        await liberar_reserva(session, caso)
        caso.fechaResolucion = ahora
        if caso.estado == "PendienteEntrega":
            caso.estado = "Anulada"
            caso.motivoRechazo = "No se entrego la prenda hasta la fecha limite"
            continue
        venta = await session.get(Venta, caso.idVenta)
        linea = await linea_de_venta(session, venta, caso.idProducto)
        politica, _ = await politica_vigente(session, caso.idTenant, venta.fecha)
        precio = linea.precio_pagado if linea else Decimal("0")
        credito = credito_del_caso(dinero(precio * caso.cantidad), caso.recargo, caso.descuentoDeterioro)
        caso.tipo, caso.idProductoNuevo, caso.tallaNueva, caso.diferencia = "nota_credito", None, None, Decimal("0.00")
        caso.estado = "Completada"
        if credito > 0:
            await emitir_nota(session, caso, credito, politica, caso.idInspector or caso.idUsuario, "Plazo de retiro vencido")
    if vencidos:
        await session.commit()
    return len(vencidos)
