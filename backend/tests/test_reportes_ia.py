"""Tests del analisis multi-sucursal sin red: el motor de reglas, la
deteccion de clave de Gemini invalida y el respaldo cuando la IA falla."""

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from google.genai import errors as genai_errors

from app.services import reportes_ia
from app.services.horario import fin_del_dia, inicio_del_dia


def _metrica(codigo: int, nombre: str, monto: str, unidades: int, stock: int = 200) -> dict:
    return {
        "codigoSucursal": codigo,
        "sucursal": nombre,
        "unidades_vendidas": unidades,
        "monto_vendido": Decimal(monto),
        "stock_total": stock,
        "stock_reservado": 0,
        "skus": 26,
        "skus_criticos": 0,
    }


def _fila(id_producto: int, codigo: int, sucursal: str, disponible: int, talla: str = "M") -> dict:
    return {
        "idProducto": id_producto,
        "producto": "Polera Oversize Negro",
        "talla": talla,
        "codigoSucursal": codigo,
        "sucursal": sucursal,
        "disponible": disponible,
    }


METRICAS = [_metrica(1, "Equipetrol", "9000", 40), _metrica(2, "El Prado", "3000", 12)]


def test_reglas_sugieren_transferencia_de_exceso_a_quiebre():
    detalle = [_fila(7, 1, "Equipetrol", 2), _fila(7, 2, "El Prado", 26)]

    analisis = reportes_ia.analizar_por_reglas(METRICAS, detalle, "ultimos 30 dias")

    assert len(analisis.transferencias) == 1
    t = analisis.transferencias[0]
    assert (t.desdeSucursal, t.haciaSucursal) == ("El Prado", "Equipetrol")
    # Lo justo para dejar el quiebre en el objetivo sin vaciar el origen.
    assert t.unidades == reportes_ia.OBJETIVO_TRAS_TRANSFERIR - 2
    assert "talla M" in t.producto


def test_reglas_sin_exceso_no_transfieren_y_alertan_quiebre_total():
    detalle = [_fila(7, 1, "Equipetrol", 1), _fila(7, 2, "El Prado", 3)]

    analisis = reportes_ia.analizar_por_reglas(METRICAS, detalle, "ultimos 30 dias")

    assert analisis.transferencias == []
    assert any("todas las sucursales" in a for a in analisis.alertas)


def test_reglas_hallazgos_por_sucursal_ordenados_por_venta():
    analisis = reportes_ia.analizar_por_reglas(METRICAS, [], "ultimos 30 dias")

    assert [h.sucursal for h in analisis.hallazgos] == ["Equipetrol", "El Prado"]
    assert all(h.severidad in {"Alta", "Media", "Baja"} for h in analisis.hallazgos)
    assert "Equipetrol lidera con el 75%" in analisis.resumen


def test_reglas_sin_sucursales_no_explotan():
    analisis = reportes_ia.analizar_por_reglas([], [], "todo el historial")

    assert analisis.hallazgos == []
    assert "0 sucursal(es)" in analisis.resumen


def test_clave_invalida_se_reconoce_aunque_google_responda_400():
    exc = genai_errors.ClientError(
        400, {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}
    )
    assert reportes_ia._es_clave_invalida(exc)
    assert not reportes_ia._es_clave_invalida(
        genai_errors.ClientError(429, {"error": {"code": 429, "message": "Resource exhausted", "status": "RESOURCE_EXHAUSTED"}})
    )


def test_respaldo_usa_reglas_y_avisa_cuando_la_ia_falla(monkeypatch):
    async def falla(*_args):
        raise reportes_ia.GeminiCredencialInvalida("API key not valid")

    monkeypatch.setattr(reportes_ia, "analizar_sucursales", falla)
    detalle = [_fila(7, 1, "Equipetrol", 2), _fila(7, 2, "El Prado", 26)]

    analisis, generado_por, aviso = asyncio.run(reportes_ia.analizar_con_respaldo(METRICAS, detalle, "ultimos 30 dias"))

    assert generado_por == reportes_ia.MOTOR_REGLAS
    assert aviso and "GEMINI_API_KEY" in aviso
    assert len(analisis.transferencias) == 1


def test_respaldo_no_avisa_cuando_la_ia_responde(monkeypatch):
    esperado = reportes_ia.AnalisisSucursales(resumen="ok", hallazgos=[], transferencias=[], alertas=[])

    async def responde(*_args):
        return esperado

    monkeypatch.setattr(reportes_ia, "analizar_sucursales", responde)

    analisis, generado_por, aviso = asyncio.run(reportes_ia.analizar_con_respaldo(METRICAS, [], "ultimos 30 dias"))

    assert (analisis, generado_por, aviso) == (esperado, reportes_ia.MODEL, None)


def test_cortes_de_dia_en_hora_de_bolivia():
    dia = date(2026, 10, 23)

    assert inicio_del_dia(dia).astimezone(timezone.utc) == datetime(2026, 10, 23, 4, 0, tzinfo=timezone.utc)
    assert fin_del_dia(dia) - inicio_del_dia(dia) < timedelta(days=1)
    assert fin_del_dia(dia).astimezone(timezone.utc).date() == date(2026, 10, 24)


def test_montos_salen_como_numero_en_el_json():
    # La web los sumaba como texto ("071520.00108360.00 Bs") cuando el JSON
    # traia los Decimal serializados como string.
    from app.schemas.reports import SucursalMetricaOut

    fila = SucursalMetricaOut(**_metrica(1, "Equipetrol", "71520.50", 428))

    assert fila.monto_vendido == Decimal("71520.50")
    assert fila.model_dump(mode="json")["monto_vendido"] == 71520.5
