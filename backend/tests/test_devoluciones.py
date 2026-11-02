"""Tests de las reglas del modulo de devoluciones (CU1 a CU11 de
docs/iconix/2do parcial SI2.md) que no necesitan base: elegibilidad,
recargo por demora, inspeccion, diferencias de precio, saldo a favor,
politica, distincion entre tallas y nota de devolucion."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services import devoluciones as dv

AHORA = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)
POLITICA = dv.Politica()


def prenda(id_producto: int, tipo: str, talla: str, color: str) -> SimpleNamespace:
    return SimpleNamespace(idProducto=id_producto, tipo=tipo, talla=talla, color=color)


POLERA_M_NEGRA = prenda(1, "Polera Oversize", "M", "Negro")
POLERA_L_NEGRA = prenda(2, "Polera Oversize", "L", "Negro")
POLERA_M_GRIS = prenda(3, "Polera Oversize", "M", "Gris")
POLERA_L_GRIS = prenda(4, "Polera Oversize", "L", "Gris")
JEAN_32_NEGRO = prenda(5, "Jeans", "32", "Negro")


def elegibilidad(horas_desde_venta: float, politica: dv.Politica = POLITICA, **extra) -> dv.Elegibilidad:
    datos = dict(categoria="Polera Oversize", es_defecto=False, cambios_realizados=0, disponibles=1)
    datos.update(extra)
    return dv.evaluar_elegibilidad(
        fecha_venta=AHORA - timedelta(hours=horas_desde_venta), ahora=AHORA, politica=politica,
        valor=Decimal("120.00"), **datos,
    )


# --- CU1/CU2: elegibilidad -------------------------------------------------------

def test_dentro_del_plazo_de_cambio_de_24_h():
    e = elegibilidad(23)
    assert e.puede and e.estado == "en_plazo" and 0.9 < e.horasRestantes <= 1


def test_fuera_de_plazo_se_rechaza_indicando_la_fecha_limite():
    e = elegibilidad(25)
    assert not e.puede and e.estado == "fuera_plazo" and "fecha limite" in e.mensaje


def test_fuera_de_plazo_con_recargo_por_dia_de_demora():
    politica = dv.Politica(accionFueraPlazo="recargo", recargoTipo="porcentaje", recargoValor=Decimal("5"), recargoUnidad="dia")
    e = elegibilidad(24 + 30, politica)  # 30 h de demora: 2 dias iniciados
    assert e.puede and e.estado == "recargo" and e.recargo == Decimal("12.00")


def test_el_recargo_nunca_supera_el_valor_de_la_prenda():
    politica = dv.Politica(recargoTipo="monto", recargoValor=Decimal("50"), recargoUnidad="hora")
    assert dv.calcular_recargo(Decimal("120"), politica, 10) == Decimal("120.00")
    assert dv.calcular_recargo(Decimal("120"), politica, 0) == Decimal("0.00")


def test_defecto_de_fabrica_se_evalua_contra_la_garantia():
    assert elegibilidad(24 * 10, es_defecto=True).estado == "garantia"
    assert not elegibilidad(24 * 31, es_defecto=True).puede


def test_categoria_no_retornable_solo_por_defecto():
    politica = dv.Politica(categoriasNoRetornables=("Polera Oversize",))
    assert elegibilidad(1, politica).estado == "no_retornable"
    assert elegibilidad(1, politica, es_defecto=True).puede


def test_maximo_de_cambios_y_unidades_agotadas():
    assert elegibilidad(1, cambios_realizados=2).estado == "max_cambios"
    assert elegibilidad(1, disponibles=0).estado == "sin_unidades"


# --- CU3: inspeccion -------------------------------------------------------------

def test_el_codigo_escaneado_debe_coincidir_con_la_prenda():
    assert dv.codigo_coincide("YS-000042", 42)
    assert dv.codigo_coincide(None, 42)
    assert not dv.codigo_coincide("YS-000041", 42)
    d = dv.decidir_inspeccion("apta", POLITICA, coincide=False, acepta_descuento=False)
    assert d.estado == "Rechazada" and "no corresponde" in d.motivo_rechazo


def test_deteriorada_segun_la_politica():
    assert dv.decidir_inspeccion("deteriorada", POLITICA, coincide=True, acepta_descuento=True).estado == "Rechazada"
    con_descuento = dv.Politica(accionDeterioro="descuento", descuentoDeterioroPct=Decimal("30"))
    acepta = dv.decidir_inspeccion("deteriorada", con_descuento, coincide=True, acepta_descuento=True)
    assert acepta.estado == "Aprobada" and acepta.descuento_pct == Decimal("30")
    assert dv.decidir_inspeccion("deteriorada", con_descuento, coincide=True, acepta_descuento=False).estado == "Rechazada"


def test_defecto_de_fabrica_se_acepta_y_va_al_inventario_no_vendible():
    assert dv.decidir_inspeccion("defectuosa", POLITICA, coincide=True, acepta_descuento=False).estado == "Aprobada"
    assert dv.destino_por_condicion("defectuosa") == "no_vendible"
    assert dv.destino_por_condicion("apta") == "vendible"


def test_credito_descuenta_recargo_y_deterioro():
    assert dv.credito_del_caso(Decimal("120"), Decimal("12"), Decimal("36")) == Decimal("72.00")
    assert dv.credito_del_caso(Decimal("10"), Decimal("12"), 0) == Decimal("0.00")


# --- CU4/CU5: cambios ------------------------------------------------------------

def test_clasificacion_del_cambio():
    assert dv.tipo_de_cambio(POLERA_M_NEGRA, POLERA_L_NEGRA) == "cambio_talla"
    assert dv.tipo_de_cambio(POLERA_M_NEGRA, POLERA_M_GRIS) == "cambio_color"
    assert dv.tipo_de_cambio(POLERA_M_NEGRA, POLERA_L_GRIS) == "cambio_producto"
    assert dv.tipo_de_cambio(POLERA_M_NEGRA, JEAN_32_NEGRO) == "cambio_producto"
    assert "cambio de color" in dv.error_de_clasificacion("cambio_talla", POLERA_M_NEGRA, POLERA_M_GRIS)
    assert dv.error_de_clasificacion("cambio_producto", POLERA_M_NEGRA, POLERA_M_NEGRA)


def test_cambio_sin_costo_y_diferencia_propia_de_la_variante():
    # Mismo precio: "Cambio sin costo".
    assert dv.diferencia_variante(precio_pagado=120, precio_actual_original=120, precio_actual_nueva=120,
                                  cantidad=1, credito=120, respetar_precio_original=True) == Decimal("0.00")
    # La XL tiene un recargo propio de Bs 10: se cobra solo eso.
    assert dv.diferencia_variante(precio_pagado=120, precio_actual_original=120, precio_actual_nueva=130,
                                  cantidad=1, credito=120, respetar_precio_original=True) == Decimal("10.00")


def test_respetar_precio_original_no_cobra_el_aumento_general():
    # El modelo subio de 120 a 150 despues de la venta.
    con = dv.diferencia_variante(precio_pagado=120, precio_actual_original=150, precio_actual_nueva=150,
                                 cantidad=1, credito=120, respetar_precio_original=True)
    sin = dv.diferencia_variante(precio_pagado=120, precio_actual_original=150, precio_actual_nueva=150,
                                 cantidad=1, credito=120, respetar_precio_original=False)
    assert con == Decimal("0.00") and sin == Decimal("30.00")


# --- Distincion entre tallas (correccion: "L mas grande o L menos grande") ----------------

def _prenda(talla, pecho=None, largo=None, cintura=None):
    return SimpleNamespace(talla=talla, medidaPechoCm=pecho, medidaLargoCm=largo, medidaCinturaCm=cintura)


def test_la_talla_nueva_es_mas_grande_por_centimetros():
    r = dv.comparar_tallas(_prenda("M", 118, 72), _prenda("L", 124, 74))
    assert r["direccion"] == "mas_grande"
    assert r["diferenciasCm"] == {"pecho": 6, "largo": 2}
    assert "MAS GRANDE" in r["texto"]


def test_una_l_puede_ser_mas_chica_que_otra_l():
    # Misma letra, distinto modelo: la "L" normal es mas chica que la "L" oversize.
    r = dv.comparar_tallas(_prenda("L", 124, 74), _prenda("L", 104, 70))
    assert r["direccion"] == "mas_chica"
    assert r["diferenciasCm"]["pecho"] == -20


def test_sin_medidas_se_usa_el_orden_de_las_tallas():
    assert dv.comparar_tallas(_prenda("S"), _prenda("XL"))["direccion"] == "mas_grande"
    assert dv.comparar_tallas(_prenda("34"), _prenda("30"))["direccion"] == "mas_chica"
    assert dv.comparar_tallas(_prenda("?"), _prenda("M"))["direccion"] == "sin_datos"


# --- CU6: medio de reembolso ----------------------------------------------------------

def test_el_reembolso_usa_el_medio_de_la_venta():
    assert dv.medio_de_pago(SimpleNamespace(origen="tarjeta_stripe", stripePaymentIntentId="pi_1", tipo="Tarjeta (Stripe)")) == "tarjeta"
    assert dv.medio_de_pago(SimpleNamespace(origen=None, stripePaymentIntentId=None, tipo="QR / Transferencia")) == "qr"
    # Ya no hay notas de credito: una venta vieja pagada con nota se devuelve en efectivo.
    assert dv.medio_de_pago(SimpleNamespace(origen="nota_credito", stripePaymentIntentId=None, tipo="Nota de credito NC-1")) == "efectivo"
    assert dv.medio_de_pago(SimpleNamespace(origen=None, stripePaymentIntentId=None, tipo="Efectivo")) == "efectivo"
    assert dv.medio_de_pago(None) == "efectivo"


def test_umbral_de_autorizacion():
    politica = dv.Politica(umbralAutorizacion=Decimal("300"))
    assert dv.supera_umbral(Decimal("300.01"), politica)
    assert not dv.supera_umbral(300, politica)


# --- CU9: politica -----------------------------------------------------------------

def test_la_garantia_no_puede_ser_menor_que_el_plazo_de_cambio():
    errores = dv.errores_politica(dv.Politica(plazoCambioHoras=72, plazoGarantiaDias=2))
    assert "plazoGarantiaDias" in errores
    assert dv.errores_politica(POLITICA) == {}


def test_valores_invalidos_se_marcan_por_campo():
    errores = dv.errores_politica(dv.Politica(recargoValor=Decimal("150"), descuentoDeterioroPct=Decimal("-1"), maxCambiosPorPrenda=0))
    assert {"recargoValor", "descuentoDeterioroPct", "maxCambiosPorPrenda"} <= set(errores)


# --- CU7: nota de devolucion -------------------------------------------------------------

def test_codigos():
    assert dv.codigo_caso(123) == "DEV-000123"
    assert dv.codigo_de_producto(42) == "YS-000042"


def test_la_nota_de_devolucion_dice_cuanto_y_por_que_medio():
    caso = SimpleNamespace(codigo="DEV-000123", montoDevuelto=Decimal("80"), metodoReembolso="efectivo",
                           estadoReembolso="Completado", referenciaReembolso=None)
    nota = dv.nota_de_devolucion(caso)
    assert nota[0] == "Nota de devolucion N DEV-000123"
    assert "Bs 80.00 en efectivo" in nota[1]


def test_la_nota_avisa_si_el_reembolso_sigue_pendiente():
    caso = SimpleNamespace(codigo="DEV-000124", montoDevuelto=Decimal("50"), metodoReembolso="tarjeta",
                           estadoReembolso="Pendiente", referenciaReembolso="La pasarela no respondio")
    nota = dv.nota_de_devolucion(caso)
    assert "Estado del reembolso: Pendiente" in nota
