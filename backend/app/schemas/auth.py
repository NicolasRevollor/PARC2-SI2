from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.security import validate_password_strength

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    nombre: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _validar_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserSummary"


class RefreshRequest(BaseModel):
    refresh_token: str


class PermisoOut(BaseModel):
    idPermiso: int
    nombrePermiso: str


class RolOut(ORMModel):
    codigoRol: int
    nombreRol: str


class UserSummary(BaseModel):
    idUser: int
    nombre: str
    correo: str
    rol: str
    permisos: list[str]

    model_config = ConfigDict(from_attributes=True)


class UserOut(UserSummary):
    pass


class MeResponse(BaseModel):
    idUser: int
    nombre: str
    correo: str
    rol: str
    permisos: list[str]


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _validar_new_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token_dev: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _validar_new_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class PasswordUpdatedResponse(BaseModel):
    message: str


class PasswordChangedResponse(BaseModel):
    message: str


LoginRequest.model_rebuild()
TokenResponse.model_rebuild()
