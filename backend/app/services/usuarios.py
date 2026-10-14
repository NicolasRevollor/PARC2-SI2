from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AsignacionPermiso, Permiso, Rol, Usuario


async def get_permisos_de_usuario(session: AsyncSession, idUser: int) -> list[str]:
    result = await session.execute(
        select(Permiso.nombrePermiso)
        .join(AsignacionPermiso, AsignacionPermiso.idPermiso == Permiso.idPermiso)
        .join(Rol, Rol.codigoRol == AsignacionPermiso.codigoRol)
        .join(Usuario, Usuario.codigoRol == Rol.codigoRol)
        .where(AsignacionPermiso.estado == "Activo", Usuario.idUser == idUser)
    )
    return list(result.scalars().all())


async def get_rol_nombre(session: AsyncSession, codigoRol: int) -> str:
    result = await session.execute(select(Rol.nombreRol).where(Rol.codigoRol == codigoRol))
    rol = result.scalar_one_or_none()
    return rol or "Desconocido"


async def build_user_claims(session: AsyncSession, usuario: Usuario) -> dict:
    permisos = await get_permisos_de_usuario(session, usuario.idUser)
    rol = await get_rol_nombre(session, usuario.codigoRol)
    return {"correo": usuario.correo, "rol": rol, "permisos": permisos}
