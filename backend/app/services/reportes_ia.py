"""Analisis consolidado multi-sucursal asistido por IA (CU29).

Dos piezas separadas a proposito:

  1. `metricas_por_sucursal()` — SQL puro. Es la fuente de verdad: totales de
     venta, unidades, stock y quiebres por sucursal del tenant. Se devuelve
     SIEMPRE, aunque la IA no este disponible.
  2. `analizar_sucursales()` — Gemini con "structured output" sobre esas
     metricas ya calculadas. El modelo NUNCA inventa numeros: solo interpreta
     los que se le pasan y propone transferencias entre sucursales.

A diferencia de `recomendaciones_gemini.py` (background, post-venta), esto es
sincronico: el usuario esta esperando el analisis, asi que los fallos se
propagan como excepciones tipadas para que el router las convierta en 503 en
vez de tragarselas.
"""

import asyncio
import json
import logging
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import DetalleVenta, Inventario, Movimiento, Producto, Reserva, Sucursal, Venta
from app.services.horario import fin_del_dia, inicio_del_dia

try:
    from google import genai
    from google.genai import errors as genai_errors
    from google.genai import types
except ImportError:  # pragma: no cover - google-genai siempre deberia estar instalado
    genai = None
    genai_errors = None
    types = None

logger = logging.getLogger("app.errors")
settings = get_settings()

# Mismo pin que chat_gemini.py / recomendaciones_gemini.py.
MODEL = "gemini-2.5-flash"

# Tope de filas de detalle que se le mandan al modelo: con 5 sucursales y un
# catalogo mediano el prompt crece rapido y el analisis no mejora.
MAX_FILAS_DETALLE = 60

UMBRAL_STOCK_CRITICO = 5

SYSTEM_INSTRUCTION = (
    "Sos el analista de operaciones de YouShop, una cadena de tiendas de ropa unisex "
    "que vende solo poleras oversize (blanco, negro, guinda, gris) y jeans (negro, blanco). "
    "Recibis metricas YA CALCULADAS por sucursal (ventas, unidades, stock, quiebres) y "
    "tenes que interpretarlas para la gerencia. Reglas estrictas: "
    "(1) NUNCA inventes cifras ni sucursales que no esten en los datos; "
    "(2) toda afirmacion tiene que poder derivarse de los numeros entregados; "
    "(3) proponé transferencias de stock SOLO entre sucursales presentes en los datos y "
    "solo cuando una tenga exceso y otra quiebre del MISMO producto; "
    "(4) escribi en espanol rioplatense, claro y breve, sin tecnicismos de IA."
)


class HallazgoSucursal(BaseModel):
    codigoSucursal: int
    sucursal: str
    diagnostico: str
    severidad: Literal["Alta", "Media", "Baja"]


class SugerenciaTransferencia(BaseModel):
    idProducto: int
    producto: str
    desdeSucursal: str
    haciaSucursal: str
    unidades: int
    motivo: str


class AnalisisSucursales(BaseModel):
    resumen: str
    hallazgos: list[HallazgoSucursal]
    transferencias: list[SugerenciaTransferencia]
    alertas: list[str]


class GeminiNoConfigurado(RuntimeError):
    """`GEMINI_API_KEY` no esta configurada o falta el paquete `google-genai`."""


class AnalisisNoDisponible(RuntimeError):
    """La API respondio pero no se pudo obtener un analisis valido."""


class GeminiCredencialInvalida(RuntimeError):
    """Google rechazo la credencial (401/403): la clave existe pero no sirve,
    tipicamente porque se pego un token de acceso ("AQ....") en vez de una
    API key de AI Studio ("AIza...")."""


def _client() -> "genai.Client":
    if genai is None or not settings.GEMINI_API_KEY:
        raise GeminiNoConfigurado("GEMINI_API_KEY no esta configurada")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


# --- Metricas (SQL, sin IA) ---------------------------------------------

