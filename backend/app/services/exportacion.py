# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU28] Exportar reporte a PDF o Excel
# Control del diagrama: ControlExportacion
#   armarDocumento() -> paso 2: encabezado (empresa con su logo, titulo, filtros, fecha
#                       y usuario), tabla con totales y subtotales, grafico y resumen
#   pdf() / excel()  -> paso 2 y 3 (Excel agrega la hoja "Datos" sin formato)
# Sirve igual para el reporte convencional de ventas o inventario y para el generativo (CU26).
# ==================================================================
"""Documento formal de un reporte en PDF (reportlab) o Excel (openpyxl)."""

import io
from dataclasses import dataclass, field
from datetime import datetime

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Circle, Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Paleta de graficos (skill de visualizacion): una serie = un solo tono;
# categorias en orden fijo, nunca ciclado.
SERIE = "#2a78d6"
CATEGORIAS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
TINTA = "#1f2937"
TINTA_SUAVE = "#52514e"
LINEA = "#d1d5db"
MAX_BARRAS = 15


@dataclass
class Columna:
    clave: str
    etiqueta: str
    tipo: str  # texto | entero | moneda


@dataclass
class Documento:
    empresa: str
    titulo: str
    usuario: str
    generado: datetime
    filtros: list[tuple[str, str]]
    columnas: list[Columna]
    filas: list[dict]
    totales: dict
    visualizacion: str = "barras"  # tabla | barras | lineas | torta
    resumen: str | None = None
    avisos: list[str] = field(default_factory=list)

    @property
    def dimensiones(self) -> list[Columna]:
        return [c for c in self.columnas if c.tipo == "texto"]

    @property
    def metricas(self) -> list[Columna]:
        return [c for c in self.columnas if c.tipo != "texto"]


def iniciales(empresa: str) -> str:
    palabras = [p for p in empresa.split() if p[:1].isalnum()]
    return "".join(p[0] for p in palabras[:2]).upper() or "YS"


def subtotales(doc: Documento) -> dict[str, dict]:
    """Con dos agrupaciones, subtotal por la primera (paso 2)."""
    if len(doc.dimensiones) < 2:
        return {}
    clave = doc.dimensiones[0].clave
    salida: dict[str, dict] = {}
    for fila in doc.filas:
        grupo = salida.setdefault(str(fila.get(clave)), {m.clave: 0.0 for m in doc.metricas})
        for m in doc.metricas:
            if m.clave != "ticket_promedio":
                grupo[m.clave] += float(fila.get(m.clave) or 0)
    return salida


def _texto(valor, tipo: str) -> str:
    if valor is None:
        return "-"
    if tipo == "moneda":
        return f"Bs {float(valor):,.2f}"
    if tipo == "entero":
        return f"{float(valor):,.0f}"
    return str(valor)


def _grafico_datos(doc: Documento) -> tuple[list[str], list[float], str] | None:
    """Una sola agrupacion y una metrica: lo que se puede graficar sin mentir."""
    if doc.visualizacion == "tabla" or len(doc.dimensiones) != 1 or not doc.metricas or not doc.filas:
        return None
    dim, met = doc.dimensiones[0], doc.metricas[0]
    filas = doc.filas if doc.visualizacion == "lineas" else doc.filas[:MAX_BARRAS]
    return [str(f.get(dim.clave)) for f in filas], [float(f.get(met.clave) or 0) for f in filas], met.etiqueta


# --- PDF ------------------------------------------------------------------------

def _logo(empresa: str) -> Drawing:
    dibujo = Drawing(1.4 * cm, 1.4 * cm)
    dibujo.add(Circle(0.7 * cm, 0.7 * cm, 0.68 * cm, fillColor=colors.HexColor(SERIE), strokeColor=None))
    dibujo.add(String(0.7 * cm, 0.52 * cm, iniciales(empresa), fontName="Helvetica-Bold", fontSize=13,
                      fillColor=colors.white, textAnchor="middle"))
    return dibujo


