# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# [CU3] Inspeccionar estado de la prenda devuelta
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# [CU6] Procesar reembolso de dinero
# [CU7] Emitir nota de devolucion
# [CU8] Gestionar cambio sin stock disponible
# [CU9] Configurar politica de devoluciones y cambios
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU1" y "Clases CU1", "Robustez CU2" y "Clases CU2", "Robustez CU3" y "Clases CU3", "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5", "Robustez CU6" y "Clases CU6", "Robustez CU7" y "Clases CU7", "Robustez CU8" y "Clases CU8", "Robustez CU9" y "Clases CU9", "Robustez CU10" y "Clases CU10"
# IMPORTANTE: ya NO existen las notas de credito. Si al cliente le sobra plata, SIEMPRE se le devuelve
# en dinero y se le entrega una "Nota de devolucion" (el comprobante de lo que se le devolvio).
# Diagrama de clases: ControlDevoluciones (las reglas y calculos de sus metodos)
# En palabras simples: aca estan los calculos del modulo de devoluciones. Cada funcion dice que metodo del diagrama de clases es. Los endpoints que las llaman estan en backend/app/routers/returns.py.
# ==================================================================

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
    venta enlazada) o el dinero; sin stock ofrece traslado, atencion en otra
    sucursal o lista de espera. Todo saldo a favor se devuelve en dinero y
    queda una nota de devolucion (CU7).
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
    PoliticaDevolucion,
    Producto,
    Sucursal,
    Venta,
)
from app.services import caja as caja_srv
from app.services.disponibilidad import resolver_inventario
from app.services.horario import HORA_BOLIVIA
from app.services.metodo_pago_guard import exigir_metodo_pago_consumible
from app.services import notificaciones as notif
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU9] Configurar politica de devoluciones y cambios
# Diagramas del informe: "Robustez CU9" y "Clases CU9"
# Diagrama de clases: ControlDevoluciones.usarPoliticaDePlataforma()  (entidad PoliticaDevolucion)
# En palabras simples: valores por defecto de la politica cuando la empresa no configuro la suya (plazo 24 h, etc.).
# Robustez CU9: control "ObtenerPolitica" -> mensaje 3: "... (o la de la plataforma)" = estos valores por defecto
# Secuencia CU9: usarPoliticaDePlataforma()  [opt la empresa no tiene una version guardada]
# ==================================================================
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
    # permiteReembolso: si la empresa acepta DEVOLVER la prenda a cambio del dinero.
    # (Un saldo a favor de un cambio SIEMPRE se devuelve en dinero, este valor no lo afecta.)
    permiteReembolso: bool = True
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU9] Configurar politica de devoluciones y cambios
# Diagramas del informe: "Robustez CU9" y "Clases CU9"
# Diagrama de clases: ControlDevoluciones.validarPolitica()
# En palabras simples: revisa que los valores de la politica sean validos y dice que campo esta mal.
# Robustez CU9: control "ValidarPolitica" -> mensaje 7: guardarPolitica(valores) (aca se validan)
# Secuencia CU9: lifeline "ValidarPolitica" -> validarPolitica(valores positivos, garantia >= plazo de cambio)
# ==================================================================
def errores_politica(p: Politica) -> dict[str, str]:
    """CU9 paso 4: plazos y montos positivos y coherentes. Campo -> mensaje."""
    # Revisamos campo por campo. Cada error se guarda con el nombre del campo para pintarlo en rojo en la pantalla.
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
    if not 1 <= p.diasEntregaEnLinea <= 60:
        errores["diasEntregaEnLinea"] = "El plazo para entregar la prenda debe estar entre 1 y 60 dias"
    if not 1 <= p.diasRetiroCambio <= 60:
        errores["diasRetiroCambio"] = "El plazo de retiro debe estar entre 1 y 60 dias"
    return errores


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# [CU9] Configurar politica de devoluciones y cambios
# Diagramas del informe: "Robustez CU1" y "Clases CU1", "Robustez CU9" y "Clases CU9"
# Diagrama de clases: PoliticaDevolucion.obtenerPoliticaVigente()
# En palabras simples: busca la version de la politica que regia el dia de la venta.
# Robustez CU1: control "ValidarElegibilidad" -> mensaje 8: obtener politica vigente
# Robustez CU2: control "ControlDevoluciones" -> mensaje 5: obtenerPoliticaVigente(fechaVenta), 6: retornarPolitica(...)
# Secuencia CU1: obtenerPoliticaVigente(idTenant, fechaVenta) a "PoliticaDevolucion" -> politica(plazo, categorias, max. cambios)
# Secuencia CU2: obtenerPoliticaVigente(idTenant) -> politica(plazo, categorias, dias de entrega)
# ==================================================================
async def politica_vigente(
    session: AsyncSession, id_tenant: int, fecha: datetime | None = None
) -> tuple[Politica, PoliticaDevolucion | None]:
    """La version vigente en `fecha` (la de la venta, CU9 flujo alternativo 2)
    o la ultima. Sin version: la politica de la plataforma."""
    # Buscamos las versiones de la politica de esta empresa que ya regian en esa fecha y nos quedamos con la mas nueva.
    stmt = select(PoliticaDevolucion).where(PoliticaDevolucion.idTenant == id_tenant)
    if fecha is not None:
        stmt = stmt.where(PoliticaDevolucion.vigenteDesde <= fecha)
    fila = (
        await session.execute(
            stmt.order_by(PoliticaDevolucion.vigenteDesde.desc(), PoliticaDevolucion.version.desc()).limit(1)
        )
    ).scalars().first()
    # Si la empresa nunca guardo una politica, se usa la de la plataforma (valores por defecto).
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# Diagramas del informe: "Robustez CU1" y "Clases CU1"
# Diagrama de clases: Devolucion.recargo (CU1 flujo alternativo 2)
# En palabras simples: calcula el recargo por pedir la devolucion fuera de plazo.
# Secuencia CU1: lifeline "ValidarElegibilidad" -> calcularRecargo(horas de demora)  [opt: fuera de plazo y la politica permite recargo]
# ==================================================================
def calcular_recargo(valor: Decimal, politica: Politica, horas_demora: float) -> Decimal:
    """Recargo por demora (CU1 flujo alternativo 2): porcentaje del valor o
    monto fijo por cada hora o dia (iniciado) de demora, nunca mas que el valor."""
    if horas_demora <= 0:
        return Decimal("0.00")
    # Cuantas horas o dias de demora (un dia empezado cuenta como dia entero).
    unidades = math.ceil(horas_demora / 24) if politica.recargoUnidad == "dia" else math.ceil(horas_demora)
    valor = Decimal(str(valor))
    if politica.recargoTipo == "porcentaje":
        recargo = valor * politica.recargoValor / 100 * unidades
    else:
        recargo = politica.recargoValor * unidades
    # El recargo nunca puede ser mayor que lo que vale la prenda.
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# Diagramas del informe: "Robustez CU1" y "Clases CU1", "Robustez CU2" y "Clases CU2"
# Diagrama de clases: ControlDevoluciones.calcularElegibilidad() / validarElegibilidad()
# En palabras simples: decide si la prenda se puede devolver: plazo, unidades, categoria y maximo de cambios.
# Robustez CU1: control "ValidarElegibilidad" -> mensaje 8: validar plazo, categoria y cantidad
# Robustez CU2: control "ControlDevoluciones" -> mensaje 7: calcularElegibilidad(plazo, cantidades), 18: validarElegibilidad(...)
# Secuencia CU1: lifeline "ValidarElegibilidad" -> validarElegibilidad(plazo, categoria, cantidad)
# Secuencia CU2: lifeline "ListarComprasElegibles" -> calcularElegibilidad(plazo, cantidades)
# ==================================================================
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
    # Fecha limite para cambiar = fecha de la venta + plazo de la politica (24 horas por defecto).
    limite = venta + timedelta(hours=politica.plazoCambioHoras)
    # Fecha limite de la garantia (solo cuenta para defecto de fabrica).
    garantia = venta + timedelta(days=politica.plazoGarantiaDias)
    cero = Decimal("0.00")

    def resultado(estado: str, puede: bool, hasta: datetime, mensaje: str, recargo: Decimal = cero) -> Elegibilidad:
        horas = round((hasta - ahora).total_seconds() / 3600, 2)
        return Elegibilidad(estado, puede, horas, limite, garantia, recargo, mensaje)

    # Regla 1: si ya no quedan unidades para devolver, no se puede.
    if disponibles <= 0:
        return resultado("sin_unidades", False, limite, "No quedan unidades elegibles: ya se devolvieron o estan en tramite")
    # Regla 2: una misma prenda no se puede cambiar infinitas veces.
    if cambios_realizados >= politica.maxCambiosPorPrenda:
        return resultado(
            "max_cambios", False, limite,
            f"La prenda alcanzo el maximo de {politica.maxCambiosPorPrenda} cambio(s) que admite la politica",
        )
    # Regla 3: hay categorias que no se devuelven (por ejemplo ropa interior), salvo defecto de fabrica.
    if categoria and categoria in politica.categoriasNoRetornables and not es_defecto:
        return resultado("no_retornable", False, limite, f"{categoria} no admite devolucion: solo por defecto de fabrica")
    # Regla 4: un defecto de fabrica se mide contra la garantia, no contra las 24 horas.
    if es_defecto:
        if ahora < garantia:
            return resultado("garantia", True, garantia, "Dentro del plazo de garantia por defecto de fabrica")
        return resultado(
            "fuera_plazo", False, garantia,
            f"La garantia vencio el {garantia.astimezone(HORA_BOLIVIA):%d/%m/%Y %H:%M}",
        )
    # Regla 5: si todavia esta dentro del plazo, se puede.
    if ahora < limite:
        return resultado("en_plazo", True, limite, "Dentro del plazo de cambio")
    # Regla 6: fuera de plazo se cobra un recargo (si la empresa lo permite) o se rechaza.
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU3] Inspeccionar estado de la prenda devuelta
# Diagramas del informe: "Robustez CU3" y "Clases CU3"
# Diagrama de clases: ControlDevoluciones.compararSKU()
# En palabras simples: compara el codigo escaneado de la prenda con el de la venta.
# Robustez CU3: control "EvaluarCondicion" -> mensaje 9: validar SKU
# Secuencia CU3: lifeline "EvaluarCondicion" -> compararSKU(escaneado, vendido)
# ==================================================================
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU3] Inspeccionar estado de la prenda devuelta
# Diagramas del informe: "Robustez CU3" y "Clases CU3"
# Diagrama de clases: ControlDevoluciones.decidirInspeccion()  (enum CondicionPrenda / AccionDeterioro)
# En palabras simples: segun el estado de la prenda (apta, defectuosa, deteriorada) decide si se aprueba o se rechaza.
# Robustez CU3: control "EvaluarCondicion" -> mensaje 9: aplicar politica de deterioro y defecto
# Secuencia CU3: lifeline "EvaluarCondicion" -> los tres caminos del alt: "No corresponde", deterioro rechazado, "Aprobada"
# ==================================================================
def decidir_inspeccion(resultado: str, politica: Politica, *, coincide: bool, acepta_descuento: bool) -> DecisionInspeccion:
    """CU3 pasos 4-6 y flujos alternativos 1 a 3."""
    # Caso 1: no es la prenda que se vendio -> se rechaza y se le devuelve al cliente.
    if not coincide or resultado == "no_corresponde":
        return DecisionInspeccion("Rechazada", Decimal("0"), "La prenda no corresponde a la vendida: se devuelve al cliente")
    # Caso 2: esta gastada por uso -> segun la politica se rechaza, o se acepta con descuento si el cliente esta de acuerdo.
    if resultado == "deteriorada":
        if politica.accionDeterioro == "rechazar":
            return DecisionInspeccion("Rechazada", Decimal("0"), "Prenda deteriorada por uso: la politica no la acepta")
        if not acepta_descuento:
            return DecisionInspeccion("Rechazada", Decimal("0"), "El cliente no acepto el descuento por deterioro")
        return DecisionInspeccion("Aprobada", politica.descuentoDeterioroPct, None)
    # Apta, o defecto de fabrica: se acepta aunque el motivo inicial fuera otro.
    # Caso 3: esta bien o tiene defecto de fabrica -> se aprueba.
    return DecisionInspeccion("Aprobada", Decimal("0"), None)


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU10" y "Clases CU10"
# Diagrama de clases: ControlDevoluciones.decidirDestino()  (enum DestinoInventario)
# En palabras simples: si la prenda esta apta vuelve a la venta; si no, va al inventario no vendible.
# Robustez CU10: control "DeterminarDestino" -> mensaje 3: determinarDestino(solicitud),
#   4: consultar resultado de inspeccion y sucursal receptora (Devolucion), 6: destino de cada prenda (reventa o no vendible)
# Secuencia CU10: lifeline "DeterminarDestino" -> determinarDestino(idDevolucion), consultarSolicitud(idDevolucion) -> solicitud(condicion, cantidad, sucursal receptora),
#   consultarProducto(idProducto) -> producto(idProveedor, activo) -> destino(reventa | no vendible)
# ==================================================================
def destino_por_condicion(condicion: str) -> str:
    """CU10: solo una prenda apta vuelve al stock vendible."""
    return "vendible" if condicion == "apta" else "no_vendible"


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU3] Inspeccionar estado de la prenda devuelta
# [CU5] Procesar cambio por un producto diferente
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU3" y "Clases CU3", "Robustez CU5" y "Clases CU5", "Robustez CU6" y "Clases CU6"
# Diagrama de clases: ControlDevoluciones.calcularCredito() / obtenerCredito() (CU5), calcularMonto() / obtenerMontoReembolso() (CU6), calcularDescuentoDeterioro() (CU3)
# En palabras simples: cuanto dinero tiene a favor el cliente: lo que pago menos recargo y descuento por deterioro.
# Robustez CU5: control "ControlDevoluciones" -> mensaje 2: obtenerCredito(solicitud),
#   3: consultar precio pagado, recargo y deterioro (Devolucion), 4: credito disponible
# Robustez CU6: control "CalcularMontoReembolso" -> mensaje 2: obtenerMontoReembolso(solicitud),
#   3: consultar cantidad, recargo y deterioro (Devolucion), 6: monto y medio de reembolso
# Secuencia CU5: lifeline "CalcularCredito" -> obtenerCredito(idDevolucion), consultarSolicitud(idDevolucion),
#   calcularCredito(pagado - recargo - deterioro) -> credito(monto) -> mostrarCredito(monto)
# Secuencia CU6: lifeline "CalcularMontoReembolso" -> calcularMonto(pagado - recargo - deterioro) -> monto y medio de reembolso()
# ==================================================================
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
}


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5"
# Diagrama de clases: enum TipoDevolucion (cambio_talla, cambio_color, cambio_producto...)
# En palabras simples: mira la prenda nueva y dice si es cambio de talla, de color o de producto.
# ==================================================================
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


