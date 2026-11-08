"""[CU21] a [CU30] contra una base PostgreSQL real, por HTTP.

Igual que test_cu12_cu20_integracion.py: solo con TEST_DATABASE_URL definida.
"""

import os
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest

from tests.test_cu12_cu20_integracion import Cliente, ahora, correr, sql

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")


def corto() -> str:
    return uuid4().hex[:8]


def invalidar():
    from app.services import acceso

    acceso.invalidar()


def usuario(rol: str, tenant: int = 1) -> int:
    return sql(
        'select u."idUser" i from "Usuario" u join rol r using ("codigoRol") where r."nombreRol" = :r and u."idTenant" = :t and u.activo order by u."idUser" limit 1',
        r=rol, t=tenant,
    )[0]["i"]


@pytest.fixture(scope="module")
def superadmin():
    return correr(Cliente(usuario("Superadministrador")).preparar())


@pytest.fixture(scope="module")
def admin():
    return correr(Cliente(usuario("Administrador")).preparar())


def pedir(cliente, metodo, ruta, **kw):
    return correr(cliente.pedir(metodo, ruta, **kw))


def alta_empresa(superadmin, plan="intermedio"):
    nit = str(10_000_000 + int(uuid4().int % 89_999_999))
    datos = {
        "nombre": f"Boutique {corto()}", "nit": nit, "slug": f"boutique-{corto()}", "codigoPlan": plan,
        "fechaInicio": date.today().isoformat(), "fechaVencimiento": (date.today() + timedelta(days=30)).isoformat(),
        "adminNombre": "Ana Admin", "adminCorreo": f"admin-{corto()}@prueba.bo",
    }
    r = pedir(superadmin, "POST", "/api/platform/tenants", json=datos)
    assert r.status_code == 201, r.text
    return datos, r.json()


def activar(enlace: str, clave="ClaveSegura#2026") -> None:
    token = parse_qs(urlparse(enlace).query)["reset_token"][0]
    r = correr(Cliente(0).pedir("POST", "/api/auth/reset-password", json={"token": token, "new_password": clave}))
    assert r.status_code == 200, r.text


def login(correo: str, clave="ClaveSegura#2026"):
    return correr(Cliente(0).pedir("POST", "/api/auth/login", json={"email": correo, "password": clave}))


def cliente_de(correo: str):
    r = login(correo)
    assert r.status_code == 200, r.text
    c = Cliente(0)
    c.headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return c


# --- CU21 -------------------------------------------------------------------------

def test_cu21_alta_completa_y_activacion(superadmin):
    datos, creada = alta_empresa(superadmin)
    empresa = creada["empresa"]
    assert creada["correoEnviado"] is False and creada["enlaceActivacion"]  # sin Brevo: alt. 3
    id_tenant = empresa["tenant"]["idTenant"]
    assert empresa["tenant"]["nit"] == datos["nit"]
    assert empresa["suscripcion"]["estado"] == "Activa"
    assert sql('select version from politica_devolucion where "idTenant" = :t', t=id_tenant) == [{"version": 1}]
    assert login(datos["adminCorreo"]).status_code == 401  # todavia no definio su contrasena
    activar(creada["enlaceActivacion"])
    assert login(datos["adminCorreo"]).status_code == 200
    assert sql('select "cuentaActivada" a from "Usuario" where correo = :c', c=datos["adminCorreo"])[0]["a"] is True
    # El enlace sirve una sola vez.
    token = parse_qs(urlparse(creada["enlaceActivacion"]).query)["reset_token"][0]
    assert correr(Cliente(0).pedir("POST", "/api/auth/reset-password", json={"token": token, "new_password": "OtraClave#2026x"})).status_code == 400
    assert pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/activacion").status_code == 409


