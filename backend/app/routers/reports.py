import csv
import io
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DetalleVenta, Inventario, Producto, Sucursal, Venta
from app.schemas.reports import (
    InventarioReporteFila,
    InventarioReporteOut,
    ReportFiltrosOut,
    VentaReporteFila,
    VentaReporteOut,
)
from app.security import require_permiso

router = APIRouter(prefix="/api/reports", tags=["reports"])


# --- Helpers puros (sin DB, sin I/O) -----------------------------------
# Extraidos del cuerpo de los endpoints para poder testearlos sin una
# conexion real a Postgres (ver backend/tests/test_reports.py).

def _shape_sales_rows(raw_rows) -> list[dict]:
    """Convierte filas crudas (Row/tuple con atributos) del query de
    ventas agregadas en dicts planos, ordenados por producto y sucursal."""
    filas = [
        {
            "idProducto": r.idProducto,
            "producto_nombre": r.producto_nombre,
            "codigoSucursal": r.codigoSucursal,
            "sucursal_nombre": r.sucursal_nombre,
            "cantidad_vendida": int(r.cantidad_vendida),
            "monto": Decimal(str(r.monto)),
        }
        for r in raw_rows
    ]
    return sorted(filas, key=lambda f: (f["producto_nombre"], f["sucursal_nombre"]))


def _shape_inventory_rows(raw_rows) -> list[dict]:
    """Convierte filas crudas del query de inventario en dicts planos,
    ordenados por producto y sucursal."""
    filas = [
        {
            "idProducto": r.idProducto,
            "producto_nombre": r.producto_nombre,
            "codigoSucursal": r.codigoSucursal,
            "sucursal_nombre": r.sucursal_nombre,
            "cantidad_actual": int(r.cantidad_actual),
            "cantidad_reservada": int(r.cantidad_reservada),
        }
        for r in raw_rows
    ]
    return sorted(filas, key=lambda f: (f["producto_nombre"], f["sucursal_nombre"]))


def _sales_totals(filas: list[dict]) -> tuple[Decimal, int]:
    total_monto = sum((f["monto"] for f in filas), Decimal("0"))
    total_items = sum(f["cantidad_vendida"] for f in filas)
    return total_monto, total_items


def _describe_filtros(filtros: dict) -> str:
    """Texto legible de los filtros aplicados, usado como subtitulo del PDF."""
    partes = []
    if filtros.get("fecha_desde"):
        partes.append(f"Del {filtros['fecha_desde']}")
    if filtros.get("fecha_hasta"):
        partes.append(f"al {filtros['fecha_hasta']}")
    if filtros.get("codigoSucursal") is not None:
        partes.append(f"Sucursal {filtros['codigoSucursal']}")
    if filtros.get("idProducto") is not None:
        partes.append(f"Producto {filtros['idProducto']}")
    return ", ".join(partes) if partes else "Sin filtros"