# --- Distincion entre tallas (correccion de la ingeniera: "una L puede ser mas grande o mas chica") ---

# Orden de las tallas de letra, de la mas chica a la mas grande.
ORDEN_TALLAS = ("XS", "S", "M", "L", "XL", "XXL")
# Las medidas en centimetros que se comparan, con el nombre que ve el usuario.
MEDIDAS_CM = (("medidaPechoCm", "pecho"), ("medidaLargoCm", "largo"), ("medidaCinturaCm", "cintura"))


def _posicion_talla(talla: str | None) -> float | None:
    """Convierte una talla en un numero para poder decir cual es mas grande.
    "S" -> 1, "M" -> 2 ... y una talla de jean "32" -> 32. Si no se reconoce: None."""
    t = (talla or "").strip().upper()
    if t in ORDEN_TALLAS:
        return float(ORDEN_TALLAS.index(t))
    try:
        return float(t)
    except ValueError:
        return None


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# [CU4] Procesar cambio de talla, color o medida
# Diagramas del informe: "Robustez CU4" y "Clases CU4" (al elegir la variante nueva: mostrarVariantes / elegirVariante)
# En palabras simples: compara la prenda que devuelve con la que se lleva y dice si es MAS GRANDE o MAS CHICA,
#   y por cuantos centimetros. Sirve porque una "L" de un modelo no mide lo mismo que la "L" de otro modelo:
#   lo que manda son las medidas reales en cm de cada prenda, no la letra.
# ==================================================================
def comparar_tallas(original, nueva) -> dict:
    """Devuelve {"direccion": "mas_grande" | "mas_chica" | "igual" | "sin_datos",
    "diferenciasCm": {"pecho": 4, ...}, "texto": "..."}. `original` y `nueva`
    son productos (o cualquier objeto con talla y medidas en cm)."""
    # Paso 1: comparamos las medidas reales en centimetros que esten cargadas en las DOS prendas.
    diferencias: dict[str, int] = {}
    for campo, nombre in MEDIDAS_CM:
        a, b = getattr(original, campo, None), getattr(nueva, campo, None)
        if a is not None and b is not None:
            diferencias[nombre] = int(b) - int(a)
    talla_a, talla_b = original.talla or "?", nueva.talla or "?"
    if diferencias:
        # Paso 2: si la suma de las diferencias es positiva, la prenda nueva es mas grande.
        total = sum(diferencias.values())
        direccion = "mas_grande" if total > 0 else "mas_chica" if total < 0 else "igual"
        detalle = ", ".join(
            f"{abs(cm)} cm {'mas' if cm > 0 else 'menos'} de {nombre}" for nombre, cm in diferencias.items() if cm != 0
        )
        if direccion == "igual":
            texto = f"La {talla_b} de este modelo mide lo mismo que la {talla_a} que devuelve"
        else:
            texto = f"La {talla_b} es {'MAS GRANDE' if direccion == 'mas_grande' else 'MAS CHICA'} que la {talla_a}: {detalle}"
        return {"direccion": direccion, "diferenciasCm": diferencias, "texto": texto}
    # Paso 3: si no hay medidas cargadas, solo podemos usar el orden de las tallas (S < M < L < XL).
    pa, pb = _posicion_talla(original.talla), _posicion_talla(nueva.talla)
    if pa is None or pb is None:
        return {"direccion": "sin_datos", "diferenciasCm": {}, "texto": "No hay medidas para comparar estas tallas"}
    direccion = "mas_grande" if pb > pa else "mas_chica" if pb < pa else "igual"
    palabra = {"mas_grande": "mas grande", "mas_chica": "mas chica", "igual": "igual"}[direccion]
    return {
        "direccion": direccion,
        "diferenciasCm": {},
        "texto": f"La {talla_b} es {palabra} que la {talla_a} (sin medidas en cm cargadas para este modelo)",
    }


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# Diagramas del informe: "Robustez CU4" y "Clases CU4"
# Diagrama de clases: ControlDevoluciones.calcularDiferencia()
# En palabras simples: cuanto paga de mas (o le sobra) el cliente al cambiar a otra talla/color.
# Robustez CU4: control "CalcularDiferencia" -> mensaje 8: calcularDiferencia(variante nueva),
#   9: obtener politica (respetar precio original, umbral), 10: diferencia a cobrar, sin costo o a favor
# Secuencia CU4: lifeline "CalcularDiferencia" -> calcularDiferencia(idVariante), obtenerPoliticaDelCaso(idPolitica)
#   -> politica(respetar precio original, umbral), calcularDiferencia(precio nuevo - credito) -> diferencia(monto)
# ==================================================================
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
    # Si la politica respeta el precio original, no cobramos si subio el precio de la prenda; solo la diferencia propia de la talla.
    if respetar_precio_original:
        nueva = pagado + (nueva - Decimal(str(precio_actual_original)))
    # Resultado: positivo = el cliente paga la diferencia; negativo = le sobra plata (saldo a favor); 0 = cambio sin costo.
    return dinero(nueva * cantidad - Decimal(str(credito)))


