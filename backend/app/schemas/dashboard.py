from datetime import date

from pydantic import BaseModel

from app.schemas.reports import Monto


class KpisOut(BaseModel):
    total_ventas_monto: Monto
    total_ventas_items: int
    stock_total: int
    productos_bajo_stock: int


class VentaDiariaFila(BaseModel):
    fecha: date
    monto: Monto
    cantidad: int


class VentasDiariasOut(BaseModel):
    dias: list[VentaDiariaFila]


class TopProductoFila(BaseModel):
    idProducto: int
    producto_nombre: str
    monto: Monto
    cantidad: int


class TopProductosOut(BaseModel):
    productos: list[TopProductoFila]


class StockSucursalFila(BaseModel):
    codigoSucursal: int
    sucursal_nombre: str
    stock_total: int


class StockPorSucursalOut(BaseModel):
    sucursales: list[StockSucursalFila]
