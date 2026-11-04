"""[CU12] a [CU20] contra una base PostgreSQL real, por HTTP.

Modifican datos, asi que solo corren con una base de pruebas explicita:

    set TEST_DATABASE_URL=1      (y DATABASE_URL apuntando a una base con las migraciones)
    pytest tests/test_cu12_cu20_integracion.py

Cada prueba usa prendas y sucursal propias del tenant 1.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select, text

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requiere una base de pruebas (TEST_DATABASE_URL)")

LOOP = asyncio.new_event_loop()


def correr(coro):
    return LOOP.run_until_complete(coro)


def uuid() -> str:
    return str(uuid4())


def ahora(**delta) -> str:
    return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


class Cliente:
    """Cliente HTTP con el token de un usuario."""

    def __init__(self, id_user: int):
        self.id_user = id_user
        self.headers = {}

    async def preparar(self, permisos_extra=()):
        from app.database import AsyncSessionLocal
        from app.models import Usuario
        from app.security import create_access_token
        from app.services.usuarios import build_user_claims

        async with AsyncSessionLocal() as session:
            usuario = await session.get(Usuario, self.id_user)
            claims = await build_user_claims(session, usuario)
        self.headers = {"Authorization": f"Bearer {create_access_token(self.id_user, claims)}"}
        return self

    async def pedir(self, metodo: str, ruta: str, **kw):
        from app.main import app

        transporte = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transporte, base_url="http://prueba") as http:
            return await http.request(metodo, ruta, headers=self.headers, **kw)


async def _sql(consulta: str, **params):
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        resultado = await session.execute(text(consulta), params)
        filas = resultado.mappings().all() if resultado.returns_rows else []
        await session.commit()
        return [dict(f) for f in filas]


def sql(consulta: str, **params):
    return correr(_sql(consulta, **params))


class Escenario:
    """Una sucursal nueva con caja propia y usuarios del tenant 1."""

    def __init__(self):
        self.admin = correr(Cliente(self._usuario("Administrador")).preparar())
        self.encargado = correr(Cliente(self._usuario("Encargado de Sucursal")).preparar())
        self.cajero = correr(Cliente(self._usuario("Cajero")).preparar())
        ciudad = sql('select "idCiudad" from "Ciudad" limit 1')[0]["idCiudad"]
        self.sucursal = sql(
            'insert into "Sucursal"(nombre, direccion, "idCiudad", "idTenant") values (:n, :d, :c, 1) returning "codigoSucursal"',
            n=f"Prueba {uuid()[:8]}", d="Calle 1", c=ciudad,
        )[0]["codigoSucursal"]
        for usuario in (self.encargado, self.cajero):
            sql('insert into usuario_sucursal("idUser", "codigoSucursal") values (:u, :s)', u=usuario.id_user, s=self.sucursal)

    @staticmethod
    def _usuario(rol: str) -> int:
        filas = sql(
            'select u."idUser" from "Usuario" u join rol r on r."codigoRol" = u."codigoRol" '
            'where r."nombreRol" = :rol and u."idTenant" = 1 limit 1',
            rol=rol,
        )
        if filas:
            return filas[0]["idUser"]
        codigo = sql('select "codigoRol" from rol where "nombreRol" = :rol', rol=rol)[0]["codigoRol"]
        return sql(
            'insert into "Usuario"(nombre, correo, "contraseña", "codigoRol", "idTenant") values (:n, :c, :p, :r, 1) returning "idUser"',
            n=rol, c=f"{uuid()[:8]}@prueba.bo", p="x", r=codigo,
        )[0]["idUser"]

    def stock(self, id_producto: int, cantidad: int) -> None:
        sql(
            'insert into "Inventario"(cantidad_actual, cantidad_reservada, "codigoSucursal", "idProducto") values (:c, 0, :s, :p) '
            'on conflict ("codigoSucursal", "idProducto") do update set cantidad_actual = :c, cantidad_reservada = 0',
            c=cantidad, s=self.sucursal, p=id_producto,
        )

    def inventario(self, id_producto: int) -> tuple[int, int]:
        fila = sql(
            'select cantidad_actual a, cantidad_reservada r from "Inventario" where "codigoSucursal" = :s and "idProducto" = :p',
            s=self.sucursal, p=id_producto,
        )[0]
        return fila["a"], fila["r"]

    def abrir_caja(self, monto=100.0, actor=None) -> dict:
        r = correr((actor or self.cajero).pedir("POST", "/api/caja/abrir", json={"codigoSucursal": self.sucursal, "montoInicial": monto}))
        assert r.status_code == 200, r.text
        return r.json()

    def caja(self) -> dict | None:
        return correr(self.cajero.pedir("GET", "/api/caja/actual", params={"codigoSucursal": self.sucursal})).json()

    def operacion(self, tipo: str, datos: dict, **extra) -> dict:
        return {
            "uuidOperacion": uuid(), "tipo": tipo, "idTenant": 1, "codigoSucursal": self.sucursal,
            "fechaOperacion": ahora(), "datos": datos, **extra,
        }

    def enviar(self, *operaciones, actor=None) -> list[dict]:
        r = correr((actor or self.cajero).pedir("POST", "/api/sync/lote", json={"operaciones": list(operaciones)}))
        assert r.status_code == 200, r.text
        return r.json()["resultados"]

    def conflicto(self, uuid_operacion: str) -> dict:
        r = correr(self.encargado.pedir("GET", "/api/sync/conflictos"))
        assert r.status_code == 200, r.text
        return next(c for c in r.json() if c["uuidOperacion"] == uuid_operacion)

    def resolver(self, id_conflicto: int, actor=None, **cuerpo):
        return correr((actor or self.encargado).pedir("POST", f"/api/sync/conflictos/{id_conflicto}/resolver", json=cuerpo))


@pytest.fixture(scope="module")
def producto():
    """Una variante de un modelo con al menos otra variante."""
    fila = sql(
        'select p."idProducto" id, p.venta, p."idModelo" from producto p where p."idTenant" = 1 and p."idModelo" is not null '
        'and (select count(*) from producto o where o."idModelo" = p."idModelo") > 2 order by p."idProducto" limit 1'
    )[0]
    otras = sql(
        'select "idProducto" id, venta from producto where "idModelo" = :m and "idProducto" <> :p order by "idProducto"',
        m=fila["idModelo"], p=fila["id"],
    )
    return {"id": fila["id"], "precio": float(fila["venta"]), "otras": otras}


@pytest.fixture()
def e():
    return Escenario()


def venta_datos(producto, cantidad=1, precio=None, **extra):
    precio = producto["precio"] if precio is None else precio
    return {
        "items": [{"idProducto": producto["id"], "cantidad": cantidad, "precioUnitario": precio}],
        "total": precio * cantidad, "formaPago": "Efectivo", "montoRecibido": precio * cantidad, **extra,
    }


# --- CU12 --------------------------------------------------------------------

def test_cu12_preparacion_descarga_todas_las_secciones(e, producto):
    e.stock(producto["id"], 4)
    r = correr(e.cajero.pedir("GET", "/api/sync/preparacion", params={"codigoSucursal": e.sucursal}))
    assert r.status_code == 200, r.text
    preparacion = r.json()
    assert preparacion["idTenant"] == 1
    for seccion in ("sucursales", "productos", "inventario", "clientes", "reservas", "ventas", "politica"):
        r = correr(e.cajero.pedir("GET", f"/api/sync/snapshot/{seccion}", params={"codigoSucursal": e.sucursal, "tam": 5}))
        assert r.status_code == 200, (seccion, r.text)
    inventario = correr(e.cajero.pedir("GET", "/api/sync/snapshot/inventario", params={"codigoSucursal": e.sucursal})).json()
    assert [i["idProducto"] for i in inventario["items"]] == [producto["id"]]


def test_cu12_plan_sin_operacion_sin_conexion_responde_402(e):
    sql('update plan set "permiteOffline" = false where "idPlan" = (select "idPlan" from tenant where "idTenant" = 1)')
    try:
        r = correr(e.cajero.pedir("GET", "/api/sync/preparacion", params={"codigoSucursal": e.sucursal}))
        assert r.status_code == 402
    finally:
        sql('update plan set "permiteOffline" = true where "idPlan" = (select "idPlan" from tenant where "idTenant" = 1)')


# --- CU14 y CU17 -------------------------------------------------------------

def test_cu14_cu17_venta_confirmada_descuenta_y_entra_a_caja(e, producto):
    e.stock(producto["id"], 5)
    caja = e.abrir_caja()
    op = e.operacion("venta", venta_datos(producto, 2, uuidCaja=caja["uuidOperacion"]))
    resultado = e.enviar(op)[0]
    assert resultado["estado"] == "Confirmada", resultado
    assert e.inventario(producto["id"]) == (3, 0)
    assert e.caja()["ingresos"] == producto["precio"] * 2
    venta = sql('select "origenRegistro" o, total from "Venta" where "idVenta" = :v', v=resultado["idServidor"])[0]
    assert venta["o"] == "sin_conexion"


def test_cu17_reenviar_el_uuid_no_duplica(e, producto):
    e.stock(producto["id"], 5)
    caja = e.abrir_caja()
    op = e.operacion("venta", venta_datos(producto, 1, uuidCaja=caja["uuidOperacion"]))
    primero = e.enviar(op)[0]
    segundo = e.enviar(op)[0]
    assert segundo == primero
    assert e.inventario(producto["id"]) == (4, 0)
    assert e.caja()["ingresos"] == producto["precio"]
    log = sql('select resultado from registro_sincronizacion where "uuidOperacion" = :u order by "idRegistro"', u=op["uuidOperacion"])
    assert [f["resultado"] for f in log] == ["Aplicada", "Duplicada"]


def test_cu17_rechaza_otra_empresa_y_sigue_con_el_lote(e, producto):
    e.stock(producto["id"], 5)
    ajena = e.operacion("venta", venta_datos(producto), idTenant=2)
    buena = e.operacion("venta", venta_datos(producto))
    resultados = e.enviar(ajena, buena)
    assert resultados[0]["estado"] == "Rechazada"
    assert resultados[1]["estado"] == "Confirmada"


def test_cu17_venta_con_tarjeta_se_rechaza(e, producto):
    e.stock(producto["id"], 5)
    assert e.enviar(e.operacion("venta", venta_datos(producto, formaPago="Tarjeta")))[0]["estado"] == "Rechazada"


def test_cu17_suspendida_acepta_lo_anterior_y_rechaza_lo_posterior(e, producto):
    e.stock(producto["id"], 5)
    sql("update tenant set estado = 'Suspendido' where \"idTenant\" = 1")
    sql("update suscripcion set \"fechaSuspension\" = now() - interval '1 hour', estado = 'Suspendida' where \"idTenant\" = 1 and estado = 'Activa'")
    try:
        anterior = e.operacion("venta", venta_datos(producto), fechaOperacion=ahora(hours=-2))
        posterior = e.operacion("venta", venta_datos(producto), fechaOperacion=ahora(minutes=-5))
        resultados = e.enviar(anterior, posterior)
        assert [r["estado"] for r in resultados] == ["Confirmada", "Rechazada"], resultados
    finally:
        sql("update tenant set estado = 'Activo' where \"idTenant\" = 1")
        sql("update suscripcion set \"fechaSuspension\" = null, estado = 'Activa' where \"idTenant\" = 1 and estado = 'Suspendida'")


def test_cu14_cliente_nuevo_y_generico(e, producto):
    e.stock(producto["id"], 5)
    ci = uuid()[:10]
    nuevo = e.operacion("venta", venta_datos(producto, clienteNuevo={"nombre": "Ana Perez", "ci": ci}))
    generico = e.operacion("venta", venta_datos(producto))
    resultados = e.enviar(nuevo, generico)
    assert [r["estado"] for r in resultados] == ["Confirmada", "Confirmada"]
    cliente = sql('select c.nombre, c.ci from "Venta" v join "Cliente" c using ("idCliente") where v."idVenta" = :v', v=resultados[0]["idServidor"])[0]
    assert cliente == {"nombre": "Ana Perez", "ci": ci}
    nombre = sql('select c.nombre from "Venta" v join "Cliente" c using ("idCliente") where v."idVenta" = :v', v=resultados[1]["idServidor"])[0]
    assert nombre["nombre"] == "Cliente generico"


# --- CU18 --------------------------------------------------------------------

def test_cu18_stock_insuficiente_no_mueve_nada_hasta_aceptar_con_ajuste(e, producto):
    e.stock(producto["id"], 1)
    caja = e.abrir_caja()
    op = e.operacion("venta", venta_datos(producto, 3, uuidCaja=caja["uuidOperacion"]))
    resultado = e.enviar(op)[0]
    assert resultado["estado"] == "En conflicto"
    assert resultado["tipoConflicto"] == "stock_insuficiente"
    assert e.inventario(producto["id"]) == (1, 0)
    assert e.caja()["ingresos"] == 0

    conflicto = e.conflicto(op["uuidOperacion"])
    assert conflicto["decisiones"] == ["aceptar_ajuste", "anular"]
    r = e.resolver(conflicto["idConflicto"], decision="aceptar_ajuste", observaciones="La prenda ya se entrego")
    assert r.status_code == 200, r.text
    assert r.json()["resultado"] == "Confirmada"
    assert r.json()["alertaDiscrepancia"] is True
    assert e.inventario(producto["id"]) == (0, 0)
    assert e.caja()["ingresos"] == producto["precio"] * 3
    # El dispositivo se entera del resultado por el mismo UUID.
    assert e.enviar(op)[0]["estado"] == "Confirmada"


def test_cu18_respetar_precio_registra_el_descuento(e, producto):
    e.stock(producto["id"], 3)
    e.abrir_caja()
    cobrado = producto["precio"] - 10
    op = e.operacion("venta", venta_datos(producto, 1, cobrado))
    assert e.enviar(op)[0]["tipoConflicto"] == "precio_desactualizado"
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="respetar_precio")
    assert r.status_code == 200, r.text
    venta = sql('select total, "descuentoAutorizado" d from "Venta" where "idVenta" = :v', v=r.json()["idReferencia"])[0]
    assert float(venta["total"]) == cobrado
    assert float(venta["d"]) == 10


def test_cu18_anular_venta_registra_el_egreso(e, producto):
    e.stock(producto["id"], 0)
    caja = e.abrir_caja()
    op = e.operacion("venta", venta_datos(producto, 1, uuidCaja=caja["uuidOperacion"]))
    assert e.enviar(op)[0]["estado"] == "En conflicto"
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="anular")
    assert r.status_code == 200, r.text
    assert r.json()["resultado"] == "Anulada"
    actual = e.caja()
    assert actual["ingresos"] == actual["egresos"] == producto["precio"]
    assert e.enviar(op)[0]["estado"] == "Anulada"


def test_cu18_decision_invalida_y_umbral_de_administrador(e, producto):
    e.stock(producto["id"], 0)
    op = e.operacion("venta", venta_datos(producto, 1, 5000.0))
    e.enviar(op)
    conflicto = e.conflicto(op["uuidOperacion"])
    assert conflicto["soloAdministrador"] is True
    assert e.resolver(conflicto["idConflicto"], decision="reasignar").status_code == 400
    assert e.resolver(conflicto["idConflicto"], decision="anular").status_code == 403
    assert e.resolver(conflicto["idConflicto"], actor=e.admin, decision="anular").status_code == 200


def test_cu18_el_empleado_no_tiene_permiso(e, producto):
    assert correr(e.cajero.pedir("GET", "/api/sync/conflictos")).status_code == 403


def test_cu18_cliente_duplicado_se_fusiona(e, producto):
    e.stock(producto["id"], 3)
    ci = uuid()[:10]
    e.enviar(e.operacion("venta", venta_datos(producto, clienteNuevo={"nombre": "Maria Lopez", "ci": ci})))
    op = e.operacion("venta", venta_datos(producto, clienteNuevo={"nombre": "M. Lopez", "ci": ci}))
    assert e.enviar(op)[0]["tipoConflicto"] == "cliente_duplicado"
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="fusionar_cliente")
    assert r.status_code == 200, r.text
    cliente = sql('select c.nombre from "Venta" v join "Cliente" c using ("idCliente") where v."idVenta" = :v', v=r.json()["idReferencia"])[0]
    assert cliente["nombre"] == "Maria Lopez"


# --- CU15 --------------------------------------------------------------------

def reserva_datos(producto, cantidad=1, deposito=0.0, **extra):
    return {
        "items": [{"idProducto": producto["id"], "cantidad": cantidad, "precioUnitario": producto["precio"]}],
        "fechaLimite": ahora(days=2), "deposito": deposito, **extra,
    }


def test_cu15_reserva_aparta_y_la_cancelacion_libera(e, producto):
    e.stock(producto["id"], 4)
    caja = e.abrir_caja()
    op = e.operacion("reserva", reserva_datos(producto, 2, 30.0, uuidCaja=caja["uuidOperacion"]))
    cancelar = e.operacion("cancelar_reserva", {"uuidReserva": op["uuidOperacion"], "devolverDeposito": 30.0, "uuidCaja": caja["uuidOperacion"]})
    resultados = e.enviar(op)
    assert resultados[0]["estado"] == "Confirmada", resultados
    assert e.inventario(producto["id"]) == (4, 2)
    assert e.caja()["ingresos"] == 30
    assert e.enviar(cancelar)[0]["estado"] == "Confirmada"
    assert e.inventario(producto["id"]) == (4, 0)
    assert e.caja()["egresos"] == 30


def test_cu15_confirmar_reserva_con_varias_prendas(e, producto):
    otra = {"id": producto["otras"][0]["id"], "precio": float(producto["otras"][0]["venta"])}
    e.stock(producto["id"], 2)
    e.stock(otra["id"], 2)
    datos = reserva_datos(producto, 2)
    datos["items"].append({"idProducto": otra["id"], "cantidad": 1, "precioUnitario": otra["precio"]})
    datos["clienteNuevo"] = {"nombre": "Luis Rojas", "ci": uuid()[:10]}
    id_reserva = e.enviar(e.operacion("reserva", datos))[0]["idServidor"]
    assert e.inventario(producto["id"]) == (2, 2)
    assert correr(e.encargado.pedir("PUT", f"/api/reservations/{id_reserva}/prepare")).status_code == 200
    pago = correr(e.encargado.pedir("POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": 1})).json()
    r = correr(e.encargado.pedir("PUT", f"/api/reservations/{id_reserva}/confirm", json={"idMetPago": pago["idMetPago"]}))
    assert r.status_code == 200, r.text
    assert r.json()["total"] == producto["precio"] * 2 + otra["precio"]
    assert e.inventario(producto["id"]) == (0, 0)
    assert e.inventario(otra["id"]) == (1, 0)


def test_cu15_cu18_reserva_sin_existencia_se_reasigna(e, producto):
    otra = producto["otras"][0]["id"]
    e.stock(producto["id"], 0)
    e.stock(otra, 2)
    op = e.operacion("reserva", reserva_datos(producto))
    assert e.enviar(op)[0]["tipoConflicto"] == "reserva_sin_existencia"
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="reasignar", idProductoNuevo=otra)
    assert r.status_code == 200, r.text
    assert e.inventario(otra) == (2, 1)


# --- CU19 --------------------------------------------------------------------

def _venta_para_cambio(e, producto, caja) -> dict:
    op = e.operacion("venta", venta_datos(producto, 1, uuidCaja=caja["uuidOperacion"]))
    assert e.enviar(op)[0]["estado"] == "Confirmada"
    return op


def cambio_datos(producto, nueva, venta_op, cobrado=0.0, **extra):
    return {
        "uuidVenta": venta_op["uuidOperacion"], "idProducto": producto["id"], "idProductoNuevo": nueva, "cantidad": 1,
        "tipo": "cambio_talla", "motivoCategoria": "talla", "condicion": "apta", "montoCobrado": cobrado, **extra,
    }


def test_cu19_cambio_de_talla_completo(e, producto):
    nueva = next(o for o in producto["otras"] if float(o["venta"]) == producto["precio"])["id"]
    e.stock(producto["id"], 2)
    e.stock(nueva, 2)
    caja = e.abrir_caja()
    venta = _venta_para_cambio(e, producto, caja)
    op = e.operacion("cambio", cambio_datos(producto, nueva, venta, uuidCaja=caja["uuidOperacion"]), dependeDe=venta["uuidOperacion"])
    resultado = e.enviar(op)[0]
    assert resultado["estado"] == "Confirmada", resultado
    caso = sql('select estado, "origenRegistro" o, "idProductoNuevo" n from devolucion where "idDevolucion" = :i', i=resultado["idServidor"])[0]
    assert caso == {"estado": "Completada", "o": "sin_conexion", "n": nueva}
    assert e.inventario(nueva) == (1, 0)
    assert e.inventario(producto["id"]) == (2, 0)  # vendida una y devuelta una
    assert e.enviar(op)[0] == resultado


def test_cu19_saldo_a_favor_queda_como_reembolso_pendiente(e, producto):
    nueva = producto["otras"][0]["id"]
    e.stock(producto["id"], 2)
    e.stock(nueva, 2)
    caja = e.abrir_caja()
    sql("update producto set venta = venta - 20 where \"idProducto\" = :p", p=nueva)
    try:
        venta = _venta_para_cambio(e, producto, caja)
        resultado = e.enviar(e.operacion("cambio", cambio_datos(producto, nueva, venta)))[0]
        assert resultado["estado"] == "Confirmada", resultado
        caso = sql(
            'select "metodoReembolso" m, "estadoReembolso" r, "montoDevuelto" d from devolucion where "idDevolucion" = :i',
            i=resultado["idServidor"],
        )[0]
        assert caso["m"] == "efectivo" and caso["r"] == "Pendiente" and float(caso["d"]) > 0
        # El dinero no salio todavia: sale de la caja cuando se entrega.
        assert e.caja()["egresos"] == 0
        r = correr(e.cajero.pedir("POST", f"/api/returns/{resultado['idServidor']}/reembolso/confirmar", json={"comprobante": "Recibo 1"}))
        assert r.status_code == 200, r.text
        assert e.caja()["egresos"] == float(caso["d"])
    finally:
        sql("update producto set venta = venta + 20 where \"idProducto\" = :p", p=nueva)


def test_cu19_fuera_de_politica_queda_en_conflicto_y_se_puede_aceptar(e, producto):
    nueva = producto["otras"][0]["id"]
    e.stock(producto["id"], 2)
    e.stock(nueva, 2)
    caja = e.abrir_caja()
    venta = _venta_para_cambio(e, producto, caja)
    sql('update "Venta" set fecha = now() - interval \'60 days\' where "uuidOperacion" = :u', u=venta["uuidOperacion"])
    op = e.operacion("cambio", cambio_datos(producto, nueva, venta))
    resultado = e.enviar(op)[0]
    assert resultado["tipoConflicto"] == "politica_incumplida", resultado
    assert e.inventario(nueva) == (2, 0)
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="aceptar_cambio")
    assert r.status_code == 200, r.text
    assert e.inventario(nueva) == (1, 0)


def test_cu19_venta_en_conflicto_deja_el_cambio_pendiente(e, producto):
    nueva = producto["otras"][0]["id"]
    e.stock(producto["id"], 0)
    e.stock(nueva, 2)
    venta = e.operacion("venta", venta_datos(producto))
    cambio = e.operacion("cambio", cambio_datos(producto, nueva, venta), dependeDe=venta["uuidOperacion"])
    resultados = e.enviar(venta, cambio)
    assert resultados[0]["tipoConflicto"] == "stock_insuficiente"
    assert resultados[1]["tipoConflicto"] == "dependencia_pendiente"
    assert e.resolver(e.conflicto(venta["uuidOperacion"])["idConflicto"], decision="aceptar_ajuste").status_code == 200
    r = e.resolver(e.conflicto(cambio["uuidOperacion"])["idConflicto"], decision="reintentar")
    assert r.status_code == 200, r.text
    assert r.json()["resultado"] == "Confirmada"


def test_cu19_custodia_se_vincula_a_su_venta(e, producto):
    e.stock(producto["id"], 2)
    caja = e.abrir_caja()
    venta = _venta_para_cambio(e, producto, caja)
    id_venta = sql('select "idVenta" v from "Venta" where "uuidOperacion" = :u', u=venta["uuidOperacion"])[0]["v"]
    op = e.operacion("custodia", {"clienteNombre": "Ana", "descripcionPrenda": "Polera negra M", "comprobante": "123"})
    assert e.enviar(op)[0]["tipoConflicto"] == "recepcion_custodia"
    r = e.resolver(e.conflicto(op["uuidOperacion"])["idConflicto"], decision="vincular_venta", idVenta=id_venta, idProducto=producto["id"])
    assert r.status_code == 200, r.text
    caso = sql('select estado from devolucion where "idDevolucion" = :i', i=r.json()["idReferencia"])[0]
    assert caso["estado"] == "EnInspeccion"


# --- CU20 --------------------------------------------------------------------

def test_cu20_abrir_dos_veces_devuelve_la_misma(e):
    assert e.abrir_caja()["idCaja"] == e.abrir_caja(monto=999)["idCaja"]


def test_cu20_pos_en_efectivo_exige_caja_abierta(e, producto):
    e.stock(producto["id"], 3)
    cliente = sql('select "idCliente" i from "Cliente" limit 1')[0]["i"]

    def vender():
        pago = correr(e.cajero.pedir("POST", "/api/payment-methods", json={"tipo": "Efectivo", "estado": "Activo", "monto": producto["precio"]})).json()
        return correr(e.cajero.pedir("POST", "/api/sales", json={
            "idCliente": cliente, "idMetPago": pago["idMetPago"], "codigoSucursal": e.sucursal,
            "items": [{"idProducto": producto["id"], "cantidad": 1}],
        }))

    assert vender().status_code == 409
    assert e.inventario(producto["id"]) == (3, 0)
    e.abrir_caja()
    assert vender().status_code == 201
    assert e.caja()["ingresos"] == producto["precio"]


def test_cu20_cierre_exacto_queda_cerrado(e):
    caja = e.abrir_caja(100)
    r = correr(e.cajero.pedir("POST", f"/api/caja/{caja['idCaja']}/cerrar", json={"efectivoContado": 100}))
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "Cerrada"
    assert r.json()["diferencia"] == 0
    assert e.caja() is None


def test_cu20_diferencia_grande_pide_justificacion_y_aprobacion(e):
    caja = e.abrir_caja(100)
    ruta = f"/api/caja/{caja['idCaja']}/cerrar"
    assert correr(e.cajero.pedir("POST", ruta, json={"efectivoContado": 10})).status_code == 400
    r = correr(e.cajero.pedir("POST", ruta, json={"efectivoContado": 10, "justificacion": "Falto cambio"}))
    assert r.json()["estado"] == "PendienteAprobacion"
    assert correr(e.cajero.pedir("POST", f"/api/caja/{caja['idCaja']}/aprobar")).status_code == 403
    r = correr(e.encargado.pedir("POST", f"/api/caja/{caja['idCaja']}/aprobar"))
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "Cerrada"


def test_cu20_apertura_y_cierre_sin_conexion(e, producto):
    e.stock(producto["id"], 3)
    apertura = e.operacion("caja_apertura", {"montoInicial": 50})
    venta = e.operacion("venta", venta_datos(producto, 1, uuidCaja=apertura["uuidOperacion"]))
    cierre = e.operacion("caja_cierre", {
        "uuidCaja": apertura["uuidOperacion"], "efectivoContado": 50 + producto["precio"], "pendientes": [venta["uuidOperacion"]],
    })
    resultados = e.enviar(apertura, venta, cierre)
    assert [r["estado"] for r in resultados] == ["Confirmada"] * 3, resultados
    fila = sql('select estado, diferencia, "origenRegistro" o from caja where "idCaja" = :c', c=resultados[0]["idServidor"])[0]
    assert fila["estado"] == "Cerrada" and float(fila["diferencia"]) == 0 and fila["o"] == "sin_conexion"


def test_cu20_cierre_provisional_pasa_a_definitivo_al_resolver_el_conflicto(e, producto):
    e.stock(producto["id"], 0)
    caja = e.abrir_caja(100)
    venta = e.operacion("venta", venta_datos(producto, 1, uuidCaja=caja["uuidOperacion"]))
    assert e.enviar(venta)[0]["estado"] == "En conflicto"
    contado = 100 + producto["precio"]
    r = correr(e.cajero.pedir("POST", f"/api/caja/{caja['idCaja']}/cerrar", json={
        "efectivoContado": contado, "justificacion": "Venta en conflicto", "operacionesPendientes": [venta["uuidOperacion"]],
    }))
    assert r.json()["estado"] == "CierreProvisional", r.text
    assert r.json()["operacionesPendientes"] == 1
    assert e.resolver(e.conflicto(venta["uuidOperacion"])["idConflicto"], decision="aceptar_ajuste").status_code == 200
    fila = sql('select estado, diferencia from caja where "idCaja" = :c', c=caja["idCaja"])[0]
    assert fila["estado"] == "Cerrada"
    assert float(fila["diferencia"]) == 0


def test_cu20_una_sola_caja_por_sucursal_aunque_abran_sin_conexion(e):
    caja = e.abrir_caja()
    resultado = e.enviar(e.operacion("caja_apertura", {"montoInicial": 10}))[0]
    assert resultado["estado"] == "Confirmada"
    assert resultado["idServidor"] == caja["idCaja"]


def test_rnf02_otra_empresa_no_ve_la_caja(e):
    caja = e.abrir_caja()
    otra = sql(
        'select u."idUser" from "Usuario" u join rol r using ("codigoRol") where r."nombreRol" = \'Administrador\' and u."idTenant" = 2 limit 1'
    )[0]["idUser"]
    ajeno = correr(Cliente(otra).preparar())
    assert correr(ajeno.pedir("GET", f"/api/caja/{caja['idCaja']}/movimientos")).status_code == 404
    assert correr(ajeno.pedir("GET", "/api/caja/actual", params={"codigoSucursal": e.sucursal})).status_code == 403