# --- CU6/CU7: medio del reembolso y nota de devolucion -------------------------------

# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU6" y "Clases CU6"
# Diagrama de clases: enum MetodoReembolso
# En palabras simples: el reembolso se hace por el mismo medio con el que se pago la venta.
# Robustez CU6: control "CalcularMontoReembolso" -> mensaje 4: consultar precio pagado y medio de pago original (Venta)
# Secuencia CU6: lifeline "CalcularMontoReembolso" -> consultarVenta(idVenta) -> venta(precio pagado, medio de pago original)
# ==================================================================
def medio_de_pago(pago: MetodoPago | None) -> str:
    """Medio por el que se reembolsa por defecto (CU6 paso 2): el de la venta."""
    if pago is None:
        return "efectivo"
    # (Ventas viejas pagadas con una nota de credito: como las notas ya no existen, se devuelve en efectivo.)
    if pago.origen == "tarjeta_stripe" and pago.stripePaymentIntentId:
        return "tarjeta"
    tipo = (pago.tipo or "").lower()
    if "qr" in tipo or "transfer" in tipo:
        return "qr"
    return "efectivo"


def codigo_caso(id_devolucion: int) -> str:
    return f"DEV-{id_devolucion:06d}"


MEDIOS_TEXTO = {"efectivo": "en efectivo", "qr": "por QR / transferencia", "tarjeta": "a la tarjeta"}


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU7] Emitir nota de devolucion
# Diagramas del informe: "Robustez CU7" y "Clases CU7"
# En palabras simples: arma el texto de la NOTA DE DEVOLUCION: el papel (o PDF) que recibe el cliente
#   y que dice cuanto dinero se le devolvio, por que medio y por que prenda.
#   Su numero es el mismo codigo del caso (DEV-000123), asi se busca facil.
# ==================================================================
def nota_de_devolucion(caso: Devolucion) -> list[str]:
    """Lineas de la nota de devolucion de un caso que devolvio dinero."""
    monto = dinero(caso.montoDevuelto or 0)
    lineas = [
        f"Nota de devolucion N {caso.codigo}",
        f"Monto devuelto: Bs {monto:.2f} {MEDIOS_TEXTO.get(caso.metodoReembolso or 'efectivo', '')}".rstrip(),
    ]
    # Si el reembolso todavia no termino (tarjeta en proceso o transferencia por hacer), se avisa en la nota.
    if caso.estadoReembolso and caso.estadoReembolso != "Completado":
        lineas.append(f"Estado del reembolso: {caso.estadoReembolso}")
    if caso.referenciaReembolso:
        lineas.append(f"Referencia: {caso.referenciaReembolso}")
    return lineas


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU6" y "Clases CU6"
# Diagrama de clases: parte de ControlDevoluciones.exigirAutorizacion()
# En palabras simples: compara el monto con el umbral que necesita autorizacion.
# ==================================================================
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# Diagramas del informe: "Robustez CU1" y "Clases CU1"
# Diagrama de clases: Devolucion.consultarDevueltas()
# En palabras simples: cuantas unidades de esa prenda ya fueron devueltas o estan en tramite.
# ==================================================================
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# [CU4] Procesar cambio de talla, color o medida
# [CU8] Gestionar cambio sin stock disponible
# Diagramas del informe: "Robustez CU2" y "Clases CU2", "Robustez CU4" y "Clases CU4", "Robustez CU8" y "Clases CU8"
# Diagrama de clases: Inventario.consultarStockPorSucursal()
# En palabras simples: stock de un producto en cada sucursal de la empresa.
# Robustez CU2: mensaje 12: consultarStockPorSucursal(idVariante)
# Robustez CU4: control "ConsultarVariantes" -> mensaje 4: consultar stock de las variantes en la sucursal
# Robustez CU8: control "BuscarStockSucursales" -> mensaje 3: buscar stock en esta y en las demas sucursales
# Secuencia CU4: consultarStock(variantes, sucursal)  |  Secuencia CU8: consultarStockPorSucursal(variante) -> stock por sucursal (0 en esta)
# ==================================================================
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU8] Gestionar cambio sin stock disponible
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU8" y "Clases CU8"
# Diagrama de clases: Inventario.buscarStockDisponible()
# En palabras simples: cuantas unidades hay libres en una sucursal.
# ==================================================================
async def disponible_en(session: AsyncSession, id_producto: int, codigo_sucursal: int | None, cantidad: int) -> Inventario | None:
    if codigo_sucursal is None:
        return None
    return await resolver_inventario(session, id_producto, cantidad, codigo_sucursal)


