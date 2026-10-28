"""Sucursales que puede ver cada usuario del personal (migracion 024).

CU11 flujo alternativo 2: el Encargado de sucursal (y el resto del personal)
solo ve los registros de las sucursales que tiene asignadas; el
Administrador de empresa ve todas. El personal todavia sin asignar ve toda
la empresa, hasta que el administrador lo asigne en "Personal" (CU24).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UsuarioSucursal

PERMISO_TODAS = "tenant.admin"


def sucursales_visibles(permisos: list[str], asignadas: list[int]) -> set[int] | None:
    """None significa "todas las sucursales de la empresa"."""
    if PERMISO_TODAS in permisos or not asignadas:
        return None
    return set(asignadas)


async def sucursales_asignadas(session: AsyncSession, id_user: int) -> list[int]:
    return list(
        (
            await session.execute(
                select(UsuarioSucursal.codigoSucursal)
                .where(UsuarioSucursal.idUser == id_user)
                .order_by(UsuarioSucursal.codigoSucursal)
            )
        ).scalars()
    )


async def alcance_sucursales(session: AsyncSession, auth: dict) -> set[int] | None:
    return sucursales_visibles(auth.get("permisos", []), await sucursales_asignadas(session, int(auth["sub"])))


def recortar(pedida: int | None, visibles: set[int] | None) -> set[int] | None:
    """Sucursales a consultar: la pedida en el filtro, dentro de las visibles.
    Pedir una sucursal no visible da un conjunto vacio (sin resultados)."""
    if pedida is None:
        return visibles
    if visibles is None or pedida in visibles:
        return {pedida}
    return set()
