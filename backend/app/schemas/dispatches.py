from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DispatchItemIn(BaseModel):
    idProducto: int
    cantidad: int


class DispatchIn(BaseModel):
    origen: int
    destino: int
    items: list[DispatchItemIn]
    motivo: Optional[str] = None


class DispatchItemOut(BaseModel):
    idProducto: int
    producto_nombre: Optional[str] = None
    cantidad: int


class DispatchOut(BaseModel):
    referencia: str
    motivo: Optional[str] = None
    fecha: datetime
    movimientos: list["MovimientoOut"]


class MovimientoOut(BaseModel):
    idMov: int
    tipo: str
    cantidad: int
    fecha: datetime
    motivo: Optional[str] = None
    idInv: int
    sucursal_nombre: Optional[str] = None
    idProducto: Optional[int] = None
    producto_nombre: Optional[str] = None


DispatchOut.model_rebuild()
