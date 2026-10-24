import csv
import io
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Inventario, Producto, Sucursal
from app.schemas.reports import (
    AnalisisSucursalesOut,
    ConsolidadoSucursalesOut,
    HallazgoSucursalOut,
    InventarioReporteFila,
    InventarioReporteOut,
    ReportFiltrosOut,
    SucursalMetricaOut,
    TransferenciaSugeridaOut,
    VentaReporteFila,
    VentaReporteOut,
)
from app.security import require_permiso
from app.services import reportes_ia
from app.services.tenancy import require_feature, tenant_actual

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

SIN_SUCURSAL = "Sin sucursal registrada"


# Cada talla es un producto distinto con el mismo nombre ("Jeans Blanco"):
# sin la talla, el reporte parecia tener filas repetidas.
_NOMBRE_CON_TALLA = func.concat_ws(" talla ", Producto.nombre, Producto.talla)


async def _consultar_ventas(
    session: AsyncSession,
    id_tenant: int,
    fecha_desde: date | None,
    fecha_hasta: date | None,
    codigoSucursal: int | None,
    idProducto: int | None,
) -> list[dict]:
    # Cada linea de venta se atribuye a la sucursal que REALMENTE la surtio
    # (ver reportes_ia.lineas_venta_con_sucursal). Antes se unia por
    # Inventario.idProducto y cada venta se contaba una vez por cada sucursal
    # que tuviera ese producto en stock: los totales salian inflados.
    lineas = reportes_ia.lineas_venta_con_sucursal()
    stmt = (
        select(
            Producto.idProducto,
            _NOMBRE_CON_TALLA.label("producto_nombre"),
            func.coalesce(lineas.c.codigoSucursal, 0).label("codigoSucursal"),
            func.coalesce(Sucursal.nombre, SIN_SUCURSAL).label("sucursal_nombre"),
            func.sum(lineas.c.cantidad).label("cantidad_vendida"),
            func.sum(lineas.c.monto).label("monto"),
        )
        .select_from(lineas)
        .join(Producto, Producto.idProducto == lineas.c.idProducto)
        .outerjoin(Sucursal, Sucursal.codigoSucursal == lineas.c.codigoSucursal)
        .where(Producto.idTenant == id_tenant)
        .group_by(Producto.idProducto, Producto.nombre, Producto.talla, lineas.c.codigoSucursal, Sucursal.nombre)
    )
    stmt = reportes_ia.filtrar_lineas_por_fecha(stmt, lineas, fecha_desde, fecha_hasta)
    if codigoSucursal is not None:
        stmt = stmt.where(lineas.c.codigoSucursal == codigoSucursal)
    if idProducto is not None:
        stmt = stmt.where(Producto.idProducto == idProducto)

    raw_rows = (await session.execute(stmt)).all()
    return _shape_sales_rows(raw_rows)


async def _consultar_inventario(
    session: AsyncSession,
    id_tenant: int,
    codigoSucursal: int | None,
    idProducto: int | None,
) -> list[dict]:
    stmt = (
        select(
            Producto.idProducto,
            _NOMBRE_CON_TALLA.label("producto_nombre"),
            Inventario.codigoSucursal,
            Sucursal.nombre.label("sucursal_nombre"),
            Inventario.cantidad_actual,
            Inventario.cantidad_reservada,
        )
        .select_from(Inventario)
        .join(Producto, Producto.idProducto == Inventario.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
        .where(Sucursal.idTenant == id_tenant)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_ventas(session, id_tenant, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_ventas(session, id_tenant, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_ventas(session, id_tenant, fecha_desde, fecha_hasta, codigoSucursal, idProducto)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_inventario(session, id_tenant, codigoSucursal, idProducto)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_inventario(session, id_tenant, codigoSucursal, idProducto)
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
    id_tenant: int = Depends(tenant_actual),
):
    filas = await _consultar_inventario(session, id_tenant, codigoSucursal, idProducto)
    filtros = _filtros_inventory_dict(codigoSucursal, idProducto)
    pdf_bytes = _inventory_rows_to_pdf_bytes(filas, filtros)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reporte_inventario.pdf"'},
    )


# --- CU29: consolidado multi-sucursal y analisis con IA -------------------

def _a_metrica_out(m: dict) -> SucursalMetricaOut:
    return SucursalMetricaOut(**m)


@router.get("/branches", response_model=ConsolidadoSucursalesOut)
async def branches_report(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    """Consolidado por sucursal del tenant (sin IA, disponible en todo plan).

    Es tambien la base que se le entrega al modelo en `/ai-insights`: el
    analisis nunca ve datos distintos de los que ve el usuario.
    """
    metricas = await reportes_ia.metricas_por_sucursal(session, id_tenant, fecha_desde, fecha_hasta)
    return ConsolidadoSucursalesOut(
        sucursales=[_a_metrica_out(m) for m in metricas],
        total_unidades=sum(m["unidades_vendidas"] for m in metricas),
        total_monto=sum((m["monto_vendido"] for m in metricas), Decimal("0")),
        filtros=ReportFiltrosOut(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta),
    )


@router.get("/ai-insights", response_model=AnalisisSucursalesOut)
async def branches_ai_insights(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("reporte.ver")),
    __=Depends(require_feature("permiteIA")),
    id_tenant: int = Depends(tenant_actual),
):
    """Lectura asistida por IA del consolidado multi-sucursal.

    Doble puerta: el PERMISO (`reporte.ver`) dice que el rol puede ver
    reportes, y el PLAN (`permiteIA`) dice que la suscripcion incluye el
    analisis automatico — un Administrador en plan Basico recibe 402.
    """
    metricas = await reportes_ia.metricas_por_sucursal(session, id_tenant, fecha_desde, fecha_hasta)
    if not metricas:
        raise HTTPException(status_code=400, detail="La organizacion no tiene sucursales cargadas")

    detalle = await reportes_ia.detalle_producto_sucursal(session, id_tenant)
    periodo = _describe_filtros({"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta})

    # Con Gemini si se puede; si no (sin clave, clave rechazada, caida o
    # demora de Google) el analisis por reglas sobre las mismas metricas. Antes
    # cualquiera de esos casos dejaba al usuario sin analisis (503).
    analisis, generado_por, aviso = await reportes_ia.analizar_con_respaldo(metricas, detalle, periodo)

    return AnalisisSucursalesOut(
        resumen=analisis.resumen,
        hallazgos=[HallazgoSucursalOut(**h.model_dump()) for h in analisis.hallazgos],
        transferencias=[TransferenciaSugeridaOut(**t.model_dump()) for t in analisis.transferencias],
        alertas=analisis.alertas,
        sucursales=[_a_metrica_out(m) for m in metricas],
        generado_por=generado_por,
        con_ia=aviso is None,
        aviso=aviso,
        filtros=ReportFiltrosOut(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta),
    )
