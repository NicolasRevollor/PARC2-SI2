from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
