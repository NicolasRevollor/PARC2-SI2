from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente
from app.schemas.chat import ChatIn, ChatOut
from app.security import get_current_payload
from app.services.chat_gemini import GeminiNoConfigurado, responder_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


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
        raise HTTPException(
            status_code=403,
            detail="El chatbot solo esta disponible para clientes registrados",
        )

    try:
        respuesta, historial = await responder_chat(
            session=session,
            id_cliente=cliente.idCliente,
            mensaje=payload.mensaje,
            historial=payload.historial,
        )
    except GeminiNoConfigurado:
        raise HTTPException(
            status_code=503,
            detail="El asistente virtual no esta configurado en este servidor",
        )

    return ChatOut(respuesta=respuesta, historial=historial)
