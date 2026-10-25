from datetime import datetime, date, time, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, ARRAY, JSONB
from sqlalchemy import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _ahora_utc() -> datetime:
    # Con zona: asyncpg convierte un datetime naive a UTC asumiendo la hora
    # local de la maquina, y en una PC en Bolivia (UTC-4) cada fecha quedaba
    # guardada 4 h en el futuro.
    return datetime.now(timezone.utc)


# Migracion 014 — multitenencia por columna discriminante. Las entidades raiz
# llevan "idTenant" con DEFAULT 1 (el tenant de la operacion ya existente), de
# modo que todo INSERT previo que no lo setee sigue siendo valido.
TENANT_POR_DEFECTO = 1


class Plan(Base):
    """Catalogo de planes de suscripcion (Free Lite / Basico / Intermedio /
    Avanzado). Un limite en -1 significa ILIMITADO (ver services/tenancy.py)."""

    __tablename__ = "plan"

    idPlan: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(60), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String(255))
    precioMensual: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    maxSucursales: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    maxUsuarios: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    maxProductos: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    permiteIA: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permiteOffline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permiteMultiSucursal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    soloLocal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Tenant(Base):
    __tablename__ = "tenant"

    idTenant: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="Activo", nullable=False)
    fechaAlta: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idPlan: Mapped[int] = mapped_column(ForeignKey("plan.idPlan", onupdate="CASCADE"), nullable=False)

    plan: Mapped["Plan"] = relationship()


class Ciudad(Base):
    __tablename__ = "Ciudad"

    idCiudad: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombCiudad: Mapped[str] = mapped_column(String(100), nullable=False)

    sucursales: Mapped[list["Sucursal"]] = relationship(back_populates="ciudad")


class Permiso(Base):
    __tablename__ = "permiso"

    idPermiso: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombrePermiso: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


class Rol(Base):
    __tablename__ = "rol"

    codigoRol: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombreRol: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    asignaciones: Mapped[list["AsignacionPermiso"]] = relationship(back_populates="rol")


class AsignacionPermiso(Base):
    __tablename__ = "asignacion_permiso"
    __table_args__ = (UniqueConstraint("codigoRol", "idPermiso", name="uq_rol_permiso"),)

    idRolPermiso: Mapped[int] = mapped_column(Integer, primary_key=True)
    fechaAsignacion: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="Activo", nullable=False)
    codigoRol: Mapped[int] = mapped_column(ForeignKey("rol.codigoRol", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idPermiso: Mapped[int] = mapped_column(ForeignKey("permiso.idPermiso", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)

    rol: Mapped["Rol"] = relationship(back_populates="asignaciones")
    permiso: Mapped["Permiso"] = relationship()


class Usuario(Base):
    __tablename__ = "Usuario"

    idUser: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    correo: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    contraseña: Mapped[str] = mapped_column(String(255), nullable=False)
    codigoRol: Mapped[int] = mapped_column(ForeignKey("rol.codigoRol", onupdate="CASCADE"), nullable=False)
    intentosFallidos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bloqueadoHasta: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    vecesBloqueado: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    requiereActivacion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )

    rol: Mapped["Rol"] = relationship()


class Sucursal(Base):
    __tablename__ = "Sucursal"
    __table_args__ = (Index("idx_sucursal_ciudad", "idCiudad"),)

    codigoSucursal: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    idCiudad: Mapped[int] = mapped_column(ForeignKey("Ciudad.idCiudad", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )

    ciudad: Mapped["Ciudad"] = relationship(back_populates="sucursales")
    inventarios: Mapped[list["Inventario"]] = relationship(back_populates="sucursal")


class Temporada(Base):
    __tablename__ = "Temporada"
    __table_args__ = (
        CheckConstraint("fecha_fin >= fecha_ini", name="chk_temporada_fechas"),
        Index("idx_temporada_fechas", "fecha_ini", "fecha_fin"),
    )

    idTemporada: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombreTemporada: Mapped[str] = mapped_column(String(100), nullable=False)
    fecha_ini: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )


class Colecciones(Base):
    __tablename__ = "Colecciones"
    __table_args__ = (Index("idx_coleccion_temporada", "idTemporada"),)

    idColeccion: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre_coleccion: Mapped[str] = mapped_column(String(100), nullable=False)
    idTemporada: Mapped[int] = mapped_column(ForeignKey("Temporada.idTemporada", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )

    temporada: Mapped["Temporada"] = relationship()


class Proveedor(Base):
    __tablename__ = "Proveedor"
    __table_args__ = (Index("idx_proveedor_nombre", "nombre"),)

    idProveedor: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20))
    correo: Mapped[str | None] = mapped_column(String(100))
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )

    productos: Mapped[list["Producto"]] = relationship(back_populates="proveedor")


