from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bitacora
from app.security import get_current_payload
from app.services.horario import HORA_BOLIVIA

# Largo de la columna Bitacora.accion (VARCHAR(150)).
MAX_ACCION = 150


async def registrar_bitacora(session: AsyncSession, accion: str, idUser: int, ip: str) -> None:
    # "hora" y "fecha" son columnas sin zona que se muestran tal cual.
    now = datetime.now(HORA_BOLIVIA)
    session.add(
        Bitacora(
            accion=accion[:MAX_ACCION],
            hora=now.time(),
            fecha=now.date(),
            ip=ip,
            idUser=idUser,
        )
    )


@dataclass(frozen=True)
class Actor:
    """Quien hace la accion: el usuario del JWT y la IP de la peticion."""

    id_user: int
    ip: str


def actor_actual(request: Request, payload: dict = Depends(get_current_payload)) -> Actor:
    return Actor(
        id_user=int(payload["sub"]),
        ip=request.client.host if request.client else "0.0.0.0",
    )


async def auditar(session: AsyncSession, actor: Actor, accion: str) -> None:
    """Registra en la bitacora una accion del usuario autenticado. Se agrega a
    la misma transaccion: si la operacion falla y no se commitea, tampoco
    queda registrada."""
    await registrar_bitacora(session, accion, actor.id_user, actor.ip)
