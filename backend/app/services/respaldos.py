"""Respaldos (backups) por empresa (migracion 018).

Que contiene un respaldo
------------------------
Un JSON comprimido con gzip (.json.gz) con TODAS las filas que pertenecen a
una empresa, tabla por tabla, en orden de dependencia (padres antes que
hijos) para que una restauracion pueda reinsertarlas en ese mismo orden:

    tenant -> Proveedor -> Temporada -> Colecciones -> producto -> Sucursal ->
    Usuario -> Cliente -> Inventario -> Movimiento -> metodo_pago -> Venta ->
    detalle_venta -> historial -> Reserva -> devolucion -> Recomendaciones ->
    Bitacora

Las tablas raiz se filtran por "idTenant"; las hojas, por la cadena de FKs
(Inventario por sus sucursales, Venta por sus clientes, etc.). Las tablas
globales (plan, rol, permiso, Ciudad) NO se incluyen: son catalogos
compartidos por todas las empresas.

Donde se guarda
---------------
- Bucket PRIVADO de Supabase Storage si BACKUP_BUCKET y las credenciales de
  Supabase estan configuradas (produccion).
- Carpeta local `backend/<BACKUP_DIR_LOCAL>/` si no (desarrollo). En Render
  esa carpeta se borra en cada redeploy: no sirve como respaldo real.

Los respaldos incluyen hashes de contrasenas y datos personales de clientes:
por eso el bucket debe ser privado y la descarga pasa siempre por el backend
(que exige "plataforma.admin"), nunca por una URL publica.
"""

import gzip
import hmac
import ipaddress
import json
import logging
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path

import anyio
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    Bitacora,
    Cliente,
    Colecciones,
    DetalleVenta,
    Devolucion,
    Historial,
    Inventario,
    MetodoPago,
    Movimiento,
    Plan,
    Producto,
    Proveedor,
    Recomendaciones,
    Reserva,
    Respaldo,
    Sucursal,
    Temporada,
    Tenant,
    Usuario,
    Venta,
)
from app.services import storage_supabase

logger = logging.getLogger("app.errors")
settings = get_settings()

FORMATO_VERSION = 1
CONTENT_TYPE = "application/gzip"
# backend/ (este archivo vive en backend/app/services/)
_RAIZ_BACKEND = Path(__file__).resolve().parents[2]


class RespaldoNoEncontrado(RuntimeError):
    """El archivo del respaldo no existe en el almacenamiento."""


# --- Helpers puros (testeables sin DB) ------------------------------------

