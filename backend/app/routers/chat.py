# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU36] Conversar con el asistente virtual (por texto o por voz)
#   POST /api/chat                          cliente con sesion: catalogo + sus compras y reservas
#   POST /api/chat/publico                  visitante de la landing: solo catalogo (limite por IP)
#   POST /api/chat/transcribir              voz -> texto cuando el navegador no reconoce la voz
#   POST /api/chat/admin                    personal: datos del negocio y reportes
#   GET  /api/chat/admin/reportes/{id}.{fmt} el reporte en PDF, CSV o HTML
# Control: services/chat_gemini.py (clientes) y services/chat_admin.py (personal)
# ==================================================================
import asyncio
import json
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente
from app.routers import reportes_generativos as rr
from app.schemas.chat import ChatIn, ChatOut
from app.security import get_current_payload, require_permiso
from app.services import chat_admin
from app.services import exportacion as exp
from app.services import reportes_generativos as rg
from app.services import reportes_ia
from app.services.bitacora import registrar_bitacora
from app.services.chat_gemini import ChatNoDisponible, GeminiNoConfigurado, responder_chat
from app.services.tenancy import ContextoTenant, require_feature, tenant_actual

router = APIRouter(prefix="/api/chat", tags=["chat"])

# La vitrina publica es la de la empresa 1 (alli se registran los clientes).
TENANT_VITRINA = 1
# Limite del chat publico: mensajes por IP en la ventana (sin cuenta no hay otra forma de frenar abusos).
LIMITE_PUBLICO, VENTANA_SEGUNDOS = 20, 600
_pedidos_por_ip: dict[str, deque] = defaultdict(deque)
TIPOS_AUDIO = ("audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/m4a")


class ChatAdminIn(ChatIn):
    origen: str = Field(default="texto", pattern="^(texto|voz)$")


class ChatAdminOut(ChatOut):
    archivos: list[dict] = []
    motor: str = ""


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


def _sin_ia(exc: Exception) -> HTTPException:
    if isinstance(exc, GeminiNoConfigurado):
        return HTTPException(status_code=503, detail="El asistente virtual no esta configurado en este servidor")
    return HTTPException(status_code=503, detail="El asistente virtual no esta disponible en este momento. Intenta de nuevo en unos minutos.")


@router.post("", response_model=ChatOut)
async def chat(
    payload: ChatIn,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
):
    cliente = (
        await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))
    ).scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=403, detail="El chatbot solo esta disponible para clientes registrados")
    try:
        respuesta, historial = await responder_chat(
            session=session, id_cliente=cliente.idCliente, mensaje=payload.mensaje,
            historial=payload.historial, id_tenant=tenant_actual(auth),
        )
    except (GeminiNoConfigurado, ChatNoDisponible) as exc:
        raise _sin_ia(exc)
    return ChatOut(respuesta=respuesta, historial=historial)


# ==== [CU36] Visitante de la landing ===============================
@router.post("/publico", response_model=ChatOut)
async def chat_publico(payload: ChatIn, request: Request, session: AsyncSession = Depends(get_db)):
    ahora = time.monotonic()
    cola = _pedidos_por_ip[_ip(request)]
    while cola and ahora - cola[0] > VENTANA_SEGUNDOS:
        cola.popleft()
    if len(cola) >= LIMITE_PUBLICO:
        raise HTTPException(status_code=429, detail="Hiciste muchas preguntas seguidas: espera unos minutos o inicia sesion")
    cola.append(ahora)
    if not payload.mensaje.strip() or len(payload.mensaje) > 500:
        raise HTTPException(status_code=400, detail="Escribe una pregunta de hasta 500 caracteres")
    try:
        respuesta, historial = await responder_chat(
            session=session, id_cliente=None, mensaje=payload.mensaje, historial=payload.historial[-10:], id_tenant=TENANT_VITRINA,
        )
    except (GeminiNoConfigurado, ChatNoDisponible) as exc:
        raise _sin_ia(exc)
    return ChatOut(respuesta=respuesta, historial=historial)


