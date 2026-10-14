from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Usuario
from app.schemas.fase2 import LogOut
from app.security import require_permiso

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogOut])
async def list_logs(
    idUser: int | None = None,
    fecha: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("bitacora.ver")),
):
    stmt = (
        select(Bitacora, Usuario)
        .join(Usuario, Usuario.idUser == Bitacora.idUser)
        .order_by(Bitacora.idBitacora.desc())
        .limit(limit)
    )
    if idUser is not None:
        stmt = (
            select(Bitacora, Usuario)
            .join(Usuario, Usuario.idUser == Bitacora.idUser)
            .where(Bitacora.idUser == idUser)
            .order_by(Bitacora.idBitacora.desc())
            .limit(limit)
        )
    if fecha:
        stmt = (
            select(Bitacora, Usuario)
            .join(Usuario, Usuario.idUser == Bitacora.idUser)
            .where(Bitacora.fecha == fecha)
            .order_by(Bitacora.idBitacora.desc())
            .limit(limit)
        )
    rows = (await session.execute(stmt)).all()
    return [
        LogOut(
            idBitacora=b.idBitacora,
            accion=b.accion,
            hora=b.hora.isoformat(),
            fecha=b.fecha,
            ip=str(b.ip),
            idUser=b.idUser,
            usuario_nombre=u.nombre,
        )
        for b, u in rows
    ]
