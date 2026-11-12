"""Validaciones del contrato que llega desde la cola de ventas offline."""

import pytest
from pydantic import ValidationError

from app.schemas.sincronizacion import DatosReserva, DatosVenta


def venta(**cambios):
    datos = {
        "items": [{"idProducto": 7, "cantidad": 2, "precioUnitario": 19.99}],
        "total": 39.98,
        "formaPago": "Efectivo",
        "montoRecibido": 50,
    }
    datos.update(cambios)
    return datos


def test_venta_offline_acepta_importe_de_lineas_y_efectivo_suficiente():
    datos = DatosVenta.model_validate(venta())
    assert datos.total == 39.98


@pytest.mark.parametrize(
    ("datos", "mensaje"),
    [
        (venta(total=1), "El total no coincide"),
        (venta(montoRecibido=39.97), "no cubre el total"),
        (venta(total=-1), "greater than or equal to 0"),
        (venta(items=[
            {"idProducto": 7, "cantidad": 1, "precioUnitario": 19.99},
            {"idProducto": 7, "cantidad": 1, "precioUnitario": 19.99},
        ]), "Una prenda debe aparecer una sola vez"),
    ],
)
def test_venta_offline_rechaza_total_cobro_o_items_inconsistentes(datos, mensaje):
    with pytest.raises(ValidationError, match=mensaje):
        DatosVenta.model_validate(datos)


def test_reserva_offline_rechaza_prenda_duplicada():
    with pytest.raises(ValidationError, match="Una prenda debe aparecer una sola vez"):
        DatosReserva.model_validate({
            "items": [
                {"idProducto": 7, "cantidad": 1, "precioUnitario": 19.99},
                {"idProducto": 7, "cantidad": 1, "precioUnitario": 19.99},
            ],
            "fechaLimite": "2026-11-12T12:00:00Z",
        })