# --- Reservas (CU2 paso 6, CU8) -------------------------------------------------------

# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# [CU8] Gestionar cambio sin stock disponible
# Diagramas del informe: "Robustez CU2" y "Clases CU2", "Robustez CU8" y "Clases CU8"
# Diagrama de clases: Inventario.apartarVariante()
# En palabras simples: aparta la prenda nueva a nombre del cliente.
# Robustez CU2: mensaje 20: apartarVariante(cantidad, hasta fecha limite) en Inventario
# Robustez CU8: control "Backend : GestionarTraslado" -> mensaje 9: ... y apartar la variante
# Secuencia CU2: apartarVariante(cantidad, hasta la fecha limite)  |  Secuencia CU8: apartarVariante(sucursal destino / otra sucursal)
# ==================================================================
async def reservar(session: AsyncSession, caso: Devolucion, inv: Inventario) -> None:
    inv.cantidad_reservada += caso.cantidad
    caso.idInvReservado = inv.idInv


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU3] Inspeccionar estado de la prenda devuelta
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# Diagramas del informe: "Robustez CU3" y "Clases CU3", "Robustez CU2" y "Clases CU2"
# Diagrama de clases: ControlDevoluciones.liberarReservaApartada()
# En palabras simples: suelta la prenda apartada (se rechazo o se anulo la solicitud).
# ==================================================================
async def liberar_reserva(session: AsyncSession, caso: Devolucion) -> Inventario | None:
    if caso.idInvReservado is None:
        return None
    inv = await session.get(Inventario, caso.idInvReservado, with_for_update=True)
    if inv is not None:
        inv.cantidad_reservada = max(inv.cantidad_reservada - caso.cantidad, 0)
    caso.idInvReservado = None
    return inv


# --- CU10: inventario ----------------------------------------------------------------

# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU10" y "Clases CU10"
# Diagrama de clases: Inventario.recibirPrendaDevuelta()  (+ InventarioNoVendible y Movimiento "Entrada por devolucion")
# En palabras simples: la prenda devuelta entra al stock vendible o a merma segun su estado.
# Robustez CU10: control "DeterminarDestino" -> mensaje 5: consultar el producto y su proveedor (Producto)
# Robustez CU10: control "MoverInventario" -> mensaje 7: aplicarMovimientos(destino, resolucion),
#   8: [apta] sumar stock en la sucursal receptora (Inventario), 9: [apta] registrar "Entrada por devolucion" (Movimiento),
#   10: [defecto o deterioro] registrar en inventario no vendible (InventarioNoVendible), 14: guardar el destino de inventario
# Secuencia CU10: lifeline "MoverInventario" -> aplicarMovimientos(destino, resolucion): sumarStock(sucursal receptora, + cantidad),
#   registrarMovimiento("Entrada por devolucion") o registrarMerma(motivo, proveedor, observaciones); actualizarDestino(destinoInventario)
# ==================================================================
async def recibir_prenda(session: AsyncSession, caso: Devolucion, producto: Producto) -> None:
    """La prenda devuelta entra al inventario de la sucursal receptora: la
    apta al stock vendible ("Entrada por devolucion"), la defectuosa o
    deteriorada al inventario no vendible, con reclamo al proveedor si es un
    defecto de fabrica (CU10 pasos 2-3 y flujo alternativo 2)."""
    if caso.codigoSucursal is None:
        caso.codigoSucursal = await sucursal_de_venta(session, caso.idVenta, caso.idProducto)
    if caso.codigoSucursal is None:
        raise HTTPException(status_code=400, detail="Indique la sucursal que recibe la prenda")
    # Paso 1: decidimos a donde va la prenda devuelta.
    destino = destino_por_condicion(caso.condicion or "apta")
    # Secuencia CU10: [alt la prenda es apta para reventa] sumarStock(...) y registrarMovimiento("Entrada por devolucion")
    if destino == "vendible":
        inv = await _fila_inventario(session, caso.idProducto, caso.codigoSucursal)
        # Prenda apta: la sumamos al stock de la sucursal y anotamos el movimiento "Entrada por devolucion".
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
        # Secuencia CU10: [alt tiene defecto de fabrica o esta deteriorada] registrarMerma(motivo, proveedor, observaciones) a "InventarioNoVendible"
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU10" y "Clases CU10"
# Diagrama de clases: Inventario.descontarVariante()  (Movimiento "Salida por cambio")
# En palabras simples: descuenta del stock la prenda nueva que se le entrega al cliente.
# Robustez CU10: control "MoverInventario" -> mensaje 11: [cambio] descontar la prenda entregada (Inventario),
#   12: [cambio] registrar "Salida por cambio" (Movimiento)
# Secuencia CU10: [opt la resolucion es un cambio] descontarStock(variante entregada, - cantidad), registrarMovimiento("Salida por cambio")
# ==================================================================
async def entregar_prenda(session: AsyncSession, caso: Devolucion, inv: Inventario, cantidad: int) -> None:
    """Salida de la prenda entregada en un cambio (CU10 paso 4)."""
    if caso.idInvReservado == inv.idInv:
        await liberar_reserva(session, caso)
    if inv.cantidad_actual - inv.cantidad_reservada < cantidad:
        raise HTTPException(status_code=409, detail="El stock de la prenda de reemplazo cambio: vuelva a intentar")
    inv.cantidad_actual -= cantidad
    session.add(
        Movimiento(
            # Restamos del stock la prenda nueva que se lleva el cliente y anotamos "Salida por cambio".
            tipo="salida_cambio",
            cantidad=-cantidad,
            motivo=f"Salida por cambio {caso.codigo}",
            idInv=inv.idInv,
            referencia=caso.codigo,
        )
    )


