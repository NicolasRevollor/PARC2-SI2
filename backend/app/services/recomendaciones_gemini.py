"""Generacion de recomendaciones (CU22) sobre Gemini, disparada en background
justo despues de una venta (`sales.py::create_sale`).

A diferencia de `chat_gemini.py` (conversacion, tool-calling manual), esto es
generacion de una sola pasada: se usa "structured output" (`response_schema`
+ `response_mime_type="application/json"`) para que Gemini devuelva
directamente una instancia Pydantic valida, sin parsear texto libre.

Corre en un `BackgroundTasks` de FastAPI, DESPUES de que la respuesta HTTP ya
se envio — nunca puede tirar una excepcion sin capturar (no hay nadie del
otro lado esperando), y usa su PROPIA sesion (`AsyncSessionLocal`), nunca la
sesion de la request que ya se cerro.
"""

import logging
import traceback
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import delete, select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import DetalleVenta, Producto, Recomendaciones, Venta

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - google-genai siempre deberia estar instalado
    genai = None
    types = None

logger = logging.getLogger("app.errors")
settings = get_settings()

# Mismo pin que chat_gemini.py: "gemini-flash-latest" devolvio 503 "alta
# demanda" en pruebas en vivo con esta key; "gemini-2.5-flash" si respondio.
MODEL = "gemini-2.5-flash"
MAX_CANDIDATOS = 30
MAX_RECOMENDACIONES = 3

SYSTEM_INSTRUCTION = (
    "Sos el motor de recomendaciones de YouShop, una tienda de ropa unisex. "
    "Se te da el historial de compras de un cliente y una lista de productos "
    "candidatos (los unicos que el cliente todavia NO compro). Elegi hasta "
    f"{MAX_RECOMENDACIONES} productos de esa lista de candidatos que le "
    "podrian interesar, cada uno con un nivel de importancia (Alta, Media o "
    "Baja). NUNCA elijas un idProducto que no este en la lista de "
    "candidatos — si ninguno encaja, devolve una lista vacia."
)


class RecomendacionSugerida(BaseModel):
    idProducto: int
    importancia: Literal["Alta", "Media", "Baja"]


class RecomendacionesSugeridas(BaseModel):
    recomendaciones: list[RecomendacionSugerida]


class GeminiNoConfigurado(RuntimeError):
    """`GEMINI_API_KEY` no esta configurada o el paquete `google-genai` falta."""


def _client() -> "genai.Client":
    if genai is None or not settings.GEMINI_API_KEY:
        raise GeminiNoConfigurado("GEMINI_API_KEY no esta configurada")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def generar_recomendaciones_post_venta(id_cliente: int) -> None:
    """Punto de entrada para `BackgroundTasks`. Nunca propaga excepciones."""
    try:
        await _generar(id_cliente)
    except Exception:
        logger.error(
            "Fallo generando recomendaciones para idCliente=%s:\n%s",
            id_cliente,
            traceback.format_exc(),
        )


async def _generar(id_cliente: int) -> None:
    async with AsyncSessionLocal() as session:
        # Historial de compras: mismo criterio que purchase_history.py, pero
        # solo se necesita nombre/tipo/color, no el detalle completo.
        comprados_stmt = (
            select(Producto.idProducto, Producto.nombre, Producto.tipo, Producto.color)
            .select_from(Venta)
            .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
            .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
            .where(Venta.idCliente == id_cliente)
            .distinct()
        )
        comprados = (await session.execute(comprados_stmt)).all()
        ids_comprados = {row.idProducto for row in comprados}

        candidatos_stmt = select(Producto).order_by(Producto.idProducto.desc()).limit(MAX_CANDIDATOS)
        if ids_comprados:
            candidatos_stmt = candidatos_stmt.where(Producto.idProducto.notin_(ids_comprados))
        candidatos = (await session.execute(candidatos_stmt)).scalars().all()

        if not candidatos:
            # Nada para recomendar (catalogo chico o ya compro todo) — no
            # tiene sentido llamar a la API.
            return

        ids_candidatos = {p.idProducto for p in candidatos}

        historial_txt = (
            "\n".join(f"- {r.nombre} ({r.tipo or 's/tipo'}, {r.color or 's/color'})" for r in comprados)
            if comprados
            else "(el cliente todavia no compro nada)"
        )
        candidatos_txt = "\n".join(
            f"- idProducto={p.idProducto}: {p.nombre} ({p.tipo or 's/tipo'}, {p.color or 's/color'}), Bs {p.venta}"
            for p in candidatos
        )
        prompt = (
            f"Historial de compras del cliente:\n{historial_txt}\n\n"
            f"Productos candidatos (los unicos que puede recomendar):\n{candidatos_txt}"
        )

        client = _client()
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=RecomendacionesSugeridas,
            ),
        )

        sugeridas = response.parsed
        if sugeridas is None:
            import json

            sugeridas = RecomendacionesSugeridas.model_validate(json.loads(response.text))

        # Defensiva: nunca confiar ciegamente en que el modelo respeto la
        # lista de candidatos, aunque el prompt se lo pida.
        validas = []
        for s in sugeridas.recomendaciones:
            if s.idProducto not in ids_candidatos:
                logger.warning(
                    "Gemini sugirio idProducto=%s fuera de los candidatos para idCliente=%s — descartado",
                    s.idProducto,
                    id_cliente,
                )
                continue
            validas.append(s)

        if not validas:
            return

        productos_por_id = {p.idProducto: p for p in candidatos}

        # Reemplazar, no acumular: estas filas representan las
        # recomendaciones VIGENTES del cliente, no un historial.
        await session.execute(delete(Recomendaciones).where(Recomendaciones.idCliente == id_cliente))
        for s in validas[:MAX_RECOMENDACIONES]:
            producto = productos_por_id[s.idProducto]
            session.add(
                Recomendaciones(
                    nombre=producto.nombre,
                    importancia=s.importancia,
                    idCliente=id_cliente,
                    idProducto=producto.idProducto,
                )
            )
        await session.commit()
