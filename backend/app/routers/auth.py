from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from jose import JWTError, jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.email_utils import send_reset_email
from app.models import Cliente, Usuario
from app.services.bitacora import registrar_bitacora
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MeResponse,
    PasswordChangedResponse,
    PasswordUpdate,
    PasswordUpdatedResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserSummary,
)
from app.security import (
    create_access_token,
    create_pwd_reset_token,
    create_refresh_token,
    decode_token,
    get_current_payload,
    hash_password,
    verify_password,
)
from app.services.usuarios import build_user_claims

settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_INTENTOS_FALLIDOS = 3
# Duraciones de bloqueo progresivas en segundos: 1er bloqueo 30s, 2do 1min,
# 3ro 5min, 4to 15min. A partir del 5to bloqueo la cuenta queda inactiva
# hasta que un administrador la reactive manualmente (requiereActivacion).
DURACIONES_BLOQUEO_SEGUNDOS = [30, 60, 300, 900]

MENSAJE_REQUIERE_ACTIVACION = (
    "Tu cuenta fue bloqueada por seguridad tras varios bloqueos repetidos. "
    "Contacta a un administrador para reactivarla."
)


async def _find_usuario_by_email(session: AsyncSession, email: str) -> Usuario | None:
    result = await session.execute(select(Usuario).where(Usuario.correo == email))
    return result.scalar_one_or_none()


def _ahora_naive() -> datetime:
    return datetime.utcnow()


def _mensaje_bloqueado(bloqueado_hasta: datetime) -> str:
    restante_seg = int((bloqueado_hasta - _ahora_naive()).total_seconds())
    restante_seg = max(restante_seg, 1)
    if restante_seg < 60:
        cantidad, unidad = restante_seg, "segundo"
    else:
        cantidad, unidad = max(restante_seg // 60, 1), "minuto"
    return (
        "Cuenta bloqueada temporalmente por multiples intentos fallidos. "
        f"Intenta de nuevo en {cantidad} {unidad}(s)."
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, session: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "0.0.0.0"
    usuario = await _find_usuario_by_email(session, payload.email)

    if usuario is None:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    ahora = _ahora_naive()

    if usuario.requiereActivacion:
        await registrar_bitacora(
            session, "Intento de inicio de sesion con cuenta bloqueada permanentemente", usuario.idUser, ip
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=MENSAJE_REQUIERE_ACTIVACION,
        )

    if usuario.bloqueadoHasta is not None and usuario.bloqueadoHasta > ahora:
        await registrar_bitacora(
            session, "Intento de inicio de sesion con cuenta bloqueada temporalmente", usuario.idUser, ip
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=_mensaje_bloqueado(usuario.bloqueadoHasta),
        )

    if not verify_password(payload.password, usuario.contraseña):
        usuario.intentosFallidos = (usuario.intentosFallidos or 0) + 1
        await registrar_bitacora(session, "Intento de inicio de sesion fallido", usuario.idUser, ip)
        if usuario.intentosFallidos >= MAX_INTENTOS_FALLIDOS:
            usuario.intentosFallidos = 0
            usuario.vecesBloqueado = (usuario.vecesBloqueado or 0) + 1
            indice = usuario.vecesBloqueado - 1

            if indice < len(DURACIONES_BLOQUEO_SEGUNDOS):
                usuario.bloqueadoHasta = ahora + timedelta(
                    seconds=DURACIONES_BLOQUEO_SEGUNDOS[indice]
                )
                await registrar_bitacora(
                    session,
                    "Cuenta bloqueada temporalmente tras multiples intentos fallidos",
                    usuario.idUser,
                    ip,
                )
                await session.commit()
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=_mensaje_bloqueado(usuario.bloqueadoHasta),
                )

            usuario.requiereActivacion = True
            usuario.bloqueadoHasta = None
            await registrar_bitacora(
                session,
                "Cuenta bloqueada permanentemente - requiere activacion de administrador",
                usuario.idUser,
                ip,
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=MENSAJE_REQUIERE_ACTIVACION,
            )

        restantes = MAX_INTENTOS_FALLIDOS - usuario.intentosFallidos
        await session.commit()
        raise HTTPException(
            status_code=401,
            detail=(
                "Credenciales invalidas. "
                f"Te quedan {restantes} intento(s) antes de bloquear la cuenta."
            ),
        )

    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = None
    usuario.vecesBloqueado = 0
    await registrar_bitacora(session, "Inicio de sesion exitoso", usuario.idUser, ip)
    await session.commit()

    claims = await build_user_claims(session, usuario)
    access_token = create_access_token(usuario.idUser, claims)
    refresh_token = create_refresh_token(usuario.idUser)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserSummary(
            idUser=usuario.idUser,
            nombre=usuario.nombre,
            correo=usuario.correo,
            rol=claims["rol"],
            permisos=claims["permisos"],
        ),
    )


