"""[CU22] [CU25] [CU26] [CU29]: reglas puras (sin base de datos)."""

from datetime import date, datetime, timedelta, timezone

from app.services.acceso import EstadoCuenta, decidir
from app.services.modelos_ia import comparar
from app.services.operaciones_offline import rechazo_por_baja
from app.services.reportes_generativos import Contexto, interpretar_por_reglas, periodo_en_texto, validar
from app.services.suscripciones import clave_visible, estado_por_fecha

AHORA = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


def ctx(visibles=None, hoy=date(2026, 11, 7)) -> Contexto:
    return Contexto(
        id_tenant=1, empresa="YouShop", sucursales={1: "Sucursal Central", 2: "Sucursal El Prado"}, visibles=visibles,
        categorias=["Jeans", "Polera Oversize"], tallas=["M", "L", "32"], colores=["Negro", "Blanco"],
        productos=["Jeans Negro", "Polera Oversize Negra"], hoy=hoy,
    )


# --- CU22 -------------------------------------------------------------------------

def test_cu22_vence_pasa_a_gracia_y_luego_a_suspendida():
    vence = AHORA - timedelta(days=1)
    assert estado_por_fecha("Activa", vence, AHORA) == "Gracia"
    assert estado_por_fecha("Activa", AHORA - timedelta(days=8), AHORA) == "Suspendida"
    assert estado_por_fecha("Activa", AHORA + timedelta(days=1), AHORA) == "Activa"
    assert estado_por_fecha("Cancelada", vence, AHORA) == "Cancelada"


def test_cu22_por_vencer_se_calcula():
    assert clave_visible("Activa", AHORA + timedelta(days=5), AHORA) == "PorVencer"
    assert clave_visible("Activa", AHORA + timedelta(days=20), AHORA) == "Activa"


# --- CU25 -------------------------------------------------------------------------

def test_cu25_en_gracia_solo_consultas():
    gracia = EstadoCuenta(usuario_activo=True, suscripcion="Gracia")
    assert decidir(gracia, "GET", "/api/products") is None
    assert decidir(gracia, "POST", "/api/reports/ia/consultar") is None
    assert decidir(gracia, "POST", "/api/sales")[0] == 403
    assert decidir(gracia, "POST", "/api/sync/lote") is None


def test_cu25_suspendida_rechaza_todo_menos_sesion_y_sincronizacion():
    suspendida = EstadoCuenta(usuario_activo=True, suscripcion="Suspendida")
    assert decidir(suspendida, "GET", "/api/products")[0] == 403
    assert decidir(suspendida, "POST", "/api/auth/refresh") is None
    assert decidir(suspendida, "POST", "/api/sync/lote") is None


def test_cu24_usuario_dado_de_baja_no_opera():
    baja = EstadoCuenta(usuario_activo=False, suscripcion="Activa")
    assert decidir(baja, "GET", "/api/products")[0] == 401
    assert decidir(baja, "POST", "/api/sync/lote")[0] == 401


def test_cu24_operaciones_antes_de_la_baja_se_aceptan():
    baja = AHORA
    assert rechazo_por_baja(False, baja, AHORA - timedelta(hours=1)) is None
    assert rechazo_por_baja(False, baja, AHORA + timedelta(hours=1)) is not None
    assert rechazo_por_baja(True, None, AHORA) is None


# --- CU26 -------------------------------------------------------------------------

def test_cu26_ejemplo_del_informe():
    i = interpretar_por_reglas("Mostrame las ventas de septiembre agrupadas por sucursal", ctx())
    v = validar(i, ctx())
    assert (v.fuente, v.dimensiones, v.desde, v.hasta) == ("ventas", ["sucursal"], date(2026, 9, 1), date(2026, 9, 30))


def test_cu26_mas_vendidos_sin_criterio_pide_aclaracion():
    i = interpretar_por_reglas("los productos mas vendidos", ctx())
    assert i.accion == "aclarar" and len(i.opciones) == 2
    elegida = interpretar_por_reglas(i.opciones[0], ctx())
    assert elegida.accion == "reporte" and elegida.metricas == ["unidades"]


def test_cu26_este_mes_al_inicio_del_mes_pide_aclaracion():
    i = interpretar_por_reglas("ventas por sucursal este mes", ctx(hoy=date(2026, 11, 2)))
    assert i.accion == "aclarar"
    assert interpretar_por_reglas(i.opciones[0], ctx(hoy=date(2026, 11, 2))).accion == "reporte"


def test_cu26_sin_periodo_usa_el_mes_actual_y_lo_indica():
    v = validar(interpretar_por_reglas("ventas por categoria", ctx()), ctx())
    assert v.desde == date(2026, 11, 1)
    assert "valor por defecto" in dict(v.filtros_texto)["Periodo"]


def test_cu26_rechaza_modificar_datos_y_otra_empresa():
    assert interpretar_por_reglas("borra las ventas de ayer", ctx()).accion == "rechazar"
    assert interpretar_por_reglas("ventas de otra empresa", ctx()).accion == "rechazar"
    assert interpretar_por_reglas("que hora es", ctx()).accion == "rechazar"


def test_cu26_encargado_limitado_a_sus_sucursales():
    v = validar(interpretar_por_reglas("ventas de la Sucursal El Prado por producto", ctx(visibles={1})), ctx(visibles={1}))
    assert v.sucursales == set()
    assert any("sus sucursales" in a for a in v.avisos)
    v = validar(interpretar_por_reglas("ventas por producto", ctx(visibles={1})), ctx(visibles={1}))
    assert v.sucursales == {1}


def test_cu26_dos_agrupaciones_y_rango():
    v = validar(interpretar_por_reglas("stock disponible por sucursal y categoria", ctx()), ctx())
    assert v.dimensiones == ["sucursal", "categoria"] and v.visualizacion == "tabla"
    assert periodo_en_texto("ventas del 1 al 15 de octubre", date(2026, 11, 7)) == (date(2026, 10, 1), date(2026, 10, 15))


# --- CU29 -------------------------------------------------------------------------

def test_cu29_compara_con_la_version_publicada():
    assert comparar({"r2": 0.4, "mae": 1.0}, {"r2": 0.3, "mae": 1.5}) == {"r2": 0.1, "mae": -0.5}
    assert comparar({"r2": 0.4}, None) == {}
