from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CiudadOut(ORMModel):
    idCiudad: int
    nombCiudad: str


class CiudadIn(BaseModel):
    nombCiudad: str


class CiudadUpdate(BaseModel):
    nombCiudad: Optional[str] = None


class TemporadaOut(ORMModel):
    idTemporada: int
    nombreTemporada: str
    fecha_ini: date
    fecha_fin: date


class TemporadaIn(BaseModel):
    nombreTemporada: str
    fecha_ini: date
    fecha_fin: date


class TemporadaUpdate(BaseModel):
    nombreTemporada: Optional[str] = None
    fecha_ini: Optional[date] = None
    fecha_fin: Optional[date] = None


class ColeccionOut(ORMModel):
    idColeccion: int
    nombre_coleccion: str
    idTemporada: int
    temporada_nombre: Optional[str] = None


class ColeccionIn(BaseModel):
    nombre_coleccion: str
    idTemporada: int


class ColeccionUpdate(BaseModel):
    nombre_coleccion: Optional[str] = None
    idTemporada: Optional[int] = None


class ProveedorOut(ORMModel):
    idProveedor: int
    nombre: str
    telefono: Optional[str] = None
    correo: Optional[str] = None


class ProveedorIn(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    correo: Optional[str] = None


class ProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None


class SucursalOut(ORMModel):
    codigoSucursal: int
    nombre: str
    direccion: str
    idCiudad: int
    ciudad_nombre: Optional[str] = None


class SucursalIn(BaseModel):
    nombre: str
    direccion: str
    idCiudad: int


class SucursalUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    idCiudad: Optional[int] = None


class ClienteOut(ORMModel):
    idCliente: int
    nombre: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    idUser: int
    altura: Optional[int] = None
    pecho: Optional[int] = None
    cintura: Optional[int] = None
    tiro: Optional[int] = None


class ClienteFull(ClienteOut):
    correo: Optional[str] = None


class ClienteCreate(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    idUser: int


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    idUser: Optional[int] = None


class ClienteMeUpdate(BaseModel):
    # Autogestion (GET/PUT /api/customers/me): nunca acepta idUser ni correo
    # — esos cambian por otro flujo (o nunca), no por edicion de perfil.
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    # Medidas biometricas (CU11 — determinar si una prenda le queda al
    # cliente). En cm. `None`/ausente nunca borra un valor ya guardado
    # (mismo criterio exclude_unset que el resto del perfil).
    altura: Optional[int] = None
    pecho: Optional[int] = None
    cintura: Optional[int] = None
    tiro: Optional[int] = None


class MetodoPagoOut(ORMModel):
    idMetPago: int
    tipo: str
    estado: str
    fecha: datetime
    monto: float
    stripePaymentIntentId: Optional[str] = None
    moneda: Optional[str] = None
    estadoStripe: Optional[str] = None
    origen: Optional[str] = None


class MetodoPagoIn(BaseModel):
    tipo: str
    estado: str = "Activo"
    monto: float = 0.00


class MetodoPagoUpdate(BaseModel):
    tipo: Optional[str] = None
    estado: Optional[str] = None
    monto: Optional[float] = None


class DetalleVentaIn(BaseModel):
    idProducto: int
    cantidad: int


class VentaIn(BaseModel):
    idCliente: Optional[int] = None       # staff only; derivado del JWT para un Cliente
    idMetPago: int
    codigoSucursal: Optional[int] = None  # None => el backend resuelve la sucursal
    items: list[DetalleVentaIn]


class DetalleVentaOut(BaseModel):
    codigoVenta: int
    cantidad: int
    precio_unitario: float
    idProducto: int
    producto_nombre: Optional[str] = None
    idVenta: int


class VentaOut(ORMModel):
    idVenta: int
    fecha: datetime
    total: float
    idCliente: int
    idMetPago: int
    detalles: list[DetalleVentaOut] = []


class ReservaIn(BaseModel):
    fecha: date
    horario: str
    idCliente: int | None = None
    codigoSucursal: int
    idProducto: int
    idMetPago: int  # anticipo verificado (CU12) — obligatorio, sin excepcion


class ReservaOut(ORMModel):
    codigoReserva: int
    fecha: date
    horario: str
    estado: str
    idCliente: int
    codigoSucursal: int
    idProducto: int
    producto_nombre: Optional[str] = None
    sucursal_nombre: Optional[str] = None
    idMetPago: Optional[int] = None
    montoDeposito: Optional[float] = None


class ReservaStatusOut(ReservaOut):
    pass


class ReservaConfirmarIn(BaseModel):
    idMetPago: int


class RecomendacionOut(ORMModel):
    idRecomendacion: int
    nombre: str
    importancia: Optional[str] = None
    idCliente: int
    idProducto: Optional[int] = None
    producto_nombre: Optional[str] = None


class RecomendacionIn(BaseModel):
    nombre: str
    importancia: str = "Media"
    idCliente: int
    idProducto: Optional[int] = None


class RecomendacionUpdate(BaseModel):
    nombre: Optional[str] = None
    importancia: Optional[str] = None
    idCliente: Optional[int] = None
    idProducto: Optional[int] = None


class PurchaseHistoryItem(BaseModel):
    idVenta: int
    fecha: datetime
    total: float
    idProducto: int
    producto_nombre: Optional[str] = None
    cantidad: int
    precio_unitario: float
    codigoHistorial: Optional[int] = None


class LogOut(BaseModel):
    idBitacora: int
    accion: str
    hora: str
    fecha: date
    ip: str
    idUser: int
    usuario_nombre: Optional[str] = None


class DetallePagoItem(BaseModel):
    idProducto: int
    cantidad: int


class PagoIntentIn(BaseModel):
    items: list[DetallePagoItem]
    claveIntento: UUID
    concepto: Optional[str] = None
    # CU12: "venta" preserva el comportamiento POS/CU17 byte-a-byte (default).
    # "reserva_deposito" activa la rama de anticipo del 10% en payments.py;
    # requiere codigoSucursal (D2) para el chequeo de stock branch-scoped.
    proposito: Literal["venta", "reserva_deposito"] = "venta"
    codigoSucursal: Optional[int] = None


class PagoIntentOut(BaseModel):
    paymentIntentId: str
    clientSecret: str
    monto: float


class PagoIntentVerificadoOut(BaseModel):
    paymentIntentId: str
    estado: str
    pagado: bool
    idMetPago: Optional[int] = None
    monto: Optional[float] = None
