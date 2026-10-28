"""Reglas de la migracion 023: vencimiento de la suscripcion y campos de
sincronizacion de una operacion hecha sin conexion."""

from datetime import datetime, timezone
from uuid import uuid4

from app.services.sincronizacion import campos_sincronizacion
from app.services.suscripciones import sumar_meses


def test_sumar_meses_mismo_dia():
    inicio = datetime(2026, 3, 15, 10, 30, tzinfo=timezone.utc)
    assert sumar_meses(inicio, 1) == datetime(2026, 4, 15, 10, 30, tzinfo=timezone.utc)


def test_sumar_meses_cruza_el_anio():
    assert sumar_meses(datetime(2026, 11, 5, tzinfo=timezone.utc), 3) == datetime(2027, 2, 5, tzinfo=timezone.utc)


def test_sumar_meses_fin_de_mes_cae_en_el_ultimo_dia():
    assert sumar_meses(datetime(2026, 1, 31, tzinfo=timezone.utc), 1) == datetime(2026, 2, 28, tzinfo=timezone.utc)


def test_operacion_en_linea_no_lleva_uuid_del_dispositivo():
    campos = campos_sincronizacion(None, None)
    assert campos == {"origenRegistro": "en_linea", "estadoSincronizacion": "Sincronizada"}


def test_operacion_sin_conexion_guarda_uuid_y_fechas():
    uuid = uuid4()
    hecha = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
    campos = campos_sincronizacion(uuid, hecha)
    assert campos["uuidOperacion"] == str(uuid)
    assert campos["origenRegistro"] == "sin_conexion"
    assert campos["fechaOperacion"] == hecha
    assert campos["fechaSincronizacion"] >= hecha
