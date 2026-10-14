from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LocationOut(BaseModel):
    codigoSucursal: int
    nombre: str
    direccion: str
    ciudad: str

    @classmethod
    def from_row(cls, sucursal, ciudad_nombre: str):
        return cls(
            codigoSucursal=sucursal.codigoSucursal,
            nombre=sucursal.nombre,
            direccion=sucursal.direccion,
            ciudad=ciudad_nombre,
        )


class StockOut(BaseModel):
    idInv: int
    cantidad_actual: int
    cantidad_reservada: int
    codigoSucursal: int
    sucursal_nombre: Optional[str] = None
    idProducto: int
    producto_nombre: Optional[str] = None
    producto_tipo: Optional[str] = None
    producto_talla: Optional[str] = None
    producto_color: Optional[str] = None
    producto_imagen: Optional[str] = None


class StockAdjustIn(BaseModel):
    cantidad: int = Field(..., description="Valor absoluto del ajuste")
    tipo: str = "ajuste"
    motivo: Optional[str] = None
    signo: str = Field("set", description="set | add | subtract: como aplicar la cantidad")


class StockIngresoIn(BaseModel):
    idProducto: int
    codigoSucursal: int
    cantidad: int = Field(..., gt=0)
    idProveedor: Optional[int] = None
    motivo: Optional[str] = None