class Producto(Base):
    __tablename__ = "producto"
    __table_args__ = (
        CheckConstraint("venta >= 0 AND costo >= 0", name="chk_producto_precios"),
        Index("idx_producto_busqueda", "nombre", "tipo", "talla", "color"),
        Index("idx_producto_proveedor", "idProveedor"),
        Index("idx_producto_coleccion", "idColeccion"),
    )

    idProducto: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    costo: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    venta: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(50))
    talla: Mapped[str | None] = mapped_column(String(20))
    color: Mapped[str | None] = mapped_column(String(50))
    idProveedor: Mapped[int] = mapped_column(ForeignKey("Proveedor.idProveedor", onupdate="CASCADE"), nullable=False)
    idColeccion: Mapped[int] = mapped_column(ForeignKey("Colecciones.idColeccion", onupdate="CASCADE"), nullable=False)

    imagen_url: Mapped[str | None] = mapped_column(Text)
    imagenes_secundarias: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=lambda: [])
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )

    proveedor: Mapped["Proveedor"] = relationship(back_populates="productos")
    coleccion: Mapped["Colecciones"] = relationship()
    inventarios: Mapped[list["Inventario"]] = relationship(back_populates="producto")


class Cliente(Base):
    __tablename__ = "Cliente"

    idCliente: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20))
    direccion: Mapped[str | None] = mapped_column(String(255))
    idUser: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", ondelete="CASCADE", onupdate="CASCADE"), unique=True, nullable=False)
    altura: Mapped[int | None] = mapped_column(Integer)
    pecho: Mapped[int | None] = mapped_column(Integer)
    cintura: Mapped[int | None] = mapped_column(Integer)
    tiro: Mapped[int | None] = mapped_column(Integer)


class Inventario(Base):
    __tablename__ = "Inventario"
    __table_args__ = (
        CheckConstraint("cantidad_actual >= 0 AND cantidad_reservada >= 0", name="chk_inv_cantidades"),
        UniqueConstraint("codigoSucursal", "idProducto", name="uq_sucursal_producto"),
    )

    idInv: Mapped[int] = mapped_column(Integer, primary_key=True)
    cantidad_actual: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cantidad_reservada: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    codigoSucursal: Mapped[int] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"), nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)

    sucursal: Mapped["Sucursal"] = relationship(back_populates="inventarios")
    producto: Mapped["Producto"] = relationship(back_populates="inventarios")
    movimientos: Mapped[list["Movimiento"]] = relationship(back_populates="inventario")


class Movimiento(Base):
    __tablename__ = "Movimiento"
    __table_args__ = (Index("idx_movimiento_inv_fecha", "idInv", "fecha"),)

    idMov: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(255))
    idInv: Mapped[int] = mapped_column(ForeignKey("Inventario.idInv", onupdate="CASCADE"), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(50))

    inventario: Mapped["Inventario"] = relationship(back_populates="movimientos")


