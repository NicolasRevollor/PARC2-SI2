"""[CU34] aviso de reposicion de stock y [CU35] envio a domicilio de una compra en
linea, contra una base PostgreSQL real (solo con TEST_DATABASE_URL definida)."""

import os
from datetime import date, timedelta

import pytest

from tests.test_cu12_cu20_integracion import Cliente, Escenario, correr, sql
from tests.test_cu33_cupones import cliente_nuevo

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")

MANANA = (date.today() + timedelta(days=1)).isoformat()


def pedir(http, metodo, ruta, **kw):
    return correr(http.pedir(metodo, ruta, **kw))


@pytest.fixture()
def agotada():
    """Una prenda sin stock en ninguna sucursal; al final se le devuelve el stock."""
    p = sql('select "idProducto" i from producto where "idTenant" = 1 order by "idProducto" desc limit 1')[0]["i"]
    antes = sql('select "idInv" i, cantidad_actual c, cantidad_reservada r from "Inventario" where "idProducto" = :p', p=p)
    sql('update "Inventario" set cantidad_actual = cantidad_reservada where "idProducto" = :p', p=p)
    yield p
    for f in antes:
        sql('update "Inventario" set cantidad_actual = :c, cantidad_reservada = :r where "idInv" = :i', c=f["c"], r=f["r"], i=f["i"])


# --- CU34 ---------------------------------------------------------------------------

def test_cu34_avisa_cuando_vuelve_el_stock(agotada):
    cli = cliente_nuevo()
    r = pedir(cli["http"], "POST", "/api/avisos-stock", json={"idProducto": agotada})
    assert r.status_code == 201, r.text
    aviso = r.json()
    # Pedirlo dos veces no duplica.
    assert pedir(cli["http"], "POST", "/api/avisos-stock", json={"idProducto": agotada}).json()["idAviso"] == aviso["idAviso"]
    assert pedir(cli["http"], "GET", "/api/avisos-stock/mios").json()[0]["estado"] == "Pendiente"

    # Vuelve el stock en una sucursal (como lo haria un ingreso de lote): la base avisa.
    inv = sql('select "idInv" i from "Inventario" where "idProducto" = :p order by 1 limit 1', p=agotada)[0]["i"]
    sql('update "Inventario" set cantidad_actual = cantidad_reservada + 5 where "idInv" = :i', i=inv)
    estado = pedir(cli["http"], "GET", "/api/avisos-stock/mios").json()[0]
    assert estado["estado"] == "Avisado" and estado["sucursal"]
    avisos = sql('select titulo from notificacion where referencia = :r and tipo = \'stock\' order by "idNotificacion"', r=f"STK-{aviso['idAviso']}")
    assert len(avisos) == 2 and avisos[1]["titulo"].startswith("Volvio")
    # Otra subida de stock no vuelve a avisar.
    sql('update "Inventario" set cantidad_actual = cantidad_actual + 3 where "idInv" = :i', i=inv)
    assert sql("select count(*) n from notificacion where referencia = :r", r=f"STK-{aviso['idAviso']}")[0]["n"] == 2


def test_cu34_validaciones(agotada):
    cli = cliente_nuevo()
    con_stock = sql('select "idProducto" i from "Inventario" where cantidad_actual - cantidad_reservada > 0 limit 1')[0]["i"]
    assert pedir(cli["http"], "POST", "/api/avisos-stock", json={"idProducto": con_stock}).status_code == 409
    aviso = pedir(cli["http"], "POST", "/api/avisos-stock", json={"idProducto": agotada}).json()
    assert pedir(cli["http"], "DELETE", f"/api/avisos-stock/{aviso['idAviso']}").status_code == 204
    sql('update "Inventario" set cantidad_actual = cantidad_reservada + 1 where "idProducto" = :p', p=agotada)
    # Cancelado: no se avisa.
    assert sql("select estado from aviso_stock where \"idAviso\" = :a", a=aviso["idAviso"])[0]["estado"] == "Cancelado"
    # El personal ve que tallas esperan clientes.
    admin = correr(Cliente(sql('select u."idUser" i from "Usuario" u join rol r using ("codigoRol") where r."nombreRol" = \'Administrador\' and u."idTenant" = 1 limit 1')[0]["i"]).preparar())
    assert pedir(admin, "GET", "/api/avisos-stock").status_code == 200


