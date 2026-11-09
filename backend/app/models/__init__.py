# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# Este archivo = las ENTIDADES del "Modelo de dominio" (seccion 3.1 del informe)
# y del diagrama de clases de la base de datos (40 clases = 40 tablas).
# Cada clase de abajo dice en que paquete del modelo de dominio esta.
# En los diagramas de robustez son los circulos con raya abajo (entity).
# ==================================================================

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
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, ARRAY, JSONB, UUID
from sqlalchemy import TIMESTAMP, text
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


# [Modelo de dominio] Paquete "Plataforma SaaS" -> entidad Plan  (tabla "plan")
class Plan(Base):
    """Catalogo de planes de suscripcion (Basico / Intermedio / Avanzado).
    Un limite en -1 significa ILIMITADO (ver services/tenancy.py)."""

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
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Migracion 027 ([CU23] alt. 2): desactivado no se ofrece en nuevas contrataciones.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# [Modelo de dominio] Paquete "Plataforma SaaS" -> entidad Tenant  (tabla "tenant")
class Tenant(Base):
    __tablename__ = "tenant"

    idTenant: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="Activo", nullable=False)
    fechaAlta: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idPlan: Mapped[int] = mapped_column(ForeignKey("plan.idPlan", onupdate="CASCADE"), nullable=False)
    # Migracion 027 ([CU21]): NIT de la empresa contratante.
    nit: Mapped[str | None] = mapped_column(String(20), unique=True)
    # Migracion 030 ([CU33]): desde cuando cuentan las compras para los cupones.
    inicioFidelidad: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)

    plan: Mapped["Plan"] = relationship()


# [Modelo de dominio] Paquete "Ventas" -> entidad Cupon  (tabla "cupon")
# [CU33] Obtener y usar cupon de descuento por compras
class Cupon(Base):
    __tablename__ = "cupon"

    idCupon: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    porcentaje: Mapped[float] = mapped_column(Numeric(5, 2), default=30.00, nullable=False)
    estado: Mapped[str] = mapped_column(String(10), default="Disponible", nullable=False)
    fechaEmision: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaVencimiento: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    idVentaOrigen: Mapped[int | None] = mapped_column(ForeignKey("Venta.idVenta", ondelete="SET NULL", onupdate="CASCADE"))
    idVentaUso: Mapped[int | None] = mapped_column(ForeignKey("Venta.idVenta", ondelete="SET NULL", onupdate="CASCADE"), unique=True)
    montoDescontado: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    fechaUso: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


# [Modelo de dominio] Paquete "Plataforma SaaS" -> entidad Suscripcion  (tabla "suscripcion")
class Suscripcion(Base):
    """Contrato de una empresa con un plan (migracion 023): fecha de inicio,
    vencimiento del periodo en curso y estado. Una sola vigente por empresa;
    las anteriores quedan como historial de cambios de plan."""

    __tablename__ = "suscripcion"

    idSuscripcion: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idPlan: Mapped[int] = mapped_column(ForeignKey("plan.idPlan", onupdate="CASCADE"), nullable=False)
    fechaInicio: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaVencimiento: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    # Activa | Gracia | Suspendida | Cancelada (vigentes o terminadas por el CU22) y
    # Finalizada (reemplazada por un cambio de plan). "Por vencer" no se guarda: se calcula.
    estado: Mapped[str] = mapped_column(String(12), default="Activa", nullable=False)
    precioMensual: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    creadoEn: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    # Migracion 026 ([CU17] alternativo 5): las operaciones sin conexion anteriores se aceptan.
    fechaSuspension: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Migracion 027 ([CU22] alt. 1).
    motivoSuspension: Mapped[str | None] = mapped_column(String(255))


