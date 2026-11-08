# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU7] Emitir nota de devolucion
# Controles del diagrama:
#   GenerarNotaDevolucion  -> armar_nota(): junta LO QUE SE DEVOLVIO (prendas, cantidad,
#                             motivo, estado en que llego), cuanto valian, que se descontó
#                             y cuanto dinero se le devolvio al cliente, por que medio y en
#                             que estado esta ese reembolso.
#   ExportarNotaDevolucion -> pdf(): el papel / PDF que se le entrega al cliente.
#   NotificarNotaDevolucion -> devoluciones.avisar_resultado(): el aviso y el correo.
# Pantallas: web/src/app/shared/components/nota-devolucion.component.ts (personal y cliente)
# Endpoints: GET /api/returns/{id}/nota-devolucion  y  /nota-devolucion.pdf
# En palabras simples: la nota de devolucion es el comprobante del DINERO que se le
#   devolvio al cliente por una devolucion (CU6) o por el saldo a favor de un cambio
#   (CU4, CU5, CU8). Ya no existen las notas de credito: siempre es dinero.
# ==================================================================
"""Nota de devolucion (CU7)."""

import io
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException

from app.services import devoluciones as dv
from app.services.horario import HORA_BOLIVIA

ESTADOS_REEMBOLSO = {
    "Completado": "Entregado al cliente",
    "Pendiente": "Pendiente de entrega en la sucursal",
    "EnProceso": "En proceso en la tarjeta",
    "TransferenciaPendiente": "Pendiente de transferencia",
}
CONDICIONES = {"apta": "En buen estado", "defectuosa": "Con defecto de fabrica", "deteriorada": "Con deterioro", "no_corresponde": "No corresponde"}
TIPOS = {
    "devolucion": "Devolucion con reembolso",
    "cambio_talla": "Cambio de talla",
    "cambio_color": "Cambio de color",
    "cambio_producto": "Cambio por otro producto",
    "cambio_medida": "Ajuste de medida",
}


def _d(valor) -> Decimal:
    return dv.dinero(Decimal(str(valor or 0)))


# ==== [CU7] GenerarNotaDevolucion.puedeEmitirse() ==================
# Alternativo 1: si no se devolvio dinero, corresponde el comprobante de cambio.
# ===================================================================
def puede_emitirse(estado: str, tipo: str, monto_devuelto) -> str | None:
    if estado in ("PendienteEntrega", "EnInspeccion", "EnRevision", "Aprobada"):
        return "La nota de devolucion se emite cuando se resuelve el caso"
    if estado in ("Rechazada", "Anulada", "Cancelada"):
        return f"El caso esta {estado}: no se devolvio dinero"
    if _d(monto_devuelto) <= 0:
        return "En este caso no se devolvio dinero: corresponde el comprobante de cambio"
    return None


# ==== [CU7] GenerarNotaDevolucion.armarNota() ======================
def armar_nota(d, empresa: str, viajes: list | None = None) -> dict:
    """`d` es el DevolucionOut del caso. Devuelve la nota lista para mostrar o imprimir."""
    error = puede_emitirse(d.estado, d.tipo, d.montoDevuelto)
    if error:
        raise HTTPException(status_code=409, detail=error)
    precio = _d(d.precio_unitario)
    valor = _d(d.valor) or precio * d.cantidad
    descuentos = [
        (concepto, _d(monto))
        for concepto, monto in (
            ("Recargo por demora", d.recargo),
            ("Descuento por deterioro", d.descuentoDeterioro),
            ("Delivery a domicilio", d.costoDomicilio),
        )
        if _d(monto) > 0
    ]
    a_favor = _d(d.credito)
    devuelto = _d(d.montoDevuelto)
    entregado = None
    if d.tipo != "devolucion" and d.producto_nuevo_nombre:
        entregado = {
            "producto": d.producto_nuevo_nombre, "talla": d.tallaNueva, "color": d.producto_nuevo_color,
            "valor": float(dv.dinero(a_favor + _d(d.diferencia))), "diferencia": float(_d(d.diferencia)),
        }
    # Solo si la trajo el repartidor (si el cliente la llevo a la sucursal no hay repartidor).
    recojo = next((v for v in (viajes or []) if v.tipo == "recojo" and v.estado == "Completado" and v.repartidor), None)
    emitida = d.fechaResolucion or datetime.now(timezone.utc)
    return {
        "numero": d.codigo,
        "empresa": empresa,
        "fechaEmision": emitida,
        "tipo": TIPOS.get(d.tipo, d.tipo),
        "cliente": d.cliente_nombre,
        "sucursal": d.sucursal_nombre,
        # En una solicitud en linea quien la registra es el cliente: atendio quien reviso la prenda.
        "atendidoPor": d.inspector_nombre or d.usuario_nombre,
        "venta": {"idVenta": d.idVenta, "fecha": d.fechaVenta},
        # Lo que el cliente DEVOLVIO.
        "prendasDevueltas": [{
            "producto": d.producto_nombre, "talla": d.tallaOriginal, "color": d.producto_color, "cantidad": d.cantidad,
            "precioUnitario": float(precio), "subtotal": float(valor),
            "motivo": dv.MOTIVOS.get(d.motivoCategoria or "", d.motivoCategoria or "-") + (f" - {d.motivo}" if d.motivo else ""),
            "estadoAlRecibirla": CONDICIONES.get(d.condicion or "", d.condicion or "-"),
        }],
        "recogidaADomicilio": (
            {"fecha": recojo.fechaCompletado, "repartidor": recojo.repartidor, "direccion": recojo.direccion} if recojo else None
        ),
        "valorPrendas": float(valor),
        "descuentos": [{"concepto": c, "monto": float(m)} for c, m in descuentos],
        "valorAFavor": float(a_favor),
        "prendaEntregada": entregado,
        # Lo que se le DEVOLVIO en dinero.
        "montoDevuelto": float(devuelto),
        "medio": dv.MEDIOS_TEXTO.get(d.metodoReembolso or "efectivo", d.metodoReembolso or "-"),
        "estadoReembolso": ESTADOS_REEMBOLSO.get(d.estadoReembolso or "", d.estadoReembolso or "-"),
        "referencia": d.referenciaReembolso,
    }


