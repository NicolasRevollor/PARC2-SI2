from datetime import date
from math import ceil

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Rol, Usuario
from app.schemas.fase2 import LogOut, LogPaginadoOut, UsuarioBitacoraOut
from app.security import get_current_payload
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/logs", tags=["logs"])

PERMISO_EMPRESA = "bitacora.ver"
# El superadministrador opera la plataforma (su actividad esta en la bitacora
# de plataforma): aunque su usuario cuelga de la empresa 1, no es personal de ella.
ROL_PLATAFORMA = "Superadministrador"


@router.get("", response_model=LogPaginadoOut)
async def list_logs(
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=100),
    idUser: int | None = None,
    q: str | None = Query(None, max_length=100, description="Busca en la accion, el nombre o el correo"),
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """Bitacora de la organizacion, de lo mas nuevo a lo mas viejo.

    Todo usuario tiene bitacora: con "bitacora.ver" (Administrador, Encargado)
    ve la actividad de toda SU empresa; sin ese permiso (Cajero, Cliente) ve
    solo sus propias acciones. Nunca se mezclan empresas.
    """
    ve_empresa = PERMISO_EMPRESA in payload.get("permisos", [])
    filtros = [Usuario.idTenant == id_tenant, Rol.nombreRol != ROL_PLATAFORMA]
    if not ve_empresa:
        filtros.append(Bitacora.idUser == int(payload["sub"]))
    elif idUser is not None:
        filtros.append(Bitacora.idUser == idUser)
    if q:
        patron = f"%{q.strip()}%"
        filtros.append(or_(Bitacora.accion.ilike(patron), Usuario.nombre.ilike(patron), Usuario.correo.ilike(patron)))
    if fecha_desde is not None:
        filtros.append(Bitacora.fecha >= fecha_desde)
    if fecha_hasta is not None:
        filtros.append(Bitacora.fecha <= fecha_hasta)

    base = (
        select(Bitacora, Usuario, Rol.nombreRol)
        .join(Usuario, Usuario.idUser == Bitacora.idUser)
        .join(Rol, Rol.codigoRol == Usuario.codigoRol)
        .where(*filtros)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await session.execute(
            base.order_by(Bitacora.fecha.desc(), Bitacora.hora.desc(), Bitacora.idBitacora.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    return LogPaginadoOut(
        items=[
            LogOut(
                idBitacora=b.idBitacora,
                accion=b.accion,
                hora=b.hora.strftime("%H:%M:%S"),
                fecha=b.fecha,
                ip=str(b.ip),
                idUser=b.idUser,
                usuario_nombre=u.nombre,
                usuario_correo=u.correo,
                rol=rol,
            )
            for b, u, rol in rows
        ],
        total=total,
        page=page,
        size=size,
        pages=ceil(total / size) if total else 0,
        alcance="empresa" if ve_empresa else "propia",
    )


@router.get("/usuarios", response_model=list[UsuarioBitacoraOut])
async def usuarios_con_bitacora(
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """Usuarios de la empresa para el filtro de la bitacora (solo con
    "bitacora.ver"; sin ese permiso el usuario solo se ve a si mismo)."""
    stmt = (
        select(Usuario, Rol.nombreRol)
        .join(Rol, Rol.codigoRol == Usuario.codigoRol)
        .where(Usuario.idTenant == id_tenant, Rol.nombreRol.not_in(("Cliente", ROL_PLATAFORMA)))
        .order_by(Usuario.nombre)
    )
    if PERMISO_EMPRESA not in payload.get("permisos", []):
        stmt = stmt.where(Usuario.idUser == int(payload["sub"]))
    rows = (await session.execute(stmt)).all()
    return [UsuarioBitacoraOut(idUser=u.idUser, nombre=u.nombre, correo=u.correo, rol=rol) for u, rol in rows]
