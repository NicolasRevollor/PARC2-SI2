import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import AsignacionPermiso, Permiso, Rol, Usuario
from app.security import hash_password

PERMISOS = [
    "producto.listar",
    "producto.crear",
    "producto.editar",
    "producto.eliminar",
    "inventario.ver",
    "inventario.ajustar",
    "inventario.traspasar",
    "venta.crear",
    "venta.ver",
    "reserva.crear",
    "reserva.gestionar",
    "usuario.admin",
    "equipo.ver",
    "bitacora.ver",
    "recomendacion.gestionar",
    "cliente.ver",
    "reporte.ver",
    "tenant.ver",
    "tenant.admin",
    "devolucion.ver",
    "devolucion.crear",
]

# Mismos nombres de rol y asignaciones que base.sql + migraciones 005, 007,
# 011, 014 y 015. Antes este seed creaba "Admin"/"Vendedor", roles que el
# codigo no reconoce (team.py::ROLES_STAFF, platform.py buscan
# "Administrador"), y el admin sembrado quedaba sin reportes ni devoluciones.
ROLES_PERMISOS = {
    "Administrador": PERMISOS,
    "Encargado de Sucursal": [
        "producto.listar",
        "producto.crear",
        "producto.editar",
        "inventario.ver",
        "inventario.ajustar",
        "inventario.traspasar",
        "venta.ver",
        "reserva.gestionar",
        "equipo.ver",
        "cliente.ver",
        "bitacora.ver",
        "recomendacion.gestionar",
        "tenant.ver",
        "devolucion.ver",
        "devolucion.crear",
    ],
    "Cajero": [
        "producto.listar",
        "inventario.ver",
        "venta.crear",
        "venta.ver",
        "reserva.crear",
        "cliente.ver",
        "tenant.ver",
        "devolucion.ver",
        "devolucion.crear",
    ],
    "Cliente": [
        "producto.listar",
        "reserva.crear",
        "venta.crear",
    ],
}


async def seed(session: AsyncSession):
    permisos_map = {}
    for nombre in PERMISOS:
        existing = (
            await session.execute(select(Permiso).where(Permiso.nombrePermiso == nombre))
        ).scalar_one_or_none()
        if existing is None:
            permiso = Permiso(nombrePermiso=nombre)
            session.add(permiso)
            await session.flush()
            permisos_map[nombre] = permiso
        else:
            permisos_map[nombre] = existing

    roles_map = {}
    for nombre_rol, perms in ROLES_PERMISOS.items():
        rol = (
            await session.execute(select(Rol).where(Rol.nombreRol == nombre_rol))
        ).scalar_one_or_none()
        if rol is None:
            rol = Rol(nombreRol=nombre_rol)
            session.add(rol)
            await session.flush()
        roles_map[nombre_rol] = rol
        for nombre_permiso in perms:
            exists = (
                await session.execute(
                    select(AsignacionPermiso).where(
                        AsignacionPermiso.codigoRol == rol.codigoRol,
                        AsignacionPermiso.idPermiso == permisos_map[nombre_permiso].idPermiso,
                    )
                )
            ).scalar_one_or_none()
            if exists is None:
                session.add(
                    AsignacionPermiso(
                        codigoRol=rol.codigoRol,
                        idPermiso=permisos_map[nombre_permiso].idPermiso,
                        estado="Activo",
                    )
                )

    admin = (
        await session.execute(
            select(Usuario).where(Usuario.correo == "admin@ropa.com")
        )
    ).scalar_one_or_none()
    if admin is None:
        # 10+ caracteres: la politica de security.py::validate_password_strength
        # ("Admin123!" tenia 9 y no se podia volver a fijar desde la app).
        admin = Usuario(
            nombre="Administrador",
            correo="admin@ropa.com",
            contraseña=hash_password("Admin12345!"),
            codigoRol=roles_map["Administrador"].codigoRol,
        )
        session.add(admin)

    await session.commit()
    print("Seed completado.")


async def main():
    async with AsyncSessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
