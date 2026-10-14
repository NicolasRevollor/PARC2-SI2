from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


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
    monto: Decimal


class VentaReporteOut(BaseModel):
    filas: list[VentaReporteFila]
    total_monto: Decimal
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
