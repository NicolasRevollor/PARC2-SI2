import hashlib
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
        claims={**extra_claims, "type": "access"},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: int) -> str:
    return create_token(
        subject=str(user_id),
        claims={"type": "refresh"},
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def huella_contrasena(hash_actual: str) -> str:
    """Huella corta del hash de contrasena vigente. Viaja dentro del token de
    recuperacion: en cuanto la contrasena cambia, la huella deja de coincidir
    y el enlace ya usado (o cualquier otro emitido antes) queda invalido."""
    return hashlib.sha256(hash_actual.encode("utf-8")).hexdigest()[:16]


def create_pwd_reset_token(user_id: int, hash_actual: str) -> str:
    """Crea un JWT de corta duracion para recuperacion de contrasena (stateless)."""
    return create_token(
        subject=str(user_id),
        claims={"purpose": "pwd_reset", "pwh": huella_contrasena(hash_actual)},
        expires_delta=timedelta(minutes=PWD_RESET_TOKEN_EXPIRE_MINUTES),
    )


def es_refresh_token(payload: dict) -> bool:
    """Los refresh emitidos antes de agregar el claim "type" solo traian
    sub/iat/exp: se reconocen por no tener "permisos" ni "purpose"."""
    if "type" in payload:
        return payload["type"] == "refresh"
    return "permisos" not in payload and "purpose" not in payload


def es_access_token(payload: dict) -> bool:
    if "type" in payload:
        return payload["type"] == "access"
    return "permisos" in payload and "purpose" not in payload


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
    payload = decode_token(credentials.credentials)
    # Un refresh token (7 dias) o un enlace de recuperacion no pueden usarse
    # como token de acceso.
    if not es_access_token(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
        )
    return payload


def get_optional_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    """Para endpoints publicos que cambian de alcance si hay sesion (ej. el
    catalogo: con un token de staff se lista el de SU organizacion).

    Sin token -> None (visitante). Con un token vencido o invalido -> 401, no
    None: si se tratara como visitante, el staff de otra empresa recibiria un
    200 con el catalogo de la empresa por defecto y el cliente nunca se
    enteraria de que tiene que renovar la sesion."""
    if not credentials:
        return None
    return get_current_payload(credentials)


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
