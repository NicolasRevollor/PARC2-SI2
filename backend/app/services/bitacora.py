from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bitacora


async def registrar_bitacora(session: AsyncSession, accion: str, idUser: int, ip: str) -> None:
    now = datetime.now()
    session.add(
        Bitacora(
            accion=accion,
            hora=now.time(),
            fecha=now.date(),
            ip=ip,
            idUser=idUser,
        )
    )