# ==== [CU7] ExportarNotaDevolucion.pdf() ===========================
def pdf(nota: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    estilos = getSampleStyleSheet()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A5, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f"Nota de devolucion {nota['numero']}")
    bs = lambda v: f"Bs {v:,.2f}"  # noqa: E731
    fecha = nota["fechaEmision"].astimezone(HORA_BOLIVIA)
    partes = [
        Paragraph(f"<b>{nota['empresa']}</b>", estilos["Title"]),
        Paragraph(f"<b>Nota de devolucion N {nota['numero']}</b>", estilos["Heading3"]),
        Paragraph(
            f"Fecha: {fecha:%d/%m/%Y %H:%M} &nbsp; Cliente: {nota['cliente'] or '-'}<br/>"
            f"Sucursal: {nota['sucursal'] or '-'} &nbsp; Atendido por: {nota['atendidoPor'] or '-'}<br/>"
            f"Venta original: #{nota['venta']['idVenta']} del {nota['venta']['fecha'].astimezone(HORA_BOLIVIA):%d/%m/%Y} &nbsp; {nota['tipo']}",
            estilos["Normal"],
        ),
        Spacer(1, 4 * mm),
        Paragraph("<b>Prendas devueltas</b>", estilos["Normal"]),
    ]
    filas = [["Prenda", "Cant.", "Motivo / estado", "Subtotal"]]
    for p in nota["prendasDevueltas"]:
        filas.append([
            Paragraph(f"{p['producto']} talla {p['talla'] or '-'} {p['color'] or ''}", estilos["BodyText"]),
            p["cantidad"], Paragraph(f"{p['motivo']}<br/>{p['estadoAlRecibirla']}", estilos["BodyText"]), bs(p["subtotal"]),
        ])
    filas.append(["Valor de las prendas", "", "", bs(nota["valorPrendas"])])
    for x in nota["descuentos"]:
        filas.append([f"- {x['concepto']}", "", "", bs(x["monto"])])
    filas.append(["Valor a favor del cliente", "", "", bs(nota["valorAFavor"])])
    if nota["prendaEntregada"]:
        e = nota["prendaEntregada"]
        filas.append([f"- Se llevo: {e['producto']} talla {e['talla'] or '-'}", "", "", bs(e["valor"])])
    tabla = Table(filas, colWidths=[52 * mm, 12 * mm, 38 * mm, 22 * mm])
    tabla.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
        ("ALIGN", (1, 0), (1, -1), "CENTER"), ("ALIGN", (3, 0), (3, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.grey), ("LINEABOVE", (0, len(nota["prendasDevueltas"]) + 1), (-1, len(nota["prendasDevueltas"]) + 1), 0.5, colors.grey),
    ]))
    partes += [tabla, Spacer(1, 4 * mm)]
    partes.append(Paragraph(
        f"<b>Dinero devuelto: {bs(nota['montoDevuelto'])}</b> {nota['medio']}<br/>Estado: {nota['estadoReembolso']}"
        + (f"<br/>Referencia: {nota['referencia']}" if nota["referencia"] else ""),
        estilos["Normal"],
    ))
    if nota["recogidaADomicilio"]:
        r = nota["recogidaADomicilio"]
        cuando = r["fecha"].astimezone(HORA_BOLIVIA).strftime("%d/%m/%Y") if r["fecha"] else "-"
        partes.append(Paragraph(f"Prenda recogida a domicilio el {cuando} por {r['repartidor'] or '-'}.", estilos["BodyText"]))
    partes += [Spacer(1, 6 * mm), Paragraph("Conserve esta nota: respalda el dinero que se le devolvio.", estilos["Italic"])]
    doc.build(partes)
    return buffer.getvalue()
