from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AsignacionPermiso,
    Permiso,
    Plan,
    Rol,
    Tenant,
    Usuario,
    TENANT_POR_DEFECTO,
)


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


async def get_plan_codigo(session: AsyncSession, id_tenant: int) -> str | None:
    """Codigo del plan vigente del tenant (migracion 014), o None si el tenant
    no existe todavia (bases que aun no corrieron el seed)."""
    return await session.scalar(
        select(Plan.codigo).join(Tenant, Tenant.idPlan == Plan.idPlan).where(Tenant.idTenant == id_tenant)
    )


async def build_user_claims(session: AsyncSession, usuario: Usuario) -> dict:
    permisos = await get_permisos_de_usuario(session, usuario.idUser)
    rol = await get_rol_nombre(session, usuario.codigoRol)
    # "tenant" y "plan" viajan en el JWT para que el gating por suscripcion no
    # necesite un SELECT extra en cada request (services/tenancy.py los lee).
    id_tenant = getattr(usuario, "idTenant", None) or TENANT_POR_DEFECTO
    return {
        "correo": usuario.correo,
        "rol": rol,
        "permisos": permisos,
        "tenant": id_tenant,
        "plan": await get_plan_codigo(session, id_tenant),
    }