def _sales_rows_to_csv(filas: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Producto", "Sucursal", "Cantidad Vendida", "Monto"])
    for fila in filas:
        writer.writerow(
            [
                fila["producto_nombre"],
                fila["sucursal_nombre"],
                fila["cantidad_vendida"],
                f"{fila['monto']:.2f}",
            ]
        )
    total_monto, total_items = _sales_totals(filas)
    writer.writerow(["TOTAL", "", total_items, f"{total_monto:.2f}"])
    return buffer.getvalue()


def _inventory_rows_to_csv(filas: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Producto", "Sucursal", "Cantidad Actual", "Cantidad Reservada"])
    for fila in filas:
        writer.writerow(
            [
                fila["producto_nombre"],
                fila["sucursal_nombre"],
                fila["cantidad_actual"],
                fila["cantidad_reservada"],
            ]
        )
    return buffer.getvalue()


def _build_pdf_bytes(titulo: str, subtitulo: str, headers: list[str], filas: list[list[str]]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    estilos = getSampleStyleSheet()
    elementos = [
        Paragraph(titulo, estilos["Title"]),
        Paragraph(subtitulo, estilos["Normal"]),
        Spacer(1, 12),
    ]
    tabla = Table([headers] + filas)
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    elementos.append(tabla)
    doc.build(elementos)
    return buffer.getvalue()


def _sales_rows_to_pdf_bytes(filas: list[dict], filtros: dict) -> bytes:
    total_monto, total_items = _sales_totals(filas)
    tabla_filas = [
        [f["producto_nombre"], f["sucursal_nombre"], str(f["cantidad_vendida"]), f"{f['monto']:.2f}"]
        for f in filas
    ]
    tabla_filas.append(["TOTAL", "", str(total_items), f"{total_monto:.2f}"])
    return _build_pdf_bytes(
        "Reporte de Ventas",
        _describe_filtros(filtros),
        ["Producto", "Sucursal", "Cantidad Vendida", "Monto"],
        tabla_filas,
    )


def _inventory_rows_to_pdf_bytes(filas: list[dict], filtros: dict) -> bytes:
    tabla_filas = [
        [f["producto_nombre"], f["sucursal_nombre"], str(f["cantidad_actual"]), str(f["cantidad_reservada"])]
        for f in filas
    ]
    return _build_pdf_bytes(
        "Reporte de Inventario",
        _describe_filtros(filtros),
        ["Producto", "Sucursal", "Cantidad Actual", "Cantidad Reservada"],
        tabla_filas,
    )


# --- Queries (tocan la DB, sin test de integracion por falta de DB viva) -

async def _consultar_ventas(
    session: AsyncSession,
    fecha_desde: date | None,
    fecha_hasta: date | None,
    codigoSucursal: int | None,
    idProducto: int | None,
) -> list[dict]:
    # Join Venta -> DetalleVenta -> Producto -> Inventario (en vez del mas
    # preciso Movimiento.motivo == f"Venta {idVenta}"): ese motivo es
    # IDENTICO para todos los items de una misma venta multi-item (fan-out/
    # doble conteo al unirlo con DetalleVenta) y ademas las ventas
    # confirmadas desde una Reserva usan tipo="venta_reserva" con un motivo
    # distinto ("Confirmacion reserva {codigoReserva}", sin idVenta), asi
    # que un join por motivo omitiria ese canal de ventas por completo.
    stmt = (
        select(
            Producto.idProducto,
            Producto.nombre.label("producto_nombre"),
            Inventario.codigoSucursal,
            Sucursal.nombre.label("sucursal_nombre"),
            func.sum(DetalleVenta.cantidad).label("cantidad_vendida"),
            func.sum(DetalleVenta.cantidad * DetalleVenta.precio_unitario).label("monto"),
        )
        .select_from(Venta)
        .join(DetalleVenta, DetalleVenta.idVenta == Venta.idVenta)
        .join(Producto, Producto.idProducto == DetalleVenta.idProducto)
        .join(Inventario, Inventario.idProducto == Producto.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .group_by(Producto.idProducto, Producto.nombre, Inventario.codigoSucursal, Sucursal.nombre)
    )
    if fecha_desde is not None:
        stmt = stmt.where(Venta.fecha >= datetime.combine(fecha_desde, time.min))
    if fecha_hasta is not None:
        stmt = stmt.where(Venta.fecha <= datetime.combine(fecha_hasta, time.max))
    if codigoSucursal is not None:
        stmt = stmt.where(Inventario.codigoSucursal == codigoSucursal)
    if idProducto is not None:
        stmt = stmt.where(Producto.idProducto == idProducto)

    raw_rows = (await session.execute(stmt)).all()
    return _shape_sales_rows(raw_rows)


async def _consultar_inventario(
    session: AsyncSession,
    codigoSucursal: int | None,
    idProducto: int | None,
) -> list[dict]:
    stmt = (
        select(
            Producto.idProducto,
            Producto.nombre.label("producto_nombre"),
            Inventario.codigoSucursal,
            Sucursal.nombre.label("sucursal_nombre"),
            Inventario.cantidad_actual,
            Inventario.cantidad_reservada,
        )
        .select_from(Inventario)
        .join(Producto, Producto.idProducto == Inventario.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
    )
    if codigoSucursal is not None:
        stmt = stmt.where(Inventario.codigoSucursal == codigoSucursal)
    if idProducto is not None:
        stmt = stmt.where(Producto.idProducto == idProducto)

    raw_rows = (await session.execute(stmt)).all()
    return _shape_inventory_rows(raw_rows)


def _filtros_sales_dict(
    fecha_desde: date | None, fecha_hasta: date | None, codigoSucursal: int | None, idProducto: int | None
) -> dict:
    return {
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "codigoSucursal": codigoSucursal,
        "idProducto": idProducto,
    }


def _filtros_inventory_dict(codigoSucursal: int | None, idProducto: int | None) -> dict:
    return {"fecha_desde": None, "fecha_hasta": None, "codigoSucursal": codigoSucursal, "idProducto": idProducto}


# --- Endpoints -----------------------------------------------------------

@router.get("/sales", response_model=VentaReporteOut)
async def sales_report(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_ventas(session, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
    total_monto, total_items = _sales_totals(filas)
    return VentaReporteOut(
        filas=[VentaReporteFila(**f) for f in filas],
        total_monto=total_monto,
        total_items=total_items,
        filtros=ReportFiltrosOut(**_filtros_sales_dict(fecha_desde, fecha_hasta, codigoSucursal, idProducto)),
    )


@router.get("/sales/csv")
async def sales_report_csv(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_ventas(session, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
    csv_text = _sales_rows_to_csv(filas)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="reporte_ventas.csv"'},
    )


@router.get("/sales/pdf")
async def sales_report_pdf(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_ventas(session, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
    filtros = _filtros_sales_dict(fecha_desde, fecha_hasta, codigoSucursal, idProducto)
    pdf_bytes = _sales_rows_to_pdf_bytes(filas, filtros)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reporte_ventas.pdf"'},
    )


@router.get("/inventory", response_model=InventarioReporteOut)
async def inventory_report(
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_inventario(session, codigoSucursal, idProducto)
    return InventarioReporteOut(
        filas=[InventarioReporteFila(**f) for f in filas],
        filtros=ReportFiltrosOut(**_filtros_inventory_dict(codigoSucursal, idProducto)),
    )


@router.get("/inventory/csv")
async def inventory_report_csv(
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_inventario(session, codigoSucursal, idProducto)
    csv_text = _inventory_rows_to_csv(filas)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="reporte_inventario.csv"'},
    )


@router.get("/inventory/pdf")
async def inventory_report_pdf(
    codigoSucursal: int | None = None,
    idProducto: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
):
    filas = await _consultar_inventario(session, codigoSucursal, idProducto)
    filtros = _filtros_inventory_dict(codigoSucursal, idProducto)
    pdf_bytes = _inventory_rows_to_pdf_bytes(filas, filtros)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reporte_inventario.pdf"'},
    )
