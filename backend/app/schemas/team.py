from datetime import date, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.security import validate_password_strength


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TeamMemberOut(BaseModel):
    idUser: int
    nombre: str
    correo: str
    rol: str
    permisos: list[str]
    # Sucursales asignadas (migracion 024, CU24); vacio = toda la empresa.
    sucursales: list[int] = []


class StaffUserIn(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: str
    sucursales: list[int] = []

    @field_validator("password")
    @classmethod
    def _validar_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class ChangeRoleIn(BaseModel):
    rol: str


class AsignarSucursalesIn(BaseModel):
    sucursales: list[int]


class AuditLogOut(BaseModel):
    idBitacora: int
    accion: str
    hora: time
    fecha: date
    ip: str
    idUser: int
    usuario_nombre: Optional[str] = None


class ActivateAccountResponse(BaseModel):
    message: str
