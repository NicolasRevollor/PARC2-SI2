"""Regresiones del chat sin red, credenciales ni base de datos real."""

import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from google.genai import errors, types


@pytest.fixture
def chat(monkeypatch):
    # Cargar solo este servicio: no inicializar Settings ni el motor de BD.
    import sys

    monkeypatch.setitem(sys.modules, "app.config", SimpleNamespace(
        get_settings=lambda: SimpleNamespace(GEMINI_API_KEY="clave-de-prueba"),
    ))
    monkeypatch.setitem(sys.modules, "app.models", SimpleNamespace(
        **{name: object() for name in ("Inventario", "Producto", "Reserva", "Sucursal", "Venta")},
    ))
    path = Path(__file__).parents[1] / "app/services/chat_gemini.py"
    spec = importlib.util.spec_from_file_location("chat_gemini_unit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.asyncio, "sleep", AsyncMock())
    return module


def client_for(generate):
    return SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))


@pytest.mark.parametrize("error", [
    errors.APIError(503, {"message": "Sobrecarga"}),
    errors.APIError(429, {"message": "Limite temporal"}),
    httpx.ReadTimeout("Timeout"),
])
def test_error_temporal_se_recupera(chat, error):
    response = object()
    generate = AsyncMock(side_effect=[error, response])
    assert asyncio.run(chat._generar_respuesta(client_for(generate), [], None)) is response
    assert generate.await_count == 2
    chat.asyncio.sleep.assert_awaited_once_with(1)


@pytest.mark.parametrize("code, attempts", [(400, 1), (403, 1), (503, 3)])
def test_errores_permanentes_y_limite_de_reintentos(chat, code, attempts, caplog):
    generate = AsyncMock(side_effect=errors.APIError(code, {"message": "dato-privado"}))
    with pytest.raises(chat.ChatNoDisponible):
        asyncio.run(chat._generar_respuesta(client_for(generate), [], None))
    assert generate.await_count == attempts
    assert chat.asyncio.sleep.await_count == attempts - 1
    assert str(code) in caplog.text
    assert "dato-privado" not in caplog.text
    assert "clave-de-prueba" not in caplog.text


def test_catalogo_y_reintento_no_repiten_la_consulta(chat, monkeypatch):
    tool_content = types.Content(role="model", parts=[types.Part(
        function_call=types.FunctionCall(name="buscar_productos", args={"talla": "M"}),
        thought_signature=b"firma-del-modelo",
    )])
    first = types.GenerateContentResponse(candidates=[types.Candidate(content=tool_content)])
    final = types.GenerateContentResponse(candidates=[types.Candidate(
        content=types.Content(role="model", parts=[types.Part.from_text(text="Hay una polera M.")]),
    )])
    requests = []

    async def generate(**kwargs):
        requests.append(list(kwargs["contents"]))
        if len(requests) == 1:
            return first
        if len(requests) == 2:
            raise errors.APIError(503, {"message": "Sobrecarga"})
        return final

    monkeypatch.setattr(chat, "_client", lambda: client_for(generate))
    products = AsyncMock(return_value=[{"nombre": "Polera", "talla": "M"}])
    monkeypatch.setattr(chat, "buscar_productos", products)
    session = object()
    text, history = asyncio.run(chat.responder_chat(session, None, "Hay talla M?", [], 1))
    assert text == "Hay una polera M."
    assert len(history) == 2
    products.assert_awaited_once_with(session, 1, talla="M")
    assert requests[1][-2] is tool_content
    assert requests[1][-1].role == "user"
    assert requests[1][-1].parts[0].function_response.name == "buscar_productos"
    assert requests[1] == requests[2]


def test_cliente_configura_timeout_sin_reintentos_duplicados(chat, monkeypatch):
    from unittest.mock import Mock

    constructor = Mock()
    monkeypatch.setattr(chat.genai, "Client", constructor)
    chat._client()
    options = constructor.call_args.kwargs["http_options"]
    assert options.timeout == 20000
    assert options.retry_options.attempts == 1