# --- CU6: reembolso ------------------------------------------------------------------------

# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU6" y "Clases CU6"
# Diagrama de clases: ControlDevoluciones.marcarReembolso()
# En palabras simples: devuelve la plata por efectivo, tarjeta (Stripe) o transferencia/QR.
# Robustez CU6: control "EjecutarReembolso" -> mensaje 9: confirmarReembolso(medio), 10: registrar el egreso del reembolso (MetodoPago),
#   11: solicitar reembolso a "Pasarela de Pagos : Stripe" (si fue con tarjeta), 14: guardar monto devuelto (Devolucion)
# Secuencia CU6: lifeline "EjecutarReembolso" -> [alt el pago original fue en efectivo / con tarjeta / por QR o transferencia]
#   registrarEgresoEnCaja(monto), solicitarReembolso(paymentIntent, monto) a "Stripe", registrarTransferenciaPendiente(cuenta destino),
#   actualizarDevolucion(montoDevuelto, estadoReembolso, "Completada")
# ==================================================================
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
    # Paso 1: miramos como pago el cliente la venta original.
    pago = await session.get(MetodoPago, venta.idMetPago)
    original = medio_de_pago(pago)
    # Paso 2: si el empleado no eligio otro medio, se devuelve por el mismo medio con que pago.
    metodo = metodo or original
    caso.metodoReembolso = metodo
    # Secuencia CU6: [alt el pago original fue en efectivo] registrarEgresoEnCaja(monto)
    if metodo == "efectivo":
        # [CU20] paso 3: el reembolso en efectivo sale de la caja (CU6: debe estar abierta).
        await caja_srv.efectivo_en_linea(
            session, caso.codigoSucursal, concepto="reembolso", monto=monto, referencia=caso.codigo, id_usuario=id_usuario
        )
        caso.estadoReembolso = "Completado"
        return
    # Secuencia CU6: [alt el pago original fue por QR o transferencia] registrarTransferenciaPendiente(cuenta destino)
    if metodo == "qr":
        if not (cuenta_destino or "").strip():
            raise HTTPException(status_code=400, detail="Indique la cuenta de destino de la transferencia")
        caso.cuentaDestino = cuenta_destino.strip()[:120]
        caso.estadoReembolso = "TransferenciaPendiente"
        return
    # Para devolver a la tarjeta, la venta tuvo que pagarse con tarjeta por Stripe.
    if pago is None or pago.origen != "tarjeta_stripe" or not pago.stripePaymentIntentId:
        raise HTTPException(
            status_code=400,
            detail="La venta no se cobro con tarjeta en linea: el reembolso debe ser en efectivo o por transferencia",
        )
    # Secuencia CU6: [alt el pago original fue con tarjeta] solicitarReembolso(paymentIntent, monto) a "Stripe"
    await intentar_reembolso_tarjeta(caso, pago, monto)


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU6" y "Clases CU6"
# Diagrama de clases: <<interface>> PasarelaDePagos.reembolsar()
# En palabras simples: le pide a Stripe que devuelva el cobro de la tarjeta.
# Robustez CU6: control "EjecutarReembolso" -> mensaje 11: solicitar reembolso del cobro original a "Pasarela de Pagos : Stripe",
#   12: estado del reembolso
# Secuencia CU6: solicitarReembolso(paymentIntent, monto) a la lifeline "Stripe" -> estado del reembolso()
# ==================================================================
async def intentar_reembolso_tarjeta(caso: Devolucion, pago: MetodoPago, monto: Decimal) -> None:
    try:
        reembolso = await reembolsar_payment_intent(
            payment_intent_id=pago.stripePaymentIntentId,
            monto=monto,
            clave_idempotencia=f"re:{caso.codigo}:{monto}",
        )
    # Si Stripe no esta configurado o falla, el reembolso queda "Pendiente" para reintentar (no se pierde).
    except StripeNoConfigurado:
        caso.estadoReembolso = "Pendiente"
        caso.referenciaReembolso = "Pasarela de pagos no configurada: reintentar"
        return
    # Secuencia CU6: [opt la pasarela rechaza o no responde] marcarReembolso("Pendiente", reintentar)
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
    # CU8 (no hay stock): traslado | otra_sucursal | espera | reembolso
    sin_stock: str | None = None
    sucursal_origen: int | None = None
    medida_original: str | None = None
    medida_nueva: str | None = None
    fecha_entrega_ajuste: date | None = None
    # [CU19]: cambio registrado sin conexion. El efectivo ya lo anoto la operacion
    # y el saldo a favor no se entrego: queda pendiente.
    sin_conexion: bool = False


