"""Orquestacion del chatbot (CU23) sobre Gemini.

Usa `google-genai` (el paquete `google-generativeai` esta deprecado). El
loop de tool-calling es MANUAL (`automatic_function_calling` deshabilitado)
en vez del automatico del SDK: asi el limite de seguridad de abajo queda
explicito y auditable en este archivo, no implicito dentro de la ejecucion
que maneja el SDK.

Limite de seguridad: `consultar_mis_ventas`/`consultar_mis_reservas` NUNCA
exponen `id_cliente` como parametro que el modelo pueda decidir — el
`FunctionDeclaration` que ve Gemini no tiene ese campo. `id_cliente` se
cierra por clausura (partial) sobre el Cliente ya resuelto del JWT en el
router, antes de armar las herramientas de este request.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Producto, Reserva, Sucursal, Venta
from app.schemas.chat import ChatMensaje

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - google-genai siempre deberia estar instalado
    genai = None
    types = None

settings = get_settings()

# "gemini-flash-latest" (el alias rotante) devolvio 503 "alta demanda" en
# pruebas en vivo con esta misma key; "gemini-2.5-flash" (version fija) si
# respondio. Mas confiable para esta demo, a costa de no seguir siempre al
# ultimo modelo automaticamente.
MODEL = "gemini-2.5-flash"
MAX_TURNOS_HERRAMIENTAS = 5
LIMITE_RESULTADOS = 10

SYSTEM_INSTRUCTION = (
    "Sos el asistente virtual de YouShop, una tienda de ropa unisex. "
    "Respondes SIEMPRE en espanol, de forma breve y concreta. "
    "Podes responder preguntas sobre el catalogo (productos, precios, "
    "tallas, colores disponibles) usando la herramienta buscar_productos, "
    "y sobre el estado de las compras o reservas del cliente que esta "
    "hablando con vos usando consultar_mis_ventas / consultar_mis_reservas. "
    "NUNCA inventes datos de productos, precios, compras o reservas: si "
    "una pregunta necesita esa informacion, llama a la herramienta "
    "correspondiente antes de responder. Si una pregunta no tiene que ver "
    "con el catalogo o con las compras/reservas propias del cliente, "
    "decilo con honestidad en vez de inventar una respuesta."
)


class GeminiNoConfigurado(RuntimeError):
    """`GEMINI_API_KEY` no esta configurada o el paquete `google-genai` falta."""


def gemini_configurado() -> bool:
    return genai is not None and bool(settings.GEMINI_API_KEY)


def _client() -> "genai.Client":
    if not gemini_configurado():
        raise GeminiNoConfigurado("GEMINI_API_KEY no esta configurada")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


# --- Herramientas (funciones ejecutadas del lado servidor) ---------------

async def buscar_productos(
    session: AsyncSession,
    query: str | None = None,
    tipo: str | None = None,
    color: str | None = None,
    talla: str | None = None,
) -> list[dict]:
    filters = []
    if query:
        filters.append(Producto.nombre.ilike(f"%{query}%"))
    if tipo:
        filters.append(Producto.tipo.ilike(f"%{tipo}%"))
    if color:
        filters.append(Producto.color.ilike(f"%{color}%"))
    if talla:
        filters.append(Producto.talla == talla)

    stmt = (
        select(Producto)
        .where(*filters)
        .order_by(Producto.idProducto.desc())
        .limit(LIMITE_RESULTADOS)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "idProducto": p.idProducto,
            "nombre": p.nombre,
            "tipo": p.tipo,
            "talla": p.talla,
            "color": p.color,
            "precio": float(p.venta),
            "descripcion": p.descripcion,
        }
        for p in rows
    ]


async def consultar_mis_ventas(session: AsyncSession, id_cliente: int) -> list[dict]:
    stmt = (
        select(Venta)
        .where(Venta.idCliente == id_cliente)
        .order_by(Venta.fecha.desc())
        .limit(LIMITE_RESULTADOS)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "idVenta": v.idVenta,
            "fecha": v.fecha.isoformat(),
            "total": float(v.total),
        }
        for v in rows
    ]


async def consultar_mis_reservas(session: AsyncSession, id_cliente: int) -> list[dict]:
    stmt = (
        select(Reserva, Producto, Sucursal)
        .join(Producto, Producto.idProducto == Reserva.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Reserva.codigoSucursal)
        .where(Reserva.idCliente == id_cliente)
        .order_by(Reserva.fecha.desc())
        .limit(LIMITE_RESULTADOS)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "codigoReserva": r.codigoReserva,
            "fecha": r.fecha.isoformat() if isinstance(r.fecha, date) else str(r.fecha),
            "horario": r.horario.isoformat(),
            "estado": r.estado,
            "producto_nombre": p.nombre,
            "sucursal_nombre": s.nombre,
        }
        for r, p, s in rows
    ]


def _declaraciones_herramientas() -> list["types.FunctionDeclaration"]:
    return [
        types.FunctionDeclaration(
            name="buscar_productos",
            description=(
                "Busca prendas en el catalogo de YouShop por nombre, tipo, "
                "color y/o talla. Devuelve hasta 10 resultados con precio."
            ),
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Texto libre a buscar en el nombre del producto"},
                    "tipo": {"type": "string", "description": "Tipo de prenda, ej. Camisa, Pantalon, Vestido"},
                    "color": {"type": "string", "description": "Color de la prenda"},
                    "talla": {"type": "string", "description": "Talla exacta, ej. M, L, 32"},
                },
            },
        ),
        types.FunctionDeclaration(
            name="consultar_mis_ventas",
            description=(
                "Devuelve las compras (ventas) del cliente que esta hablando "
                "en este chat. No recibe parametros: siempre consulta las "
                "compras propias de quien esta autenticado."
            ),
            parameters_json_schema={"type": "object", "properties": {}},
        ),
        types.FunctionDeclaration(
            name="consultar_mis_reservas",
            description=(
                "Devuelve las reservas del cliente que esta hablando en este "
                "chat. No recibe parametros: siempre consulta las reservas "
                "propias de quien esta autenticado."
            ),
            parameters_json_schema={"type": "object", "properties": {}},
        ),
    ]


def _historial_a_contents(historial: list[ChatMensaje]) -> list["types.Content"]:
    return [
        types.Content(role=h.role, parts=[types.Part.from_text(text=h.texto)])
        for h in historial
    ]


async def responder_chat(
    session: AsyncSession,
    id_cliente: int,
    mensaje: str,
    historial: list[ChatMensaje],
) -> tuple[str, list[ChatMensaje]]:
    """Orquesta un turno de chat, ejecutando herramientas manualmente hasta
    `MAX_TURNOS_HERRAMIENTAS` veces. `id_cliente` viene resuelto por el
    router desde el JWT — nunca se expone como parametro de herramienta."""
    client = _client()

    # Ejecutores: `session`/`id_cliente` quedan cerrados por clausura aca,
    # el modelo nunca los ve ni los controla.
    async def _ejecutar(nombre: str, args: dict) -> dict:
        if nombre == "buscar_productos":
            return {"resultados": await buscar_productos(session, **args)}
        if nombre == "consultar_mis_ventas":
            return {"resultados": await consultar_mis_ventas(session, id_cliente)}
        if nombre == "consultar_mis_reservas":
            return {"resultados": await consultar_mis_reservas(session, id_cliente)}
        return {"error": f"Herramienta desconocida: {nombre}"}

    contents: list[types.Content] = _historial_a_contents(historial)
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=mensaje)]))

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        tools=[types.Tool(function_declarations=_declaraciones_herramientas())],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    texto_final = "No pude completar la consulta, intenta preguntar de forma mas simple."
    for _ in range(MAX_TURNOS_HERRAMIENTAS):
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=contents,
            config=config,
        )
        llamadas = response.function_calls or []
        if not llamadas:
            texto_final = response.text or ""
            break

        if response.candidates and response.candidates[0].content:
            contents.append(response.candidates[0].content)

        partes_respuesta = []
        for llamada in llamadas:
            resultado = await _ejecutar(llamada.name, dict(llamada.args or {}))
            partes_respuesta.append(
                types.Part.from_function_response(name=llamada.name, response=resultado)
            )
        contents.append(types.Content(role="tool", parts=partes_respuesta))

    nuevo_historial = historial + [
        ChatMensaje(role="user", texto=mensaje),
        ChatMensaje(role="model", texto=texto_final),
    ]
    return texto_final, nuevo_historial