class MetodoPago(Base):
    __tablename__ = "metodo_pago"

    idMetPago: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), default="Activo", nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    stripePaymentIntentId: Mapped[str | None] = mapped_column(String(255))
    moneda: Mapped[str | None] = mapped_column(String(3))
    estadoStripe: Mapped[str | None] = mapped_column(String(30))
    origen: Mapped[str | None] = mapped_column(String(20))
    idUserPago: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"))
    # Migracion 010 (correccion review CU12) — ligadura producto/sucursal de
    # un anticipo de reserva verificado (NULL para filas de venta/POS) y
    # marca atomica de un-solo-uso (reemplaza el chequeo por SELECT suelto).
    idProducto: Mapped[int | None] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"))
    codigoSucursal: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"))
    consumidoEn: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class Reserva(Base):
    __tablename__ = "Reserva"
    __table_args__ = (
        Index("idx_reserva_cliente", "idCliente"),
        Index("idx_reserva_estado_fecha", "estado", "fecha"),
    )

    codigoReserva: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    horario: Mapped[time] = mapped_column(Time, nullable=False)
    estado: Mapped[str] = mapped_column(String(30), default="Pendiente", nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    codigoSucursal: Mapped[int] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"), nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    # Migracion 009 (CU12) — ambas nullable, inertes para reservas anteriores.
    # "montoDeposito" es un snapshot inmutable de MetodoPago.monto al momento
    # de la verificacion: NUNCA se relee MetodoPago.monto en vivo (ver
    # migracion 009 y D3 en design.md).
    idMetPago: Mapped[int | None] = mapped_column(ForeignKey("metodo_pago.idMetPago", onupdate="CASCADE"))
    montoDeposito: Mapped[float | None] = mapped_column(Numeric(10, 2))


class Venta(Base):
    __tablename__ = "Venta"
    __table_args__ = (
        CheckConstraint("total >= 0", name="chk_venta_total"),
        Index("idx_venta_fecha", "fecha"),
        Index("idx_venta_cliente", "idCliente"),
    )

    idVenta: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idMetPago: Mapped[int] = mapped_column(ForeignKey("metodo_pago.idMetPago", onupdate="CASCADE"), nullable=False)


class DetalleVenta(Base):
    __tablename__ = "detalle_venta"
    __table_args__ = (
        CheckConstraint("cantidad > 0", name="chk_detalle_cantidad"),
        Index("idx_detalle_venta", "idVenta"),
        Index("idx_detalle_producto", "idProducto"),
    )

    codigoVenta: Mapped[int] = mapped_column(Integer, primary_key=True)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    idVenta: Mapped[int] = mapped_column(ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    codigoReserva: Mapped[int | None] = mapped_column(ForeignKey("Reserva.codigoReserva", ondelete="SET NULL", onupdate="CASCADE"))


class Bitacora(Base):
    __tablename__ = "Bitacora"
    __table_args__ = (Index("idx_bitacora_fecha_user", "fecha", "idUser"),)

    idBitacora: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    accion: Mapped[str] = mapped_column(String(150), nullable=False)
    hora: Mapped[time] = mapped_column(Time, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    ip: Mapped[str] = mapped_column(INET, nullable=False)
    idUser: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", ondelete="CASCADE"), nullable=False)


class Recomendaciones(Base):
    __tablename__ = "Recomendaciones"
    __table_args__ = (Index("idx_recomendacion_cliente", "idCliente"),)

    idRecomendacion: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    importancia: Mapped[str] = mapped_column(String(30), default="Media")
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    # Migracion 012 (CU22) — nullable: filas creadas por staff antes de esta
    # migracion no tenian vinculo real al catalogo.
    idProducto: Mapped[int | None] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"))


class Historial(Base):
    __tablename__ = "historial"
    __table_args__ = (Index("idx_historial_busqueda", "idCliente", "idProducto"),)

    codigoHistorial: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idVenta: Mapped[int] = mapped_column(ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)


class Respaldo(Base):
    """Registro de un respaldo (backup) de UNA empresa (migracion 018). El
    archivo vive en el bucket privado de respaldos o en disco local; aca solo
    queda donde esta y como salio."""

    __tablename__ = "respaldo"
    __table_args__ = (
        CheckConstraint("tipo IN ('manual', 'automatico')", name="chk_respaldo_tipo"),
        CheckConstraint("estado IN ('Completado', 'Fallido')", name="chk_respaldo_estado"),
        CheckConstraint("almacenamiento IN ('supabase', 'local')", name="chk_respaldo_almacenamiento"),
        Index("idx_respaldo_tenant_fecha", "idTenant", "creadoEn"),
    )

    idRespaldo: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    estado: Mapped[str] = mapped_column(String(12), nullable=False)
    almacenamiento: Mapped[str] = mapped_column(String(10), nullable=False)
    ruta: Mapped[str | None] = mapped_column(String(255))
    tamanoBytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    filas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(String(500))
    creadoEn: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    idUsuario: Mapped[int | None] = mapped_column(
        ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE")
    )


class Devolucion(Base):
    """Caso de devolucion o cambio (migraciones 015 y 022). "fechaVenta" es un
    snapshot inmutable de Venta.fecha tomado al registrar el caso: el plazo de
    la politica queda auditado en la propia fila y no depende de releer la
    venta.

    Estados (docs/iconix/2do parcial SI2.md): en tienda nace "EnInspeccion"
    (CU1) y en linea "PendienteEntrega" (CU2); la inspeccion (CU3) lo deja
    "Aprobada", "Rechazada" o "EnRevision"; la resolucion (CU4 a CU8) lo deja
    "Completada" o "CambioPendiente". "Anulada" es una solicitud en linea que
    no se entrego a tiempo y "Cancelada", una que el cliente desistio."""

    __tablename__ = "devolucion"
    __table_args__ = (
        CheckConstraint(
            "tipo IN ('cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto', 'devolucion', 'nota_credito')",
            name="chk_devolucion_tipo",
        ),
        CheckConstraint("cantidad > 0", name="chk_devolucion_cantidad"),
        Index("idx_devolucion_cliente_fecha", "idCliente", "fecha"),
        Index("idx_devolucion_tenant_fecha", "idTenant", "fecha"),
    )

    idDevolucion: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(255))
    estado: Mapped[str] = mapped_column(String(20), default="Completada", nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaVenta: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    tallaOriginal: Mapped[str | None] = mapped_column(String(20))
    tallaNueva: Mapped[str | None] = mapped_column(String(20))
    medidaOriginal: Mapped[str | None] = mapped_column(String(60))
    medidaNueva: Mapped[str | None] = mapped_column(String(60))
    montoDevuelto: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    idVenta: Mapped[int] = mapped_column(
        ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    idProductoNuevo: Mapped[int | None] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"))
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    codigoSucursal: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"))
    idUsuario: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )
    # Migracion 022: flujo completo de posventa.
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    origen: Mapped[str] = mapped_column(String(10), default="tienda", nullable=False)
    motivoCategoria: Mapped[str | None] = mapped_column(String(12))
    precioPagado: Mapped[float | None] = mapped_column(Numeric(12, 2))
    idPolitica: Mapped[int | None] = mapped_column(
        ForeignKey("politica_devolucion.idPolitica", ondelete="SET NULL", onupdate="CASCADE")
    )
    recargo: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    requiereAutorizacion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivoAutorizacion: Mapped[str | None] = mapped_column(String(255))
    idAutorizador: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"))
    fechaAutorizacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaLimiteEntrega: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fotos: Mapped[list[str]] = mapped_column(ARRAY(Text), default=lambda: [], nullable=False)
    condicion: Mapped[str | None] = mapped_column(String(15))
    checklist: Mapped[dict | None] = mapped_column(JSONB)
    codigoEscaneado: Mapped[str | None] = mapped_column(String(40))
    notasInspeccion: Mapped[str | None] = mapped_column(String(255))
    idInspector: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"))
    fechaInspeccion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    descuentoDeterioro: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    motivoRechazo: Mapped[str | None] = mapped_column(String(255))
    destinoInventario: Mapped[str | None] = mapped_column(String(12))
    diferencia: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    idMetPagoDiferencia: Mapped[int | None] = mapped_column(ForeignKey("metodo_pago.idMetPago", onupdate="CASCADE"))
    idVentaCambio: Mapped[int | None] = mapped_column(ForeignKey("Venta.idVenta", onupdate="CASCADE"))
    fechaEntregaAjuste: Mapped[date | None] = mapped_column(Date)
    sucursalEntrega: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"))
    idInvReservado: Mapped[int | None] = mapped_column(ForeignKey("Inventario.idInv", onupdate="CASCADE"))
    opcionSinStock: Mapped[str | None] = mapped_column(String(14))
    fechaLlegadaEstimada: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaLimiteRetiro: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    metodoReembolso: Mapped[str | None] = mapped_column(String(12))
    estadoReembolso: Mapped[str | None] = mapped_column(String(22))
    referenciaReembolso: Mapped[str | None] = mapped_column(String(150))
    cuentaDestino: Mapped[str | None] = mapped_column(String(120))
    idNotaCredito: Mapped[int | None] = mapped_column(
        ForeignKey("nota_credito.idNotaCredito", ondelete="SET NULL", onupdate="CASCADE")
    )
    fechaResolucion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class PoliticaDevolucion(Base):
    """Una version de la politica de devoluciones de una empresa (CU9). Cada
    venta usa la version vigente al momento de la venta; si la empresa nunca
    configuro una, rige la de la plataforma (app/services/devoluciones.py)."""

    __tablename__ = "politica_devolucion"
    __table_args__ = (UniqueConstraint("idTenant", "version", name="uq_politica_version"),)

    idPolitica: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    vigenteDesde: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    plazoCambioHoras: Mapped[int] = mapped_column(Integer, nullable=False)
    plazoGarantiaDias: Mapped[int] = mapped_column(Integer, nullable=False)
    accionFueraPlazo: Mapped[str] = mapped_column(String(10), nullable=False)
    recargoTipo: Mapped[str] = mapped_column(String(10), nullable=False)
    recargoValor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    recargoUnidad: Mapped[str] = mapped_column(String(5), nullable=False)
    categoriasNoRetornables: Mapped[list[str]] = mapped_column(ARRAY(Text), default=lambda: [], nullable=False)
    maxCambiosPorPrenda: Mapped[int] = mapped_column(Integer, nullable=False)
    saldoAFavor: Mapped[str] = mapped_column(String(15), nullable=False)
    permiteReembolso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    vigenciaNotaCreditoDias: Mapped[int] = mapped_column(Integer, nullable=False)
    respetarPrecioOriginal: Mapped[bool] = mapped_column(Boolean, nullable=False)
    umbralAutorizacion: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    maxDevolucionesMes: Mapped[int] = mapped_column(Integer, nullable=False)
    accionDeterioro: Mapped[str] = mapped_column(String(10), nullable=False)
    descuentoDeterioroPct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    permiteSolicitudEnLinea: Mapped[bool] = mapped_column(Boolean, nullable=False)
    diasEntregaEnLinea: Mapped[int] = mapped_column(Integer, nullable=False)
    diasRetiroCambio: Mapped[int] = mapped_column(Integer, nullable=False)
    costoAjusteMedida: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    condiciones: Mapped[str] = mapped_column(String(1000), nullable=False)
    creadoEn: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


class NotaCredito(Base):
    """Saldo a favor de un cliente emitido por una devolucion (CU7). Se canjea
    en caja como medio de pago; "Vencida" se deduce de fechaVencimiento."""

    __tablename__ = "nota_credito"
    __table_args__ = (
        CheckConstraint("monto > 0", name="chk_nota_monto"),
        CheckConstraint("saldo >= 0 AND saldo <= monto", name="chk_nota_saldo"),
        CheckConstraint("estado IN ('Vigente', 'Usada', 'Anulada')", name="chk_nota_estado"),
    )

    idNotaCredito: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    saldo: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    estado: Mapped[str] = mapped_column(String(12), default="Vigente", nullable=False)
    fechaEmision: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaVencimiento: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(255))
    motivoAnulacion: Mapped[str | None] = mapped_column(String(255))
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idDevolucion: Mapped[int | None] = mapped_column(
        ForeignKey("devolucion.idDevolucion", ondelete="SET NULL", onupdate="CASCADE")
    )
    idUsuario: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", onupdate="CASCADE"), nullable=False)


class NotaCreditoMovimiento(Base):
    """Cada movimiento de una nota de credito (CU7): emision, consumo en caja,
    reintegro por la devolucion de una venta pagada con la nota, anulacion y
    extension del vencimiento."""

    __tablename__ = "nota_credito_movimiento"

    idMovimiento: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idNotaCredito: Mapped[int] = mapped_column(
        ForeignKey("nota_credito.idNotaCredito", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    saldoResultante: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    montoComplemento: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    metodoComplemento: Mapped[str | None] = mapped_column(String(12))
    idMetPago: Mapped[int | None] = mapped_column(ForeignKey("metodo_pago.idMetPago", onupdate="CASCADE"))
    idDevolucion: Mapped[int | None] = mapped_column(
        ForeignKey("devolucion.idDevolucion", ondelete="SET NULL", onupdate="CASCADE")
    )
    detalle: Mapped[str | None] = mapped_column(String(255))
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuario: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"), nullable=False)


class InventarioNoVendible(Base):
    """Prendas devueltas que no vuelven a la venta (CU10): defecto de fabrica
    (con reclamo al proveedor si el producto tiene uno) o deterioradas."""

    __tablename__ = "inventario_no_vendible"

    idNoVendible: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigoSucursal: Mapped[int] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"), nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str] = mapped_column(String(12), nullable=False)
    idDevolucion: Mapped[int | None] = mapped_column(
        ForeignKey("devolucion.idDevolucion", ondelete="SET NULL", onupdate="CASCADE")
    )
    idProveedor: Mapped[int | None] = mapped_column(ForeignKey("Proveedor.idProveedor", onupdate="CASCADE"))
    estado: Mapped[str] = mapped_column(String(12), default="Pendiente", nullable=False)
    observaciones: Mapped[str | None] = mapped_column(String(255))
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", onupdate="CASCADE"), nullable=False)