class AutorizacionRequerida(Exception):
    """El monto supera el umbral: hace falta la autorizacion del Encargado."""

    def __init__(self, motivo: str):
        super().__init__(motivo)
        self.motivo = motivo


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU6] Procesar reembolso de dinero
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU6" y "Clases CU6"
# Diagrama de clases: ControlDevoluciones.exigirAutorizacion()
# En palabras simples: si el monto es muy alto y el usuario no es Encargado, frena hasta que lo autoricen.
# Robustez CU4: control "CalcularDiferencia" -> mensaje 9: obtener politica (... umbral)
# ==================================================================
def exigir_autorizacion(caso: Devolucion, monto, politica: Politica, puede_autorizar: bool, que: str) -> None:
    """CU4 flujo alternativo 6 y CU6 flujo alternativo 5."""
    # No hace falta permiso si: el monto es chico, ya lo autorizaron, o el usuario ES Encargado.
    if not supera_umbral(monto, politica) or caso.idAutorizador is not None or puede_autorizar:
        return
    raise AutorizacionRequerida(
        f"{que} de Bs {Decimal(str(monto)):.2f} supera el umbral de Bs {politica.umbralAutorizacion:.2f}: "
        "requiere la autorizacion del Encargado de sucursal"
    )


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5"
# Diagrama de clases: MetodoPago.validarPago()  (ResolverCambioUI.registrarPago())
# En palabras simples: registra el pago de la diferencia cuando la prenda nueva es mas cara.
# Robustez CU4: control "ConfirmarCambio" -> mensaje 14: registrar el pago de la diferencia (MetodoPago)
# Robustez CU5: control "ControlDevoluciones" -> mensaje 15: registrar el cobro de la diferencia (MetodoPago)
# Secuencia CU4: registrarPagoDiferencia(idMetPago, monto) a "MetodoPago" -> pago registrado()
# Secuencia CU5: registrarCobro(diferencia, idMetPago) a "MetodoPago" -> pago registrado()
# ==================================================================
async def _cobrar_diferencia(
    session: AsyncSession, caso: Devolucion, diferencia: Decimal, id_pago: int | None, id_usuario: int, *, sin_conexion: bool = False
) -> None:
    # Si el cliente tiene que pagar la diferencia y no se registro el pago, se frena.
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
    # [CU20] paso 3: la diferencia cobrada en efectivo entra a la caja.
    if medio_de_pago(pago) == "efectivo" and not sin_conexion:
        await caja_srv.efectivo_en_linea(
            session, caso.codigoSucursal, concepto="diferencia_cambio", monto=diferencia, referencia=caso.codigo, id_usuario=id_usuario
        )


