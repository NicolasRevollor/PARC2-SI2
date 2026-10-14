from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class KpisOut(BaseModel):
    total_ventas_monto: Decimal
    total_ventas_items: int
    stock_total: int
    productos_bajo_stock: int


class VentaDiariaFila(BaseModel):
    fecha: date
    monto: Decimal
    cantidad: int


class VentasDiariasOut(BaseModel):
    dias: list[VentaDiariaFila]


class TopProductoFila(BaseModel):
    idProducto: int
    producto_nombre: str
    monto: Decimal
    cantidad: int


class TopProductosOut(BaseModel):
    productos: list[TopProductoFila]


class StockSucursalFila(BaseModel):
    codigoSucursal: int
    sucursal_nombre: str
    stock_total: int


class StockPorSucursalOut(BaseModel):
    sucursales: list[StockSucursalFila]
