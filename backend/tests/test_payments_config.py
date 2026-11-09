"""La tienda usa la clave PUBLICA del backend aunque no exista VITE_STRIPE_*."""

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.routers import payments


@pytest.mark.parametrize("configured, public_key, expected_key", [
    (True, "pk_test_demo", "pk_test_demo"),
    (True, "pk_live_demo", "pk_live_demo"),
    (False, None, None),
    (True, "", None),
    (True, "sk_test_nunca_publicar", None),
])
def test_configuracion_publica_no_requiere_db_ni_expone_secretos(monkeypatch, configured, public_key, expected_key):
    monkeypatch.setattr(payments, "stripe_configurado", lambda: configured)
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        STRIPE_PUBLISHABLE_KEY=public_key, STRIPE_SECRET_KEY="secreto-privado",
    ))
    app = FastAPI()
    app.include_router(payments.router)

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.get("/api/payments/config")

    response = asyncio.run(request())
    assert response.status_code == 200
    assert response.json() == {"disponible": configured, "publishableKey": expected_key}
    assert "secreto-privado" not in response.text
    assert "sk_test_nunca_publicar" not in response.text