def _grafico_pdf(doc: Documento, ancho: float) -> Drawing | None:
    datos = _grafico_datos(doc)
    if datos is None:
        return None
    etiquetas, valores, nombre = datos
    if doc.visualizacion == "torta":
        dibujo = Drawing(ancho, 6 * cm)
        pie = Pie()
        pie.x, pie.y, pie.width, pie.height = 1 * cm, 0.5 * cm, 5 * cm, 5 * cm
        pie.data, pie.labels = valores[:8], [e[:18] for e in etiquetas[:8]]
        pie.slices.strokeColor, pie.slices.strokeWidth = colors.white, 2
        for i in range(len(pie.data)):
            pie.slices[i].fillColor = colors.HexColor(CATEGORIAS[i])
        dibujo.add(pie)
        return dibujo
    if doc.visualizacion == "lineas":
        dibujo = Drawing(ancho, 6 * cm)
        linea = HorizontalLineChart()
        linea.x, linea.y, linea.width, linea.height = 1.5 * cm, 1 * cm, ancho - 2.5 * cm, 4.5 * cm
        linea.data = [valores]
        linea.categoryAxis.categoryNames = [e if i % max(len(etiquetas) // 8, 1) == 0 else "" for i, e in enumerate(etiquetas)]
        linea.categoryAxis.labels.fontSize = linea.valueAxis.labels.fontSize = 7
        linea.valueAxis.valueMin = 0
        linea.lines[0].strokeColor, linea.lines[0].strokeWidth = colors.HexColor(SERIE), 2
        linea.valueAxis.gridStrokeColor, linea.valueAxis.visibleGrid = colors.HexColor(LINEA), True
        dibujo.add(linea)
        return dibujo
    alto = max(len(valores), 3) * 0.55 * cm + 1 * cm
    dibujo = Drawing(ancho, alto)
    barras = HorizontalBarChart()
    barras.x, barras.y, barras.width, barras.height = 4.5 * cm, 0.6 * cm, ancho - 5.5 * cm, alto - 1 * cm
    barras.data = [list(reversed(valores))]
    barras.categoryAxis.categoryNames = [e[:28] for e in reversed(etiquetas)]
    barras.categoryAxis.labels.fontSize = barras.valueAxis.labels.fontSize = 7
    barras.valueAxis.valueMin = 0
    barras.bars[0].fillColor, barras.bars[0].strokeColor = colors.HexColor(SERIE), None
    barras.valueAxis.gridStrokeColor, barras.valueAxis.visibleGrid = colors.HexColor(LINEA), True
    dibujo.add(barras)
    return dibujo


def pdf(doc: Documento) -> bytes:
    salida = io.BytesIO()
    pagina = landscape(letter) if len(doc.columnas) > 4 else letter
    plantilla = SimpleDocTemplate(salida, pagesize=pagina, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.3 * cm, bottomMargin=1.3 * cm,
                                  title=doc.titulo, author=doc.empresa)
    estilos = getSampleStyleSheet()
    ancho = pagina[0] - 3 * cm
    elementos = []

    encabezado = Table(
        [[_logo(doc.empresa), Paragraph(f"<b>{doc.empresa}</b><br/><font size=13>{doc.titulo}</font>", estilos["Normal"]),
          Paragraph(f"<font size=8 color='{TINTA_SUAVE}'>Generado el {doc.generado:%d/%m/%Y %H:%M}<br/>por {doc.usuario}</font>", estilos["Normal"])]],
        colWidths=[1.8 * cm, ancho - 6.8 * cm, 5 * cm],
    )
    encabezado.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor(LINEA))]))
    elementos += [encabezado, Spacer(1, 0.3 * cm)]

    if doc.filtros:
        filtros = Table([[Paragraph(f"<b>{k}</b>", estilos["Normal"]), Paragraph(v, estilos["Normal"])] for k, v in doc.filtros], colWidths=[3.5 * cm, ancho - 3.5 * cm])
        filtros.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
        elementos += [filtros, Spacer(1, 0.3 * cm)]

    grafico = _grafico_pdf(doc, ancho)
    if grafico is not None:
        elementos += [grafico, Spacer(1, 0.3 * cm)]

    cabecera = [c.etiqueta for c in doc.columnas]
    datos = [cabecera]
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TINTA)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor(LINEA)),
        ("ALIGN", (len(doc.dimensiones), 0), (-1, -1), "RIGHT"),
    ]
    grupos = subtotales(doc)
    grupo_actual = None
    clave_grupo = doc.dimensiones[0].clave if grupos else None

    def fila_subtotal(grupo: str):
        valores = grupos[grupo]
        datos.append([f"Subtotal {grupo}"] + [""] * (len(doc.dimensiones) - 1) + [_texto(valores.get(m.clave), m.tipo) if m.clave != "ticket_promedio" else "" for m in doc.metricas])
        estilo.append(("FONTNAME", (0, len(datos) - 1), (-1, len(datos) - 1), "Helvetica-Bold"))
        estilo.append(("BACKGROUND", (0, len(datos) - 1), (-1, len(datos) - 1), colors.HexColor("#f3f4f6")))

    for fila in doc.filas:
        if clave_grupo and grupo_actual is not None and str(fila.get(clave_grupo)) != grupo_actual:
            fila_subtotal(grupo_actual)
        grupo_actual = str(fila.get(clave_grupo)) if clave_grupo else None
        datos.append([_texto(fila.get(c.clave), c.tipo) for c in doc.columnas])
    if clave_grupo and grupo_actual is not None:
        fila_subtotal(grupo_actual)
    if doc.totales:
        datos.append(["Total"] + [""] * (len(doc.dimensiones) - 1 if doc.dimensiones else 0) + [_texto(doc.totales.get(m.clave), m.tipo) for m in doc.metricas])
        estilo += [("FONTNAME", (0, len(datos) - 1), (-1, len(datos) - 1), "Helvetica-Bold"),
                   ("LINEABOVE", (0, len(datos) - 1), (-1, len(datos) - 1), 0.8, colors.HexColor(TINTA))]
    tabla = Table(datos, repeatRows=1, colWidths=[ancho / len(doc.columnas)] * len(doc.columnas))
    tabla.setStyle(TableStyle(estilo))
    elementos.append(tabla)

    if doc.resumen:
        elementos += [Spacer(1, 0.4 * cm), Paragraph("<b>Resumen</b>", estilos["Normal"]), Paragraph(doc.resumen, estilos["Normal"])]
    for aviso in doc.avisos:
        elementos.append(Paragraph(f"<font size=8 color='{TINTA_SUAVE}'>Nota: {aviso}</font>", estilos["Normal"]))

    def pie_de_pagina(lienzo, plantilla_doc):
        lienzo.saveState()
        lienzo.setFont("Helvetica", 7)
        lienzo.setFillColor(colors.HexColor(TINTA_SUAVE))
        lienzo.drawString(1.5 * cm, 0.7 * cm, f"{doc.empresa} - {doc.titulo}")
        lienzo.drawRightString(pagina[0] - 1.5 * cm, 0.7 * cm, f"Pagina {plantilla_doc.page}")
        lienzo.restoreState()

    plantilla.build(elementos, onFirstPage=pie_de_pagina, onLaterPages=pie_de_pagina)
    return salida.getvalue()


