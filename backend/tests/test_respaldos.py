"""Tests de la logica pura de respaldos por empresa (migracion 018).

Mismo criterio que test_reports.py / test_returns.py: sin DB ni red. Cubren
lo que no puede fallar en silencio: que el secreto del cron no se pueda
adivinar ni saltear, que la retencion nunca borre el ultimo respaldo, y que
un respaldo se pueda leer de vuelta sin perder precision en los montos.
"""

import ipaddress
from datetime import date, datetime, time, timezone
from decimal import Decimal

import pytest

from app.services.respaldos import (
    _ruta_local,
    a_json,
    deserializar,
    ruta_archivo,
    secreto_valido,
    seleccionar_para_borrar,
    serializar,
)


def test_secreto_correcto_es_valido():
    assert secreto_valido("abc123", "abc123") is True


def test_secreto_incorrecto_o_vacio_no_es_valido():
    assert secreto_valido("otro", "abc123") is False
    assert secreto_valido(None, "abc123") is False
    assert secreto_valido("", "abc123") is False


def test_sin_secreto_configurado_nada_es_valido():
    # Si el servidor no tiene BACKUP_CRON_SECRET, ni siquiera un valor vacio
    # puede pasar: el endpoint queda deshabilitado.
    assert secreto_valido("", None) is False
    assert secreto_valido("cualquiera", "") is False


def test_retencion_conserva_los_mas_nuevos():
    respaldos_desc = ["r10", "r9", "r8", "r7", "r6"]
    assert seleccionar_para_borrar(respaldos_desc, 3) == ["r7", "r6"]


def test_retencion_no_borra_nada_si_hay_menos_que_el_tope():
    assert seleccionar_para_borrar(["r2", "r1"], 7) == []


def test_retencion_invalida_nunca_borra_el_ultimo_respaldo():
    assert seleccionar_para_borrar(["r3", "r2", "r1"], 0) == ["r2", "r1"]


def test_a_json_preserva_montos_y_fechas():
    assert a_json(Decimal("199.90")) == "199.90"  # sin pasar por float
    assert a_json(date(2026, 10, 13)) == "2026-10-13"
    assert a_json(time(14, 30)) == "14:30:00"
    assert a_json(ipaddress.ip_address("10.0.0.1")) == "10.0.0.1"
    assert a_json(["a", Decimal("1.5")]) == ["a", "1.5"]


def test_serializar_y_deserializar_es_reversible():
    contenido = {"tablas": {"Venta": [{"idVenta": 1, "total": Decimal("250.00")}]}}
    datos = serializar(contenido)
    assert datos[:2] == b"\x1f\x8b"  # cabecera gzip
    assert deserializar(datos) == {"tablas": {"Venta": [{"idVenta": 1, "total": "250.00"}]}}


def test_ruta_archivo_separa_por_empresa():
    momento = datetime(2026, 10, 19, 6, 0, 5, tzinfo=timezone.utc)
    assert ruta_archivo(4, "automatico", momento) == "tenant-4/20261019-060005-automatico.json.gz"


def test_ruta_local_rechaza_escapes_de_carpeta():
    with pytest.raises(ValueError):
        _ruta_local("../../app/config.py")
