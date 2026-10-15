"""Tests de la ventana de 24 h para devoluciones y cambios de talla (CU28).

Mismo criterio que test_reports.py: solo logica pura (sin DB, sin I/O). Lo
que se testea aca es justamente lo que el router NO puede equivocarse:
decidir si una venta sigue siendo elegible, incluida la comparacion entre
fechas naive (como las escribe `datetime.utcnow()` en Venta.fecha) y fechas
con tzinfo (como las devuelve el driver al releer un TIMESTAMPTZ).
"""

from datetime import datetime, timedelta, timezone

from app.routers.returns import (
    VENTANA_DEVOLUCION_HORAS,
    dentro_de_ventana,
    horas_restantes,
)

AHORA = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)


def test_venta_recien_hecha_esta_dentro_de_la_ventana():
    assert dentro_de_ventana(AHORA - timedelta(minutes=5), AHORA) is True


def test_venta_de_hace_23_horas_sigue_siendo_elegible():
    assert dentro_de_ventana(AHORA - timedelta(hours=23), AHORA) is True


def test_venta_de_hace_mas_de_24_horas_ya_no_es_elegible():
    assert dentro_de_ventana(AHORA - timedelta(hours=24, minutes=1), AHORA) is False


def test_el_limite_exacto_de_24_horas_queda_fuera():
    # A las 24 h en punto la ventana ya vencio: horas_restantes == 0 y la
    # condicion del router es estrictamente > 0.
    assert horas_restantes(AHORA - timedelta(hours=VENTANA_DEVOLUCION_HORAS), AHORA) == 0
    assert dentro_de_ventana(AHORA - timedelta(hours=VENTANA_DEVOLUCION_HORAS), AHORA) is False


def test_fecha_naive_se_interpreta_como_utc_y_no_explota():
    # Venta.fecha se escribe con datetime.utcnow() (naive). Comparar naive
    # contra aware sin normalizar tiraria TypeError.
    naive = (AHORA - timedelta(hours=2)).replace(tzinfo=None)
    assert dentro_de_ventana(naive, AHORA) is True
    assert round(horas_restantes(naive, AHORA), 2) == 22.0


def test_horas_restantes_es_negativo_cuando_vencio():
    assert horas_restantes(AHORA - timedelta(hours=30), AHORA) == -6