# [Modelo de dominio] Paquete "Plataforma SaaS" -> entidad PagoSuscripcion  (tabla "pago_suscripcion")
# [CU22] Administrar estado de las suscripciones (pago simulado de la renovacion)
class PagoSuscripcion(Base):
    __tablename__ = "pago_suscripcion"

    idPago: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idSuscripcion: Mapped[int] = mapped_column(ForeignKey("suscripcion.idSuscripcion", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    meses: Mapped[int] = mapped_column(Integer, nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vencimientoAnterior: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    vencimientoNuevo: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Ubicacion" -> entidad Ciudad  (tabla "Ciudad")
class Ciudad(Base):
    __tablename__ = "Ciudad"

    idCiudad: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombCiudad: Mapped[str] = mapped_column(String(100), nullable=False)

    sucursales: Mapped[list["Sucursal"]] = relationship(back_populates="ciudad")


# [Modelo de dominio] Paquete "Seguridad" -> entidad Permiso  (tabla "permiso")
class Permiso(Base):
    __tablename__ = "permiso"

    idPermiso: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombrePermiso: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


# [Modelo de dominio] Paquete "Seguridad" -> entidad Rol  (tabla "rol")
class Rol(Base):
    __tablename__ = "rol"

    codigoRol: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombreRol: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    asignaciones: Mapped[list["AsignacionPermiso"]] = relationship(back_populates="rol")


# [Modelo de dominio] Paquete "Seguridad" -> entidad AsignacionPermiso  (tabla "asignacion_permiso")
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


# [Modelo de dominio] Paquete "Seguridad" -> entidad Usuario  (tabla "Usuario")
# La usan los diagramas de: Clases CU1, CU3 (registradaPor / inspector)
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
    # Migracion 027 ([CU24]): baja del empleado sin borrar su trazabilidad.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fechaBaja: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Migracion 027 ([CU21] [CU24]): falso hasta que defina su contrasena con el enlace.
    cuentaActivada: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    rol: Mapped["Rol"] = relationship()


# [Modelo de dominio] Paquete "Seguridad (tabla puente Usuario-Sucursal)" -> entidad UsuarioSucursal  (tabla "usuario_sucursal")
class UsuarioSucursal(Base):
    """Sucursales asignadas a un usuario del personal (migracion 024, CU24)."""

    __tablename__ = "usuario_sucursal"

    idUser: Mapped[int] = mapped_column(
        ForeignKey("Usuario.idUser", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True
    )
    codigoSucursal: Mapped[int] = mapped_column(
        ForeignKey("Sucursal.codigoSucursal", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True
    )
    fechaAsignacion: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)


# [Modelo de dominio] Paquete "Ubicacion" -> entidad Sucursal  (tabla "Sucursal")
# La usan los diagramas de: Clases CU1, CU2, CU4 (sucursalReceptora)
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


# [Modelo de dominio] Paquete "Catalogo" -> entidad Temporada  (tabla "Temporada")
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


# [Modelo de dominio] Paquete "Catalogo" -> entidad Colecciones  (tabla "Colecciones")
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


# [Modelo de dominio] Paquete "Catalogo" -> entidad Proveedor  (tabla "Proveedor")
# La usan los diagramas de: [CU10] (reclamo por defecto de fabrica)
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


# [Modelo de dominio] Paquete "Catalogo" -> entidad ModeloProducto  (tabla "modelo_producto")
# La usan los diagramas de: [CU4] (variantes del mismo modelo)
class ModeloProducto(Base):
    """Modelo de prenda (p. ej. "Polera Oversize"); sus variantes son las filas
    de producto con cada talla y color (migracion 023)."""

    __tablename__ = "modelo_producto"
    __table_args__ = (UniqueConstraint("idTenant", "nombre", name="uq_modelo_tenant_nombre"),)

    idModelo: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(50))
    descripcion: Mapped[str | None] = mapped_column(Text)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)


# [Modelo de dominio] Paquete "Catalogo" -> entidad Producto  (tabla "producto")
# La usan los diagramas de: Clases CU1 a CU5 (prenda / prendaNueva)
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
    imagen_probador_url: Mapped[str | None] = mapped_column(Text)
    imagenes_secundarias: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=lambda: [])
    idTenant: Mapped[int] = mapped_column(
        ForeignKey("tenant.idTenant", onupdate="CASCADE"), default=TENANT_POR_DEFECTO, nullable=False
    )
    # Migracion 023: cada producto es una variante (talla + color) de un modelo.
    idModelo: Mapped[int | None] = mapped_column(
        ForeignKey("modelo_producto.idModelo", ondelete="SET NULL", onupdate="CASCADE")
    )
    # Migracion 025: medidas REALES de la prenda en centimetros. Sirven para decir si una
    # talla es mas grande o mas chica que otra (una "L" oversize no mide lo mismo que una "L" normal).
    medidaPechoCm: Mapped[int | None] = mapped_column(Integer)
    medidaLargoCm: Mapped[int | None] = mapped_column(Integer)
    medidaCinturaCm: Mapped[int | None] = mapped_column(Integer)

    proveedor: Mapped["Proveedor"] = relationship(back_populates="productos")
    coleccion: Mapped["Colecciones"] = relationship()
    inventarios: Mapped[list["Inventario"]] = relationship(back_populates="producto")


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Cliente  (tabla "Cliente")
# La usan los diagramas de: Clases CU1, CU2, CU7
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
    # Migracion 026 ([CU14] paso 4): cliente registrado en tienda con nombre y CI.
    ci: Mapped[str | None] = mapped_column(String(20))


# [Modelo de dominio] Paquete "Stock" -> entidad Inventario  (tabla "Inventario")
# La usan los diagramas de: Clases CU2, CU4, CU8, CU10
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


# [Modelo de dominio] Paquete "Stock" -> entidad Movimiento  (tabla "Movimiento")
# La usan los diagramas de: [CU10] (Entrada por devolucion / Salida por cambio)
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


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad MetodoPago  (tabla "metodo_pago")
# La usan los diagramas de: Clases CU4, CU5, CU6, CU7 (pagoDiferencia)
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


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Reserva  (tabla "Reserva")
class Reserva(Base):
    __tablename__ = "Reserva"
    __table_args__ = (
        Index("idx_reserva_cliente", "idCliente"),
        Index("idx_reserva_estado_fecha", "estado", "fecha"),
    )
    # El UUID de la operacion lo genera la base: se lee en el mismo INSERT.
    __mapper_args__ = {"eager_defaults": True}

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
    # Migracion 023 — sincronizacion (CU14-CU17, RNF05): el UUID lo genera el
    # dispositivo al registrar sin conexion; reenviarlo no duplica.
    uuidOperacion: Mapped[str] = mapped_column(UUID(as_uuid=False), server_default=text("gen_random_uuid()"), nullable=False)
    origenRegistro: Mapped[str] = mapped_column(String(12), default="en_linea", nullable=False)
    estadoSincronizacion: Mapped[str] = mapped_column(String(12), default="Sincronizada", nullable=False)
    fechaOperacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaSincronizacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad DetalleReserva  (tabla "detalle_reserva")
class DetalleReserva(Base):
    """Prendas de una reserva (migracion 023)."""

    __tablename__ = "detalle_reserva"
    __table_args__ = (
        CheckConstraint("cantidad > 0", name="chk_detalle_reserva_cantidad"),
        UniqueConstraint("codigoReserva", "idProducto", name="uq_detalle_reserva_producto"),
    )

    idDetalleReserva: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigoReserva: Mapped[int] = mapped_column(
        ForeignKey("Reserva.codigoReserva", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    precioUnitario: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Venta  (tabla "Venta")
# La usan los diagramas de: Clases CU1, CU2, CU5, CU6
class Venta(Base):
    __tablename__ = "Venta"
    __table_args__ = (
        CheckConstraint("total >= 0", name="chk_venta_total"),
        Index("idx_venta_fecha", "fecha"),
        Index("idx_venta_cliente", "idCliente"),
    )
    __mapper_args__ = {"eager_defaults": True}

    idVenta: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idMetPago: Mapped[int] = mapped_column(ForeignKey("metodo_pago.idMetPago", onupdate="CASCADE"), nullable=False)
    # Migracion 023 — sincronizacion (CU14-CU17, RNF05): el UUID lo genera el
    # dispositivo al registrar sin conexion; reenviarlo no duplica.
    uuidOperacion: Mapped[str] = mapped_column(UUID(as_uuid=False), server_default=text("gen_random_uuid()"), nullable=False)
    origenRegistro: Mapped[str] = mapped_column(String(12), default="en_linea", nullable=False)
    estadoSincronizacion: Mapped[str] = mapped_column(String(12), default="Sincronizada", nullable=False)
    fechaOperacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaSincronizacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Migracion 026 ([CU18] paso 5): diferencia al respetar el precio cobrado sin conexion.
    descuentoAutorizado: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)


# [Modelo de dominio] Paquete "Sincronizacion" -> entidad RegistroSincronizacion  (tabla "registro_sincronizacion")
class RegistroSincronizacion(Base):
    """Log de cada operacion recibida de la cola de un dispositivo (RNF10)."""

    __tablename__ = "registro_sincronizacion"

    idRegistro: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    uuidOperacion: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    # venta | reserva | devolucion | cancelar_reserva | cambio | custodia | caja_apertura | caja_cierre
    tipoOperacion: Mapped[str] = mapped_column(String(20), nullable=False)
    # Aplicada | Duplicada | Rechazada | Conflicto
    resultado: Mapped[str] = mapped_column(String(12), nullable=False)
    detalle: Mapped[str | None] = mapped_column(String(255))
    idReferencia: Mapped[int | None] = mapped_column(Integer)
    fechaOperacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaRecepcion: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    dispositivo: Mapped[str | None] = mapped_column(String(120))
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))
    idTenant: Mapped[int | None] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"))
    codigoSucursal: Mapped[int | None] = mapped_column(Integer)


