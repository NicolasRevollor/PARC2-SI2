"""Esquemas de la operacion sin conexion, la sincronizacion y la caja (CU12 a CU20)."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

TipoOperacion = Literal["venta", "reserva", "cancelar_reserva", "cambio", "custodia", "caja_apertura", "caja_cierre"]


# --- [CU17] Cola del dispositivo ---------------------------------------------

class OperacionIn(BaseModel):
    uuidOperacion: UUID
    tipo: TipoOperacion
    # Lo que el dispositivo cree: se compara con el token, nunca se usa como fuente (RNF02).
    idTenant: int | None = None
    # Quien la registro en el dispositivo ([CU24] alt. 3): puede no ser quien la envia.
    idUsuario: int | None = None
    codigoSucursal: int | None = None
    fechaOperacion: datetime
    dependeDe: UUID | None = None
    datos: dict


class LoteIn(BaseModel):
    operaciones: list[OperacionIn] = Field(min_length=1, max_length=200)


class ResultadoOperacionOut(BaseModel):
    uuidOperacion: str
    # Confirmada | Rechazada | En conflicto | Anulada | Reintentar | Desconocida
    estado: str
    idServidor: int | None = None
    motivo: str | None = None
    tipoConflicto: str | None = None


class LoteOut(BaseModel):
    resultados: list[ResultadoOperacionOut]
    fechaServidor: datetime


class EstadoOperacionesIn(BaseModel):
    uuids: list[UUID] = Field(max_length=500)


# --- Contenido de cada operacion ---------------------------------------------

class ClienteNuevoIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    ci: str = Field(min_length=3, max_length=20)


class ItemOfflineIn(BaseModel):
    idProducto: int
    cantidad: int = Field(gt=0)
    precioUnitario: float = Field(ge=0)
    nombre: str | None = None
    stockNoConfirmado: bool = False


class DatosCliente(BaseModel):
    idCliente: int | None = None
    clienteNuevo: ClienteNuevoIn | None = None


class DatosVenta(DatosCliente):
    """[CU14] paso 7."""

    items: list[ItemOfflineIn] = Field(min_length=1)
    total: float = Field(ge=0)
    formaPago: str = "Efectivo"
    montoRecibido: float = Field(ge=0)
    uuidCaja: UUID | None = None

    @model_validator(mode="after")
    def validar_cobro(self):
        ids = [item.idProducto for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Una prenda debe aparecer una sola vez en la venta")

        centavo = Decimal("0.01")
        total_lineas = sum(
            (Decimal(str(item.precioUnitario)).quantize(centavo) * item.cantidad for item in self.items),
            Decimal("0.00"),
        ).quantize(centavo)
        total_declarado = Decimal(str(self.total)).quantize(centavo)
        recibido = Decimal(str(self.montoRecibido)).quantize(centavo)
        if total_declarado != total_lineas:
            raise ValueError("El total no coincide con el importe de las prendas")
        if recibido < total_declarado:
            raise ValueError("El monto recibido no cubre el total de la venta")
        return self


class DatosReserva(DatosCliente):
    """[CU15] paso 6."""

    items: list[ItemOfflineIn] = Field(min_length=1)
    fechaLimite: datetime
    deposito: float = Field(default=0, ge=0)
    uuidCaja: UUID | None = None

    @model_validator(mode="after")
    def validar_items_unicos(self):
        ids = [item.idProducto for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Una prenda debe aparecer una sola vez en la reserva")
        return self


class DatosCancelarReserva(BaseModel):
    """[CU15] flujo alternativo 3."""

    uuidReserva: UUID | None = None
    codigoReserva: int | None = None
    devolverDeposito: float = Field(default=0, ge=0)
    uuidCaja: UUID | None = None


class DatosCambio(BaseModel):
    """[CU19] paso 6."""

    idVenta: int | None = None
    uuidVenta: UUID | None = None
    idProducto: int
    idProductoNuevo: int
    cantidad: int = Field(default=1, gt=0)
    tipo: Literal["cambio_talla", "cambio_color"] = "cambio_talla"
    motivoCategoria: str = "talla"
    motivo: str | None = None
    condicion: Literal["apta", "defectuosa", "deteriorada"] = "apta"
    diferencia: float = 0
    montoCobrado: float = Field(default=0, ge=0)
    uuidCaja: UUID | None = None


class DatosCustodia(BaseModel):
    """[CU19] flujo alternativo 3: la prenda queda en custodia sin venta local."""

    comprobante: str | None = None
    clienteNombre: str = Field(min_length=2, max_length=100)
    ci: str | None = None
    descripcionPrenda: str = Field(min_length=2, max_length=200)
    observaciones: str | None = None


class DatosAperturaCaja(BaseModel):
    montoInicial: float = Field(ge=0)


class DatosCierreCaja(BaseModel):
    uuidCaja: UUID | None = None
    efectivoContado: float = Field(ge=0)
    justificacion: str | None = None
    pendientes: list[UUID] = []


# --- [CU12] Preparacion ------------------------------------------------------

class ConfiguracionOut(BaseModel):
    horasDatosVigentes: int
    horasSesionSinConexion: int
    permiteVentaSinStock: bool
    umbralDiferenciaCaja: float
    umbralConflicto: float
    horasRetiroReserva: int


class ConfiguracionIn(BaseModel):
    horasDatosVigentes: int = Field(gt=0, le=720)
    horasSesionSinConexion: int = Field(gt=0, le=720)
    permiteVentaSinStock: bool
    umbralDiferenciaCaja: float = Field(ge=0)
    umbralConflicto: float = Field(ge=0)
    horasRetiroReserva: int = Field(gt=0, le=720)


class PreparacionOut(BaseModel):
    idTenant: int
    codigoSucursal: int
    sucursalNombre: str
    idClienteGenerico: int
    configuracion: ConfiguracionOut
    # Cuantas filas tiene cada seccion: permite estimar el espacio y mostrar el avance.
    secciones: dict[str, int]
    generadoEn: datetime


class PaginaSnapshotOut(BaseModel):
    seccion: str
    pagina: int
    total: int
    hayMas: bool
    items: list[dict]


# --- [CU18] Conflictos -------------------------------------------------------

class ConflictoOut(BaseModel):
    idConflicto: int
    uuidOperacion: str
    tipoOperacion: str
    tipoConflicto: str
    etiqueta: str
    motivo: str
    monto: float
    estado: str
    resultado: str | None
    decision: str | None
    observaciones: str | None
    alertaDiscrepancia: bool
    idReferencia: int | None
    codigoSucursal: int | None
    sucursal: str | None
    usuario: str | None
    fechaOperacion: datetime | None
    fechaRegistro: datetime
    fechaResolucion: datetime | None
    datosDispositivo: dict
    datosServidor: dict
    decisiones: list[str]
    soloAdministrador: bool


class ResolverConflictoIn(BaseModel):
    decision: str
    observaciones: str | None = Field(default=None, max_length=255)
    # Reserva: reasignar a otra variante o sucursal.
    idProductoNuevo: int | None = None
    codigoSucursalNueva: int | None = None
    # Custodia: venta donde se registra la prenda recibida.
    idVenta: int | None = None
    idProducto: int | None = None


# --- [CU20] Caja -------------------------------------------------------------

class AbrirCajaIn(BaseModel):
    codigoSucursal: int
    montoInicial: float = Field(ge=0)


class CerrarCajaIn(BaseModel):
    efectivoContado: float = Field(ge=0)
    justificacion: str | None = Field(default=None, max_length=255)
    # UUID de lo que el dispositivo todavia no pudo confirmar (flujo alternativo 2).
    operacionesPendientes: list[UUID] = []


class ResumenConceptoOut(BaseModel):
    tipo: str
    concepto: str
    etiqueta: str
    monto: float
    cantidad: int


class MovimientoCajaOut(BaseModel):
    idMovimientoCaja: int
    tipo: str
    concepto: str
    etiqueta: str
    monto: float
    referencia: str | None
    fecha: datetime
    usuario: str | None


class CajaOut(BaseModel):
    idCaja: int
    uuidOperacion: str
    origenRegistro: str
    codigoSucursal: int
    sucursal: str | None
    estado: str
    montoInicial: float
    fechaApertura: datetime
    usuarioApertura: str | None
    fechaCierre: datetime | None
    usuarioCierre: str | None
    efectivoContado: float | None
    ingresos: float
    egresos: float
    montoEsperado: float
    diferencia: float | None
    justificacion: str | None
    aprobador: str | None
    operacionesPendientes: int
    resumen: list[ResumenConceptoOut]
    umbralDiferencia: float
