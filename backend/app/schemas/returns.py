"""Esquemas del modulo de devoluciones (CU1 a CU11, docs/iconix/2do parcial SI2.md)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

TipoDevolucion = Literal["cambio_talla", "cambio_color", "cambio_medida", "cambio_producto", "devolucion", "nota_credito"]
EstadoDevolucion = Literal[
    "PendienteEntrega", "EnInspeccion", "EnRevision", "Aprobada", "CambioPendiente",
    "Completada", "Rechazada", "Anulada", "Cancelada",
]
MotivoCategoria = Literal["talla", "medida", "color", "defecto", "equivocado", "no_desea"]
ResultadoInspeccion = Literal["apta", "defectuosa", "deteriorada", "no_corresponde"]
MetodoReembolso = Literal["efectivo", "qr", "tarjeta"]
OpcionSinStock = Literal["traslado", "otra_sucursal", "espera", "nota_credito", "reembolso"]
SaldoAFavor = Literal["nota_credito", "reembolso"]


# --- CU1 / CU2: solicitud ---------------------------------------------------------

class ItemSolicitudIn(BaseModel):
    idProducto: int
    cantidad: int = Field(default=1, gt=0)


class RegistroTiendaIn(BaseModel):
    """CU1: el personal registra la solicitud; queda "EnInspeccion"."""

    idVenta: int
    # Sucursal receptora: la del actor (la venta pudo ser en otra o digital).
    codigoSucursal: int
    motivoCategoria: MotivoCategoria
    motivo: str | None = Field(default=None, max_length=255)
    # Resolucion que pide el cliente (puede cambiar al resolver).
    tipo: TipoDevolucion
    items: list[ItemSolicitudIn] = Field(min_length=1)


class SolicitudIn(BaseModel):
    """CU2: el cliente pide desde la tienda en linea; queda "PendienteEntrega"."""

    idVenta: int
    idProducto: int
    cantidad: int = Field(default=1, gt=0)
    motivoCategoria: MotivoCategoria
    motivo: str | None = Field(default=None, max_length=255)
    tipo: Literal["cambio_talla", "cambio_color", "cambio_producto", "devolucion", "nota_credito"]
    # Variante pedida: si hay existencia en la sucursal elegida, se aparta.
    idProductoNuevo: int | None = None
    codigoSucursal: int
    fotos: list[str] = Field(default_factory=list, max_length=5)


# --- CU3: inspeccion --------------------------------------------------------------

class ChecklistIn(BaseModel):
    etiquetas: bool = False
    sinUso: bool = False
    sinManchas: bool = False
    sinRoturas: bool = False
    accesorios: bool = False


class InspeccionIn(BaseModel):
    resultado: ResultadoInspeccion
    checklist: ChecklistIn = Field(default_factory=ChecklistIn)
    codigoEscaneado: str | None = Field(default=None, max_length=40)
    notasInspeccion: str | None = Field(default=None, max_length=255)
    fotos: list[str] = Field(default_factory=list, max_length=5)
    # Aprobacion parcial: unidades que pasan la inspeccion (el resto se rechaza).
    cantidadAprobada: int | None = Field(default=None, ge=0)
    # Prenda deteriorada con politica de descuento: el cliente decide.
    aceptaDescuento: bool = False
    # El cliente no acepta el resultado: pasa a revision del Administrador.
    disconforme: bool = False
    motivoRechazo: str | None = Field(default=None, max_length=255)


class RevisionIn(BaseModel):
    """CU3 flujo alternativo 5: el Administrador resuelve la disconformidad."""

    aprobada: bool
    motivo: str = Field(min_length=3, max_length=255)
    # Si se aprueba una prenda deteriorada, si se aplica el descuento de la politica.
    aplicarDescuento: bool = True


class AutorizacionIn(BaseModel):
    motivo: str | None = Field(default=None, max_length=255)


# --- CU4 a CU8: resolucion ---------------------------------------------------------

class ProductoCambioIn(BaseModel):
    idProducto: int
    cantidad: int = Field(default=1, gt=0)


class ResolucionIn(BaseModel):
    tipo: TipoDevolucion
    # CU4: la nueva variante (otra talla o color del mismo modelo).
    idProductoNuevo: int | None = None
    # CU5: uno o varios productos distintos.
    productos: list[ProductoCambioIn] = Field(default_factory=list)
    # Sucursal que entrega el cambio (por defecto, la receptora).
    codigoSucursal: int | None = None
    metodoReembolso: MetodoReembolso | None = None
    cuentaDestino: str | None = Field(default=None, max_length=120)
    # Pago ya registrado en caja por la diferencia (efectivo, tarjeta, QR o nota).
    idMetPagoDiferencia: int | None = None
    # Preferencia del cliente cuando la politica lo deja elegir.
    saldoAFavor: SaldoAFavor | None = None
    # CU8: que hacer si la variante no tiene existencia en la sucursal.
    sinStock: OpcionSinStock | None = None
    sucursalOrigen: int | None = None
    # CU4 flujo alternativo 5: orden de ajuste de medida.
    medidaOriginal: str | None = Field(default=None, max_length=60)
    medidaNueva: str | None = Field(default=None, max_length=60)
    fechaEntregaAjuste: date | None = None


class CompletarCambioIn(BaseModel):
    accion: Literal["entregar", "nota_credito", "reembolso"] = "entregar"
    codigoSucursal: int | None = None
    idMetPagoDiferencia: int | None = None
    saldoAFavor: SaldoAFavor | None = None
    metodoReembolso: MetodoReembolso | None = None
    cuentaDestino: str | None = Field(default=None, max_length=120)


class ConfirmarTransferenciaIn(BaseModel):
    comprobante: str = Field(min_length=3, max_length=150)


# --- Salidas ---------------------------------------------------------------------------

class EventoOut(BaseModel):
    fecha: datetime
    etapa: str
    detalle: str
    usuario: str | None = None


class DevolucionOut(BaseModel):
    idDevolucion: int
    codigo: str | None
    tipo: TipoDevolucion
    origen: Literal["tienda", "en_linea"]
    cantidad: int
    motivoCategoria: str | None
    motivo: str | None
    estado: EstadoDevolucion
    fecha: datetime
    fechaVenta: datetime
    fechaLimiteEntrega: datetime | None
    tallaOriginal: str | None
    tallaNueva: str | None
    medidaOriginal: str | None
    medidaNueva: str | None
    fechaEntregaAjuste: date | None
    valor: float
    recargo: float
    descuentoDeterioro: float
    credito: float
    montoDevuelto: float
    metodoReembolso: str | None
    estadoReembolso: str | None
    referenciaReembolso: str | None
    cuentaDestino: str | None
    diferencia: float
    idMetPagoDiferencia: int | None
    idVentaCambio: int | None
    idNotaCredito: int | None
    nota_codigo: str | None
    condicion: str | None
    checklist: dict | None
    codigoEscaneado: str | None
    notasInspeccion: str | None
    fotos: list[str]
    inspector_nombre: str | None
    fechaInspeccion: datetime | None
    destinoInventario: str | None
    motivoRechazo: str | None
    requiereAutorizacion: bool
    motivoAutorizacion: str | None
    autorizador_nombre: str | None
    fechaAutorizacion: datetime | None
    opcionSinStock: str | None
    sucursalEntrega: int | None
    sucursal_entrega_nombre: str | None
    fechaLlegadaEstimada: datetime | None
    fechaLimiteRetiro: datetime | None
    stockDisponibleReemplazo: int | None = None
    fechaResolucion: datetime | None
    idVenta: int
    idProducto: int
    producto_nombre: str | None
    producto_color: str | None
    producto_tipo: str | None
    idProductoNuevo: int | None
    producto_nuevo_nombre: str | None
    producto_nuevo_color: str | None
    precio_unitario: float | None
    idCliente: int
    cliente_nombre: str | None
    codigoSucursal: int | None
    sucursal_nombre: str | None
    idUsuario: int
    usuario_nombre: str | None
    politica_version: int | None


class DevolucionDetalleOut(DevolucionOut):
    """Detalle con la linea de tiempo (CU11 paso 5)."""

    lineaTiempo: list[EventoOut]


class ElegibilidadOut(BaseModel):
    estado: str
    puede: bool
    horasRestantes: float
    fechaLimite: datetime
    garantiaHasta: datetime
    recargo: float
    mensaje: str
    # Fuera del plazo de cambio pero dentro de la garantia: solo se admite
    # la solicitud por defecto de fabrica (CU1/CU2 flujo alternativo).
    soloDefecto: bool = False


class LineaDevolucionOut(BaseModel):
    idProducto: int
    producto: str
    talla: str | None
    color: str | None
    tipoPrenda: str | None
    codigoProducto: str
    cantidad: int
    precioPagado: float
    ocupadas: int
    disponibles: int
    recibidaPorCambio: bool
    elegibilidad: ElegibilidadOut
    solicitudAbierta: str | None


class VentaDevolucionOut(BaseModel):
    """Una venta con sus prendas y la elegibilidad de cada una (CU1 paso 4, CU2 paso 2)."""

    idVenta: int
    fecha: datetime
    idCliente: int
    cliente: str | None
    codigoSucursal: int | None
    sucursal: str | None
    formaPago: str | None
    total: float
    estadoDevolucion: Literal["Sin devoluciones", "Parcialmente devuelta", "Devuelta"]
    idTenant: int
    empresa: str | None
    politica_version: int | None
    lineas: list[LineaDevolucionOut]


class PoliticaIn(BaseModel):
    plazoCambioHoras: int = Field(ge=1, le=720)
    plazoGarantiaDias: int = Field(ge=1, le=730)
    accionFueraPlazo: Literal["rechazar", "recargo"]
    recargoTipo: Literal["porcentaje", "monto"]
    recargoValor: float = Field(ge=0)
    recargoUnidad: Literal["hora", "dia"]
    categoriasNoRetornables: list[str] = Field(default_factory=list)
    maxCambiosPorPrenda: int = Field(ge=1, le=20)
    saldoAFavor: Literal["reembolso", "nota_credito", "cliente_elige"]
    permiteReembolso: bool
    vigenciaNotaCreditoDias: int = Field(ge=1, le=730)
    respetarPrecioOriginal: bool
    umbralAutorizacion: float = Field(ge=0)
    maxDevolucionesMes: int = Field(ge=1, le=100)
    accionDeterioro: Literal["rechazar", "descuento"]
    descuentoDeterioroPct: float = Field(ge=0, le=100)
    permiteSolicitudEnLinea: bool
    diasEntregaEnLinea: int = Field(ge=1, le=60)
    diasRetiroCambio: int = Field(ge=1, le=60)
    costoAjusteMedida: float = Field(ge=0)
    condiciones: str = Field(min_length=10, max_length=1000)


class PoliticaOut(PoliticaIn):
    idTenant: int
    # 0: politica por defecto de la plataforma (la empresa no configuro una).
    version: int
    idPolitica: int | None
    vigenteDesde: datetime | None
    creadoEn: datetime | None
    creadoPor: str | None


class StockSucursalOut(BaseModel):
    codigoSucursal: int
    sucursal: str
    disponible: int


class NoVendibleOut(BaseModel):
    idNoVendible: int
    idProducto: int
    producto: str
    talla: str | None
    color: str | None
    codigoSucursal: int
    sucursal: str | None
    cantidad: int
    motivo: str
    estado: str
    proveedor: str | None
    observaciones: str | None
    fecha: datetime
    codigoCaso: str | None


class NoVendibleUpdateIn(BaseModel):
    estado: Literal["Pendiente", "Reclamado", "Repuesto", "Desechado"]
    observaciones: str | None = Field(default=None, max_length=255)


class InventarioDevolucionFila(BaseModel):
    idProducto: int
    producto: str
    talla: str | None
    color: str | None
    codigoSucursal: int | None
    sucursal: str | None
    vendible: int
    noVendible: int


class InventarioDevolucionOut(BaseModel):
    """CU10: a donde fueron las prendas devueltas."""

    vendible: int
    noVendible: int
    defecto: int
    deterioro: int
    porRecibir: int
    reclamosPendientes: int
    filas: list[InventarioDevolucionFila]
    noVendibles: list[NoVendibleOut]


class TasaOut(BaseModel):
    clave: str
    detalle: str | None = None
    vendidas: int
    devueltas: int
    tasa: float


class ConteoOut(BaseModel):
    clave: str
    detalle: str | None = None
    casos: int
    monto: float = 0


class AnalisisOut(BaseModel):
    """CU11 paso 4: indicadores de posventa."""

    casos: int
    unidadesDevueltas: int
    montoReembolsado: float
    notasEmitidas: int
    montoNotas: float
    cambios: int
    rechazadas: int
    porProducto: list[TasaOut]
    porTalla: list[TasaOut]
    motivos: list[ConteoOut]
    clientesFrecuentes: list[ConteoOut]


class QrOut(BaseModel):
    codigo: str
    modulos: list[str]


class FotoOut(BaseModel):
    url: str


# --- CU7: notas de credito ----------------------------------------------------------

class MovimientoNotaOut(BaseModel):
    idMovimiento: int
    tipo: str
    monto: float
    saldoResultante: float
    montoComplemento: float
    metodoComplemento: str | None
    idMetPago: int | None
    idVenta: int | None
    detalle: str | None
    fecha: datetime
    usuario: str | None


class NotaCreditoOut(BaseModel):
    idNotaCredito: int
    codigo: str
    monto: float
    saldo: float
    estado: Literal["Vigente", "Usada", "Anulada", "Vencida"]
    fechaEmision: datetime
    fechaVencimiento: datetime
    motivo: str | None
    motivoAnulacion: str | None
    idCliente: int
    cliente_nombre: str | None
    idDevolucion: int | None
    codigoDevolucion: str | None
    idTenant: int
    empresa: str | None
    movimientos: list[MovimientoNotaOut]


class CanjeIn(BaseModel):
    codigo: str = Field(min_length=4, max_length=20)
    # Total de la venta; si el saldo no alcanza, el resto se cobra con otro medio.
    montoTotal: float = Field(gt=0)
    idCliente: int
    metodoComplemento: Literal["efectivo", "qr"] | None = None


class CanjeOut(BaseModel):
    """Metodo de pago listo para usar en `POST /api/sales`."""

    idMetPago: int
    montoTotal: float
    montoNota: float
    montoComplemento: float
    metodoComplemento: str | None
    codigo: str
    saldoRestante: float


class AnulacionIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=255)


class ExtensionIn(BaseModel):
    fechaVencimiento: datetime
    motivo: str | None = Field(default=None, max_length=255)
