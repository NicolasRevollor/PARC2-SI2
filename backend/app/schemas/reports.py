from datetime import date
from decimal import Decimal
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, PlainSerializer

# Monto en bolivianos: Decimal en Python (CSV/PDF sin error de redondeo) pero
# numero en el JSON. Pydantic serializa Decimal como texto, y la web lo sumaba
# como string ("071520.00108360.00 Bs") o fallaba al formatearlo.
Monto = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ReportFiltrosOut(BaseModel):
    """Eco de los filtros aplicados, para que el cliente confirme que el
    reporte que ve corresponde a los filtros que pidio."""

    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None
    codigoSucursal: Optional[int] = None
    idProducto: Optional[int] = None


class VentaReporteFila(BaseModel):
    idProducto: int
    producto_nombre: str
    codigoSucursal: int
    sucursal_nombre: str
    cantidad_vendida: int
    monto: Monto


class VentaReporteOut(BaseModel):
    filas: list[VentaReporteFila]
    total_monto: Monto
    total_items: int
    filtros: ReportFiltrosOut


class InventarioReporteFila(BaseModel):
    idProducto: int
    producto_nombre: str
    codigoSucursal: int
    sucursal_nombre: str
    cantidad_actual: int
    cantidad_reservada: int


class InventarioReporteOut(BaseModel):
    filas: list[InventarioReporteFila]
    filtros: ReportFiltrosOut


# --- CU29: consolidado multi-sucursal + analisis con IA ------------------

class SucursalMetricaOut(BaseModel):
    codigoSucursal: int
    sucursal: str
    unidades_vendidas: int
    monto_vendido: Monto
    stock_total: int
    stock_reservado: int
    skus: int
    skus_criticos: int


class ConsolidadoSucursalesOut(BaseModel):
    sucursales: list[SucursalMetricaOut]
    total_unidades: int
    total_monto: Monto
    filtros: ReportFiltrosOut


class HallazgoSucursalOut(BaseModel):
    codigoSucursal: int
    sucursal: str
    diagnostico: str
    severidad: str


class TransferenciaSugeridaOut(BaseModel):
    idProducto: int
    producto: str
    desdeSucursal: str
    haciaSucursal: str
    unidades: int
    motivo: str


class AnalisisSucursalesOut(BaseModel):
    """Analisis redactado por IA SOBRE las metricas de `sucursales`, que se
    devuelven junto al texto para que el usuario pueda contrastarlo."""

    resumen: str
    hallazgos: list[HallazgoSucursalOut]
    transferencias: list[TransferenciaSugeridaOut]
    alertas: list[str]
    sucursales: list[SucursalMetricaOut]
    generado_por: str
    # False cuando Gemini no estuvo disponible y el analisis salio del motor
    # de reglas; `aviso` explica por que (para mostrarlo tal cual).
    con_ia: bool = True
    aviso: Optional[str] = None
    filtros: ReportFiltrosOut
