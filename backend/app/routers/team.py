from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Rol, Sucursal, Usuario, UsuarioSucursal
from app.schemas.team import (
    ActivateAccountResponse,
    AsignarSucursalesIn,
    AuditLogOut,
    ChangeRoleIn,
    StaffUserIn,
    TeamMemberOut,
)
from app.security import hash_password, require_permiso
from app.services.alcance import sucursales_asignadas
from app.services.bitacora import registrar_bitacora
from app.services.tenancy import ContextoTenant, contexto_actual, exigir_cupo, tenant_actual
from app.services.usuarios import build_user_claims

router = APIRouter(prefix="/api/team", tags=["team"])

ROLES_STAFF = ("Administrador", "Encargado de Sucursal", "Cajero")


async def _miembro(session: AsyncSession, u: Usuario) -> TeamMemberOut:
    claims = await build_user_claims(session, u)
    return TeamMemberOut(
        idUser=u.idUser,
        nombre=u.nombre,
        correo=u.correo,
        rol=claims["rol"],
        permisos=claims["permisos"],
        sucursales=await sucursales_asignadas(session, u.idUser),
    )


async def _asignar(session: AsyncSession, usuario: Usuario, sucursales: list[int]) -> None:
    """CU24: reemplaza las sucursales del usuario; todas deben ser de su empresa."""
    pedidas = set(sucursales)
    if pedidas:
        propias = set(
            (
                await session.execute(
                    select(Sucursal.codigoSucursal).where(
                        Sucursal.codigoSucursal.in_(pedidas), Sucursal.idTenant == usuario.idTenant
                    )
                )
            ).scalars()
        )
        if propias != pedidas:
            raise HTTPException(status_code=400, detail="Sucursal inexistente")
    actuales = (
        await session.execute(select(UsuarioSucursal).where(UsuarioSucursal.idUser == usuario.idUser))
    ).scalars().all()
    for fila in actuales:
        if fila.codigoSucursal not in pedidas:
            await session.delete(fila)
    for codigo in pedidas - {f.codigoSucursal for f in actuales}:
        session.add(UsuarioSucursal(idUser=usuario.idUser, codigoSucursal=codigo))


@router.get("", response_model=list[TeamMemberOut])
async def list_team(session: AsyncSession = Depends(get_db),
                    _=Depends(require_permiso("equipo.ver")),
                    id_tenant: int = Depends(tenant_actual)):
    roles_staff = (
        await session.execute(
            select(Rol).where(Rol.nombreRol.in_(ROLES_STAFF))
        )
    ).scalars().all()
    codigos_staff = [r.codigoRol for r in roles_staff]
    if not codigos_staff:
        return []

    usuarios = (
        await session.execute(
            select(Usuario).where(
                Usuario.codigoRol.in_(codigos_staff),
                Usuario.idTenant == id_tenant,
            )
        )
    ).scalars().all()

    return [await _miembro(session, u) for u in usuarios]


