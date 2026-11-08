from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    # Migracion 027 ([CU24]).
    activo: bool = True
    cuentaActivada: bool = True
    fechaBaja: datetime | None = None


class StaffUserIn(BaseModel):
    """[CU24] paso 2. Sin contrasena: el empleado la define con el enlace de activacion."""

    nombre: str = Field(min_length=2, max_length=100)
    email: EmailStr
    rol: str
    sucursales: list[int] = []


class StaffCreadoOut(BaseModel):
    miembro: TeamMemberOut
    correoEnviado: bool
    # Solo si el correo no salio: se puede copiar y entregar en persona.
    enlaceActivacion: str | None = None


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