# --- CU35 ---------------------------------------------------------------------------

def _pago_tarjeta(id_user: int, monto: float) -> int:
    """Lo que deja el cobro verificado de Stripe (POST /api/payments/intents/{id}/verify)."""
    return sql('insert into metodo_pago(tipo, estado, monto, origen, "idUserPago") values (\'Tarjeta\', \'Activo\', :m, \'tarjeta_stripe\', :u) '
               'returning "idMetPago"', m=monto, u=id_user)[0]["idMetPago"]


def test_cu35_compra_en_linea_con_envio_hasta_la_entrega():
    e, cli = Escenario(), cliente_nuevo()
    prenda = sql('select p."idProducto" i, p.venta from producto p where p."idTenant" = 1 order by 1 limit 1')[0]
    e.stock(prenda["i"], 20)
    precio = float(prenda["venta"])
    entrega = {"direccion": "Av. Banzer 123, 3er anillo", "telefono": "70012345", "franja": "tarde"}
    id_user = cli["http"].id_user
    # El pago tiene que cubrir tambien el envio (Bs 15 por defecto).
    corto = _pago_tarjeta(id_user, precio)
    r = pedir(cli["http"], "POST", "/api/sales", json={"idMetPago": corto, "items": [{"idProducto": prenda["i"], "cantidad": 1}], "entrega": entrega})
    assert r.status_code == 400 and "no cubre" in r.text
    pago = _pago_tarjeta(id_user, precio + 15)
    r = pedir(cli["http"], "POST", "/api/sales", json={"idMetPago": pago, "items": [{"idProducto": prenda["i"], "cantidad": 1}], "entrega": entrega})
    assert r.status_code == 201, r.text
    venta = r.json()
    assert venta["total"] == pytest.approx(precio) and venta["envio"]["costo"] == 15 and venta["envio"]["estado"] == "Solicitado"

    # El personal lo ve en Recojos y entregas, lo programa y lo entrega.
    viajes = pedir(e.encargado, "GET", "/api/returns/domicilio", params={"estado": "activos", "tipo": "pedido"}).json()
    viaje = next((v for v in viajes if v.get("idVenta") == venta["idVenta"]), None)
    if viaje is None:  # la sucursal que surtio no es del encargado de la prueba: lo ve el administrador
        viajes = pedir(e.admin, "GET", "/api/returns/domicilio", params={"estado": "activos", "tipo": "pedido"}).json()
        viaje = next(v for v in viajes if v.get("idVenta") == venta["idVenta"])
    assert viaje["codigo"] == f"VTA-{venta['idVenta']}" and viaje["producto"]
    r = pedir(e.admin, "POST", f"/api/returns/domicilio/{viaje['idEntrega']}/programar", json={"fecha": MANANA, "franja": "tarde", "repartidor": "Juan Moto"})
    assert r.status_code == 200, r.text
    r = pedir(e.admin, "POST", f"/api/returns/domicilio/{viaje['idEntrega']}/completar", json={})
    assert r.status_code == 200, r.text
    mios = pedir(cli["http"], "GET", "/api/pedidos/mios").json()
    assert mios[0]["estado"] == "Completado" and mios[0]["codigo"] == f"VTA-{venta['idVenta']}"
    titulos = [f["titulo"] for f in sql('select titulo from notificacion where referencia = :r order by "idNotificacion"', r=f"VTA-{venta['idVenta']}")]
    assert any("Recibimos tu pedido" in t for t in titulos) and any("Entregamos su compra" in t for t in titulos)


def test_cu35_el_pos_no_hace_envios():
    e, cli = Escenario(), cliente_nuevo()
    prenda = sql('select "idProducto" i, venta from producto where "idTenant" = 1 order by 1 limit 1')[0]
    e.stock(prenda["i"], 5)
    if e.caja() is None:
        e.abrir_caja()
    pago = pedir(e.cajero, "POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": float(prenda["venta"])}).json()
    r = pedir(e.cajero, "POST", "/api/sales", json={
        "idCliente": cli["idCliente"], "idMetPago": pago["idMetPago"], "codigoSucursal": e.sucursal,
        "items": [{"idProducto": prenda["i"], "cantidad": 1}], "entrega": {"direccion": "Calle 1 numero 2", "telefono": "70012345"},
    })
    assert r.status_code == 400