@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, request: Request, session: AsyncSession = Depends(get_db)):
    existing = await _find_usuario_by_email(session, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya esta registrado")

    res = await session.execute(
        text('SELECT "codigoRol" FROM "rol" WHERE "nombreRol" = :r'),
        {"r": "Cliente"},
    )
    codigo_cliente = res.scalar_one_or_none()
    if codigo_cliente is None:
        raise HTTPException(status_code=500, detail="Rol Cliente no configurado en la base")

    nuevo = Usuario(
        nombre=payload.nombre,
        correo=payload.email,
        contraseña=hash_password(payload.password),
        codigoRol=codigo_cliente,
    )
    session.add(nuevo)
    await session.flush()

    session.add(Cliente(nombre=payload.nombre, idUser=nuevo.idUser))
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Cuenta registrada", nuevo.idUser, ip)
    await session.commit()
    await session.refresh(nuevo)

    claims = await build_user_claims(session, nuevo)
    access_token = create_access_token(nuevo.idUser, claims)
    refresh_token = create_refresh_token(nuevo.idUser)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserSummary(
            idUser=nuevo.idUser,
            nombre=nuevo.nombre,
            correo=nuevo.correo,
            rol=claims["rol"],
            permisos=claims["permisos"],
        ),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db)):
    decoded = decode_token(payload.refresh_token)
    try:
        user_id = int(decoded["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Refresh token invalido")

    usuario = await session.get(Usuario, user_id)
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no existe")

    claims = await build_user_claims(session, usuario)
    access_token = create_access_token(usuario.idUser, claims)
    refresh_token = create_refresh_token(usuario.idUser)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserSummary(
            idUser=usuario.idUser,
            nombre=usuario.nombre,
            correo=usuario.correo,
            rol=claims["rol"],
            permisos=claims["permisos"],
        ),
    )


@router.get("/me", response_model=MeResponse)
async def me(payload: dict = Depends(get_current_payload), session: AsyncSession = Depends(get_db)):
    user_id = int(payload["sub"])
    usuario = await session.get(Usuario, user_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return MeResponse(
        idUser=usuario.idUser,
        nombre=usuario.nombre,
        correo=usuario.correo,
        rol=payload.get("rol", ""),
        permisos=payload.get("permisos", []),
    )


@router.patch("/password", response_model=PasswordUpdatedResponse)
async def change_password(
    payload: PasswordUpdate,
    request: Request,
    current: dict = Depends(get_current_payload),
    session: AsyncSession = Depends(get_db),
):
    user_id = int(current["sub"])
    usuario = await session.get(Usuario, user_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not verify_password(payload.current_password, usuario.contraseña):
        raise HTTPException(status_code=400, detail="La contrasena actual no es correcta")

    usuario.contraseña = hash_password(payload.new_password)
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Contrasena actualizada", usuario.idUser, ip)
    await session.commit()
    return PasswordUpdatedResponse(message="Contrasena actualizada correctamente")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest, session: AsyncSession = Depends(get_db)):
    mensaje = "Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena."
    usuario = await _find_usuario_by_email(session, payload.email)
    if usuario is None:
        return ForgotPasswordResponse(message=mensaje, reset_token_dev=None)

    reset_token = create_pwd_reset_token(usuario.idUser)
    reset_link = f"{settings.FRONTEND_URL}/?reset_token={reset_token}"

    enviado = await run_in_threadpool(send_reset_email, usuario.correo, reset_link)
    if enviado:
        return ForgotPasswordResponse(message=mensaje, reset_token_dev=None)

    # SMTP no configurado o fallo el envio: modo desarrollo, se devuelve el
    # token directamente para poder probar el flujo sin correo real.
    return ForgotPasswordResponse(message=mensaje, reset_token_dev=reset_token)


@router.post("/reset-password", response_model=PasswordChangedResponse)
async def reset_password(payload: ResetPasswordRequest, request: Request, session: AsyncSession = Depends(get_db)):
    try:
        decoded = jwt.decode(
            payload.token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=400,
            detail="El enlace de recuperacion es invalido o expiro",
        )

    if decoded.get("purpose") != "pwd_reset":
        raise HTTPException(
            status_code=400,
            detail="El enlace de recuperacion es invalido o expiro",
        )

    try:
        user_id = int(decoded["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="El enlace de recuperacion es invalido o expiro",
        )

    usuario = await session.get(Usuario, user_id)
    if not usuario:
        raise HTTPException(
            status_code=400,
            detail="El enlace de recuperacion es invalido o expiro",
        )

    usuario.contraseña = hash_password(payload.new_password)
    usuario.intentosFallidos = 0
    usuario.bloqueadoHasta = None
    ip = request.client.host if request.client else "0.0.0.0"
    await registrar_bitacora(session, "Contrasena restablecida mediante recuperacion", usuario.idUser, ip)
    await session.commit()
    return PasswordChangedResponse(message="Contrasena restablecida correctamente")