# [Modelo de dominio] Paquete "Sincronizacion" -> entidad ConflictoSincronizacion  (tabla "conflicto_sincronizacion")
# [CU18] Resolver conflictos de sincronizacion
class ConflictoSincronizacion(Base):
    """Operacion sin conexion que el servidor no pudo confirmar sola. Mientras
    este "Pendiente" no mueve stock ni crea la venta: lo hace la decision del
    Encargado (services/conflictos.py)."""

    __tablename__ = "conflicto_sincronizacion"

    idConflicto: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    uuidOperacion: Mapped[str] = mapped_column(UUID(as_uuid=False), unique=True, nullable=False)
    tipoOperacion: Mapped[str] = mapped_column(String(12), nullable=False)
    # stock_insuficiente | precio_desactualizado | producto_desactivado | cliente_duplicado
    # | reserva_sin_existencia | politica_incumplida | dependencia_pendiente | recepcion_custodia
    tipoConflicto: Mapped[str] = mapped_column(String(30), nullable=False)
    motivo: Mapped[str] = mapped_column(String(255), nullable=False)
    datosDispositivo: Mapped[dict] = mapped_column(JSONB, nullable=False)
    datosServidor: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    estado: Mapped[str] = mapped_column(String(10), default="Pendiente", nullable=False)
    resultado: Mapped[str | None] = mapped_column(String(12))  # Confirmada | Anulada
    decision: Mapped[str | None] = mapped_column(String(30))
    observaciones: Mapped[str | None] = mapped_column(String(255))
    alertaDiscrepancia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    idReferencia: Mapped[int | None] = mapped_column(Integer)
    codigoSucursal: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"))
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    fechaOperacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fechaRegistro: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idResolvio: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))
    fechaResolucion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


