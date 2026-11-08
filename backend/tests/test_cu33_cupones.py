"""[CU33] Cupon del 30% cada 3 compras, contra una base PostgreSQL real
(solo con TEST_DATABASE_URL definida)."""

import os
from uuid import uuid4

import pytest

from app.services import cupones as cs
from tests.test_cu12_cu20_integracion import Cliente, Escenario, correr, sql

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")


# --- Reglas puras -------------------------------------------------------------------

def test_reglas_del_cupon():
    assert float(cs.precio_con_descuento(120, 30)) == 84.00
    assert float(cs.precio_con_descuento(259.99, 30)) == 181.99
    assert [cs.cupones_que_corresponden(n) for n in (0, 2, 3, 5, 6, 9)] == [0, 0, 1, 1, 2, 3]
    assert [cs.faltan_para_cupon(n) for n in (0, 1, 2, 3, 4)] == [3, 2, 1, 3, 2]


# --- Integracion ----------------------------------------------------------------------

def pedir(http, metodo, ruta, **kw):
    return correr(http.pedir(metodo, ruta, **kw))


def cliente_nuevo() -> dict:
    """Un cliente sin compras, para que el conteo no dependa de otras pruebas."""
    rol = sql("select \"codigoRol\" c from rol where \"nombreRol\" = 'Cliente'")[0]["c"]
    id_user = sql('insert into "Usuario"(nombre, correo, "contraseña", "codigoRol", "idTenant") values (:n, :c, :p, :r, 1) returning "idUser"',
                  n="Cliente Cupon", c=f"cupon-{uuid4().hex[:8]}@prueba.bo", p="x", r=rol)[0]["idUser"]
    id_cliente = sql('insert into "Cliente"(nombre, "idUser") values (:n, :u) returning "idCliente"', n="Cliente Cupon", u=id_user)[0]["idCliente"]
    return {"idCliente": id_cliente, "http": correr(Cliente(id_user).preparar())}


@pytest.fixture(scope="module")
def prenda():
    fila = sql('select "idProducto" i, venta from producto where "idTenant" = 1 and venta > 0 order by "idProducto" limit 1')[0]
    return {"id": fila["i"], "precio": float(fila["venta"])}


def comprar(e: Escenario, cliente: dict, prenda: dict, cupon: int | None = None, cantidad: int = 1):
    e.stock(prenda["id"], 50)
    if e.caja() is None:
        e.abrir_caja()
    pago = pedir(e.cajero, "POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": prenda["precio"] * cantidad}).json()
    cuerpo = {"idCliente": cliente["idCliente"], "idMetPago": pago["idMetPago"], "codigoSucursal": e.sucursal,
              "items": [{"idProducto": prenda["id"], "cantidad": cantidad}]}
    if cupon:
        cuerpo["idCupon"] = cupon
    return pedir(e.cajero, "POST", "/api/sales", json=cuerpo)


def test_cu33_tres_compras_dan_un_cupon_y_se_usa_una_vez(prenda):
    e, cli = Escenario(), cliente_nuevo()
    for n in (1, 2):
        r = comprar(e, cli, prenda)
        assert r.status_code == 201, r.text
        assert r.json()["cuponGanado"] is None
    r = comprar(e, cli, prenda)
    ganado = r.json()["cuponGanado"]
    assert ganado and ganado["porcentaje"] == 30
    # Aviso al cliente.
    assert sql("select count(*) n from notificacion where tipo = 'cupon' and referencia = :c", c=ganado["codigo"])[0]["n"] == 1
    mios = pedir(cli["http"], "GET", "/api/cupones/mios").json()
    cupon = next(c for c in mios["cupones"] if c["codigo"] == ganado["codigo"])
    assert cupon["estado"] == "Disponible"
    assert any(p["idTenant"] == 1 and p["compras"] == 3 and p["faltan"] == 3 for p in mios["progreso"])

    # El cliente ve el total con el cupon antes de pagar.
    cot = pedir(cli["http"], "POST", "/api/cupones/cotizar", json={"items": [{"idProducto": prenda["id"], "cantidad": 2}], "idCupon": cupon["idCupon"]}).json()
    assert cot["subtotal"] == pytest.approx(prenda["precio"] * 2)
    assert cot["total"] == pytest.approx(float(cs.precio_con_descuento(prenda["precio"], 30)) * 2)

    # Cuarta compra con el cupon: 30% menos y el precio con descuento queda en el detalle.
    r = comprar(e, cli, prenda, cupon=cupon["idCupon"], cantidad=2)
    assert r.status_code == 201, r.text
    venta = r.json()
    con_descuento = float(cs.precio_con_descuento(prenda["precio"], 30))
    assert venta["total"] == pytest.approx(con_descuento * 2)
    assert venta["detalles"][0]["precio_unitario"] == pytest.approx(con_descuento)
    assert venta["cuponUsado"]["codigo"] == cupon["codigo"]
    assert venta["cuponUsado"]["descuento"] == pytest.approx(round(prenda["precio"] * 2 - con_descuento * 2, 2))
    # La caja recibe lo que de verdad se cobro.
    assert sql('select estado, "idVentaUso" v from cupon where "idCupon" = :i', i=cupon["idCupon"])[0] == {"estado": "Usado", "v": venta["idVenta"]}
    # Un cupon sirve una sola vez.
    assert comprar(e, cli, prenda, cupon=cupon["idCupon"]).status_code == 409