def a_json(valor):
    """Convierte un valor de columna a algo serializable en JSON sin perder
    precision: los Decimal van como texto (un float redondearia montos)."""
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, (datetime, date, time)):
        return valor.isoformat()
    if isinstance(valor, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
        return str(valor)
    if isinstance(valor, (list, tuple)):
        return [a_json(v) for v in valor]
    return valor


def serializar(contenido: dict) -> bytes:
    return gzip.compress(json.dumps(contenido, ensure_ascii=False, default=a_json).encode("utf-8"))


def deserializar(datos: bytes) -> dict:
    return json.loads(gzip.decompress(datos).decode("utf-8"))


def seleccionar_para_borrar(automaticos_desc: list, retencion: int) -> list:
    """Dada la lista de respaldos AUTOMATICOS de una empresa, del mas nuevo al
    mas viejo, devuelve los que exceden la retencion (los mas viejos)."""
    if retencion < 1:
        retencion = 1  # nunca borrar el ultimo respaldo que existe
    return list(automaticos_desc[retencion:])


def secreto_valido(recibido: str | None, configurado: str | None) -> bool:
    """Compara el secreto del cron en tiempo constante. Sin secreto
    configurado, nada es valido (el endpoint queda deshabilitado)."""
    if not configurado or not recibido:
        return False
    return hmac.compare_digest(recibido.encode("utf-8"), configurado.encode("utf-8"))


def ruta_archivo(id_tenant: int, tipo: str, momento: datetime) -> str:
    return f"tenant-{id_tenant}/{momento.strftime('%Y%m%d-%H%M%S')}-{tipo}.json.gz"


# --- Almacenamiento -------------------------------------------------------

def almacenamiento_activo() -> str:
    """'supabase' si hay bucket privado configurado, 'local' si no."""
    if settings.BACKUP_BUCKET and storage_supabase.supabase_configurado():
        return "supabase"
    return "local"


def _ruta_local(ruta: str) -> Path:
    base = (_RAIZ_BACKEND / settings.BACKUP_DIR_LOCAL).resolve()
    destino = (base / ruta).resolve()
    # Defensa contra rutas manipuladas ("../") que salgan de la carpeta.
    if base not in destino.parents:
        raise ValueError("Ruta de respaldo invalida")
    return destino


def _bucket():
    return storage_supabase._get_client().storage.from_(settings.BACKUP_BUCKET)


async def guardar_archivo(almacenamiento: str, ruta: str, datos: bytes) -> None:
    if almacenamiento == "supabase":
        await anyio.to_thread.run_sync(
            lambda: _bucket().upload(ruta, datos, {"content-type": CONTENT_TYPE})
        )
        return
    destino = _ruta_local(ruta)
    destino.parent.mkdir(parents=True, exist_ok=True)
    await anyio.to_thread.run_sync(destino.write_bytes, datos)


async def leer_archivo(almacenamiento: str, ruta: str) -> bytes:
    if almacenamiento == "supabase":
        try:
            return await anyio.to_thread.run_sync(lambda: _bucket().download(ruta))
        except Exception as exc:
            raise RespaldoNoEncontrado(str(exc)) from exc
    destino = _ruta_local(ruta)
    if not destino.exists():
        raise RespaldoNoEncontrado(f"No existe el archivo local {ruta}")
    return await anyio.to_thread.run_sync(destino.read_bytes)


async def borrar_archivo(almacenamiento: str, ruta: str) -> None:
    """Borra el archivo. Si ya no existe no es un error: el objetivo (que no
    este) ya se cumple."""
    try:
        if almacenamiento == "supabase":
            await anyio.to_thread.run_sync(lambda: _bucket().remove([ruta]))
        else:
            _ruta_local(ruta).unlink(missing_ok=True)
    except Exception:
        logger.warning("No se pudo borrar el archivo de respaldo %s (%s)", ruta, almacenamiento)


# --- Export ---------------------------------------------------------------

async def _filas(session: AsyncSession, modelo, condicion) -> list[dict]:
    resultado = await session.execute(select(modelo.__table__).where(condicion))
    return [{k: a_json(v) for k, v in fila._mapping.items()} for fila in resultado]


async def exportar_empresa(session: AsyncSession, id_tenant: int) -> dict:
    """Todas las filas de una empresa, tabla por tabla, en orden de dependencia."""
    tenant, plan = (
        await session.execute(
            select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan).where(Tenant.idTenant == id_tenant)
        )
    ).one()

    usuarios = select(Usuario.idUser).where(Usuario.idTenant == id_tenant)
    sucursales = select(Sucursal.codigoSucursal).where(Sucursal.idTenant == id_tenant)
    inventarios = select(Inventario.idInv).where(Inventario.codigoSucursal.in_(sucursales))
    clientes = select(Cliente.idCliente).where(Cliente.idUser.in_(usuarios))
    ventas = select(Venta.idVenta).where(Venta.idCliente.in_(clientes))
    pagos_ventas = select(Venta.idMetPago).where(Venta.idCliente.in_(clientes))
    pagos_reservas = select(Reserva.idMetPago).where(
        Reserva.codigoSucursal.in_(sucursales), Reserva.idMetPago.is_not(None)
    )

    tablas = [
        ("tenant", Tenant, Tenant.idTenant == id_tenant),
        ("Proveedor", Proveedor, Proveedor.idTenant == id_tenant),
        ("Temporada", Temporada, Temporada.idTenant == id_tenant),
        ("Colecciones", Colecciones, Colecciones.idTenant == id_tenant),
        ("producto", Producto, Producto.idTenant == id_tenant),
        ("Sucursal", Sucursal, Sucursal.idTenant == id_tenant),
        ("Usuario", Usuario, Usuario.idTenant == id_tenant),
        ("Cliente", Cliente, Cliente.idUser.in_(usuarios)),
        ("Inventario", Inventario, Inventario.codigoSucursal.in_(sucursales)),
        ("Movimiento", Movimiento, Movimiento.idInv.in_(inventarios)),
        ("metodo_pago", MetodoPago, or_(MetodoPago.idMetPago.in_(pagos_ventas), MetodoPago.idMetPago.in_(pagos_reservas))),
        ("Venta", Venta, Venta.idCliente.in_(clientes)),
        ("detalle_venta", DetalleVenta, DetalleVenta.idVenta.in_(ventas)),
        ("historial", Historial, Historial.idVenta.in_(ventas)),
        ("Reserva", Reserva, Reserva.codigoSucursal.in_(sucursales)),
        ("devolucion", Devolucion, Devolucion.idTenant == id_tenant),
        ("Recomendaciones", Recomendaciones, Recomendaciones.idCliente.in_(clientes)),
        ("Bitacora", Bitacora, Bitacora.idUser.in_(usuarios)),
    ]

    contenido = {}
    for nombre, modelo, condicion in tablas:
        contenido[nombre] = await _filas(session, modelo, condicion)

    return {
        "formato": FORMATO_VERSION,
        "generadoEn": datetime.now(timezone.utc).isoformat(),
        "empresa": {"idTenant": tenant.idTenant, "nombre": tenant.nombre, "slug": tenant.slug, "plan": plan.codigo},
        "conteo": {nombre: len(filas) for nombre, filas in contenido.items()},
        "tablas": contenido,
    }


