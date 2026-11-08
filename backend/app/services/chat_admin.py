# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU36] Conversar con el asistente virtual (por texto o por voz)
# Parte del ADMINISTRADOR / ENCARGADO: el asistente arma reportes descargables.
# Control: ControlAsistente
#   responder_admin()  -> Gemini decide si hace falta un reporte y en que formato
#                         (herramienta generar_reporte). Sin Gemini se usan reglas.
#   generar_reporte()  -> el MISMO motor del CU26: la IA solo interpreta el pedido;
#                         el backend valida contra lo permitido y consulta solo los
#                         datos de la empresa (y las sucursales del Encargado).
#   Los archivos (PDF, CSV o HTML) salen de services/exportacion.py.
# ==================================================================
"""Asistente de los administradores: conversa y entrega reportes en PDF, CSV o HTML."""

import re
import unicodedata

from sqlalchemy.ext.asyncio import AsyncSession

from app.routers import reportes_generativos as rr
from app.schemas.chat import ChatMensaje
from app.services import chat_gemini as cg
from app.services import reportes_generativos as rg
from app.services import reportes_ia
from app.services.bitacora import registrar_bitacora

FORMATOS = ("pdf", "csv", "html")
PALABRAS_REPORTE = ("reporte", "informe", "ventas", "venta", "stock", "inventario", "devolucion", "devoluciones",
                    "vendid", "dame", "mostrame", "muestrame", "genera", "exporta", "descarga", "cuanto", "cuantas")

SYSTEM_INSTRUCTION = (
    "Sos el asistente de gestion de YouShop para el personal de una tienda de ropa. Respondes en espanol, "
    "breve y concreto, sin tablas ni markdown (tus respuestas pueden leerse en voz alta). "
    "Cuando te pidan datos del negocio (ventas, unidades, ticket promedio, devoluciones, stock) o un reporte, "
    "llama a la herramienta generar_reporte con el pedido escrito en una frase clara y el formato que pidieron "
    "(pdf, csv o html; si no dicen formato usa pdf). Despues resume en 2 o 3 frases lo que dice el reporte usando "
    "solo los numeros que devolvio la herramienta y avisa que el archivo esta listo para descargar. "
    "NUNCA inventes numeros. Si el pedido no es sobre el negocio, decilo con amabilidad."
)


def _sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def formatos_pedidos(texto: str) -> list[str]:
    """pdf / csv / html que menciona el mensaje (excel cuenta como csv)."""
    t = _sin_tildes(texto)
    pedidos = [f for f in FORMATOS if re.search(rf"\b{f}\b", t)]
    if re.search(r"\b(excel|planilla|hoja de calculo)\b", t) and "csv" not in pedidos:
        pedidos.append("csv")
    if re.search(r"\b(pagina|web)\b", t) and "html" not in pedidos:
        pedidos.append("html")
    return pedidos


def parece_reporte(texto: str) -> bool:
    t = _sin_tildes(texto)
    return any(p in t for p in PALABRAS_REPORTE) or bool(formatos_pedidos(texto))


def _limpiar(texto: str) -> str:
    """El pedido sin la parte del formato ("...en pdf"): eso no es un filtro del reporte."""
    t = re.sub(r"\b(en|como|formato|archivo|y|o)?\s*(pdf|csv|html|excel)\b", " ", texto, flags=re.I)
    return re.sub(r"\s+", " ", t).strip(" ,.") or texto


async def generar_reporte(session: AsyncSession, auth: dict, id_tenant: int, solicitud: str, origen: str) -> dict:
    """Corre el motor del CU26 y guarda la solicitud (queda en el historial de reportes)."""
    ctx = await rr._contexto(session, auth, id_tenant)
    interp, motor, _ = await rg.interpretar(_limpiar(solicitud), ctx)
    if interp.accion == "aclarar":
        await rr._guardar(session, auth, id_tenant, solicitud, origen, motor, "Aclaracion", interp)
        return {"estado": "aclaracion", "pregunta": interp.pregunta, "opciones": interp.opciones[:4]}
    try:
        valida = rg.validar(interp, ctx)
    except rg.Rechazo as exc:
        await rr._guardar(session, auth, id_tenant, solicitud, origen, motor, "Rechazado", interp)
        return {"estado": "rechazado", "motivo": exc.mensaje, "ejemplos": rg.EJEMPLOS[:3]}
    filas, _ = await rg.ejecutar(valida, id_tenant, valida.limite)
    if not filas:
        await rr._guardar(session, auth, id_tenant, solicitud, origen, motor, "SinDatos", interp, valida.titulo)
        return {"estado": "sin_datos", "titulo": valida.titulo, "filtros": valida.filtros_texto}
    totales = rg.totales_de(valida, filas)
    guardada = await rr._guardar(session, auth, id_tenant, solicitud, origen, motor, "Generado", interp, valida.titulo, len(filas))
    return {
        "estado": "generado", "idSolicitud": guardada.idSolicitud, "titulo": valida.titulo, "filas": len(filas),
        "filtros": valida.filtros_texto, "totales": totales, "resumen": rg.resumen_por_reglas(valida, filas, totales),
        "primeras": filas[:5],
    }


