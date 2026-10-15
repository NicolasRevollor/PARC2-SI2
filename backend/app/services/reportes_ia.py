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

import json
import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import DetalleVenta, Inventario, Producto, Sucursal, Venta

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
    "Sos el analista de operaciones de YouShop, una cadena de boutiques de ropa unisex. "
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

async def metricas_por_sucursal(
    session: AsyncSession,
    id_tenant: int,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
) -> list[dict]:
    """Una fila por sucursal del tenant con sus totales de venta y stock."""
    ventas_stmt = (
        select(
            Inventario.codigoSucursal.label("codigoSucursal"),
            func.sum(DetalleVenta.cantidad).label("unidades"),
            func.sum(DetalleVenta.cantidad * DetalleVenta.precio_unitario).label("monto"),
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Inventario, Inventario.idProducto == DetalleVenta.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
        .group_by(Inventario.codigoSucursal)
    )
    if fecha_desde is not None:
        ventas_stmt = ventas_stmt.where(Venta.fecha >= datetime.combine(fecha_desde, time.min))
    if fecha_hasta is not None:
        ventas_stmt = ventas_stmt.where(Venta.fecha <= datetime.combine(fecha_hasta, time.max))

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
    """Stock por producto y sucursal, acotado a las filas mas relevantes.

    Es el insumo que le permite al modelo proponer transferencias concretas
    (mismo producto, una sucursal con exceso y otra en quiebre).
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
        .order_by(Producto.nombre, Sucursal.nombre)
        .limit(MAX_FILAS_DETALLE)
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


# --- Analisis (IA sobre las metricas ya calculadas) ----------------------

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
        for d in detalle
    )
    return (
        f"Periodo analizado: {periodo}\n"
        f"Sucursales activas: {len(metricas)}\n\n"
        f"Metricas por sucursal:\n{resumen_sucursales or '(sin sucursales)'}\n\n"
        f"Stock por producto y sucursal (muestra):\n{detalle_txt or '(sin inventario cargado)'}"
    )


async def analizar_sucursales(
    metricas: list[dict], detalle: list[dict], periodo: str
) -> AnalisisSucursales:
    client = _client()
    try:
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=_prompt(metricas, detalle, periodo),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=AnalisisSucursales,
            ),
        )
    except genai_errors.ClientError as exc:
        if exc.code in (401, 403):
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