# [Modelo de dominio] Paquete "Sincronizacion" -> entidad ConfiguracionOperacion  (tabla "configuracion_operacion")
# [CU13] [CU14] [CU18] [CU20]: tiempos y umbrales de cada empresa.
class ConfiguracionOperacion(Base):
    __tablename__ = "configuracion_operacion"

    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    horasDatosVigentes: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    horasSesionSinConexion: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    permiteVentaSinStock: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    umbralDiferenciaCaja: Mapped[float] = mapped_column(Numeric(12, 2), default=50, nullable=False)
    umbralConflicto: Mapped[float] = mapped_column(Numeric(12, 2), default=1000, nullable=False)
    horasRetiroReserva: Mapped[int] = mapped_column(Integer, default=48, nullable=False)


# [Modelo de dominio] Paquete "Inteligencia artificial" -> entidad ReporteSolicitud  (tabla "reporte_solicitud")
# [CU26] [CU27] Historial y favoritos de los reportes generativos
class ReporteSolicitud(Base):
    __tablename__ = "reporte_solicitud"

    idSolicitud: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))
    texto: Mapped[str] = mapped_column(String(500), nullable=False)
    origen: Mapped[str] = mapped_column(String(5), default="texto", nullable=False)  # texto | voz
    motor: Mapped[str] = mapped_column(String(40), nullable=False)
    interpretacion: Mapped[dict | None] = mapped_column(JSONB)
    titulo: Mapped[str | None] = mapped_column(String(150))
    estado: Mapped[str] = mapped_column(String(12), nullable=False)  # Generado | SinDatos | Aclaracion | Rechazado
    filas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    favorita: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)


