from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProveedorOut(ORMModel):
    idProveedor: int
    nombre: str
    telefono: Optional[str] = None
    correo: Optional[str] = None


class TemporadaOut(ORMModel):
    idTemporada: int
    nombreTemporada: str
    fecha_ini: date
    fecha_fin: date


class ColeccionOut(ORMModel):
    idColeccion: int
    nombre_coleccion: str
    idTemporada: int

    @classmethod
    def from_orm(cls, instance):
        return cls(
            idColeccion=instance.idColeccion,
            nombre_coleccion=instance.nombre_coleccion,
            idTemporada=instance.idTemporada,
        )


class ProductoIn(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    costo: float = 0.00
    venta: float = 0.00
    tipo: Optional[str] = None
    talla: Optional[str] = None
    color: Optional[str] = None
    idProveedor: int
    idColeccion: int
    imagen_url: Optional[str] = None
    imagenes_secundarias: Optional[list[str]] = []
    # Medidas REALES de la prenda en cm (migracion 025). Con ellas el sistema dice si una talla
    # es mas grande o mas chica que otra al hacer un cambio (una "L" oversize no mide como una "L" normal).
    medidaPechoCm: Optional[int] = Field(default=None, ge=1, le=300)
    medidaLargoCm: Optional[int] = Field(default=None, ge=1, le=300)
    medidaCinturaCm: Optional[int] = Field(default=None, ge=1, le=300)


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    costo: Optional[float] = None
    venta: Optional[float] = None
    tipo: Optional[str] = None
    talla: Optional[str] = None
    color: Optional[str] = None
    idProveedor: Optional[int] = None
    idColeccion: Optional[int] = None
    imagen_url: Optional[str] = None
    imagenes_secundarias: Optional[list[str]] = None
    # Medidas REALES de la prenda en cm (migracion 025). Con ellas el sistema dice si una talla
    # es mas grande o mas chica que otra al hacer un cambio (una "L" oversize no mide como una "L" normal).
    medidaPechoCm: Optional[int] = Field(default=None, ge=1, le=300)
    medidaLargoCm: Optional[int] = Field(default=None, ge=1, le=300)
    medidaCinturaCm: Optional[int] = Field(default=None, ge=1, le=300)


class ProductoOut(BaseModel):
    idProducto: int
    nombre: str
    descripcion: Optional[str] = None
    costo: float
    venta: float
    tipo: Optional[str] = None
    talla: Optional[str] = None
    color: Optional[str] = None
    idProveedor: int
    idColeccion: int
    proveedor_nombre: Optional[str] = None
    coleccion_nombre: Optional[str] = None
    imagen_url: Optional[str] = None
    imagenes_secundarias: list[str] = []
    # Modelo al que pertenece esta variante (migracion 023).
    idModelo: Optional[int] = None
    # Medidas reales en cm (migracion 025).
    medidaPechoCm: Optional[int] = None
    medidaLargoCm: Optional[int] = None
    medidaCinturaCm: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ImagenUploadOut(BaseModel):
    imagen_url: str


class PaginatedProductos(BaseModel):
    items: list[ProductoOut]
    total: int
    page: int
    size: int
    pages: int