@router.get("/audit-log", response_model=list[AuditLogOut])
async def audit_log(
    idUser: int | None = None,
    fecha: date | None = None,
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("equipo.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    # Los filtros se COMBINAN. Antes "fecha" reconstruia la consulta desde
    # cero y descartaba "idUser"; y como llegaba como str, asyncpg rechazaba
    # el parametro contra la columna DATE (500). Ademas se listaban las
    # acciones de usuarios de TODAS las empresas.
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
        AuditLogOut(
            idBitacora=b.idBitacora,
            accion=b.accion,
            hora=b.hora,
            fecha=b.fecha,
            ip=str(b.ip),
            idUser=b.idUser,
            usuario_nombre=u.nombre,
        )
        for b, u in rows
    ]


@router.patch("/{idUser}/activate", response_model=ActivateAccountResponse)
async def activate_account(
    idUser: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current: dict = Depends(require_permiso("usuario.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    usuario = await session.get(Usuario, idUser)
    if not usuario or usuario.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = None
    usuario.vecesBloqueado = 0
    usuario.requiereActivacion = False
    # A nombre de QUIEN reactiva (el administrador), con el afectado en el texto.
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(
        session,
        f"Cuenta reactivada: {usuario.correo}",
        int(current["sub"]),
        ip,
    )
    await session.commit()
    return ActivateAccountResponse(message="Cuenta reactivada correctamente")


@router.post("", response_model=TeamMemberOut, status_code=201)
async def create_staff_user(
    payload: StaffUserIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current: dict = Depends(require_permiso("usuario.admin")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    await exigir_cupo(session, ctx, "usuarios")
    existing = (
        await session.execute(
            select(Usuario.idUser).where(func.lower(Usuario.correo) == payload.email.lower())
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya esta registrado")

    rol = (
        await session.execute(
            select(Rol).where(Rol.nombreRol == payload.rol, Rol.nombreRol.in_(ROLES_STAFF))
        )
    ).scalar_one_or_none()
    if rol is None:
        raise HTTPException(status_code=400, detail="Rol invalido")

    nuevo = Usuario(
        nombre=payload.nombre,
        correo=payload.email,
        contraseña=hash_password(payload.password),
        codigoRol=rol.codigoRol,
        idTenant=ctx.tenant.idTenant,
    )
    session.add(nuevo)
    await session.flush()
    await _asignar(session, nuevo, payload.sucursales)

    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(
        session, f"Usuario de personal creado: {nuevo.correo} ({rol.nombreRol})", int(current["sub"]), ip
    )
    await session.commit()
    await session.refresh(nuevo)
    return await _miembro(session, nuevo)


@router.patch("/{idUser}/role", response_model=TeamMemberOut)
async def change_staff_role(
    idUser: int,
    payload: ChangeRoleIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current: dict = Depends(require_permiso("usuario.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    usuario = await session.get(Usuario, idUser)
    if not usuario or usuario.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if int(current["sub"]) == idUser:
        raise HTTPException(status_code=400, detail="No puede cambiar su propio rol")

    rol = (
        await session.execute(
            select(Rol).where(Rol.nombreRol == payload.rol, Rol.nombreRol.in_(ROLES_STAFF))
        )
    ).scalar_one_or_none()
    if rol is None:
        raise HTTPException(status_code=400, detail="Rol invalido")

    rol_actual = (
        await session.execute(select(Rol).where(Rol.codigoRol == usuario.codigoRol))
    ).scalar_one_or_none()
    if rol_actual is not None and rol_actual.nombreRol == "Administrador" and payload.rol != "Administrador":
        total_admins = (
            await session.execute(
                select(func.count())
                .select_from(Usuario)
                .join(Rol, Rol.codigoRol == Usuario.codigoRol)
                # Por empresa: antes contaba los administradores de TODAS, y
                # el ultimo admin de una empresa podia degradarse.
                .where(Rol.nombreRol == "Administrador", Usuario.idTenant == id_tenant)
            )
        ).scalar_one()
        if total_admins <= 1:
            raise HTTPException(status_code=400, detail="Debe quedar al menos un Administrador")

    usuario.codigoRol = rol.codigoRol
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(
        session,
        f"Rol de {usuario.correo} cambiado: {rol_actual.nombreRol if rol_actual else '?'} -> {rol.nombreRol}",
        int(current["sub"]),
        ip,
    )
    await session.commit()
    await session.refresh(usuario)
    return await _miembro(session, usuario)


@router.put("/{idUser}/sucursales", response_model=TeamMemberOut)
async def asignar_sucursales(
    idUser: int,
    payload: AsignarSucursalesIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current: dict = Depends(require_permiso("usuario.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    """CU24: sucursales en las que trabaja el usuario. El Encargado asignado
    solo ve el historial de devoluciones de esas sucursales (CU11)."""
    usuario = await session.get(Usuario, idUser)
    if not usuario or usuario.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await _asignar(session, usuario, payload.sucursales)
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(
        session,
        f"Sucursales de {usuario.correo}: {', '.join(map(str, sorted(set(payload.sucursales)))) or 'todas'}",
        int(current["sub"]),
        ip,
    )
    await session.commit()
    return await _miembro(session, usuario)