# [Modelo de dominio] Paquete "Inteligencia artificial" -> entidad ReporteExportacion  (tabla "reporte_exportacion")
# [CU28] Exportar reporte a PDF o Excel (los grandes se generan en segundo plano)
class ReporteExportacion(Base):
    __tablename__ = "reporte_exportacion"

    idExportacion: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    formato: Mapped[str] = mapped_column(String(5), nullable=False)  # pdf | xlsx
    estado: Mapped[str] = mapped_column(String(12), default="EnProceso", nullable=False)  # EnProceso | Lista | Fallida
    filas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nombreArchivo: Mapped[str | None] = mapped_column(String(160))
    archivo: Mapped[bytes | None] = mapped_column(LargeBinary)
    error: Mapped[str | None] = mapped_column(String(255))
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)


# [Modelo de dominio] Paquete "Inteligencia artificial" -> entidad ModeloIA  (tabla "modelo_ia")
# [CU29] Entrenar y evaluar modelos de Machine Learning  /  [CU30] los usa el dashboard
class ModeloIA(Base):
    """Una version entrenada de un modelo de la empresa. "resultados" guarda lo
    que muestra el dashboard (predicciones, segmentos o anomalias), calculado al
    entrenar: el dashboard no vuelve a correr el modelo."""

    __tablename__ = "modelo_ia"

    idModeloIA: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # demanda | devolucion | segmentacion | anomalias
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    estado: Mapped[str] = mapped_column(String(12), nullable=False)  # Entrenado | Publicado | Retirado | Fallido
    algoritmo: Mapped[str | None] = mapped_column(String(60))
    metricas: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    cumpleUmbral: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    filasReales: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    filasSinteticas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    parametros: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    resultados: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[str | None] = mapped_column(String(500))
    fechaEntrenamiento: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaPublicacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Caja" -> entidad Caja  (tabla "caja")
# [CU20] Gestionar apertura y cierre de caja
class Caja(Base):
    """Turno de caja de una sucursal (migracion 026). Estados: "Abierta",
    "CierreProvisional" (quedan operaciones sin confirmar), "PendienteAprobacion"
    (la diferencia supera el umbral y falta el Encargado) y "Cerrada"."""

    __tablename__ = "caja"
    __mapper_args__ = {"eager_defaults": True}

    idCaja: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    uuidOperacion: Mapped[str] = mapped_column(UUID(as_uuid=False), server_default=text("gen_random_uuid()"), unique=True, nullable=False)
    origenRegistro: Mapped[str] = mapped_column(String(12), default="en_linea", nullable=False)
    codigoSucursal: Mapped[int] = mapped_column(ForeignKey("Sucursal.codigoSucursal", onupdate="CASCADE"), nullable=False)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idUsuarioApertura: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"), nullable=False)
    montoInicial: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    fechaApertura: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuarioCierre: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"))
    fechaCierre: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    efectivoContado: Mapped[float | None] = mapped_column(Numeric(12, 2))
    montoEsperado: Mapped[float | None] = mapped_column(Numeric(12, 2))
    diferencia: Mapped[float | None] = mapped_column(Numeric(12, 2))
    justificacion: Mapped[str | None] = mapped_column(String(255))
    estado: Mapped[str] = mapped_column(String(20), default="Abierta", nullable=False)
    idAprobador: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", onupdate="CASCADE"))
    fechaAprobacion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    operacionesPendientes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)