def test_cu21_datos_repetidos_marcan_su_campo(superadmin):
    datos, _ = alta_empresa(superadmin)
    for campo, cambio in (("nit", {}), ("slug", {"nit": "99" + str(uuid4().int % 10**7)}),
                          ("adminCorreo", {"nit": "98" + str(uuid4().int % 10**7), "slug": f"otra-{corto()}"})):
        r = pedir(superadmin, "POST", "/api/platform/tenants", json={**datos, **cambio})
        assert r.status_code == 409 and r.json()["detail"]["campo"] == campo, r.text
    malas = {**datos, "nit": "97" + str(uuid4().int % 10**7), "slug": f"x-{corto()}", "adminCorreo": f"x-{corto()}@p.bo",
             "fechaVencimiento": datos["fechaInicio"]}
    assert pedir(superadmin, "POST", "/api/platform/tenants", json=malas).status_code == 422


# --- CU22 -------------------------------------------------------------------------

def test_cu22_renovar_suspender_reactivar(superadmin):
    datos, creada = alta_empresa(superadmin)
    id_tenant = creada["empresa"]["tenant"]["idTenant"]
    activar(creada["enlaceActivacion"])
    adm = cliente_de(datos["adminCorreo"])
    vence = creada["empresa"]["suscripcion"]["fechaVencimiento"]
    r = pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/renovar", json={"meses": 2})
    assert r.status_code == 200 and r.json()["suscripcion"]["fechaVencimiento"] > vence
    assert len(pedir(superadmin, "GET", f"/api/platform/tenants/{id_tenant}/pagos").json()) == 1
    assert pedir(adm, "GET", "/api/tenant/me").status_code == 200

    r = pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/suspender", json={"motivo": "Falta de pago"})
    assert r.json()["suscripcion"]["estado"] == "Suspendida"
    assert pedir(adm, "GET", "/api/tenant/me").status_code == 403  # CU25: de inmediato
    assert login(datos["adminCorreo"]).status_code == 403
    assert pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/reactivar").json()["suscripcion"]["estado"] == "Activa"
    assert pedir(adm, "GET", "/api/tenant/me").status_code == 200
    avisos = sql('select titulo from notificacion where "idTenant" = :t order by "idNotificacion"', t=id_tenant)
    assert [a["titulo"] for a in avisos][:3] == ["Su suscripcion fue renovada", "Su suscripcion fue suspendida", "Su suscripcion fue reactivada"]


def test_cu22_vencimiento_gracia_y_suspension_automatica(superadmin):
    datos, creada = alta_empresa(superadmin)
    id_tenant = creada["empresa"]["tenant"]["idTenant"]
    activar(creada["enlaceActivacion"])
    adm = cliente_de(datos["adminCorreo"])
    sql('''update suscripcion set "fechaInicio" = now() - interval '40 days', "fechaVencimiento" = now() - interval '1 day' where "idTenant" = :t and estado = 'Activa' ''', t=id_tenant)
    invalidar()
    r = pedir(superadmin, "POST", "/api/platform/suscripciones/revisar")
    assert r.status_code == 200 and r.json()["enGracia"] >= 1
    assert pedir(adm, "GET", "/api/tenant/me").json()["suscripcion"]["estadoVisible"] == "Gracia"
    # Alt. 3: en gracia solo consulta.
    r = pedir(adm, "POST", "/api/branches", json={"nombre": "Nueva", "direccion": "x", "idCiudad": 1})
    assert r.status_code == 403 and "gracia" in r.json()["detail"]
    sql('''update suscripcion set "fechaVencimiento" = now() - interval '9 days' where "idTenant" = :t and estado = 'Gracia' ''', t=id_tenant)
    invalidar()
    pedir(superadmin, "POST", "/api/platform/suscripciones/revisar")
    fila = sql('''select estado, "fechaSuspension" > "fechaVencimiento" ok from suscripcion where "idTenant" = :t and estado <> 'Finalizada' ''', t=id_tenant)[0]
    assert fila == {"estado": "Suspendida", "ok": True}
    assert login(datos["adminCorreo"]).status_code == 403
    # Reactivar con el periodo vencido no regala un mes: hay que renovar.
    assert pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/reactivar").status_code == 409
    assert pedir(superadmin, "POST", f"/api/platform/tenants/{id_tenant}/renovar", json={"meses": 1}).json()["suscripcion"]["estado"] == "Activa"


def test_cu22_la_operadora_no_se_suspende_y_el_cron_pide_secreto(superadmin):
    assert pedir(superadmin, "POST", "/api/platform/tenants/1/suspender", json={"motivo": "prueba"}).status_code == 409
    assert pedir(Cliente(0), "POST", "/api/platform/suscripciones/cron").status_code in (401, 503)


