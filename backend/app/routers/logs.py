from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Usuario
from app.schemas.fase2 import LogOut
from app.security import require_permiso
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogOut])
async def list_logs(
    idUser: int | None = None,
    fecha: date | None = None,
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("bitacora.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    # Los filtros se combinan (antes "fecha" descartaba "idUser") y la fecha
    # se valida como DATE (como str, asyncpg la rechazaba con un 500). La
    # bitacora de una empresa solo muestra acciones de SUS usuarios.
    stmt = (
        select(Bitacora, Usuario)
        .join(Usuario, Usuario.idUser == Bitacora.idUser)
        .where(Usuario.idTenant == id_tenant)
    )
    if idUser is not None:
        stmt = stmt.where(Bitacora.idUser == idUser)
    if fecha is not None:
        stmt = stmt.where(Bitacora.fecha == fecha)
    stmt = stmt.order_by(Bitacora.idBitacora.desc()).limit(limit)

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