# [Modelo de dominio] Paquete "Caja" -> entidad MovimientoCaja  (tabla "movimiento_caja")
# [CU20] Gestionar apertura y cierre de caja
class MovimientoCaja(Base):
    """Ingreso o egreso en efectivo de una caja."""

    __tablename__ = "movimiento_caja"

    idMovimientoCaja: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idCaja: Mapped[int] = mapped_column(ForeignKey("caja.idCaja", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(8), nullable=False)  # ingreso | egreso
    # venta | diferencia_cambio | deposito_reserva | reembolso | devolucion_deposito | anulacion_venta
    concepto: Mapped[str] = mapped_column(String(24), nullable=False)
    monto: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(60))
    uuidOperacion: Mapped[str | None] = mapped_column(UUID(as_uuid=False))
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad DetalleVenta  (tabla "detalle_venta")
# La usan los diagramas de: Clases CU1, CU2, CU5
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


# [Modelo de dominio] Paquete "Seguridad" -> entidad Bitacora  (tabla "Bitacora")
# La usan los diagramas de: casi todos los diagramas de robustez y clases (registrarBitacora())
class Bitacora(Base):
    __tablename__ = "Bitacora"
    __table_args__ = (Index("idx_bitacora_fecha_user", "fecha", "idUser"),)

    idBitacora: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    accion: Mapped[str] = mapped_column(String(150), nullable=False)
    hora: Mapped[time] = mapped_column(Time, nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    ip: Mapped[str] = mapped_column(INET, nullable=False)
    idUser: Mapped[int] = mapped_column(ForeignKey("Usuario.idUser", ondelete="CASCADE"), nullable=False)


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Recomendaciones  (tabla "Recomendaciones")
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


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Historial  (tabla "historial")
class Historial(Base):
    __tablename__ = "historial"
    __table_args__ = (Index("idx_historial_busqueda", "idCliente", "idProducto"),)

    codigoHistorial: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", onupdate="CASCADE"), nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", onupdate="CASCADE"), nullable=False)
    idVenta: Mapped[int] = mapped_column(ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)


# [Modelo de dominio] Paquete "Plataforma SaaS" -> entidad Respaldo  (tabla "respaldo")
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


# [Modelo de dominio] Paquete "Posventa" -> entidad Devolucion  (tabla "devolucion")
# La usan los diagramas de: Clases CU1 a CU10 (es la entidad principal del modulo)
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
            "tipo IN ('cambio_talla', 'cambio_color', 'cambio_medida', 'cambio_producto', 'devolucion')",
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
    fechaResolucion: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Migracion 026 ([CU19]): cambio registrado sin conexion.
    uuidOperacion: Mapped[str | None] = mapped_column(UUID(as_uuid=False), unique=True)
    origenRegistro: Mapped[str] = mapped_column(String(12), default="en_linea", nullable=False)
    # Migracion 028 ([CU31] [CU32]): la prenda se recoge y la nueva se entrega en el domicilio.
    modalidadEntrega: Mapped[str] = mapped_column(String(10), default="sucursal", nullable=False)
    costoDomicilio: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)


