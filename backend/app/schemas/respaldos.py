from datetime import datetime

from pydantic import BaseModel


class RespaldoIn(BaseModel):
    idTenant: int


class RespaldoOut(BaseModel):
    idRespaldo: int
    idTenant: int
    empresa: str
    tipo: str
    estado: str
    almacenamiento: str
    tamanoBytes: int
    filas: int
    error: str | None
    creadoEn: datetime
    creadoPor: str | None


class RespaldoPaginadoOut(BaseModel):
    items: list[RespaldoOut]
    total: int
    page: int
    size: int
    pages: int


class RespaldoConfigOut(BaseModel):
    """Estado de la configuracion de respaldos, para que la consola avise si
    falta algo (bucket privado o secreto del cron)."""

    almacenamiento: str  # 'supabase' | 'local'
    automaticosHabilitados: bool
    retencionAutomaticos: int


class EjecucionAutomaticaOut(BaseModel):
    empresas: int
    completados: int
    fallidos: int
