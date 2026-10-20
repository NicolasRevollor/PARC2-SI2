from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.security import validate_password_strength


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idPlan: int
    codigo: str
    nombre: str
    descripcion: str | None = None
    precioMensual: float
    # -1 == ilimitado (services/tenancy.py::ILIMITADO).
    maxSucursales: int
    maxUsuarios: int
    maxProductos: int
    permiteIA: bool
    permiteOffline: bool
    permiteMultiSucursal: bool
    soloLocal: bool
    orden: int


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idTenant: int
    nombre: str
    slug: str
    estado: str
    fechaAlta: datetime


class UsoTenantOut(BaseModel):
    """Consumo actual del tenant frente a los topes del plan."""

    sucursales: int
    usuarios: int
    productos: int


class TenantMeOut(BaseModel):
    tenant: TenantOut
    plan: PlanOut
    uso: UsoTenantOut


class CambiarPlanIn(BaseModel):
    codigo: str


# --- Consola de plataforma (superadministrador, migracion 016) ------------

EstadoTenant = Literal["Activo", "Suspendido"]


class EmpresaOut(BaseModel):
    """Una empresa suscrita vista desde la consola de plataforma."""

    tenant: TenantOut
    plan: PlanOut
    uso: UsoTenantOut
    # Correo de su administrador principal (el primero dado de alta), para
    # que el operador sepa a quien contactar.
    adminCorreo: str | None = None


class PlanResumenOut(BaseModel):
    codigo: str
    nombre: str
    empresas: int


class ResumenPlataformaOut(BaseModel):
    totalEmpresas: int
    activas: int
    suspendidas: int
    # Ingreso mensual recurrente: suma del precio del plan de cada empresa ACTIVA.
    ingresoMensual: float
    porPlan: list[PlanResumenOut]


class EmpresaIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    # Identificador corto y unico de la empresa (solo minusculas, numeros y guiones).
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    codigoPlan: str
    adminNombre: str = Field(min_length=2, max_length=100)
    adminCorreo: EmailStr
    adminPassword: str

    @field_validator("adminPassword")
    @classmethod
    def _validar_password(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class CambiarEstadoIn(BaseModel):
    estado: EstadoTenant


class RenombrarEmpresaIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)

    @field_validator("nombre")
    @classmethod
    def _sin_espacios_sobrantes(cls, v: str) -> str:
        limpio = " ".join(v.split())
        if len(limpio) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres")
        return limpio


class BitacoraEntradaOut(BaseModel):
    idBitacora: int
    fecha: str
    hora: str
    accion: str
    ip: str
    idUser: int
    usuarioNombre: str
    usuarioCorreo: str
    idTenant: int
    empresa: str


class BitacoraPaginadaOut(BaseModel):
    items: list[BitacoraEntradaOut]
    total: int
    page: int
    size: int
    pages: int