# [Modelo de dominio] Paquete "Posventa" -> entidad EntregaDomicilio  (tabla "entrega_domicilio")
# [CU31] Recoger a domicilio la prenda devuelta  /  [CU32] Entregar a domicilio la prenda del cambio
# Un viaje del repartidor: "recojo" (trae la prenda devuelta a la sucursal) o
# "entrega" (lleva la prenda nueva al cliente, recien despues de la inspeccion).
class EntregaDomicilio(Base):
    __tablename__ = "entrega_domicilio"

    idEntrega: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Recojo/entrega de una devolucion (CU31, CU32) o envio de una compra en linea (CU35, tipo "pedido").
    idDevolucion: Mapped[int | None] = mapped_column(
        ForeignKey("devolucion.idDevolucion", ondelete="CASCADE", onupdate="CASCADE")
    )
    idVenta: Mapped[int | None] = mapped_column(ForeignKey("Venta.idVenta", ondelete="CASCADE", onupdate="CASCADE"))
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    estado: Mapped[str] = mapped_column(String(12), default="Solicitado", nullable=False)
    codigoSucursal: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", ondelete="SET NULL", onupdate="CASCADE"))
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(255))
    telefono: Mapped[str] = mapped_column(String(20), nullable=False)
    fechaPreferida: Mapped[date | None] = mapped_column(Date)
    franja: Mapped[str | None] = mapped_column(String(10))
    fechaProgramada: Mapped[date | None] = mapped_column(Date)
    repartidor: Mapped[str | None] = mapped_column(String(100))
    costo: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)
    intentos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(String(255))
    fechaRegistro: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaCompletado: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Ventas" -> entidad AvisoStock  (tabla "aviso_stock")
# [CU34] Avisar cuando vuelve el stock de una talla. El aviso lo dispara un trigger
# de la base (migracion 031) cuando el Inventario vuelve a tener disponible.
class AvisoStock(Base):
    __tablename__ = "aviso_stock"

    idAviso: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idTenant: Mapped[int] = mapped_column(ForeignKey("tenant.idTenant", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idCliente: Mapped[int] = mapped_column(ForeignKey("Cliente.idCliente", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    idProducto: Mapped[int] = mapped_column(ForeignKey("producto.idProducto", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    estado: Mapped[str] = mapped_column(String(10), default="Pendiente", nullable=False)
    fechaRegistro: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    fechaAviso: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    codigoSucursal: Mapped[int | None] = mapped_column(ForeignKey("Sucursal.codigoSucursal", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Posventa" -> entidad PoliticaDevolucion  (tabla "politica_devolucion")
# La usan los diagramas de: Clases CU1 a CU9 (obtenerPoliticaVigente())
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
    permiteReembolso: Mapped[bool] = mapped_column(Boolean, nullable=False)
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
    # Migracion 028 ([CU31] [CU32]): delivery de devoluciones y cambios.
    permiteDomicilio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    costoDomicilio: Mapped[float] = mapped_column(Numeric(12, 2), default=15.00, nullable=False)
    creadoEn: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
    idUsuario: Mapped[int | None] = mapped_column(ForeignKey("Usuario.idUser", ondelete="SET NULL", onupdate="CASCADE"))


# [Modelo de dominio] Paquete "Stock" -> entidad InventarioNoVendible  (tabla "inventario_no_vendible")
# La usan los diagramas de: Clases CU10 (merma / defecto de fabrica)
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


# [Modelo de dominio] Paquete "Venta y atencion" -> entidad Notificacion  (tabla "notificacion")
# Correccion de la ingeniera: los avisos al cliente ("su prenda sera enviada el viernes",
# "le devolvemos su dinero") llegan como notificacion en la app y por correo.
class Notificacion(Base):
    """Un aviso para un usuario (cliente o personal). Se muestra en la bandeja
    de notificaciones de la web y la app movil; si `porCorreo` es True, tambien
    se manda por correo (Brevo) y `correoEnviado` queda en True."""

    __tablename__ = "notificacion"
    __table_args__ = (Index("idx_notificacion_usuario", "idUser", "fecha"),)

    idNotificacion: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    idUser: Mapped[int] = mapped_column(
        ForeignKey("Usuario.idUser", ondelete="CASCADE", onupdate="CASCADE"), nullable=False
    )
    idTenant: Mapped[int | None] = mapped_column(ForeignKey("tenant.idTenant", onupdate="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # envio | reembolso | devolucion | venta_sin_conexion
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    mensaje: Mapped[str] = mapped_column(String(600), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(40))  # p. ej. el codigo del caso DEV-000123
    leida: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    porCorreo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    correoEnviado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fecha: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=_ahora_utc, nullable=False)
