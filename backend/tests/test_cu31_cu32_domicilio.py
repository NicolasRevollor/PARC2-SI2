"""[CU31] recojo a domicilio, [CU32] entrega a domicilio y [CU7] nota de devolucion,
contra una base PostgreSQL real (solo con TEST_DATABASE_URL definida)."""

import os
from datetime import date, timedelta

import pytest

from tests.test_cu12_cu20_integracion import Cliente, Escenario, correr, sql

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")

DOMICILIO = {"direccion": "Av. Banzer 123, 3er anillo", "referencia": "Porton verde", "telefono": "70012345", "franja": "tarde"}
MANANA = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture(scope="module")
def comprador():
    fila = sql('select c."idCliente" c, c."idUser" u from "Cliente" c join "Usuario" u on u."idUser" = c."idUser" where u."idTenant" = 1 order by 1 limit 1')[0]
    return {"idCliente": fila["c"], "http": correr(Cliente(fila["u"]).preparar())}


@pytest.fixture(scope="module")
def prendas():
    """Una prenda y otra talla del mismo modelo con el mismo precio (el cambio no tiene diferencia)."""
    # Debe ser un cambio de TALLA real: mismo modelo y color, distinta talla y mismo precio.
    # (Si solo se pide "mismo modelo", el par puede diferir en color y el backend lo
    # clasifica como "cambio por otro producto", no como cambio de talla.)
    fila = sql(
        'select p."idProducto" a, o."idProducto" b, p.venta from producto p join producto o on o."idModelo" = p."idModelo" '
        'and o."idProducto" <> p."idProducto" and o.venta = p.venta '
        'and coalesce(o.color, \'\') = coalesce(p.color, \'\') and coalesce(o.talla, \'\') <> coalesce(p.talla, \'\') '
        'where p."idTenant" = 1 and p."idModelo" is not null '
        'and coalesce(p.tipo, \'\') <> \'\' order by p."idProducto" limit 1'
    )[0]
    return {"original": fila["a"], "nueva": fila["b"], "precio": float(fila["venta"])}


def pedir(http, metodo, ruta, **kw):
    return correr(http.pedir(metodo, ruta, **kw))


def vender(e: Escenario, comprador, id_producto: int, precio: float) -> int:
    e.stock(id_producto, 5)
    if e.caja() is None:
        e.abrir_caja()
    pago = pedir(e.cajero, "POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": precio}).json()
    r = pedir(e.cajero, "POST", "/api/sales", json={
        "idCliente": comprador["idCliente"], "idMetPago": pago["idMetPago"], "codigoSucursal": e.sucursal,
        "items": [{"idProducto": id_producto, "cantidad": 1}],
    })
    assert r.status_code == 201, r.text
    return r.json()["idVenta"]


def solicitar(e, comprador, id_venta, id_producto, *, tipo, motivo, nuevo=None, modalidad="domicilio"):
    cuerpo = {"idVenta": id_venta, "idProducto": id_producto, "motivoCategoria": motivo, "tipo": tipo,
              "codigoSucursal": e.sucursal, "modalidadEntrega": modalidad}
    if nuevo:
        cuerpo["idProductoNuevo"] = nuevo
    if modalidad == "domicilio":
        cuerpo["domicilio"] = DOMICILIO
    r = pedir(comprador["http"], "POST", "/api/returns/solicitudes", json=cuerpo)
    assert r.status_code == 201, r.text
    return r.json()


def viajes(http, id_devolucion):
    r = pedir(http, "GET", f"/api/returns/domicilio/caso/{id_devolucion}")
    assert r.status_code == 200, r.text
    return r.json()


def programar(e, viaje):
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{viaje['idEntrega']}/programar",
              json={"fecha": MANANA, "franja": "manana", "repartidor": "Juan Moto"})
    assert r.status_code == 200, r.text
    return r.json()