# ==== [CU19] Saldo a favor de un cambio sin conexion ===============
# El informe decia "nota de credito", pero la ingeniera las elimino: el saldo se
# devuelve en dinero. Queda en "Reembolsos pendientes" y al entregarlo sale de
# caja (returns.py -> confirmar_transferencia) con su nota de devolucion (CU7).
# ===================================================================
def dejar_saldo_pendiente(caso: Devolucion, monto: Decimal) -> None:
    caso.montoDevuelto = dinero(monto)
    caso.metodoReembolso, caso.estadoReembolso = "efectivo", "Pendiente"
    caso.referenciaReembolso = "Saldo a favor de un cambio sin conexion"


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5"
# Diagrama de clases: ControlDevoluciones.resolver() (parte: cobrar diferencia o devolver el saldo a favor)
# En palabras simples: si la prenda nueva es mas cara, el cliente paga la diferencia;
#   si es mas barata, SE LE DEVUELVE LA PLATA (ya no hay notas de credito) y recibe su nota de devolucion.
# ==================================================================
async def _liquidar(
    session: AsyncSession, caso: Devolucion, venta: Venta, diferencia: Decimal, res: Resolucion, politica: Politica, id_usuario: int
) -> None:
    """Cobra la diferencia o entrega el saldo a favor (CU4 pasos 4-6, CU5 paso 5)."""
    caso.diferencia = diferencia
    # Secuencia CU4: [alt diferencia > 0 (la variante nueva cuesta mas)] registrarPagoDiferencia / [diferencia <= 0] "Cambio sin costo" o saldo a favor -> CU6
    # Secuencia CU5: [alt total > credito] registrarCobro / [total <= credito] el saldo a favor se devuelve en dinero (CU6)
    if diferencia > 0:
        # Caso 1: la prenda nueva es mas cara -> el cliente paga la diferencia.
        await _cobrar_diferencia(session, caso, diferencia, res.id_met_pago_diferencia, id_usuario, sin_conexion=res.sin_conexion)
    elif diferencia < 0:
        # [CU19] flujo alternativo 1: sin conexion no se entrega dinero, queda pendiente.
        if res.sin_conexion:
            dejar_saldo_pendiente(caso, -diferencia)
            return
        # Caso 2: la prenda nueva es mas barata -> le sobra plata y SE LE DEVUELVE EN DINERO (CU6).
        await reembolsar(session, caso, venta, -diferencia, res.metodo_reembolso, res.cuenta_destino, id_usuario)
    # Caso 3: diferencia = 0 -> "cambio sin costo", no se cobra ni se devuelve nada.


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU5] Procesar cambio por un producto diferente
# Diagramas del informe: "Robustez CU5" y "Clases CU5"
# Diagrama de clases: ControlDevoluciones.cotizarProducto() + resolver()  (crea Venta y DetalleVenta nuevos)
# En palabras simples: en un cambio por otro producto crea una venta nueva pagada con el credito de la prenda devuelta.
# Robustez CU5: control "ControlDevoluciones" -> mensaje 16: crear venta nueva por los productos entregados (Venta),
#   17: entra la prenda devuelta y salen las nuevas (Inventario), 18: vincular la venta nueva y estado "Completada"
# Secuencia CU5: lifeline "ConfirmarCambio" -> crearVentaDeCambio(productos, total, idCliente) a "Venta" -> idVentaNueva(),
#   actualizarInventario(entra devuelta, salen nuevos) (CU10), actualizarDevolucion(idVentaNueva, diferencia, "Completada")
# ==================================================================
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
    # Paso 1: total de los productos nuevos al precio de hoy.
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
    # Paso 2: se crea una venta nueva pagada con el credito de la prenda devuelta.
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU8] Gestionar cambio sin stock disponible
# Diagramas del informe: "Robustez CU8" y "Clases CU8"
# Diagrama de clases: ControlDevoluciones.resolverComo()  (enum OpcionSinStock)
# Pantalla (boundary) que lo usa: ResolverCambioUI.mostrarOpciones() / elegirOpcion()
# En palabras simples: no hay la talla en esta sucursal: trasladar, atender en otra sucursal, lista de espera o devolverle la plata.
#   Al cliente le llega un aviso (correo + notificacion en la app), por ejemplo "Su prenda sera enviada el viernes 06/11".
# Robustez CU8: control "BuscarStockSucursales" -> mensaje 4: sin stock: sucursales con existencia
# Robustez CU8: control "Backend : GestionarTraslado" -> mensaje 7: resolver(traslado, sucursal de origen),
#   8: obtener dias para retirar el cambio (PoliticaDevolucion), 9: recibir prenda devuelta, trasladar y apartar la variante (Inventario),
#   10: registrar salida y entrada por traspaso (Movimiento), 11: guardar "CambioPendiente" con fecha de llegada (Devolucion),
#   13: cambio pendiente y fecha de llegada
# Secuencia CU8: lifeline "GestionarTraslado" -> resolver(opcion, sucursalOrigen), obtenerPoliticaDelCaso(idPolitica) -> dias para retirar,
#   recibirPrendaDevuelta() (CU10), trasladar(origen -, destino +), registrarTraspaso(salida_traspaso, entrada_traspaso),
#   apartarVariante(...), actualizarDevolucion("CambioPendiente", ...), registrarBitacora(RESOLVER, opcion elegida)
#   -> resultado(estado, fecha estimada) -> mostrarComprobante(estado, fecha estimada)
# ==================================================================
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
        # Paso 1: buscamos otras sucursales que si tengan esa talla.
        s for s in await stock_por_sucursal(session, nuevo.idProducto, caso.idTenant)
        if s["codigoSucursal"] != sucursal_entrega and s["disponible"] >= caso.cantidad
    ]
    opcion = res.sin_stock
    # Secuencia CU8: sinStock(sucursales con existencia) -> mostrarOpciones(traslado | otra sucursal | otra prenda | reembolso)
    if opcion is None:
        donde = (
            "Hay en: " + ", ".join(f"{s['sucursal']} ({s['disponible']})" for s in otras)
            if otras
            else "Ninguna sucursal tiene existencia: puede elegir otra prenda, la lista de espera o devolverle el dinero"
        )
        raise HTTPException(
            status_code=409,
            detail=f"No hay stock de {nuevo.nombre} talla {nuevo.talla or '-'} en la sucursal. {donde}",
        )
    # Opcion: se le devuelve la plata (se permite aunque la politica solo acepte cambios, porque la tienda no tiene lo que pidio).
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
    # La solicitud queda "CambioPendiente" hasta que el cliente retire la prenda.
    caso.estado = "CambioPendiente"
    caso.sucursalEntrega = sucursal_entrega
    # Secuencia CU8: [alt ninguna sucursal tiene stock] registrarOpcion(otra prenda CU5 | lista de espera | reembolso CU6)
    if opcion == "espera":
        # Lista de espera: se avisa cuando haya reposicion (sin apartar nada).
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
            titulo=f"Su cambio {caso.codigo} esta en lista de espera",
            mensaje=f"No hay stock de {nuevo.nombre} talla {nuevo.talla or '-'}. Le avisaremos apenas llegue.",
        )
        return
    origen = next((s for s in otras if s["codigoSucursal"] == res.sucursal_origen), None) if res.sucursal_origen else None
    origen = origen or (max(otras, key=lambda s: s["disponible"]) if otras else None)
    if origen is None:
        raise HTTPException(status_code=409, detail="Ninguna otra sucursal tiene existencia: use la lista de espera")
    inv_origen = await _fila_inventario(session, nuevo.idProducto, origen["codigoSucursal"])
    caso.fechaLimiteRetiro = ahora + timedelta(days=politica.diasRetiroCambio)
    # Secuencia CU8: [alt atencion en otra sucursal] apartarVariante(otra sucursal), actualizarDevolucion("CambioPendiente", codigo de cambio)
    if opcion == "otra_sucursal":
        # Se aparta en la otra sucursal, que completa el cambio con el codigo.
        caso.sucursalEntrega = origen["codigoSucursal"]
        await reservar(session, caso, inv_origen)
        # Aviso al cliente: su prenda lo espera en la otra sucursal hasta la fecha limite.
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
            titulo=f"Su prenda lo espera en {origen['sucursal']}",
            mensaje=(f"Apartamos {nuevo.nombre} talla {nuevo.talla or '-'} a su nombre en la sucursal {origen['sucursal']}. "
                     f"Puede retirarla hasta el {notif.fecha_texto(caso.fechaLimiteRetiro)} con el codigo {caso.codigo}."),
        )
        return
    # Traslado: transferencia entre sucursales y la prenda queda apartada en
    # la sucursal del cliente hasta que la retire.
    # Secuencia CU8: [alt traslado a esta sucursal] trasladar(origen -, destino +), registrarTraspaso(salida_traspaso, entrada_traspaso),
    #   apartarVariante(sucursal destino), actualizarDevolucion("CambioPendiente", llegada, limite de retiro)
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
    # AVISO TIPO PUSH (correccion de la ingeniera): "Su prenda sera enviada el dia viernes".
    #   Le llega al cliente como notificacion en la app y por correo, con el dia de la semana en que llega.
    destino = await session.get(Sucursal, sucursal_entrega)
    await notif.notificar_cliente(
        session, caso.idCliente, caso.idTenant, tipo="envio", referencia=caso.codigo,
        titulo=f"Su prenda sera enviada el {notif.fecha_texto(caso.fechaLlegadaEstimada)}",
        mensaje=(f"Su prenda {nuevo.nombre} talla {nuevo.talla or '-'} sera enviada a la sucursal "
                 f"{destino.nombre if destino else ''} y llegara el {notif.fecha_texto(caso.fechaLlegadaEstimada)}. "
                 f"Puede retirarla hasta el {notif.fecha_texto(caso.fechaLimiteRetiro)} con el codigo {caso.codigo}."),
    )


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# [CU6] Procesar reembolso de dinero
# [CU7] Emitir nota de devolucion
# [CU8] Gestionar cambio sin stock disponible
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5", "Robustez CU6" y "Clases CU6", "Robustez CU7" y "Clases CU7", "Robustez CU8" y "Clases CU8", "Robustez CU10" y "Clases CU10"
# Diagrama de clases: ControlDevoluciones.resolver()
# En palabras simples: el corazon del modulo: segun el tipo hace el cambio de talla (CU4), por otro producto (CU5), el reembolso con su nota de devolucion (CU6, CU7), el caso sin stock (CU8) y mueve el inventario (CU10).
# Robustez CU4: control "ConfirmarCambio" (mensajes 13 a 17)
# Robustez CU5: control "ControlDevoluciones" -> mensaje 7: cotizarProductos(productos, cantidades),
#   8: consultar precio vigente (Producto), 9: validar stock de cada producto en la sucursal (Inventario), 11: total y diferencia
# Robustez CU6: control "EjecutarReembolso" (mensajes 9 a 15)
# Robustez CU8: si no hay stock pasa a "Backend : GestionarTraslado" (ver _sin_stock)
# Robustez CU10: control "ResolverDevolucion" -> mensaje 3: determinarDestino(solicitud), 7: aplicarMovimientos(destino, resolucion)
# Secuencia CU4: lifeline "ConfirmarCambio" (confirmarCambio -> actualizarInventario -> actualizarDevolucion "Completada")
# Secuencia CU5: lifelines "CotizarProductos" y "ConfirmarCambio" (cotizarProducto, consultarPrecioVigente, consultarStock, resolver("cambio_producto"))
# Secuencia CU6: lifeline "EjecutarReembolso" (resolver("devolucion", medio))
# Secuencia CU10: lifeline "ResolverDevolucion" -> determinarDestino(idDevolucion) y aplicarMovimientos(destino, resolucion)
# ==================================================================
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
    # Paso 1: lo que el cliente pago por esas prendas.
    valor = dinero(linea.precio_pagado * caso.cantidad)
    # Paso 2: credito a favor del cliente = lo que pago - recargo por demora - descuento por deterioro.
    credito = credito_del_caso(valor, caso.recargo, caso.descuentoDeterioro)
    es_defecto = caso.condicion == "defectuosa"
    tipo = res.tipo
    # Paso 3: si la empresa no devuelve dinero (y no es defecto), no se puede elegir reembolso.
    if tipo == "devolucion" and not (politica.permiteReembolso or es_defecto):
        raise HTTPException(
            status_code=400,
            detail="La politica de la empresa solo admite cambios (devolver el dinero es solo por defecto de fabrica)",
        )
    sucursal_entrega = res.sucursal_entrega or caso.sucursalEntrega or caso.codigoSucursal

    # Montos que pueden requerir autorizacion, antes de mover nada.
    nuevo: Producto | None = None
    diferencia = Decimal("0.00")
    productos: list[tuple[Producto, int]] = []
    if tipo in TIPOS_VARIANTE:
        # CAMBIO DE TALLA O COLOR (CU4): hay que elegir la prenda nueva y calcular la diferencia.
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
        # CAMBIO POR OTRO PRODUCTO (CU5): sumamos los productos nuevos y comparamos con el credito.
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
        # Secuencia CU6: [opt el monto supera el umbral de autorizacion] -> 403 (requiere autorizacion) -> solicitarAutorizacion() -> autorizar(idDevolucion)
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
            # Secuencia CU4: [break la variante elegida no tiene stock en la sucursal] -> mostrarSinStock() -> continua en CU8
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
        # Secuencia CU5: [loop por cada producto que elige el cliente] cotizarProducto(idProducto, cantidad) -> consultarStock(idProducto, sucursal)
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
            # Secuencia CU5: [alt el producto no tiene stock en la sucursal] -> sinStock(otras sucursales) -> CU8
            await _sin_stock(session, caso, venta, faltantes[0], sucursal_entrega, diferencia, credito, res, politica, id_usuario)
            if caso.estado == "CambioPendiente":
                return
        else:
            await _crear_venta_cambio(session, caso, venta, con_stock, credito)
            caso.idProductoNuevo, caso.tallaNueva = con_stock[0][0].idProducto, con_stock[0][0].talla
            await _liquidar(session, caso, venta, diferencia, res, politica, id_usuario)
    # AJUSTE DE MEDIDA (CU4 flujo alternativo 5): no se mueve stock; solo se cobra si esta fuera de plazo.
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
    # DEVOLUCION DEL DINERO (CU6): se le devuelve el credito por el medio con que pago y se emite la nota de devolucion (CU7).
    elif tipo == "devolucion":
        await reembolsar(session, caso, venta, credito, res.metodo_reembolso, res.cuenta_destino, id_usuario)

    caso.estado = "Completada"
    caso.fechaResolucion = datetime.now(timezone.utc)
    # Aviso al cliente de que su solicitud termino (y si se le devolvio plata, con su nota de devolucion).
    await avisar_resultado(session, caso)


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU8] Gestionar cambio sin stock disponible
# Diagramas del informe: "Robustez CU8" y "Clases CU8"
# Diagrama de clases: ControlDevoluciones.completarCambio()
# En palabras simples: el cliente retira la prenda que se trajo de otra sucursal.
# Robustez CU8: control "CompletarCambio" -> mensaje 17: entregar la variante apartada, 18: marcar la solicitud "Completada"
# Secuencia CU8: lifeline "CompletarCambio" -> completarCambio(idDevolucion, "entregar"), entregarVariante() (CU10), actualizarDevolucion("Completada")
# ==================================================================
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
    reposicion de la lista de espera); tambien puede preferir que le devuelvan el dinero."""
    credito = credito_del_caso(dinero(linea.precio_pagado * caso.cantidad), caso.recargo, caso.descuentoDeterioro)
    # Si el cliente ya no quiere esperar: se le devuelve el dinero. Si viene a retirar: se le entrega la prenda.
    if accion != "entregar":
        await liberar_reserva(session, caso)
        caso.idProductoNuevo, caso.tallaNueva, caso.diferencia = None, None, Decimal("0.00")
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
    await avisar_resultado(session, caso)


# --- Vencimientos (CU2 alternativo 3, CU8 alternativo 3) ----------------------------------

# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# Diagramas del informe: "Robustez CU2" y "Clases CU2"
# Diagrama de clases: CU2 flujo alternativo 3
# En palabras simples: anula las solicitudes en linea que el cliente no entrego a tiempo y libera la prenda.
# ==================================================================
async def aplicar_vencimientos(session: AsyncSession, *, id_tenant: int | None = None, id_cliente: int | None = None) -> int:
    """Anula las solicitudes en linea no entregadas a tiempo (libera la
    variante apartada) y deja para devolver el dinero de los cambios cuyo plazo
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
    # Por cada solicitud vencida: se suelta la prenda apartada; si era por internet se anula;
    #   si era un cambio que nadie retiro, queda el dinero PENDIENTE de devolver (lo ve el personal en
    #   "Reembolsos pendientes") y al cliente le llega un aviso.
    for caso in vencidos:
        await liberar_reserva(session, caso)
        caso.fechaResolucion = ahora
        if caso.estado == "PendienteEntrega":
            caso.estado = "Anulada"
            caso.motivoRechazo = "No se entrego la prenda hasta la fecha limite"
            await notif.notificar_cliente(
                session, caso.idCliente, caso.idTenant, tipo="devolucion", referencia=caso.codigo,
                titulo=f"Su solicitud {caso.codigo} fue anulada",
                mensaje="No se entrego la prenda en la sucursal hasta la fecha limite. Puede hacer una nueva solicitud si todavia esta en plazo.",
            )
            continue
        venta = await session.get(Venta, caso.idVenta)
        linea = await linea_de_venta(session, venta, caso.idProducto)
        precio = linea.precio_pagado if linea else Decimal("0")
        credito = credito_del_caso(dinero(precio * caso.cantidad), caso.recargo, caso.descuentoDeterioro)
        caso.tipo, caso.idProductoNuevo, caso.tallaNueva, caso.diferencia = "devolucion", None, None, Decimal("0.00")
        caso.estado = "Completada"
        # El dinero queda pendiente: el personal lo entrega (efectivo/QR) o reintenta la tarjeta.
        caso.montoDevuelto = credito
        caso.metodoReembolso = medio_de_pago(await session.get(MetodoPago, venta.idMetPago))
        caso.estadoReembolso = "Pendiente" if credito > 0 else "Completado"
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="reembolso", referencia=caso.codigo,
            titulo=f"Le devolveremos Bs {credito:.2f}",
            mensaje=(f"No retiro la prenda del cambio {caso.codigo} a tiempo, asi que le devolvemos su dinero "
                     f"({MEDIOS_TEXTO.get(caso.metodoReembolso, '')}). Le avisaremos cuando este listo."),
        )
    if vencidos:
        await session.commit()
    return len(vencidos)


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU4] [CU5] [CU6] [CU7] [CU8] Aviso al cliente cuando su solicitud termina
# En palabras simples: cuando un cambio o una devolucion se completa, al cliente le llega un aviso
#   (notificacion en la app + correo). Si se le devolvio plata, el aviso es su NOTA DE DEVOLUCION (CU7).
# ==================================================================
async def avisar_resultado(session: AsyncSession, caso: Devolucion) -> None:
    if caso.tipo == "devolucion" or Decimal(str(caso.montoDevuelto or 0)) > 0:
        # Hubo dinero devuelto: el mensaje lleva el texto de la nota de devolucion.
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="reembolso", referencia=caso.codigo,
            titulo=f"Nota de devolucion {caso.codigo}: le devolvimos Bs {dinero(caso.montoDevuelto or 0):.2f}",
            mensaje=". ".join(nota_de_devolucion(caso)),
        )
    else:
        await notif.notificar_cliente(
            session, caso.idCliente, caso.idTenant, tipo="devolucion", referencia=caso.codigo,
            titulo=f"Su cambio {caso.codigo} esta listo",
            mensaje=f"Se completo su {ETIQUETAS.get(caso.tipo, 'cambio')}. Gracias por su compra.",
        )
