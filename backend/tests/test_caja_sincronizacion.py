"""[CU17] [CU18] [CU20]: reglas puras de la caja, los conflictos y la suspension."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.caja import calcular_arqueo, decidir_cierre
from app.services.conflictos import decisiones_de, solo_administrador
from app.services.operaciones_offline import LineaRevisada, clasificar_lineas, rechazo_por_suscripcion


def linea(**campos) -> LineaRevisada:
    base = dict(id_producto=1, nombre="Polera", cantidad=1, precio_local=Decimal("100.00"),
                precio_servidor=Decimal("100.00"), disponible=5)
    return LineaRevisada(**{**base, **campos})


def test_arqueo_esperado_es_inicial_mas_ingresos_menos_egresos():
    esperado, diferencia = calcular_arqueo(100, 250, 50, 300)
    assert esperado == Decimal("300.00")
    assert diferencia == Decimal("0.00")


def test_arqueo_negativo_es_faltante():
    _, diferencia = calcular_arqueo(100, 0, 0, 90.5)
    assert diferencia == Decimal("-9.50")


def test_cierre_con_diferencia_en_el_umbral_no_pide_nada():
    decision = decidir_cierre(50, 50, pendientes=0, puede_aprobar=False)
    assert decision.estado == "Cerrada"
    assert not decision.requiere_justificacion


def test_cierre_sobre_el_umbral_lo_aprueba_el_encargado():
    decision = decidir_cierre(-50.01, 50, pendientes=0, puede_aprobar=False)
    assert decision.estado == "PendienteAprobacion"
    assert decision.requiere_justificacion


def test_el_encargado_cierra_con_justificacion_sin_esperar_aprobacion():
    decision = decidir_cierre(80, 50, pendientes=0, puede_aprobar=True)
    assert decision.estado == "Cerrada"
    assert decision.requiere_justificacion


def test_con_operaciones_sin_confirmar_el_cierre_es_provisional():
    assert decidir_cierre(0, 50, pendientes=2, puede_aprobar=True).estado == "CierreProvisional"


def test_lineas_que_coinciden_no_son_conflicto():
    assert clasificar_lineas([linea()]) is None


def test_stock_insuficiente_es_conflicto():
    assert clasificar_lineas([linea(cantidad=6)])[0] == "stock_insuficiente"


def test_precio_distinto_es_conflicto_en_venta_pero_no_en_reserva():
    distinta = linea(precio_servidor=Decimal("120.00"))
    assert clasificar_lineas([distinta])[0] == "precio_desactualizado"
    assert clasificar_lineas([distinta], es_reserva=True) is None


def test_reserva_sin_stock_tiene_su_propio_conflicto():
    assert clasificar_lineas([linea(disponible=0)], es_reserva=True)[0] == "reserva_sin_existencia"


def test_producto_inexistente_gana_a_los_demas_conflictos():
    lineas = [linea(disponible=0), linea(id_producto=2, existe=False, precio_servidor=None)]
    assert clasificar_lineas(lineas)[0] == "producto_desactivado"


def test_producto_desactivado_solo_se_puede_anular():
    assert decisiones_de("producto_desactivado") == ("anular",)


def test_umbral_de_conflicto_reserva_el_caso_al_administrador():
    assert solo_administrador(1000.01, 1000)
    assert not solo_administrador(1000, 1000)


def test_suspension_acepta_lo_anterior_y_rechaza_lo_posterior():
    suspension = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
    antes = suspension - timedelta(hours=1)
    despues = suspension + timedelta(hours=1)
    assert rechazo_por_suscripcion("Suspendido", suspension, antes) is None
    assert rechazo_por_suscripcion("Suspendido", suspension, despues) is not None
    assert rechazo_por_suscripcion("Activo", None, despues) is None
    assert rechazo_por_suscripcion("Suspendido", None, antes) is not None