def test_cu33_validaciones(prenda):
    e, cli, otro = Escenario(), cliente_nuevo(), cliente_nuevo()
    for _ in range(3):
        comprar(e, cli, prenda)
    cupon = pedir(cli["http"], "GET", "/api/cupones/mios").json()["cupones"][0]
    # De otro cliente: no existe para el.
    assert comprar(e, otro, prenda, cupon=cupon["idCupon"]).status_code == 404
    # Vencido.
    sql('update cupon set "fechaVencimiento" = now() - interval \'1 day\' where "idCupon" = :i', i=cupon["idCupon"])
    assert comprar(e, cli, prenda, cupon=cupon["idCupon"]).status_code == 409
    assert pedir(cli["http"], "GET", "/api/cupones/mios").json()["cupones"][0]["estado"] == "Vencido"
    # Sin conexion no se usan cupones.
    sql('update cupon set "fechaVencimiento" = now() + interval \'30 day\', estado = \'Disponible\' where "idCupon" = :i', i=cupon["idCupon"])
    pago = pedir(e.cajero, "POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": prenda["precio"]}).json()
    r = pedir(e.cajero, "POST", "/api/sales", json={
        "idCliente": cli["idCliente"], "idMetPago": pago["idMetPago"], "codigoSucursal": e.sucursal, "idCupon": cupon["idCupon"],
        "items": [{"idProducto": prenda["id"], "cantidad": 1}], "uuidOperacion": str(uuid4()),
    })
    assert r.status_code == 400 and "Sin conexion" in r.text
    # De otra tienda: el cupon de la empresa 1 no vale para prendas de otra empresa.
    ajena = sql('select "idProducto" i from producto where "idTenant" <> 1 limit 1')[0]["i"]
    r = pedir(cli["http"], "POST", "/api/cupones/cotizar", json={"items": [{"idProducto": ajena, "cantidad": 1}], "idCupon": cupon["idCupon"]})
    assert r.status_code == 400


def test_cu33_una_compra_devuelta_no_cuenta(prenda):
    e, cli = Escenario(), cliente_nuevo()
    ventas = [comprar(e, cli, prenda).json()["idVenta"] for _ in range(2)]
    # Se devuelve por completo la segunda compra (CU1 -> CU3 -> CU6).
    r = pedir(e.encargado, "POST", "/api/returns", json={
        "idVenta": ventas[1], "codigoSucursal": e.sucursal, "motivoCategoria": "no_desea", "tipo": "devolucion",
        "items": [{"idProducto": prenda["id"], "cantidad": 1}],
    })
    assert r.status_code == 201, r.text
    caso = r.json()[0]["idDevolucion"]
    assert pedir(e.encargado, "POST", f"/api/returns/{caso}/inspeccion", json={"resultado": "apta"}).status_code == 200
    r = pedir(e.encargado, "POST", f"/api/returns/{caso}/resolver", json={"tipo": "devolucion", "metodoReembolso": "efectivo"})
    assert r.status_code == 200, r.text
    # Tercera compra: como una fue devuelta, todavia lleva 2 y no gana cupon.
    assert comprar(e, cli, prenda).json()["cuponGanado"] is None
    assert comprar(e, cli, prenda).json()["cuponGanado"] is not None


def test_cu33_compras_sin_conexion_suman(prenda):
    e, cli = Escenario(), cliente_nuevo()
    comprar(e, cli, prenda)
    comprar(e, cli, prenda)
    e.stock(prenda["id"], 50)
    caja = e.caja() or e.abrir_caja()
    op = e.operacion("venta", {
        "uuidCaja": caja.get("uuidCaja"), "idCliente": cli["idCliente"], "formaPago": "Efectivo",
        "montoRecibido": prenda["precio"], "total": prenda["precio"],
        "items": [{"idProducto": prenda["id"], "cantidad": 1, "precioUnitario": prenda["precio"]}],
    })
    resultado = e.enviar(op)[0]
    assert resultado["estado"] == "Confirmada", resultado
    assert sql('select count(*) n from cupon where "idCliente" = :c', c=cli["idCliente"])[0]["n"] == 1