def test_cu31_cu32_recojo_inspeccion_y_entrega_del_cambio(comprador, prendas):
    e = Escenario()
    e.stock(prendas["nueva"], 3)
    venta = vender(e, comprador, prendas["original"], prendas["precio"])
    # "equivocado": la culpa es de la tienda, el delivery es gratis.
    caso = solicitar(e, comprador, venta, prendas["original"], tipo="cambio_talla", motivo="equivocado", nuevo=prendas["nueva"])
    assert caso["estado"] == "PendienteEntrega" and caso["modalidadEntrega"] == "domicilio" and caso["costoDomicilio"] == 0
    [recojo] = viajes(comprador["http"], caso["idDevolucion"])
    assert recojo["tipo"] == "recojo" and recojo["estado"] == "Solicitado"
    # El cliente no puede programar viajes.
    assert pedir(comprador["http"], "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/programar",
                 json={"fecha": MANANA, "franja": "manana", "repartidor": "X Y Z"}).status_code == 403
    # La prenda sigue en la casa del cliente: todavia no se puede inspeccionar (CU3).
    assert pedir(e.encargado, "POST", f"/api/returns/{caso['idDevolucion']}/inspeccion", json={"resultado": "apta"}).status_code == 409
    # No se puede marcar recogida antes de programarla.
    assert pedir(e.encargado, "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/completar", json={}).status_code == 409
    programar(e, recojo)
    # Alternativo: el cliente no estaba; se reprograma.
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/fallido", json={"motivo": "No habia nadie"})
    assert r.json()["estado"] == "Fallido" and r.json()["intentos"] == 1
    programar(e, recojo)
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/completar", json={"observaciones": "Con etiquetas"})
    assert r.status_code == 200, r.text
    assert r.json()["estadoCaso"] == "EnInspeccion"
    # CU3: se revisa la prenda que trajo el repartidor.
    r = pedir(e.encargado, "POST", f"/api/returns/{caso['idDevolucion']}/inspeccion", json={"resultado": "apta"})
    assert r.status_code == 200, r.text
    # CU4 + CU32: el cambio no se completa en la tienda; la prenda nueva sale a domicilio.
    r = pedir(e.encargado, "POST", f"/api/returns/{caso['idDevolucion']}/resolver",
              json={"tipo": "cambio_talla", "idProductoNuevo": prendas["nueva"]})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "EnvioDomicilio"
    entrega = next(v for v in viajes(e.encargado, caso["idDevolucion"]) if v["tipo"] == "entrega")
    assert entrega["direccion"] == DOMICILIO["direccion"] and entrega["estado"] == "Solicitado"
    activos = pedir(e.encargado, "GET", "/api/returns/domicilio", params={"estado": "activos"}).json()
    assert any(v["idEntrega"] == entrega["idEntrega"] for v in activos)
    programar(e, entrega)
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{entrega['idEntrega']}/completar", json={})
    assert r.status_code == 200, r.text
    assert r.json()["estadoCaso"] == "Completada"
    # CU7 alternativo 1: en un cambio sin dinero devuelto no hay nota de devolucion.
    assert pedir(comprador["http"], "GET", f"/api/returns/{caso['idDevolucion']}/nota-devolucion").status_code == 409


