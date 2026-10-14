from datetime import datetime, date, time

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
from sqlalchemy.dialects.postgresql import INET, ARRAY
from sqlalchemy import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


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
    fechaAsignacion: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
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

    rol: Mapped["Rol"] = relationship()


class Sucursal(Base):
    __tablename__ = "Sucursal"
    __table_args__ = (Index("idx_sucursal_ciudad", "idCiudad"),)

    codigoSucursal: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    idCiudad: Mapped[int] = mapped_column(ForeignKey("Ciudad.idCiudad", onupdate="CASCADE"), nullable=False)

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


class Colecciones(Base):
    __tablename__ = "Colecciones"
    __table_args__ = (Index("idx_coleccion_temporada", "idTemporada"),)

    idColeccion: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre_coleccion: Mapped[str] = mapped_column(String(100), nullable=False)
    idTemporada: Mapped[int] = mapped_column(ForeignKey("Temporada.idTemporada", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False)

    temporada: Mapped["Temporada"] = relationship()


class Proveedor(Base):
    __tablename__ = "Proveedor"
    __table_args__ = (Index("idx_proveedor_nombre", "nombre"),)

    idProveedor: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20))
    correo: Mapped[str | None] = mapped_column(String(100))

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
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(255))
    idInv: Mapped[int] = mapped_column(ForeignKey("Inventario.idInv", onupdate="CASCADE"), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(50))

    inventario: Mapped["Inventario"] = relationship(back_populates="movimientos")


class MetodoPago(Base):
    __tablename__ = "metodo_pago"

    idMetPago: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), default="Activo", nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
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
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
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
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idVenta: Mapped[int] = mapped_column(ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
