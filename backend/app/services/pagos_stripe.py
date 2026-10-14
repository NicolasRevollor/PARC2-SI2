"""Wrapper delgado sobre el SDK sincrono de Stripe.

Este modulo es generico: no conoce `Venta`, `Reserva` ni inventario. Solo
sabe crear y verificar Payment Intents. El SDK de Stripe es sincrono, asi
que cada llamada de red corre en un hilo aparte via `anyio.to_thread.run_sync`
para no bloquear el event loop de FastAPI.

Si `STRIPE_SECRET_KEY` no esta configurada (o el paquete `stripe` no esta
instalado), `stripe_configurado()` devuelve False y el router debe responder
503 antes de llamar a cualquier funcion de este modulo — el mismo patron de
degradacion que `email_utils.py` usa con SMTP.
"""

from decimal import Decimal

import anyio

from app.config import get_settings

try:
    import stripe
except ImportError:  # pragma: no cover - stripe siempre deberia estar instalado
    stripe = None

settings = get_settings()


class StripeNoConfigurado(RuntimeError):
    """`STRIPE_SECRET_KEY` no esta configurada o el paquete `stripe` falta."""


class StripePagoError(RuntimeError):
    """Stripe respondio con un error al crear o consultar un Payment Intent."""


def stripe_configurado() -> bool:
    """True solo si el paquete `stripe` esta importado Y hay una secret key."""
    return stripe is not None and bool(settings.STRIPE_SECRET_KEY)


def _api_key() -> str:
    if not stripe_configurado():
        raise StripeNoConfigurado("STRIPE_SECRET_KEY no esta configurada")
    return settings.STRIPE_SECRET_KEY  # type: ignore[return-value]


async def crear_payment_intent(
    *,
    monto_usd: Decimal,
    clave_idempotencia: str,
    metadata: dict[str, str],
) -> dict:
    """Crea un Payment Intent con un monto SIEMPRE calculado por el llamador
    del lado servidor (nunca por el cliente HTTP).

    `clave_idempotencia` ya debe venir formada por el router como
    `f"pi:{idUser}:{claveIntento}"` para namespacear por usuario y evitar
    doble cobro en un doble click / retry.
    """
    api_key = _api_key()
    centavos = int((monto_usd * 100).to_integral_value())

    def _crear() -> "stripe.PaymentIntent":
        return stripe.PaymentIntent.create(
            amount=centavos,
            currency="usd",
            metadata=metadata,
            idempotency_key=clave_idempotencia,
            api_key=api_key,
        )

    try:
        intent = await anyio.to_thread.run_sync(_crear)
    except stripe.error.StripeError as exc:  # type: ignore[union-attr]
        raise StripePagoError(str(exc)) from exc

    return {
        "id": intent["id"],
        "client_secret": intent["client_secret"],
        "status": intent["status"],
        "amount": intent["amount"],
    }


async def obtener_payment_intent(payment_intent_id: str) -> dict:
    """Consulta el estado REAL de un Payment Intent contra Stripe.

    Nunca confiar en un flag enviado por el frontend: esta es la unica
    fuente de verdad sobre si un pago realmente se completo.
    """
    api_key = _api_key()

    def _consultar() -> "stripe.PaymentIntent":
        return stripe.PaymentIntent.retrieve(payment_intent_id, api_key=api_key)

    try:
        intent = await anyio.to_thread.run_sync(_consultar)
    except stripe.error.StripeError as exc:  # type: ignore[union-attr]
        raise StripePagoError(str(exc)) from exc

    return {
        "id": intent["id"],
        "status": intent["status"],
        "amount_received": intent["amount_received"],
        "currency": intent["currency"],
        "metadata": dict(getattr(intent["metadata"], "to_dict", lambda: intent["metadata"] or {})()),
    }
