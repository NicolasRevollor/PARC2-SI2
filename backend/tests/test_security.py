"""Tests de la distincion entre tipos de token (acceso / refresh / recuperacion).

Mismo criterio que test_reports.py: logica pura, sin DB. Cubre lo que antes
fallaba: un refresh token (7 dias) o un enlace de recuperacion de contrasena
se aceptaban como token de acceso, y cualquier JWT valido servia en /refresh.
"""

from app.security import (
    create_access_token,
    create_pwd_reset_token,
    create_refresh_token,
    decode_token,
    es_access_token,
    es_refresh_token,
    huella_contrasena,
)


def test_access_token_se_reconoce_como_acceso_y_no_como_refresh():
    payload = decode_token(create_access_token(1, {"rol": "Cliente", "permisos": []}))
    assert es_access_token(payload)
    assert not es_refresh_token(payload)


def test_refresh_token_no_sirve_como_acceso():
    payload = decode_token(create_refresh_token(1))
    assert es_refresh_token(payload)
    assert not es_access_token(payload)


def test_token_de_recuperacion_no_es_ni_acceso_ni_refresh():
    payload = decode_token(create_pwd_reset_token(1, "hash-actual"))
    assert not es_access_token(payload)
    assert not es_refresh_token(payload)


def test_tokens_previos_al_claim_type_se_siguen_distinguiendo():
    # Emitidos antes de este cambio: el access traia "permisos", el refresh no.
    acceso_viejo = {"sub": "1", "rol": "Cliente", "permisos": ["venta.crear"]}
    refresh_viejo = {"sub": "1"}
    assert es_access_token(acceso_viejo) and not es_refresh_token(acceso_viejo)
    assert es_refresh_token(refresh_viejo) and not es_access_token(refresh_viejo)


def test_la_huella_cambia_al_cambiar_la_contrasena():
    # El enlace de recuperacion guarda la huella del hash vigente: tras usarlo
    # una vez el hash cambia y el mismo enlace deja de ser valido.
    assert huella_contrasena("hash-1") == huella_contrasena("hash-1")
    assert huella_contrasena("hash-1") != huella_contrasena("hash-2")