# ==== [CU36] Voz: cuando el navegador no tiene reconocimiento de voz =====
@router.post("/transcribir")
async def transcribir(audio: UploadFile = File(...), _: dict = Depends(get_current_payload)):
    tipo = (audio.content_type or "").split(";")[0]
    if tipo not in TIPOS_AUDIO:
        raise HTTPException(status_code=415, detail="Formato de audio no soportado")
    datos = await audio.read()
    if len(datos) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="La grabacion es demasiado larga")
    try:
        cliente = reportes_ia._client()
    except reportes_ia.GeminiNoConfigurado:
        raise HTTPException(status_code=503, detail="La transcripcion no esta disponible: escribe tu pregunta")
    try:
        respuesta = await asyncio.wait_for(
            cliente.aio.models.generate_content(
                model=reportes_ia.MODEL,
                contents=[reportes_ia.types.Part.from_bytes(data=datos, mime_type=tipo),
                          "Transcribe en espanol lo que dice la persona. audible=false si hay mucho ruido o no se entiende."],
                config=reportes_ia.types.GenerateContentConfig(response_mime_type="application/json", response_schema=rr.Transcripcion),
            ),
            timeout=30,
        )
        resultado = respuesta.parsed or rr.Transcripcion.model_validate(json.loads(respuesta.text))
    except Exception:
        raise HTTPException(status_code=503, detail="No se pudo transcribir el audio: repite la pregunta o escribela")
    return {"texto": resultado.texto.strip(), "confianza": "alta" if resultado.audible and resultado.texto.strip() else "baja"}


# ==== [CU36] Asistente del personal: datos del negocio y reportes ====
@router.post("/admin", response_model=ChatAdminOut)
async def chat_admin_endpoint(
    payload: ChatAdminIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_IA)),
    id_tenant: int = Depends(tenant_actual),
    _plan: ContextoTenant = Depends(require_feature("permiteIA")),
):
    if not payload.mensaje.strip():
        raise HTTPException(status_code=400, detail="Escribe tu pedido")
    texto, historial, archivos, motor = await chat_admin.responder_admin(
        session, auth, id_tenant, payload.mensaje.strip()[:500], payload.historial, payload.origen, _ip(request)
    )
    await session.commit()
    return ChatAdminOut(respuesta=texto, historial=historial, archivos=archivos, motor=motor)


@router.get("/admin/reportes/{idSolicitud}.{formato}")
async def descargar_reporte(
    idSolicitud: int,
    formato: str,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(rr.PERMISO_IA)),
    id_tenant: int = Depends(tenant_actual),
):
    if formato not in chat_admin.FORMATOS:
        raise HTTPException(status_code=404, detail="Formato no disponible: pdf, csv o html")
    # Los datos se vuelven a consultar con los mismos filtros (y el alcance del usuario).
    doc = await rr._documento(session, auth, id_tenant, rr.ExportarIn(origen="solicitud", formato="pdf", idSolicitud=idSolicitud), rg.FILAS_MAXIMAS)
    if not doc.filas:
        raise HTTPException(status_code=409, detail="El reporte no tiene datos para exportar")
    contenido, tipo = {
        "pdf": (lambda: exp.pdf(doc), "application/pdf"),
        "csv": (lambda: exp.csv(doc), "text/csv; charset=utf-8"),
        "html": (lambda: exp.html(doc), "text/html; charset=utf-8"),
    }[formato]
    datos = await asyncio.to_thread(contenido)
    await registrar_bitacora(session, f"Asistente: descarga {doc.titulo} en {formato.upper()}"[:150], int(auth["sub"]), _ip(request))
    await session.commit()
    disposicion = "inline" if formato == "html" else "attachment"
    return Response(content=datos, media_type=tipo, headers={"Content-Disposition": f'{disposicion}; filename="{exp.nombre_archivo(doc, formato)}"'})
