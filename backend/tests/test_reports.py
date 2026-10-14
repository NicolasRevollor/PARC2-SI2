"""Tests de las funciones puras de shaping/CSV/PDF de app.routers.reports.

Solo cubren logica pura (sin DB, sin I/O), siguiendo la resolucion de TDD
documentada en odd/tasks/cu25-reportes-ventas-inventario.md: no hay
contenedor Postgres disponible para levantar un TestClient contra un DB
real, asi que las funciones de agregacion (que si tocan la DB) quedan sin
test de integracion, y solo se testean los helpers puros extraidos.
"""

from collections import namedtuple
from decimal import Decimal

from app.routers.reports import (
    _describe_filtros,
    _inventory_rows_to_csv,
    _inventory_rows_to_pdf_bytes,
    _sales_rows_to_csv,
    _sales_rows_to_pdf_bytes,
    _sales_totals,
    _shape_inventory_rows,
    _shape_sales_rows,
)

VentaRow = namedtuple(
    "VentaRow",
    ["idProducto", "producto_nombre", "codigoSucursal", "sucursal_nombre", "cantidad_vendida", "monto"],
)
InventarioRow = namedtuple(
    "InventarioRow",
    ["idProducto", "producto_nombre", "codigoSucursal", "sucursal_nombre", "cantidad_actual", "cantidad_reservada"],
)


def test_shape_sales_rows_convierte_y_ordena_por_producto_y_sucursal():
    raw = [
        VentaRow(2, "Polera", 1, "Sucursal Norte", 3, Decimal("90.00")),
        VentaRow(1, "Camisa", 2, "Sucursal Sur", 5, Decimal("250.00")),
    ]
    filas = _shape_sales_rows(raw)
    assert filas == [
        {
            "idProducto": 1,
            "producto_nombre": "Camisa",
            "codigoSucursal": 2,
            "sucursal_nombre": "Sucursal Sur",
            "cantidad_vendida": 5,
            "monto": Decimal("250.00"),
        },
        {
            "idProducto": 2,
            "producto_nombre": "Polera",
            "codigoSucursal": 1,
            "sucursal_nombre": "Sucursal Norte",
            "cantidad_vendida": 3,
            "monto": Decimal("90.00"),
        },
    ]


def test_shape_inventory_rows_convierte_y_ordena():
    raw = [
        InventarioRow(2, "Polera", 1, "Sucursal Norte", 10, 2),
        InventarioRow(1, "Camisa", 2, "Sucursal Sur", 7, 1),
    ]
    filas = _shape_inventory_rows(raw)
    assert filas[0]["producto_nombre"] == "Camisa"
    assert filas[1]["producto_nombre"] == "Polera"
    assert filas[0]["cantidad_actual"] == 7
    assert filas[0]["cantidad_reservada"] == 1


def test_sales_totals_suma_monto_y_cantidad():
    filas = [
        {"cantidad_vendida": 5, "monto": Decimal("250.00")},
        {"cantidad_vendida": 3, "monto": Decimal("90.00")},
    ]
    total_monto, total_items = _sales_totals(filas)
    assert total_monto == Decimal("340.00")
    assert total_items == 8


def test_sales_totals_con_lista_vacia():
    total_monto, total_items = _sales_totals([])
    assert total_monto == Decimal("0")
    assert total_items == 0


def test_describe_filtros_sin_filtros():
    assert _describe_filtros({}) == "Sin filtros"


def test_describe_filtros_con_fechas_sucursal_producto():
    texto = _describe_filtros(
        {
            "fecha_desde": "2026-01-01",
            "fecha_hasta": "2026-01-31",
            "codigoSucursal": 2,
            "idProducto": 5,
        }
    )
    assert "2026-01-01" in texto
    assert "2026-01-31" in texto
    assert "Sucursal 2" in texto
    assert "Producto 5" in texto


def test_sales_rows_to_csv_exacto():
    filas = [
        {
            "idProducto": 1,
            "producto_nombre": "Camisa",
            "codigoSucursal": 2,
            "sucursal_nombre": "Sucursal Sur",
            "cantidad_vendida": 5,
            "monto": Decimal("250.00"),
        },
        {
            "idProducto": 2,
            "producto_nombre": "Polera",
            "codigoSucursal": 1,
            "sucursal_nombre": "Sucursal Norte",
            "cantidad_vendida": 3,
            "monto": Decimal("90.00"),
        },
    ]
    csv_text = _sales_rows_to_csv(filas)
    esperado = (
        "Producto,Sucursal,Cantidad Vendida,Monto\r\n"
        "Camisa,Sucursal Sur,5,250.00\r\n"
        "Polera,Sucursal Norte,3,90.00\r\n"
        "TOTAL,,8,340.00\r\n"
    )
    assert csv_text == esperado


def test_sales_rows_to_csv_vacio_solo_header_y_totales_cero():
    csv_text = _sales_rows_to_csv([])
    esperado = "Producto,Sucursal,Cantidad Vendida,Monto\r\n" "TOTAL,,0,0.00\r\n"
    assert csv_text == esperado


def test_inventory_rows_to_csv_exacto():
    filas = [
        {
            "idProducto": 1,
            "producto_nombre": "Camisa",
            "codigoSucursal": 2,
            "sucursal_nombre": "Sucursal Sur",
            "cantidad_actual": 7,
            "cantidad_reservada": 1,
        },
    ]
    csv_text = _inventory_rows_to_csv(filas)
    esperado = (
        "Producto,Sucursal,Cantidad Actual,Cantidad Reservada\r\n"
        "Camisa,Sucursal Sur,7,1\r\n"
    )
    assert csv_text == esperado


def test_sales_rows_to_pdf_bytes_es_un_pdf_no_vacio():
    filas = [
        {
            "idProducto": 1,
            "producto_nombre": "Camisa",
            "codigoSucursal": 2,
            "sucursal_nombre": "Sucursal Sur",
            "cantidad_vendida": 5,
            "monto": Decimal("250.00"),
        },
    ]
    pdf_bytes = _sales_rows_to_pdf_bytes(filas, {"codigoSucursal": 2})
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 0
    assert pdf_bytes.startswith(b"%PDF")


def test_sales_rows_to_pdf_bytes_vacio_no_falla():
    pdf_bytes = _sales_rows_to_pdf_bytes([], {})
    assert pdf_bytes.startswith(b"%PDF")


def test_inventory_rows_to_pdf_bytes_es_un_pdf_no_vacio():
    filas = [
        {
            "idProducto": 1,
            "producto_nombre": "Camisa",
            "codigoSucursal": 2,
            "sucursal_nombre": "Sucursal Sur",
            "cantidad_actual": 7,
            "cantidad_reservada": 1,
        },
    ]
    pdf_bytes = _inventory_rows_to_pdf_bytes(filas, {})
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
