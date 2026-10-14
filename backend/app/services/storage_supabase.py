"""Wrapper delgado sobre el SDK sincrono de Supabase Storage.

Igual que `pagos_stripe.py`, el SDK de `supabase-py` es sincrono, asi que
la subida corre en un hilo aparte via `anyio.to_thread.run_sync` para no
bloquear el event loop de FastAPI.

Si `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no estan configuradas,
`supabase_configurado()` devuelve False y el router debe responder 503
antes de llamar a cualquier funcion de este modulo — mismo patron de
degradacion que Stripe/Brevo.
"""

import mimetypes
import uuid

import anyio

from app.config import get_settings

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - supabase siempre deberia estar instalado
    Client = None
    create_client = None

settings = get_settings()

_client: "Client | None" = None


class SupabaseNoConfigurado(RuntimeError):
    """Faltan credenciales de Supabase o el paquete `supabase` no esta instalado."""


class SupabaseStorageError(RuntimeError):
    """Supabase Storage respondio con un error al subir el archivo."""


def supabase_configurado() -> bool:
    """True solo si el paquete `supabase` esta importado Y hay credenciales."""
    return (
        create_client is not None
        and bool(settings.SUPABASE_URL)
        and bool(settings.SUPABASE_SERVICE_ROLE_KEY)
    )


def _get_client() -> "Client":
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def _public_url(path: str) -> str:
    base = settings.SUPABASE_URL.rstrip("/")
    return f"{base}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/{path}"


def _upload_sync(path: str, contenido: bytes, content_type: str) -> None:
    client = _get_client()
    client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
        path, contenido, {"content-type": content_type}
    )


async def subir_imagen_producto(nombre_archivo: str, contenido: bytes) -> str:
    """Sube una imagen de producto al bucket publico y devuelve su URL publica.

    `nombre_archivo` solo se usa para inferir la extension/content-type; el
    path real en el bucket es un UUID nuevo para evitar colisiones y no
    depender del nombre original del archivo del usuario.
    """
    if not supabase_configurado():
        raise SupabaseNoConfigurado(
            "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no configuradas o paquete supabase ausente"
        )

    content_type = mimetypes.guess_type(nombre_archivo)[0] or "application/octet-stream"
    extension = nombre_archivo.rsplit(".", 1)[-1].lower() if "." in nombre_archivo else "bin"
    path = f"productos/{uuid.uuid4().hex}.{extension}"

    try:
        await anyio.to_thread.run_sync(_upload_sync, path, contenido, content_type)
    except Exception as exc:
        raise SupabaseStorageError(str(exc)) from exc

    return _public_url(path)
