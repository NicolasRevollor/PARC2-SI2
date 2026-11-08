# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU25] Verificar limites y funcionalidades del plan
# Control del diagrama: VerificadorPlan
# En palabras simples: antes de cada pedido a la API se revisa que la cuenta siga
#   activa y en que estado esta la suscripcion de su empresa. Lo que habilita el
#   plan (IA, sin conexion) y los cupos (sucursales, usuarios, productos) los
#   revisa cada endpoint con require_feature() y exigir_cupo() (services/tenancy.py).
# Va como middleware en main.py: no depende de que la interfaz oculte opciones.
# ==================================================================
"""Verificacion por solicitud (CU25 pasos 1 a 3 y flujos alternativos 3 y 4)."""

import time
from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Usuario
from app.security import decode_token, es_access_token
from app.services.suscripciones import suscripcion_vigente

# Paso 2: cache de corta duracion (un proceso: el plan gratuito de Render corre uno).
TTL_SEGUNDOS = 30
SIEMPRE_PERMITIDAS = ("/api/auth/",)
# [CU17] [CU22] alt. 4: lo vendido sin conexion antes de la suspension se acepta.
SINCRONIZACION = ("/api/sync/lote", "/api/sync/estado")
# Pedidos POST que solo consultan: siguen disponibles en el periodo de gracia.
CONSULTAS_POST = ("/api/reports/ia/consultar", "/api/reports/ia/transcribir", "/api/reports/exportar", "/api/notificaciones", "/api/chat")
METODOS_LECTURA = ("GET", "HEAD", "OPTIONS")


@dataclass(frozen=True)
class EstadoCuenta:
    usuario_activo: bool
    suscripcion: str | None  # Activa | Gracia | Suspendida | Cancelada | None (sin suscripcion vigente)


_cache: dict[tuple[int, int], tuple[float, EstadoCuenta]] = {}


def invalidar(id_tenant: int | None = None, id_user: int | None = None) -> None:
    """Un cambio de estado se aplica de inmediato, sin esperar el TTL."""
    for clave in list(_cache):
        if (id_tenant is None or clave[1] == id_tenant) and (id_user is None or clave[0] == id_user):
            _cache.pop(clave, None)


# ==== [CU25] VerificadorPlan.decidir() =============================
# Funcion pura: (estado de la cuenta, metodo, ruta) -> rechazo o None.
# ===================================================================
def decidir(estado: EstadoCuenta, metodo: str, ruta: str) -> tuple[int, str] | None:
    if ruta.startswith(SIEMPRE_PERMITIDAS):
        return None
    if not estado.usuario_activo:
        return 401, "Su cuenta fue dada de baja: ya no puede operar"
    if ruta in SINCRONIZACION:
        return None
    # Alternativo 4: suspendida o cancelada.
    if estado.suscripcion in ("Suspendida", "Cancelada"):
        return 403, "La suscripcion de su empresa esta suspendida. Contacte al administrador de la plataforma."
    # Alternativo 3: en gracia solo se consulta.
    if estado.suscripcion == "Gracia" and metodo not in METODOS_LECTURA and not ruta.startswith(CONSULTAS_POST):
        return 403, "La suscripcion de su empresa esta en periodo de gracia: solo se permiten consultas hasta que se renueve"
    return None


async def _cargar(id_user: int, id_tenant: int) -> EstadoCuenta:
    async with AsyncSessionLocal() as session:
        activo = await session.scalar(select(Usuario.activo).where(Usuario.idUser == id_user))
        sus = await suscripcion_vigente(session, id_tenant)
        estado = EstadoCuenta(usuario_activo=bool(activo), suscripcion=sus.estado if sus else None)
        await session.commit()  # guarda un vencimiento recien aplicado
        return estado


async def estado_cuenta(id_user: int, id_tenant: int) -> EstadoCuenta:
    clave = (id_user, id_tenant)
    guardado = _cache.get(clave)
    if guardado and time.monotonic() - guardado[0] < TTL_SEGUNDOS:
        return guardado[1]
    estado = await _cargar(id_user, id_tenant)
    _cache[clave] = (time.monotonic(), estado)
    return estado


async def verificar(request: Request) -> JSONResponse | None:
    ruta = request.url.path
    if not ruta.startswith("/api/") or request.method == "OPTIONS":
        return None
    cabecera = request.headers.get("authorization", "")
    if not cabecera.lower().startswith("bearer "):
        return None  # visitante: cada endpoint decide si es publico
    try:
        payload = decode_token(cabecera[7:].strip())
    except Exception:
        return None  # token vencido o invalido: el endpoint responde 401 y el cliente lo renueva
    if not es_access_token(payload):
        return None
    # Paso 1: empresa, rol y permisos salen del token.
    permisos = payload.get("permisos") or []
    id_user = int(payload["sub"])
    if "plataforma.admin" in permisos:
        id_tenant = None
    else:
        id_tenant = int(payload.get("tenant") or 1)
    estado = await estado_cuenta(id_user, id_tenant or 1)
    if id_tenant is None:
        estado = EstadoCuenta(usuario_activo=estado.usuario_activo, suscripcion="Activa")
    rechazo = decidir(estado, request.method, ruta)
    if rechazo is None:
        return None
    return JSONResponse(status_code=rechazo[0], content={"detail": rechazo[1]})
