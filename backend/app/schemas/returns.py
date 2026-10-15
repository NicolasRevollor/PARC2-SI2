from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TipoDevolucion = Literal["cambio_talla", "cambio_medida", "devolucion"]


class DevolucionIn(BaseModel):
    idVenta: int
    idProducto: int
    tipo: TipoDevolucion
    cantidad: int = Field(default=1, gt=0)
    # Obligatorio para "cambio_talla": la prenda en la talla nueva es otra
    # fila de "producto" (la talla es una columna del producto).
    idProductoNuevo: int | None = None
    codigoSucursal: int | None = None
    motivo: str | None = Field(default=None, max_length=255)
    # Solo para "cambio_medida" (ajuste de confeccion sobre la misma prenda).
    medidaOriginal: str | None = Field(default=None, max_length=60)
    medidaNueva: str | None = Field(default=None, max_length=60)


class DevolucionOut(BaseModel):
    idDevolucion: int
    tipo: TipoDevolucion
    cantidad: int
    motivo: str | None
    estado: str
    fecha: datetime
    fechaVenta: datetime
    tallaOriginal: str | None
    tallaNueva: str | None
    medidaOriginal: str | None
    medidaNueva: str | None
    montoDevuelto: float
    idVenta: int
    idProducto: int
    producto_nombre: str | None
    idProductoNuevo: int | None
    producto_nuevo_nombre: str | None
    idCliente: int
    cliente_nombre: str | None
    codigoSucursal: int | None
    sucursal_nombre: str | None
    idUsuario: int


class ItemElegibleOut(BaseModel):
    """Item de una venta que todavia esta dentro de la ventana de 24 h."""

    idVenta: int
    fechaVenta: datetime
    horasRestantes: float
    idProducto: int
    producto_nombre: str
    talla: str | None
    cantidadVendida: int
    cantidadDevuelta: int
    cantidadDisponible: int
    precio_unitario: float
    idCliente: int
    cliente_nombre: str | None