# --- Orquestacion ---------------------------------------------------------

async def crear_respaldo(
    session: AsyncSession, id_tenant: int, tipo: str, id_usuario: int | None
) -> Respaldo:
    """Exporta, guarda y registra un respaldo. Si algo falla, el intento
    tambien queda registrado como "Fallido" con el motivo: un respaldo que
    fallo en silencio es peor que no tener respaldos."""
    almacenamiento = almacenamiento_activo()
    momento = datetime.now(timezone.utc)
    ruta = ruta_archivo(id_tenant, tipo, momento)
    registro = Respaldo(
        idTenant=id_tenant, tipo=tipo, almacenamiento=almacenamiento,
        ruta=ruta, idUsuario=id_usuario, creadoEn=momento, estado="Fallido",
    )

    try:
        contenido = await exportar_empresa(session, id_tenant)
        datos = serializar(contenido)
        await guardar_archivo(almacenamiento, ruta, datos)
        registro.estado = "Completado"
        registro.tamanoBytes = len(datos)
        registro.filas = sum(contenido["conteo"].values())
    except Exception as exc:
        logger.error("Fallo el respaldo de la empresa %s: %s", id_tenant, exc)
        await session.rollback()
        registro.ruta = None
        registro.error = str(exc)[:500]

    session.add(registro)
    await session.commit()
    await session.refresh(registro)
    return registro


async def aplicar_retencion(session: AsyncSession, id_tenant: int) -> int:
    """Borra los respaldos automaticos que exceden la retencion. Devuelve cuantos."""
    automaticos = (
        await session.execute(
            select(Respaldo)
            .where(Respaldo.idTenant == id_tenant, Respaldo.tipo == "automatico", Respaldo.estado == "Completado")
            .order_by(Respaldo.creadoEn.desc())
        )
    ).scalars().all()

    sobrantes = seleccionar_para_borrar(automaticos, settings.BACKUP_RETENCION_AUTOMATICOS)
    for respaldo in sobrantes:
        if respaldo.ruta:
            await borrar_archivo(respaldo.almacenamiento, respaldo.ruta)
        await session.delete(respaldo)
    if sobrantes:
        await session.commit()
    return len(sobrantes)


async def respaldar_empresas_activas(session: AsyncSession) -> list[Respaldo]:
    """Respaldo automatico de cada empresa activa + limpieza de los viejos.
    Una empresa que falla no frena a las demas."""
    ids = (
        await session.execute(select(Tenant.idTenant).where(Tenant.estado == "Activo").order_by(Tenant.idTenant))
    ).scalars().all()

    resultados = []
    for id_tenant in ids:
        respaldo = await crear_respaldo(session, id_tenant, "automatico", None)
        resultados.append(respaldo)
        if respaldo.estado == "Completado":
            await aplicar_retencion(session, id_tenant)
    return resultados
