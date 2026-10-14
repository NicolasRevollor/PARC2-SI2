import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def send_reset_email(to_email: str, reset_link: str) -> bool:
    """Envia el correo de recuperacion de contrasena via la API
    transaccional de Brevo (https://api.brevo.com/v3/smtp/email) — ya no
    via SMTP.

    Sigue siendo una funcion SINCRONA a proposito: el llamador
    (routers/auth.py) la corre con `run_in_threadpool(...)`, no `await`,
    para no bloquear el event loop; convertirla a async requeriria tambien
    cambiar ese call site.

    Devuelve True si Brevo acepto el envio, False si la API key no esta
    configurada o si ocurrio un error (en ambos casos el llamador cae al
    modo desarrollo devolviendo el token directamente en la respuesta).
    """
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        return False

    cuerpo = (
        "Recibimos una solicitud para restablecer tu contrasena.\n\n"
        f"Haz clic en el siguiente enlace para continuar:\n{reset_link}\n\n"
        "Si no solicitaste esto, puedes ignorar este correo. "
        "El enlace expira en 15 minutos."
    )

    payload = {
        "sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
        "to": [{"email": to_email}],
        "subject": "Restablece tu contrasena",
        "textContent": cuerpo,
    }
    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }

    try:
        response = httpx.post(BREVO_API_URL, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        return True
    except Exception:
        logger.exception("No se pudo enviar el correo de recuperacion (Brevo) a %s", to_email)
        return False