# --- Excel ----------------------------------------------------------------------

def excel(doc: Documento) -> bytes:
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Reporte"
    negrita, linea = Font(bold=True), Border(bottom=Side(style="thin", color="D1D5DB"))
    hoja["A1"] = f"[{iniciales(doc.empresa)}]  {doc.empresa}"
    hoja["A1"].font = Font(bold=True, size=14, color="1F2937")
    hoja["A2"] = doc.titulo
    hoja["A2"].font = Font(bold=True, size=12)
    hoja["A3"] = f"Generado el {doc.generado:%d/%m/%Y %H:%M} por {doc.usuario}"
    fila = 4
    for k, v in doc.filtros:
        hoja.cell(row=fila, column=1, value=k).font = negrita
        hoja.cell(row=fila, column=2, value=v)
        fila += 1
    fila += 1
    inicio = fila
    for col, c in enumerate(doc.columnas, start=1):
        celda = hoja.cell(row=fila, column=col, value=c.etiqueta)
        celda.font, celda.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F2937")
        celda.alignment = Alignment(horizontal="center")

    grupos = subtotales(doc)
    clave_grupo = doc.dimensiones[0].clave if grupos else None
    grupo_actual = None

    def escribir_subtotal(grupo: str):
        nonlocal fila
        fila += 1
        hoja.cell(row=fila, column=1, value=f"Subtotal {grupo}").font = negrita
        for col, m in enumerate(doc.metricas, start=len(doc.dimensiones) + 1):
            if m.clave != "ticket_promedio":
                celda = hoja.cell(row=fila, column=col, value=grupos[grupo][m.clave])
                celda.font = negrita
                if m.tipo == "moneda":
                    celda.number_format = '#,##0.00 "Bs"'

    filas_datos = []
    for datos in doc.filas:
        if clave_grupo and grupo_actual is not None and str(datos.get(clave_grupo)) != grupo_actual:
            escribir_subtotal(grupo_actual)
        grupo_actual = str(datos.get(clave_grupo)) if clave_grupo else None
        fila += 1
        filas_datos.append(fila)
        for col, c in enumerate(doc.columnas, start=1):
            celda = hoja.cell(row=fila, column=col, value=datos.get(c.clave))
            celda.border = linea
            if c.tipo == "moneda":
                celda.number_format = '#,##0.00 "Bs"'
    if clave_grupo and grupo_actual is not None:
        escribir_subtotal(grupo_actual)
    if doc.totales:
        fila += 1
        hoja.cell(row=fila, column=1, value="Total").font = negrita
        for col, m in enumerate(doc.metricas, start=len(doc.dimensiones) + 1):
            celda = hoja.cell(row=fila, column=col, value=doc.totales.get(m.clave))
            celda.font = negrita
            if m.tipo == "moneda":
                celda.number_format = '#,##0.00 "Bs"'
    for col, c in enumerate(doc.columnas, start=1):
        largo = max([len(c.etiqueta)] + [len(str(f.get(c.clave) or "")) for f in doc.filas[:300]])
        hoja.column_dimensions[get_column_letter(col)].width = min(max(largo + 2, 12), 40)
    hoja.freeze_panes = hoja.cell(row=inicio + 1, column=1)

    datos_grafico = _grafico_datos(doc)
    if datos_grafico is not None and not grupos and filas_datos:
        n = len(datos_grafico[0])
        categorias = Reference(hoja, min_col=1, min_row=inicio + 1, max_row=inicio + n)
        valores = Reference(hoja, min_col=len(doc.dimensiones) + 1, min_row=inicio, max_row=inicio + n)
        grafico = {"lineas": LineChart, "torta": PieChart}.get(doc.visualizacion, BarChart)()
        grafico.title = doc.titulo
        grafico.add_data(valores, titles_from_data=True)
        grafico.set_categories(categorias)
        if isinstance(grafico, BarChart):
            grafico.type = "bar"
            grafico.series[0].graphicalProperties.solidFill = SERIE[1:]
        elif isinstance(grafico, LineChart):
            grafico.series[0].graphicalProperties.line.solidFill = SERIE[1:]
        grafico.height, grafico.width = 8, 16
        hoja.add_chart(grafico, f"{get_column_letter(len(doc.columnas) + 2)}{inicio}")

    if doc.resumen:
        fila += 2
        hoja.cell(row=fila, column=1, value="Resumen").font = negrita
        hoja.cell(row=fila + 1, column=1, value=doc.resumen).alignment = Alignment(wrap_text=True, vertical="top")
        hoja.merge_cells(start_row=fila + 1, start_column=1, end_row=fila + 3, end_column=max(len(doc.columnas), 4))

    # Paso 3: datos sin formato para analizarlos.
    crudos = libro.create_sheet("Datos")
    crudos.append([c.etiqueta for c in doc.columnas])
    for datos in doc.filas:
        crudos.append([datos.get(c.clave) for c in doc.columnas])

    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()