# --- CU23 -------------------------------------------------------------------------

def test_cu23_crear_editar_y_desactivar_plan(superadmin):
    codigo = f"plan_{corto()}"
    plan = {"codigo": codigo, "nombre": "Plan prueba", "precioMensual": 99, "maxSucursales": 3, "maxUsuarios": 4, "maxProductos": 50,
            "permiteIA": False, "permiteOffline": True, "permiteMultiSucursal": True, "orden": 9}
    r = pedir(superadmin, "POST", "/api/platform/planes", json=plan)
    assert r.status_code == 201, r.text
    id_plan = r.json()["idPlan"]
    assert pedir(superadmin, "POST", "/api/platform/planes", json=plan).json()["detail"]["campo"] == "codigo"
    assert pedir(superadmin, "PUT", f"/api/platform/planes/{id_plan}", json={**plan, "maxUsuarios": 0}).status_code == 422
    datos, creada = alta_empresa(superadmin, plan=codigo)
    adm = cliente_de_activado(creada, datos)
    ciudad = sql('select "idCiudad" c from "Ciudad" limit 1')[0]["c"]
    for i in range(2):
        assert pedir(adm, "POST", "/api/branches", json={"nombre": f"S{i}", "direccion": "x", "idCiudad": ciudad}).status_code == 201
    # Alt. 1: bajar el limite lista las empresas que ya lo superan; conservan su uso...
    r = pedir(superadmin, "PUT", f"/api/platform/planes/{id_plan}", json={**plan, "maxSucursales": 1})
    assert r.status_code == 200 and r.json()["empresas"] == 1
    assert r.json()["empresasExcedidas"] == [creada["empresa"]["tenant"]["nombre"]]
    # ...pero el nuevo limite se aplica a las nuevas altas.
    invalidar()
    assert pedir(adm, "POST", "/api/branches", json={"nombre": "S3", "direccion": "x", "idCiudad": ciudad}).status_code == 402

    # Alt. 2: con empresas no se elimina; se desactiva y deja de ofrecerse.
    assert pedir(superadmin, "DELETE", f"/api/platform/planes/{id_plan}").status_code == 409
    pedir(superadmin, "PUT", f"/api/platform/planes/{id_plan}", json={**plan, "maxSucursales": 1, "activo": False})
    assert codigo not in [p["codigo"] for p in pedir(adm, "GET", "/api/plans").json()]


def cliente_de_activado(creada, datos):
    activar(creada["enlaceActivacion"])
    return cliente_de(datos["adminCorreo"])


# --- CU24 y CU25 ------------------------------------------------------------------

