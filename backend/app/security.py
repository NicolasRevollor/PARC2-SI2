import re
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

# Duracion del token de recuperacion de contrasena (15 minutos)
PWD_RESET_TOKEN_EXPIRE_MINUTES = 15


def validate_password_strength(password: str) -> None:
    """Valida la fortaleza de una contrasena y lanza ValueError con los requisitos faltantes.

    Reglas: minimo 10 caracteres, al menos una minuscula, una mayuscula,
    un digito y un caracter especial (no alfanumerico).
    """
    if not isinstance(password, str):
        raise ValueError("La contrasena debe ser una cadena de texto")

    faltantes = []
    if len(password) < 10:
        faltantes.append("al menos 10 caracteres")
    if not re.search(r"[a-z]", password):
        faltantes.append("una letra minuscula")
    if not re.search(r"[A-Z]", password):
        faltantes.append("una letra mayuscula")
    if not re.search(r"\d", password):
        faltantes.append("un numero")
    if not re.search(r"[^A-Za-z0-9]", password):
        faltantes.append("un caracter especial")

    if faltantes:
        raise ValueError(
            "La contrasena debe tener " + ", ".join(faltantes)
        )


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(subject: str, claims: dict, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "iat": now, "exp": now + expires_delta}
    payload.update(claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int, extra_claims: dict) -> str:
    return create_token(
        subject=str(user_id),
        claims=extra_claims,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: int) -> str:
    return create_token(
        subject=str(user_id),
        claims={},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_pwd_reset_token(user_id: int) -> str:
    """Crea un JWT de corta duracion para recuperacion de contrasena (stateless)."""
    return create_token(
        subject=str(user_id),
        claims={"purpose": "pwd_reset"},
        expires_delta=timedelta(minutes=PWD_RESET_TOKEN_EXPIRE_MINUTES),
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
        )


def get_current_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporciono token de autenticacion",
        )
    return decode_token(credentials.credentials)


def require_permiso(permiso: str):
    def dependency(payload: dict = Depends(get_current_payload)):
        permisos = payload.get("permisos", [])
        if permiso not in permisos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tiene permiso '{permiso}'",
            )
        return payload

    return dependency
