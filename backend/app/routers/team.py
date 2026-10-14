from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Rol, Usuario
from app.schemas.team import ActivateAccountResponse, AuditLogOut, ChangeRoleIn, StaffUserIn, TeamMemberOut
from app.security import hash_password, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services.usuarios import build_user_claims

router = APIRouter(prefix="/api/team", tags=["team"])

ROLES_STAFF = ("Administrador", "Encargado de Sucursal", "Cajero")


@router.get("", response_model=list[TeamMemberOut])
async def list_team(session: AsyncSession = Depends(get_db),
                    _=Depends(require_permiso("equipo.ver"))):
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
            select(Usuario).where(Usuario.codigoRol.in_(codigos_staff))
        )
    ).scalars().all()

    resultado = []
    for u in usuarios:
        claims = await build_user_claims(session, u)
        resultado.append(
            TeamMemberOut(
                idUser=u.idUser,
                nombre=u.nombre,
                correo=u.correo,
                rol=claims["rol"],
                permisos=claims["permisos"],
            )
        )
    return resultado


@router.get("/audit-log", response_model=list[AuditLogOut])
async def audit_log(
    idUser: int | None = None,
    fecha: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("equipo.ver")),
):
    stmt = (
        select(Bitacora, Usuario)
        .join(Usuario, Usuario.idUser == Bitacora.idUser)
        .order_by(Bitacora.idBitacora.desc())
        .limit(limit)
    )
    if idUser is not None:
        stmt = stmt.where(Bitacora.idUser == idUser).order_by(Bitacora.idBitacora.desc()).limit(limit)
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
    _=Depends(require_permiso("usuario.admin")),
):
    usuario = await session.get(Usuario, idUser)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = None
    usuario.vecesBloqueado = 0
    usuario.requiereActivacion = False
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Cuenta reactivada por un administrador", usuario.idUser, ip)
    await session.commit()
    return ActivateAccountResponse(message="Cuenta reactivada correctamente")


@router.post("", response_model=TeamMemberOut, status_code=201)
async def create_staff_user(
    payload: StaffUserIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    existing = (
        await session.execute(select(Usuario).where(Usuario.correo == payload.email))
    ).scalar_one_or_none()
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
    )
    session.add(nuevo)
    await session.flush()

    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Usuario de personal creado", nuevo.idUser, ip)
    await session.commit()
    await session.refresh(nuevo)

    claims = await build_user_claims(session, nuevo)
    return TeamMemberOut(
        idUser=nuevo.idUser,
        nombre=nuevo.nombre,
        correo=nuevo.correo,
        rol=claims["rol"],
        permisos=claims["permisos"],
    )


@router.patch("/{idUser}/role", response_model=TeamMemberOut)
async def change_staff_role(
    idUser: int,
    payload: ChangeRoleIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    current: dict = Depends(require_permiso("usuario.admin")),
):
    usuario = await session.get(Usuario, idUser)
    if not usuario:
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
                .where(Rol.nombreRol == "Administrador")
            )
        ).scalar_one()
        if total_admins <= 1:
            raise HTTPException(status_code=400, detail="Debe quedar al menos un Administrador")

    usuario.codigoRol = rol.codigoRol
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Rol de usuario modificado", usuario.idUser, ip)
    await session.commit()
    await session.refresh(usuario)

    claims = await build_user_claims(session, usuario)
    return TeamMemberOut(
        idUser=usuario.idUser,
        nombre=usuario.nombre,
        correo=usuario.correo,
        rol=claims["rol"],
        permisos=claims["permisos"],
    )
