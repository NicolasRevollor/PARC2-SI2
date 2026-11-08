# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU21] Registrar empresa contratante (paso 6: correo de activacion)
# [CU24] Gestionar empleados y asignacion a sucursales (paso 5: correo de activacion)
# En palabras simples: el usuario nuevo no recibe una contrasena; recibe un
#   enlace para crearla. Es el mismo formulario de "olvide mi contrasena", con un
#   enlace que dura 72 horas y sirve una sola vez.
# ==================================================================
"""Activacion de cuentas nuevas del personal."""

from datetime import timedelta
from uuid import uuid4

from fastapi.concurrency import run_in_threadpool

from app.config import get_settings
from app.email_utils import send_email
from app.models import Usuario
from app.security import create_token, hash_password, huella_contrasena

settings = get_settings()
HORAS_ACTIVACION = 72


def contrasena_provisional() -> str:
    """Nadie la conoce: la cuenta se usa recien cuando el usuario define la suya."""
    return hash_password(uuid4().hex)


def enlace_activacion(usuario: Usuario) -> str:
    token = create_token(
        subject=str(usuario.idUser),
        # Mismo proposito que la recuperacion: reset-password lo acepta y la huella
        # del hash lo vuelve de un solo uso.
        claims={"purpose": "pwd_reset", "pwh": huella_contrasena(usuario.contraseña), "activacion": True},
        expires_delta=timedelta(hours=HORAS_ACTIVACION),
    )
    return f"{settings.FRONTEND_URL}/?reset_token={token}&activar=1"


async def enviar_activacion(usuario: Usuario, empresa: str) -> tuple[bool, str]:
    """Devuelve (se envio, enlace). Si el correo falla la cuenta igual queda creada
    y se puede reenviar (CU21 flujo alternativo 3)."""
    enlace = enlace_activacion(usuario)
    cuerpo = (
        f"Hola {usuario.nombre}:\n\n"
        f"Se creo tu cuenta de YouShop para {empresa}. Para activarla, define tu contrasena aqui:\n{enlace}\n\n"
        f"El enlace vence en {HORAS_ACTIVACION} horas y sirve una sola vez."
    )
    enviado = await run_in_threadpool(send_email, usuario.correo, "Activa tu cuenta de YouShop", cuerpo)
    return enviado, enlace