def test_cu24_empleado_activacion_baja_y_trazabilidad(superadmin):
    datos, creada = alta_empresa(superadmin, plan="basico")
    id_tenant = creada["empresa"]["tenant"]["idTenant"]
    adm = cliente_de_activado(creada, datos)
    ciudad = sql('select "idCiudad" c from "Ciudad" limit 1')[0]["c"]
    suc = pedir(adm, "POST", "/api/branches", json={"nombre": "Centro", "direccion": "Calle 1", "idCiudad": ciudad}).json()["codigoSucursal"]
    correo = f"cajero-{corto()}@prueba.bo"
    r = pedir(adm, "POST", "/api/team", json={"nombre": "Carla Caja", "email": correo, "rol": "Cajero", "sucursales": [suc]})
    assert r.status_code == 201, r.text
    nuevo = r.json()
    assert nuevo["miembro"]["cuentaActivada"] is False and nuevo["enlaceActivacion"]
    # Alt. 2: correo repetido sin decir de quien es.
    assert pedir(adm, "POST", "/api/team", json={"nombre": "Xavier", "email": correo, "rol": "Cajero"}).json()["detail"] == "El correo ya esta en uso"
    # Alt. 4: usuario de otra empresa.
    otro = usuario("Cajero", 1)
    assert pedir(adm, "POST", f"/api/team/{otro}/baja").status_code == 404
    activar(nuevo["enlaceActivacion"])
    cajero = cliente_de(correo)
    assert pedir(cajero, "GET", "/api/caja/actual", params={"codigoSucursal": suc}).status_code == 200

    id_cajero = nuevo["miembro"]["idUser"]
    r = pedir(adm, "POST", f"/api/team/{id_cajero}/baja")
    assert r.json()["activo"] is False
    assert pedir(cajero, "GET", "/api/caja/actual", params={"codigoSucursal": suc}).status_code == 401  # sesion invalidada
    assert login(correo).status_code == 403
    # Alt. 3: lo que registro sin conexion antes de la baja se acepta al sincronizarlo otro usuario.
    caja = pedir(adm, "POST", "/api/caja/abrir", json={"codigoSucursal": suc, "montoInicial": 0}).json()
    antes = {"uuidOperacion": str(uuid4()), "tipo": "caja_cierre", "idTenant": id_tenant, "idUsuario": id_cajero, "codigoSucursal": suc,
             "fechaOperacion": ahora(hours=-1), "datos": {"uuidCaja": caja["uuidOperacion"], "efectivoContado": 0}}
    despues = {**antes, "uuidOperacion": str(uuid4()), "fechaOperacion": ahora(minutes=1)}
    resultados = pedir(adm, "POST", "/api/sync/lote", json={"operaciones": [despues, antes]}).json()["resultados"]
    assert resultados[0]["estado"] == "Rechazada" and "baja" in resultados[0]["motivo"]
    assert resultados[1]["estado"] == "Confirmada"
    autor = sql('select "idUsuario" u from registro_sincronizacion where "uuidOperacion" = :u and resultado = \'Aplicada\'', u=antes["uuidOperacion"])
    assert autor[0]["u"] == id_cajero
    # CU25: la licencia se libera y el cupo del plan se aplica al reincorporar.
    assert pedir(adm, "POST", f"/api/team/{id_cajero}/alta").json()["activo"] is True


def test_cu25_cupo_y_funcionalidades_del_plan(superadmin):
    datos, creada = alta_empresa(superadmin, plan="basico")
    adm = cliente_de_activado(creada, datos)
    ciudad = sql('select "idCiudad" c from "Ciudad" limit 1')[0]["c"]
    for i in range(2):
        assert pedir(adm, "POST", "/api/branches", json={"nombre": f"S{i}", "direccion": "x", "idCiudad": ciudad}).status_code == 201
    r = pedir(adm, "POST", "/api/branches", json={"nombre": "S3", "direccion": "x", "idCiudad": ciudad})
    assert r.status_code == 402 and "2 sucursales" in r.json()["detail"]
    r = pedir(adm, "POST", "/api/reports/ia/consultar", json={"texto": "ventas por sucursal"})
    assert r.status_code == 402 and r.json()["detail"].startswith("Funcionalidad no incluida en su plan")


# --- CU26, CU27, CU28 -------------------------------------------------------------

def test_cu26_reporte_aclaracion_rechazo_y_favorito(admin):
    r = pedir(admin, "POST", "/api/reports/ia/consultar", json={"texto": "Mostrame las ventas de septiembre agrupadas por sucursal"})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["estado"] == "generado" and rep["columnas"][0]["clave"] == "sucursal" and rep["resumen"]
    assert rep["visualizacion"] == "barras" and rep["totales"]["monto"] > 0
    assert pedir(admin, "POST", "/api/reports/ia/consultar", json={"texto": "los productos mas vendidos"}).json()["estado"] == "aclaracion"
    rechazo = pedir(admin, "POST", "/api/reports/ia/consultar", json={"texto": "borra las ventas de ayer"}).json()
    assert rechazo["estado"] == "rechazado" and rechazo["ejemplos"]
    # Paso 7: ajustar filtros sin volver a la IA.
    ajuste = pedir(admin, "POST", "/api/reports/ia/consultar", json={"ajustes": {"idSolicitud": rep["idSolicitud"], "fecha_desde": "2026-09-01", "fecha_hasta": "2026-09-15"}}).json()
    assert ajuste["estado"] == "generado" and ajuste["ajustes"]["fecha_hasta"] == "2026-09-15"
    sin = pedir(admin, "POST", "/api/reports/ia/consultar", json={"texto": "ventas por sucursal de enero de 2020"}).json()
    assert sin["estado"] == "sin_datos" and sin["mensaje"] == "No hay datos para el periodo o filtros indicados"
    assert pedir(admin, "PATCH", f"/api/reports/ia/{rep['idSolicitud']}/favorita", json={"favorita": True}).json()["favorita"] is True
    favoritas = pedir(admin, "GET", "/api/reports/ia/historial", params={"favoritas": True}).json()
    assert rep["idSolicitud"] in [f["idSolicitud"] for f in favoritas]