def _archivo(resultado: dict, formato: str) -> dict:
    return {"idSolicitud": resultado["idSolicitud"], "titulo": resultado["titulo"], "formato": formato,
            "ruta": f"/api/chat/admin/reportes/{resultado['idSolicitud']}.{formato}"}


def _texto_resultado(r: dict) -> str:
    if r["estado"] == "aclaracion":
        return r["pregunta"] + " Opciones: " + "; ".join(r["opciones"]) + "."
    if r["estado"] == "rechazado":
        return f"{r['motivo']}. Podes pedirme, por ejemplo: {r['ejemplos'][0]}."
    if r["estado"] == "sin_datos":
        return f"No hay datos para '{r['titulo']}' con esos filtros."
    return f"Listo: {r['titulo']} ({r['filas']} fila(s)). {r['resumen']}"


async def _por_reglas(session, auth, id_tenant, mensaje, origen) -> tuple[str, list[dict]]:
    if not parece_reporte(mensaje):
        return ("Puedo armarte reportes de ventas, devoluciones o stock en PDF, CSV o HTML. "
                f"Por ejemplo: '{rg.EJEMPLOS[0]} en pdf'."), []
    r = await generar_reporte(session, auth, id_tenant, mensaje, origen)
    archivos = [_archivo(r, f) for f in (formatos_pedidos(mensaje) or ["pdf"])] if r["estado"] == "generado" else []
    return _texto_resultado(r), archivos


# ==== [CU36] ControlAsistente.responderAdmin() =====================
async def responder_admin(
    session: AsyncSession, auth: dict, id_tenant: int, mensaje: str, historial: list[ChatMensaje], origen: str = "texto", ip: str = "0.0.0.0"
) -> tuple[str, list[ChatMensaje], list[dict], str]:
    """Devuelve (respuesta, historial, archivos para descargar, motor usado)."""
    archivos: list[dict] = []
    motor = cg.MODEL
    if not cg.gemini_configurado():
        texto, archivos = await _por_reglas(session, auth, id_tenant, mensaje, origen)
        motor = reportes_ia.MOTOR_REGLAS
    else:
        try:
            texto, archivos = await _con_gemini(session, auth, id_tenant, mensaje, historial, origen)
        except cg.ChatNoDisponible:
            texto, archivos = await _por_reglas(session, auth, id_tenant, mensaje, origen)
            motor = reportes_ia.MOTOR_REGLAS
    for a in archivos:
        await registrar_bitacora(session, f"Asistente: reporte {a['titulo']} en {a['formato'].upper()}"[:150], int(auth["sub"]), ip)
    nuevo = historial + [ChatMensaje(role="user", texto=mensaje), ChatMensaje(role="model", texto=texto)]
    return texto, nuevo[-20:], archivos, motor


async def _con_gemini(session, auth, id_tenant, mensaje, historial, origen) -> tuple[str, list[dict]]:
    types, cliente = cg.types, cg._client()
    archivos: list[dict] = []
    declaracion = types.FunctionDeclaration(
        name="generar_reporte",
        description="Arma un reporte con datos reales de la empresa (ventas, devoluciones o stock) y lo deja listo para descargar.",
        parameters_json_schema={
            "type": "object",
            "properties": {
                "solicitud": {"type": "string", "description": "El pedido en una frase, ej. 'ventas de octubre por sucursal'"},
                "formatos": {"type": "array", "items": {"type": "string", "enum": list(FORMATOS)}, "description": "pdf, csv y/o html"},
            },
            "required": ["solicitud"],
        },
    )
    contents = [types.Content(role=h.role, parts=[types.Part.from_text(text=h.texto)]) for h in historial[-10:]]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=mensaje)]))
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION, tools=[types.Tool(function_declarations=[declaracion])],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    for _ in range(3):
        try:
            respuesta = await cliente.aio.models.generate_content(model=cg.MODEL, contents=contents, config=config)
        except cg.genai_errors.APIError as exc:
            raise cg.ChatNoDisponible(str(exc.code)) from exc
        llamadas = respuesta.function_calls or []
        if not llamadas:
            return (respuesta.text or "").strip() or "Listo.", archivos
        if respuesta.candidates and respuesta.candidates[0].content:
            contents.append(respuesta.candidates[0].content)
        partes = []
        for llamada in llamadas:
            args = dict(llamada.args or {})
            r = await generar_reporte(session, auth, id_tenant, str(args.get("solicitud") or mensaje), origen)
            if r["estado"] == "generado":
                pedidos = [f for f in (args.get("formatos") or []) if f in FORMATOS] or formatos_pedidos(mensaje) or ["pdf"]
                archivos += [_archivo(r, f) for f in pedidos]
            partes.append(types.Part.from_function_response(name=llamada.name, response={k: v for k, v in r.items() if k != "primeras"} | {"muestra": r.get("primeras")}))
        contents.append(types.Content(role="tool", parts=partes))
    return "Listo, el reporte esta preparado.", archivos
