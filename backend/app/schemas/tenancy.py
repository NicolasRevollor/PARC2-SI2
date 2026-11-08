from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


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
    orden: int
    activo: bool = True


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idTenant: int
    nombre: str
    slug: str
    estado: str
    fechaAlta: datetime
    nit: str | None = None


class SuscripcionOut(BaseModel):
    """Suscripcion vigente de la empresa (migracion 023)."""

    model_config = ConfigDict(from_attributes=True)

    idSuscripcion: int
    idPlan: int
    fechaInicio: datetime
    fechaVencimiento: datetime
    estado: str
    precioMensual: float
    # [CU22] paso 2: Activa | PorVencer | Gracia | Suspendida | Cancelada y su texto.
    estadoVisible: str = ""
    etiqueta: str = ""
    diasRestantes: int = 0
    finGracia: datetime | None = None
    fechaSuspension: datetime | None = None
    motivoSuspension: str | None = None


class UsoTenantOut(BaseModel):
    """Consumo actual del tenant frente a los topes del plan."""

    sucursales: int
    usuarios: int
    productos: int


class TenantMeOut(BaseModel):
    tenant: TenantOut
    plan: PlanOut
    uso: UsoTenantOut
    suscripcion: SuscripcionOut | None = None


class CambiarPlanIn(BaseModel):
    codigo: str


# --- Consola de plataforma (superadministrador, migracion 016) ------------

EstadoTenant = Literal["Activo", "Suspendido"]


class EmpresaOut(BaseModel):
    """Una empresa suscrita vista desde la consola de plataforma."""

    tenant: TenantOut
    plan: PlanOut
    uso: UsoTenantOut
    suscripcion: SuscripcionOut | None = None
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
    """[CU21] paso 2. Sin contrasena: el administrador la define con el enlace de activacion."""

    nombre: str = Field(min_length=2, max_length=120)  # razon social
    nit: str = Field(min_length=5, max_length=20, pattern=r"^[0-9]+(-[0-9A-Za-z]+)?$")
    # Identificador corto y unico de la empresa (solo minusculas, numeros y guiones).
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    codigoPlan: str
    fechaInicio: date
    fechaVencimiento: date
    adminNombre: str = Field(min_length=2, max_length=100)
    adminCorreo: EmailStr

    @model_validator(mode="after")
    def _fechas(self):
        # [CU21] flujo alternativo 2.
        if self.fechaVencimiento <= self.fechaInicio:
            raise ValueError("La fecha de vencimiento debe ser posterior a la de inicio")
        return self


class EmpresaCreadaOut(BaseModel):
    empresa: "EmpresaOut"
    correoEnviado: bool
    # Solo si el correo no salio: el operador puede copiarlo o reenviar (CU21 alt. 3).
    enlaceActivacion: str | None = None


class ActivacionOut(BaseModel):
    correoEnviado: bool
    enlaceActivacion: str | None = None


class RenovarIn(BaseModel):
    meses: int = Field(ge=1, le=24)


class MotivoIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=255)


class PagoSuscripcionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    idPago: int
    meses: int
    monto: float
    vencimientoAnterior: datetime
    vencimientoNuevo: datetime
    fecha: datetime


class PlanIn(BaseModel):
    """[CU23] paso 3. -1 en un limite es ilimitado."""

    codigo: str = Field(min_length=2, max_length=30, pattern=r"^[a-z0-9_]+$")
    nombre: str = Field(min_length=2, max_length=60)
    descripcion: str | None = Field(default=None, max_length=255)
    precioMensual: float = Field(ge=0)
    maxSucursales: int
    maxUsuarios: int
    maxProductos: int
    permiteIA: bool
    permiteOffline: bool
    permiteMultiSucursal: bool
    orden: int = 0
    activo: bool = True

    @field_validator("maxSucursales", "maxUsuarios", "maxProductos")
    @classmethod
    def _limite(cls, v: int) -> int:
        if v == -1 or v >= 1:
            return v
        raise ValueError("Use -1 para ilimitado o un numero mayor que cero")


class PlanAdminOut(PlanOut):
    empresas: int
    # [CU23] alt. 1: las que ya superan los limites; conservan su uso hasta cambiar de plan.
    empresasExcedidas: list[str] = []


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


EmpresaCreadaOut.model_rebuild()