def test_cu26_encargado_ve_solo_su_sucursal():
    enc = usuario("Encargado de Sucursal")
    suc = sql('select "codigoSucursal" s from usuario_sucursal where "idUser" = :u order by 1 limit 1', u=enc)[0]["s"]
    cliente = correr(Cliente(enc).preparar())
    rep = pedir(cliente, "POST", "/api/reports/ia/consultar", json={"texto": "ventas por sucursal de los ultimos 120 dias"}).json()
    assert any("sus sucursales" in a for a in rep.get("avisos", [])), rep
    propias = {f["nombre"] for f in sql('select s.nombre from usuario_sucursal us join "Sucursal" s using ("codigoSucursal") where us."idUser" = :u', u=enc)}
    assert rep["estado"] in ("generado", "sin_datos")
    assert {f["sucursal"] for f in rep.get("filas", [])} <= propias


def test_cu27_transcripcion_sin_servicio_o_formato_invalido(admin):
    r = pedir(admin, "POST", "/api/reports/ia/transcribir", files={"audio": ("a.txt", b"hola", "text/plain")})
    assert r.status_code == 415
    r = pedir(admin, "POST", "/api/reports/ia/transcribir", files={"audio": ("a.webm", b"\x1aE\xdf\xa3", "audio/webm")})
    assert r.status_code == 503  # sin GEMINI_API_KEY: el usuario escribe la solicitud


def test_cu28_exportar_pdf_excel_y_segundo_plano(admin, monkeypatch):
    rep = pedir(admin, "POST", "/api/reports/ia/consultar", json={"texto": "ventas por producto y talla de los ultimos 90 dias"}).json()
    pdf = pedir(admin, "POST", "/api/reports/exportar", json={"origen": "solicitud", "idSolicitud": rep["idSolicitud"], "formato": "pdf"})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    xlsx = pedir(admin, "POST", "/api/reports/exportar", json={"origen": "solicitud", "idSolicitud": rep["idSolicitud"], "formato": "xlsx"})
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
    from io import BytesIO

    from openpyxl import load_workbook

    libro = load_workbook(BytesIO(xlsx.content))
    assert libro.sheetnames == ["Reporte", "Datos"]
    assert any("Subtotal" in str(c.value) for fila in libro["Reporte"].iter_rows() for c in fila)
    conv = pedir(admin, "POST", "/api/reports/exportar", json={"origen": "ventas", "formato": "pdf", "fecha_desde": "2026-09-01", "fecha_hasta": "2026-09-30"})
    assert conv.status_code == 200 and conv.content[:4] == b"%PDF"
    vacio = pedir(admin, "POST", "/api/reports/exportar", json={"origen": "ventas", "formato": "pdf", "fecha_desde": "2020-01-01", "fecha_hasta": "2020-01-02"})
    assert vacio.status_code == 409
    # Alt. 1: un reporte grande se genera en segundo plano y avisa.
    from app.routers import reportes_generativos as rr

    monkeypatch.setattr(rr, "FILAS_DESCARGA_DIRECTA", 2)
    r = pedir(admin, "POST", "/api/reports/exportar", json={"origen": "solicitud", "idSolicitud": rep["idSolicitud"], "formato": "xlsx"})
    assert r.status_code == 202, r.text
    id_exp = r.json()["idExportacion"]
    lista = {e["idExportacion"]: e for e in pedir(admin, "GET", "/api/reports/exportaciones").json()}
    assert lista[id_exp]["estado"] == "Lista"
    assert pedir(admin, "GET", f"/api/reports/exportaciones/{id_exp}/archivo").content[:2] == b"PK"
    assert sql("select count(*) n from notificacion where referencia = :r", r=f"exp-{id_exp}")[0]["n"] == 1