def lineas_venta_con_sucursal():
    """Subquery con UNA fila por linea de venta y la sucursal que la surtio.

    `DetalleVenta` no guarda la sucursal. Antes se unia por
    `Inventario.idProducto`, lo que repetia cada linea en TODAS las sucursales
    con stock de ese producto (una venta de 1 unidad aparecia como 3 si el
    producto estaba en 3 sucursales). La sucursal real sale de:
      - la reserva confirmada (`DetalleVenta.codigoReserva` -> Reserva), o
      - el movimiento de stock que genero la venta ("Venta {idVenta}").
    Una linea sin ninguno de los dos (datos historicos) queda con sucursal NULL.
    """
    sucursal_reserva = (
        select(Reserva.codigoSucursal)
        .where(Reserva.codigoReserva == DetalleVenta.codigoReserva)
        .correlate(DetalleVenta)
        .scalar_subquery()
    )
    sucursal_movimiento = (
        select(Inventario.codigoSucursal)
        .select_from(Movimiento)
        .join(Inventario, Inventario.idInv == Movimiento.idInv)
        .where(
            Movimiento.tipo == "venta",
            Movimiento.motivo == func.concat("Venta ", DetalleVenta.idVenta),
            Inventario.idProducto == DetalleVenta.idProducto,
        )
        .order_by(Movimiento.idMov)
        .limit(1)
        .correlate(DetalleVenta)
        .scalar_subquery()
    )
    return (
        select(
            DetalleVenta.idVenta.label("idVenta"),
            DetalleVenta.idProducto.label("idProducto"),
            DetalleVenta.cantidad.label("cantidad"),
            (DetalleVenta.cantidad * DetalleVenta.precio_unitario).label("monto"),
            func.coalesce(sucursal_reserva, sucursal_movimiento).label("codigoSucursal"),
            Venta.fecha.label("fecha"),
        )
        .select_from(DetalleVenta)
        .join(Venta, Venta.idVenta == DetalleVenta.idVenta)
        .subquery("lineas_venta")
    )


def filtrar_lineas_por_fecha(stmt, lineas, fecha_desde: date | None, fecha_hasta: date | None):
    if fecha_desde is not None:
        stmt = stmt.where(lineas.c.fecha >= inicio_del_dia(fecha_desde))
    if fecha_hasta is not None:
        stmt = stmt.where(lineas.c.fecha <= fin_del_dia(fecha_hasta))
    return stmt


