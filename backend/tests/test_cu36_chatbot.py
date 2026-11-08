"""[CU36] Asistente virtual: perfil publico, cliente y administrador con reportes,
contra una base PostgreSQL real (solo con TEST_DATABASE_URL definida). Sin clave de
Gemini en las pruebas: el asistente del personal usa el motor de reglas."""

import os

import pytest

from app.services import chat_admin as ca
from tests.test_cu12_cu20_integracion import Cliente, correr, sql
from tests.test_cu33_cupones import cliente_nuevo

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")


def test_reglas_del_asistente():
    assert ca.formatos_pedidos("dame las ventas en PDF y en csv") == ["pdf", "csv"]
    assert ca.formatos_pedidos("pasamelo a excel") == ["csv"]
    assert ca.formatos_pedidos("quiero la pagina web") == ["html"]
    assert ca.parece_reporte("ventas de octubre por sucursal") and not ca.parece_reporte("hola, como estas?")
    assert ca._limpiar("ventas por sucursal en pdf") == "ventas por sucursal"


def pedir(http, metodo, ruta, **kw):
    return correr(http.pedir(metodo, ruta, **kw))


@pytest.fixture(scope="module")
def admin():
    u = sql('select u."idUser" i from "Usuario" u join rol r using ("codigoRol") where r."nombreRol" = \'Administrador\' and u."idTenant" = 1 and u.activo limit 1')[0]["i"]
    return correr(Cliente(u).preparar())


def test_cu36_admin_pide_un_reporte_y_lo_descarga_en_pdf_csv_y_html(admin):
    r = pedir(admin, "POST", "/api/chat/admin", json={"mensaje": "Dame las ventas de los ultimos 90 dias por sucursal en pdf, csv y html"})
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["respuesta"].startswith("Listo") and {a["formato"] for a in datos["archivos"]} == {"pdf", "csv", "html"}
    assert len(datos["historial"]) == 2
    rutas = {a["formato"]: a["ruta"] for a in datos["archivos"]}
    pdf = pedir(admin, "GET", rutas["pdf"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    csv = pedir(admin, "GET", rutas["csv"])
    assert csv.status_code == 200 and "Sucursal" in csv.content.decode("utf-8-sig").splitlines()[0]
    html = pedir(admin, "GET", rutas["html"])
    assert html.status_code == 200 and html.text.startswith("<!doctype html>") and "<table>" in html.text
    # Sin formato: PDF por defecto. Algo que no es del negocio: explica que puede hacer.
    assert [a["formato"] for a in pedir(admin, "POST", "/api/chat/admin", json={"mensaje": "stock disponible por sucursal"}).json()["archivos"]] == ["pdf"]
    ayuda = pedir(admin, "POST", "/api/chat/admin", json={"mensaje": "hola"}).json()
    assert ayuda["archivos"] == [] and "PDF, CSV o HTML" in ayuda["respuesta"]
    # Intentar modificar datos se rechaza (mismo control que el CU26).
    assert "Listo" not in pedir(admin, "POST", "/api/chat/admin", json={"mensaje": "borra las ventas de ayer en pdf"}).json()["respuesta"]


def test_cu36_permisos_y_perfiles(admin):
    cli = cliente_nuevo()
    assert pedir(cli["http"], "POST", "/api/chat/admin", json={"mensaje": "ventas en pdf"}).status_code == 403
    r = pedir(admin, "POST", "/api/chat/admin", json={"mensaje": "ventas por sucursal en csv"}).json()
    # Un cliente no descarga reportes de la empresa.
    assert pedir(cli["http"], "GET", r["archivos"][0]["ruta"]).status_code == 403
    assert pedir(admin, "GET", r["archivos"][0]["ruta"].replace(".csv", ".exe")).status_code == 404
    # La landing no necesita cuenta; sin clave de Gemini responde que no esta configurado.
    publico = Cliente(0)
    r = pedir(publico, "POST", "/api/chat/publico", json={"mensaje": "Que tallas de jeans tienen?"})
    assert r.status_code in (200, 503)
    # El personal no usa el chat de clientes.
    assert pedir(admin, "POST", "/api/chat", json={"mensaje": "hola"}).status_code == 403


def test_cu36_chat_publico_tiene_limite_por_ip():
    from app.routers import chat

    chat._pedidos_por_ip.clear()
    publico = Cliente(0)
    codigos = [pedir(publico, "POST", "/api/chat/publico", json={"mensaje": "hola"}).status_code for _ in range(chat.LIMITE_PUBLICO + 1)]
    assert codigos[-1] == 429 and 429 not in codigos[:-1]
    chat._pedidos_por_ip.clear()