# --- CU29 y CU30 ------------------------------------------------------------------

def test_cu29_cu30_entrenar_publicar_y_dashboard(admin, monkeypatch):
    sql("delete from modelo_ia where \"idTenant\" = 1")
    sin_modelos = pedir(admin, "GET", "/api/ia/dashboard").json()
    assert sin_modelos["sinModelos"] is True and sin_modelos["indicadores"]["ventas"] > 0
    # El minimo se fija por encima de lo que hay, para no depender de cuantos
    # clientes dejaron las otras pruebas.
    from app.services import modelos_ia as ml

    monkeypatch.setitem(ml.MINIMOS, "segmentacion", 10**6)
    datos = {d["tipo"]: d for d in pedir(admin, "GET", "/api/ia/modelos/datos").json()}
    assert datos["segmentacion"]["suficiente"] is False and datos["segmentacion"]["minimo"] == 10**6
    # Alt. 1: sin datos suficientes hay que usar sinteticos.
    assert pedir(admin, "POST", "/api/ia/modelos/entrenar", json={"tipo": "segmentacion"}).status_code == 409
    seg = pedir(admin, "POST", "/api/ia/modelos/entrenar", json={"tipo": "segmentacion", "usarSinteticos": True, "registros": 3000}).json()
    assert seg["estado"] == "Entrenado" and seg["conSinteticos"] and "silueta" in seg["metricas"]
    # Alt. 2: una version que no alcanza el umbral no se publica. El umbral se fija
    # inalcanzable para no depender de cuantas devoluciones dejaron otras pruebas.
    monkeypatch.setitem(ml.UMBRALES, "devolucion", {"f1": 1.01, "exactitud": 1.01})
    dev = pedir(admin, "POST", "/api/ia/modelos/entrenar", json={"tipo": "devolucion", "usarSinteticos": True}).json()
    assert dev["estado"] == "Entrenado" and dev["cumpleUmbral"] is False
    publicar = pedir(admin, "POST", f"/api/ia/modelos/{dev['idModeloIA']}/publicar")
    assert publicar.status_code == 409 and "no alcanzan" in publicar.json()["detail"]
    monkeypatch.undo()
    dem = pedir(admin, "POST", "/api/ia/modelos/entrenar", json={"tipo": "demanda"}).json()
    assert dem["cumpleUmbral"] and {"mae", "r2"} <= set(dem["metricas"])
    for m in (seg, dem):
        assert pedir(admin, "POST", f"/api/ia/modelos/{m['idModeloIA']}/publicar").json()["estado"] == "Publicado"
    # Paso 6: la version nueva se compara con la publicada; la anterior queda retirada.
    dem2 = pedir(admin, "POST", "/api/ia/modelos/entrenar", json={"tipo": "demanda", "usarSinteticos": True}).json()
    assert dem2["versionComparada"] == dem["version"] and "r2" in dem2["comparacion"]
    pedir(admin, "POST", f"/api/ia/modelos/{dem2['idModeloIA']}/publicar")
    estados = {m["version"]: m["estado"] for m in pedir(admin, "GET", "/api/ia/modelos").json() if m["tipo"] == "demanda"}
    assert estados[dem["version"]] == "Retirado" and estados[dem2["version"]] == "Publicado"

    tablero = pedir(admin, "GET", "/api/ia/dashboard").json()
    assert tablero["sinModelos"] is False and tablero["demanda"] and tablero["segmentos"] and tablero["interpretacion"]
    assert len(tablero["semanasPrediccion"]) == 4
    # Alt. 2: el Encargado ve solo su sucursal.
    enc = usuario("Encargado de Sucursal")
    sucursales = {s["s"] for s in sql('select "codigoSucursal" s from usuario_sucursal where "idUser" = :u', u=enc)}
    vista = pedir(correr(Cliente(enc).preparar()), "GET", "/api/ia/dashboard").json()
    assert vista["restringido"] and {s["codigoSucursal"] for s in vista["sucursales"]} <= sucursales
    assert all(p["codigoSucursal"] in sucursales for p in vista["demanda"])