def nombre_archivo(doc: Documento, formato: str) -> str:
    base = "".join(ch if ch.isalnum() else "-" for ch in doc.titulo.lower()).strip("-")[:60] or "reporte"
    return f"{base}-{doc.generado:%Y%m%d-%H%M}.{formato}"


# --- [CU36] CSV y HTML (los pide el asistente de los administradores) -------------

def csv(doc: Documento) -> bytes:
    """Los datos sin formato, listos para Excel o Sheets (separador ';' y BOM para los acentos)."""
    import csv as _csv

    salida = io.StringIO()
    escritor = _csv.writer(salida, delimiter=";")
    escritor.writerow([c.etiqueta for c in doc.columnas])
    for fila in doc.filas:
        escritor.writerow([fila.get(c.clave, "") for c in doc.columnas])
    if doc.totales:
        escritor.writerow(["Total"] + [doc.totales.get(c.clave, "") for c in doc.columnas[1:]])
    return ("\ufeff" + salida.getvalue()).encode("utf-8")


def html(doc: Documento) -> bytes:
    """Pagina autonoma (se abre en cualquier navegador y se imprime): encabezado,
    filtros, resumen, grafico de barras y la tabla con totales."""
    from html import escape

    def celda(fila: dict, c: Columna, etiqueta: str = "td") -> str:
        alineado = ' class="num"' if c.tipo != "texto" else ""
        return f"<{etiqueta}{alineado}>{escape(_texto(fila.get(c.clave), c.tipo))}</{etiqueta}>"

    grafico = ""
    datos = _grafico_datos(doc)
    if datos:
        etiquetas, valores, metrica = datos
        maximo = max(valores) or 1
        barras = "".join(
            f'<div class="barra"><span class="et">{escape(e)}</span><span class="v" style="width:{max(v / maximo * 100, 0.5):.1f}%"></span>'
            f'<span class="n">{escape(_texto(v, doc.metricas[0].tipo))}</span></div>'
            for e, v in zip(etiquetas[:MAX_BARRAS], valores[:MAX_BARRAS])
        )
        grafico = f'<h2>{escape(metrica)}</h2><div class="grafico">{barras}</div>'
    filtros = "".join(f"<li><b>{escape(k)}:</b> {escape(v)}</li>" for k, v in doc.filtros)
    cuerpo = "".join("<tr>" + "".join(celda(f, c) for c in doc.columnas) + "</tr>" for f in doc.filas)
    pie = ""
    if doc.totales:
        pie = "<tfoot><tr><td>Total</td>" + "".join(
            celda(doc.totales, c) if c.clave in doc.totales else "<td></td>" for c in doc.columnas[1:]
        ) + "</tr></tfoot>"
    pagina = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(doc.titulo)} - {escape(doc.empresa)}</title>