def test_cu31_cu7_devolucion_recogida_descuenta_el_delivery_y_emite_la_nota(comprador, prendas):
    e = Escenario()
    venta = vender(e, comprador, prendas["original"], prendas["precio"])
    caso = solicitar(e, comprador, venta, prendas["original"], tipo="devolucion", motivo="no_desea")
    assert caso["costoDomicilio"] == 15
    assert caso["credito"] == pytest.approx(prendas["precio"] - 15)
    [recojo] = viajes(comprador["http"], caso["idDevolucion"])
    # El cliente fue a la sucursal en vez de esperar: se registra en la sucursal.
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/completar", json={"enSucursal": True})
    assert r.status_code == 200, r.text
    pedir(e.encargado, "POST", f"/api/returns/{caso['idDevolucion']}/inspeccion", json={"resultado": "apta"})
    r = pedir(e.encargado, "POST", f"/api/returns/{caso['idDevolucion']}/resolver", json={"tipo": "devolucion", "metodoReembolso": "efectivo"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "Completada" and r.json()["montoDevuelto"] == pytest.approx(prendas["precio"] - 15)
    # CU7: la nota dice que se devolvio y cuanto dinero.
    nota = pedir(comprador["http"], "GET", f"/api/returns/{caso['idDevolucion']}/nota-devolucion")
    assert nota.status_code == 200, nota.text
    n = nota.json()
    assert n["numero"] == caso["codigo"]
    assert n["prendasDevueltas"][0]["cantidad"] == 1 and n["prendasDevueltas"][0]["estadoAlRecibirla"] == "En buen estado"
    assert {"concepto": "Delivery a domicilio", "monto": 15.0} in n["descuentos"]
    assert n["recogidaADomicilio"] is None  # la trajo el cliente a la sucursal
    assert n["montoDevuelto"] == pytest.approx(prendas["precio"] - 15) and n["medio"] == "en efectivo"
    pdf = pedir(e.encargado, "GET", f"/api/returns/{caso['idDevolucion']}/nota-devolucion.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    # Otro cliente no la ve.
    otro = sql('select c."idUser" u from "Cliente" c join "Usuario" u on u."idUser" = c."idUser" where c."idCliente" <> :c and u."idTenant" = 1 limit 1',
               c=comprador["idCliente"])
    if otro:
        assert pedir(correr(Cliente(otro[0]["u"]).preparar()), "GET", f"/api/returns/{caso['idDevolucion']}/nota-devolucion").status_code == 404


def test_cu31_cancelar_recojo_vuelve_a_la_sucursal_y_no_cobra(comprador, prendas):
    e = Escenario()
    venta = vender(e, comprador, prendas["original"], prendas["precio"])
    caso = solicitar(e, comprador, venta, prendas["original"], tipo="devolucion", motivo="no_desea")
    [recojo] = viajes(comprador["http"], caso["idDevolucion"])
    r = pedir(e.encargado, "POST", f"/api/returns/domicilio/{recojo['idEntrega']}/cancelar")
    assert r.status_code == 200, r.text
    detalle = pedir(e.encargado, "GET", f"/api/returns/{caso['idDevolucion']}").json()
    assert detalle["modalidadEntrega"] == "sucursal" and detalle["costoDomicilio"] == 0


def test_cu31_un_recojo_pendiente_no_se_anula_por_vencimiento(comprador, prendas):
    e = Escenario()
    venta = vender(e, comprador, prendas["original"], prendas["precio"])
    caso = solicitar(e, comprador, venta, prendas["original"], tipo="devolucion", motivo="no_desea")
    sql('update devolucion set "fechaLimiteEntrega" = now() - interval \'1 day\' where "idDevolucion" = :i', i=caso["idDevolucion"])
    assert pedir(e.encargado, "GET", f"/api/returns/{caso['idDevolucion']}").json()["estado"] == "PendienteEntrega"


def test_cu31_validaciones(comprador, prendas):
    e = Escenario()
    venta = vender(e, comprador, prendas["original"], prendas["precio"])
    cuerpo = {"idVenta": venta, "idProducto": prendas["original"], "motivoCategoria": "talla", "tipo": "devolucion",
              "codigoSucursal": e.sucursal, "modalidadEntrega": "domicilio"}
    assert pedir(comprador["http"], "POST", "/api/returns/solicitudes", json=cuerpo).status_code == 400
    cuerpo["domicilio"] = {**DOMICILIO, "fechaPreferida": "2020-01-01"}
    assert pedir(comprador["http"], "POST", "/api/returns/solicitudes", json=cuerpo).status_code == 400