async def metricas_por_sucursal(
    session: AsyncSession,
    id_tenant: int,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> list[dict]:
    """Una fila por sucursal del tenant con sus totales de venta y stock."""
    lineas = lineas_venta_con_sucursal()
    ventas_stmt = (
        select(
            lineas.c.codigoSucursal.label("codigoSucursal"),
            func.sum(lineas.c.cantidad).label("unidades"),
            func.sum(lineas.c.monto).label("monto"),
        )
        .select_from(lineas)
        .join(Sucursal, Sucursal.codigoSucursal == lineas.c.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
        .group_by(lineas.c.codigoSucursal)
    )
    ventas_stmt = filtrar_lineas_por_fecha(ventas_stmt, lineas, fecha_desde, fecha_hasta)

    ventas_por_sucursal = {
        fila.codigoSucursal: (int(fila.unidades or 0), Decimal(str(fila.monto or 0)))
        for fila in (await session.execute(ventas_stmt)).all()
    }

    stock_stmt = (
        select(
            Sucursal.codigoSucursal,
            Sucursal.nombre,
            func.coalesce(func.sum(Inventario.cantidad_actual), 0).label("stock_total"),
            func.coalesce(func.sum(Inventario.cantidad_reservada), 0).label("stock_reservado"),
            func.count(Inventario.idInv).label("skus"),
        )
        .select_from(Sucursal)
        .outerjoin(Inventario, Inventario.codigoSucursal == Sucursal.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
        .group_by(Sucursal.codigoSucursal, Sucursal.nombre)
        .order_by(Sucursal.nombre)
    )

    filas = []
    for fila in (await session.execute(stock_stmt)).all():
        unidades, monto = ventas_por_sucursal.get(fila.codigoSucursal, (0, Decimal("0")))
        quiebres = await session.scalar(
            select(func.count())
            .select_from(Inventario)
            .where(
                Inventario.codigoSucursal == fila.codigoSucursal,
                Inventario.cantidad_actual - Inventario.cantidad_reservada <= UMBRAL_STOCK_CRITICO,
            )
        )
        filas.append(
            {
                "codigoSucursal": fila.codigoSucursal,
                "sucursal": fila.nombre,
                "unidades_vendidas": unidades,
                "monto_vendido": monto,
                "stock_total": int(fila.stock_total or 0),
                "stock_reservado": int(fila.stock_reservado or 0),
                "skus": int(fila.skus or 0),
                "skus_criticos": int(quiebres or 0),
            }
        )
    return filas


async def detalle_producto_sucursal(session: AsyncSession, id_tenant: int) -> list[dict]:
    """Stock disponible de cada producto en cada sucursal del tenant (completo).

    Es el insumo para proponer transferencias concretas (mismo producto, una
    sucursal con exceso y otra en quiebre). Al modelo se le manda una muestra
    (`muestra_para_prompt`); las reglas usan el detalle entero.
    """
    stmt = (
        select(
            Producto.idProducto,
            Producto.nombre.label("producto"),
            Producto.talla,
            Sucursal.codigoSucursal,
            Sucursal.nombre.label("sucursal"),
            Inventario.cantidad_actual,
            Inventario.cantidad_reservada,
        )
        .select_from(Inventario)
        .join(Producto, Producto.idProducto == Inventario.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
        .order_by(Producto.nombre, Producto.talla, Sucursal.nombre)
    )
    return [
        {
            "idProducto": f.idProducto,
            "producto": f.producto,
            "talla": f.talla,
            "codigoSucursal": f.codigoSucursal,
            "sucursal": f.sucursal,
            "disponible": int(f.cantidad_actual) - int(f.cantidad_reservada),
        }
        for f in (await session.execute(stmt)).all()
    ]


def muestra_para_prompt(detalle: list[dict], limite: int = MAX_FILAS_DETALLE) -> list[dict]:
    """Las filas que importan para el analisis, hasta `limite`.

    Antes se mandaban las primeras 60 en orden alfabetico: con 3 sucursales
    quedaban afuera casi todas las poleras. Ahora van primero TODAS las filas
    de los productos que estan en quiebre en alguna sucursal (asi el modelo ve
    donde sobra ese mismo producto) y despues las de menor disponibilidad.
    """
    criticos = {d["idProducto"] for d in detalle if d["disponible"] <= UMBRAL_STOCK_CRITICO}
    prioridad = [d for d in detalle if d["idProducto"] in criticos]
    resto = sorted((d for d in detalle if d["idProducto"] not in criticos), key=lambda d: d["disponible"])
    return (prioridad + resto)[:limite]


# --- Analisis con IA ------------------------------------------------------

# Si Gemini no responde en este tiempo se usa el analisis por reglas: sin
# tope, una caida de Google dejaba al usuario en "Analizando..." para siempre.
TIMEOUT_GEMINI_SEGUNDOS = 45


def _prompt(metricas: list[dict], detalle: list[dict], periodo: str) -> str:
    resumen_sucursales = "\n".join(
        f"- [{m['codigoSucursal']}] {m['sucursal']}: "
        f"vendio {m['unidades_vendidas']} unidades por Bs {m['monto_vendido']:.2f}; "
        f"stock {m['stock_total']} ({m['stock_reservado']} reservado) en {m['skus']} SKUs; "
        f"{m['skus_criticos']} SKU(s) en nivel critico"
        for m in metricas
    )
    detalle_txt = "\n".join(
        f"- idProducto={d['idProducto']} {d['producto']} (talla {d['talla'] or 's/t'}) "
        f"en {d['sucursal']}: {d['disponible']} disponible(s)"
        for d in muestra_para_prompt(detalle)
    )
    return (
        f"Periodo analizado: {periodo}\n"
        f"Sucursales activas: {len(metricas)}\n\n"
        f"Metricas por sucursal:\n{resumen_sucursales or '(sin sucursales)'}\n\n"
        f"Stock por producto y sucursal (filas relevantes):\n{detalle_txt or '(sin inventario cargado)'}"
    )


def _es_clave_invalida(exc: Exception) -> bool:
    # Google responde 400 INVALID_ARGUMENT "API key not valid" a una clave
    # mal formada (no 401/403): antes eso se mostraba como "el modelo no
    # devolvio un analisis utilizable", que no ayudaba a nadie.
    codigo = getattr(exc, "code", None)
    return codigo in (401, 403) or "API key not valid" in str(exc)


async def analizar_sucursales(
    metricas: list[dict], detalle: list[dict], periodo: str
) -> AnalisisSucursales:
    client = _client()
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_prompt(metricas, detalle, periodo),
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=AnalisisSucursales,
                ),
            ),
            timeout=TIMEOUT_GEMINI_SEGUNDOS,
        )
    except asyncio.TimeoutError as exc:
        raise AnalisisNoDisponible(f"Gemini no respondio en {TIMEOUT_GEMINI_SEGUNDOS} s") from exc
    except genai_errors.ClientError as exc:
        if _es_clave_invalida(exc):
            raise GeminiCredencialInvalida(str(exc)) from exc
        raise AnalisisNoDisponible(f"Gemini rechazo el pedido ({exc.code})") from exc
    except genai_errors.APIError as exc:
        # 5xx de Google (sobrecarga, mantenimiento): transitorio, no es culpa del pedido.
        raise AnalisisNoDisponible(f"Gemini no esta disponible ({exc.code})") from exc

    analisis = response.parsed
    if analisis is None:
        try:
            analisis = AnalisisSucursales.model_validate(json.loads(response.text))
        except Exception as exc:  # texto no parseable
            raise AnalisisNoDisponible("La respuesta del modelo no es un analisis valido") from exc

    # Defensiva (mismo criterio que recomendaciones_gemini.py): el modelo no
    # puede referirse a sucursales que no existen en los datos enviados.
    nombres = {m["sucursal"] for m in metricas}
    codigos = {m["codigoSucursal"] for m in metricas}
    analisis.hallazgos = [h for h in analisis.hallazgos if h.codigoSucursal in codigos]
    descartadas = [
        t for t in analisis.transferencias if t.desdeSucursal not in nombres or t.haciaSucursal not in nombres
    ]
    if descartadas:
        logger.warning(
            "Gemini sugirio %s transferencia(s) con sucursales fuera de los datos — descartadas",
            len(descartadas),
        )
    analisis.transferencias = [
        t for t in analisis.transferencias if t.desdeSucursal in nombres and t.haciaSucursal in nombres
    ]
    return analisis


# --- Analisis por reglas (respaldo sin IA) --------------------------------

# Una sucursal con al menos este disponible de un producto puede ceder unidades.
UMBRAL_EXCESO = 15
# Hasta cuanto se repone el producto en quiebre al transferir.
OBJETIVO_TRAS_TRANSFERIR = 10
MAX_TRANSFERENCIAS = 6


def _nombre_producto(d: dict) -> str:
    return f"{d['producto']} talla {d['talla']}" if d.get("talla") else d["producto"]


def analizar_por_reglas(metricas: list[dict], detalle: list[dict], periodo: str) -> AnalisisSucursales:
    """Lectura del consolidado calculada con reglas fijas sobre las mismas
    metricas que veria la IA. Se usa cuando Gemini no esta configurado o
    falla: el usuario siempre obtiene un analisis, y la respuesta dice
    claramente que no lo genero un modelo."""
    total_monto = sum((m["monto_vendido"] for m in metricas), Decimal("0"))
    total_unidades = sum(m["unidades_vendidas"] for m in metricas)
    n = len(metricas)

    # --- Transferencias: mismo producto, quiebre en una sucursal y exceso en otra.
    por_producto: dict[int, list[dict]] = {}
    for d in detalle:
        por_producto.setdefault(d["idProducto"], []).append(d)
    transferencias: list[SugerenciaTransferencia] = []
    for filas in por_producto.values():
        quiebres = sorted((f for f in filas if f["disponible"] <= UMBRAL_STOCK_CRITICO), key=lambda f: f["disponible"])
        excesos = sorted((f for f in filas if f["disponible"] >= UMBRAL_EXCESO), key=lambda f: -f["disponible"])
        for q, e in zip(quiebres, excesos):
            unidades = min(e["disponible"] - OBJETIVO_TRAS_TRANSFERIR, OBJETIVO_TRAS_TRANSFERIR - q["disponible"])
            if unidades <= 0:
                continue
            transferencias.append(
                SugerenciaTransferencia(
                    idProducto=q["idProducto"],
                    producto=_nombre_producto(q),
                    desdeSucursal=e["sucursal"],
                    haciaSucursal=q["sucursal"],
                    unidades=unidades,
                    motivo=(
                        f"{q['sucursal']} tiene {q['disponible']} disponible(s) y {e['sucursal']} "
                        f"tiene {e['disponible']}: al mover {unidades} ambas quedan con margen."
                    ),
                )
            )
    transferencias.sort(key=lambda t: -t.unidades)
    transferencias = transferencias[:MAX_TRANSFERENCIAS]

    # --- Hallazgos por sucursal.
    hallazgos: list[HallazgoSucursal] = []
    for m in sorted(metricas, key=lambda x: -x["monto_vendido"]):
        cuota = (m["monto_vendido"] / total_monto * 100) if total_monto > 0 else Decimal("0")
        criticos = [
            _nombre_producto(d)
            for d in sorted(detalle, key=lambda d: d["disponible"])
            if d["codigoSucursal"] == m["codigoSucursal"] and d["disponible"] <= UMBRAL_STOCK_CRITICO
        ]
        partes = [
            f"Vendio Bs {m['monto_vendido']:.2f} ({cuota:.0f}% del total, {m['unidades_vendidas']} unidades).",
            f"Stock disponible: {m['stock_total'] - m['stock_reservado']} unidades en {m['skus']} SKUs.",
        ]
        if criticos:
            partes.append(f"{len(criticos)} SKU(s) en nivel critico, ej.: {', '.join(criticos[:3])}.")
        if m["monto_vendido"] == 0:
            severidad = "Alta"
            partes.append("No registro ventas en el periodo: revisar la operacion de la sucursal.")
        elif len(criticos) >= 5:
            severidad = "Alta"
            partes.append("Prioridad: reponer o traer stock de otra sucursal antes de perder ventas.")
        elif len(criticos) >= 2 or (n > 1 and cuota < Decimal(60) / n):
            severidad = "Media"
            if n > 1 and cuota < Decimal(60) / n:
                partes.append("Vende por debajo del promedio de la red.")
        else:
            severidad = "Baja"
            partes.append("Operacion equilibrada.")
        hallazgos.append(
            HallazgoSucursal(
                codigoSucursal=m["codigoSucursal"],
                sucursal=m["sucursal"],
                diagnostico=" ".join(partes),
                severidad=severidad,
            )
        )

    # --- Alertas.
    alertas: list[str] = []
    for filas in por_producto.values():
        if len(filas) == n and n > 0 and all(f["disponible"] <= UMBRAL_STOCK_CRITICO for f in filas):
            alertas.append(f"{_nombre_producto(filas[0])}: en quiebre en todas las sucursales, pedir al proveedor.")
    for m in metricas:
        if m["stock_total"] > 0 and m["stock_reservado"] / m["stock_total"] > 0.1:
            alertas.append(f"{m['sucursal']}: mas del 10% del stock esta reservado; confirmar o liberar reservas.")
    if not alertas and not transferencias:
        alertas.append("Sin quiebres de stock relevantes en el periodo.")

    # --- Resumen.
    lider = max(metricas, key=lambda x: x["monto_vendido"]) if metricas else None
    total_criticos = sum(1 for d in detalle if d["disponible"] <= UMBRAL_STOCK_CRITICO)
    resumen = f"En el periodo ({periodo}) la red vendio Bs {total_monto:.2f} ({total_unidades} unidades) en {n} sucursal(es)."
    if lider and total_monto > 0 and n > 1:
        resumen += f" {lider['sucursal']} lidera con el {lider['monto_vendido'] / total_monto * 100:.0f}% de las ventas."
    resumen += f" Hay {total_criticos} SKU(s) en nivel critico"
    resumen += f" y {len(transferencias)} transferencia(s) sugerida(s) para equilibrar el stock." if transferencias else "."

    return AnalisisSucursales(resumen=resumen, hallazgos=hallazgos, transferencias=transferencias, alertas=alertas[:8])


MOTOR_REGLAS = "Motor de reglas YouShop"


async def analizar_con_respaldo(
    metricas: list[dict], detalle: list[dict], periodo: str
) -> tuple[AnalisisSucursales, str, str | None]:
    """Analisis con Gemini; si no se puede, el de reglas.

    Devuelve (analisis, generado_por, aviso). `aviso` explica por que no se
    uso la IA (None si la uso), para que la pantalla no haga pasar un
    analisis por reglas como si fuera de un modelo.
    """
    try:
        return await analizar_sucursales(metricas, detalle, periodo), MODEL, None
    except GeminiNoConfigurado:
        aviso = "El servidor no tiene configurada la clave de Gemini (GEMINI_API_KEY)."
    except GeminiCredencialInvalida:
        aviso = "Google rechazo la clave de Gemini del servidor: hay que reemplazar GEMINI_API_KEY por una API key de AI Studio."
    except AnalisisNoDisponible as exc:
        aviso = f"La IA no estuvo disponible ({exc})."
    except Exception:  # el analisis nunca debe tumbar la pantalla de reportes
        logger.exception("Fallo inesperado del analisis con IA")
        aviso = "La IA fallo de forma inesperada."
    logger.warning("Analisis por reglas en lugar de Gemini: %s", aviso)
    return analizar_por_reglas(metricas, detalle, periodo), MOTOR_REGLAS, aviso