<style>
body{{font-family:system-ui,Segoe UI,Arial,sans-serif;color:{TINTA};margin:32px auto;max-width:960px;padding:0 16px}}
header{{display:flex;justify-content:space-between;border-bottom:2px solid {SERIE};padding-bottom:12px}}
h1{{margin:0;font-size:22px}} h2{{font-size:15px;margin:24px 0 8px}} small,.suave{{color:{TINTA_SUAVE}}}
ul{{padding-left:18px;margin:8px 0}} .resumen{{background:#f3f4f6;border-radius:8px;padding:12px 14px}}
table{{border-collapse:collapse;width:100%;font-size:13px}} th,td{{border-bottom:1px solid {LINEA};padding:6px 8px;text-align:left}}
th{{background:#f3f4f6}} .num{{text-align:right;font-variant-numeric:tabular-nums}} tfoot td{{font-weight:700;border-top:2px solid {TINTA}}}
.barra{{display:grid;grid-template-columns:30% 1fr auto;gap:8px;align-items:center;font-size:12px;margin:3px 0}}
.barra .v{{height:12px;background:{SERIE};border-radius:0 4px 4px 0}} .barra .et{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
@media print{{body{{margin:0}}}}
</style></head><body>
<header><div><small>{escape(doc.empresa)}</small><h1>{escape(doc.titulo)}</h1></div>
<div class="suave" style="text-align:right;font-size:12px">Generado el {doc.generado:%d/%m/%Y %H:%M}<br>por {escape(doc.usuario or '-')}</div></header>
<h2>Filtros aplicados</h2><ul>{filtros or '<li>Sin filtros</li>'}</ul>
{f'<h2>Resumen</h2><p class="resumen">{escape(doc.resumen)}</p>' if doc.resumen else ''}
{grafico}
<h2>Datos</h2><table><thead><tr>{''.join(f'<th{chr(32) + "class=num" if c.tipo != "texto" else ""}>{escape(c.etiqueta)}</th>' for c in doc.columnas)}</tr></thead>
<tbody>{cuerpo}</tbody>{pie}</table>
<p class="suave" style="font-size:11px;margin-top:24px">{len(doc.filas)} fila(s). Reporte generado por el asistente de YouShop.</p>
</body></html>"""
    return pagina.encode("utf-8")
