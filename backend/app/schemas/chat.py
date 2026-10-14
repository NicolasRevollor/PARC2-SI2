from typing import Literal

from pydantic import BaseModel


class ChatMensaje(BaseModel):
    role: Literal["user", "model"]
    texto: str


class ChatIn(BaseModel):
    mensaje: str
    historial: list[ChatMensaje] = []


class ChatOut(BaseModel):
    respuesta: str
    historial: list[ChatMensaje]
