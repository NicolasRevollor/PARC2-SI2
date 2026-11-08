# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU26] Solicitar reporte generativo en lenguaje natural
# [CU27] Solicitar reporte generativo por voz (la transcripcion entra aqui como texto)
# Control del diagrama: ControlReportesIA
#   interpretar()  -> paso 2-3: la IA traduce el pedido a una solicitud estructurada
#   validar()      -> paso 4: lista blanca, idTenant del token, sucursales del rol
#   ejecutar()     -> paso 5: consulta parametrizada de SOLO LECTURA con tope de tiempo y filas
#   resumir()      -> paso 6: resumen narrativo a partir de los resultados
# Regla de oro (RNF14): la IA nunca escribe SQL ni ve el esquema de la base; solo
#   elige entre las metricas, agrupaciones y filtros del CATALOGO de abajo.
# Si Gemini no esta configurado o falla, interpretar_por_reglas() hace lo mismo
#   sin IA y la pantalla lo dice ("Motor de reglas YouShop").
# ==================================================================
"""Reportes generativos: catalogo, interpretacion, validacion y ejecucion."""

import asyncio
import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import Date, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Devolucion, Inventario, Producto, Sucursal
from app.services import reportes_ia
from app.services.horario import HORA_BOLIVIA, ZONA_BOLIVIA_SQL, fin_del_dia, inicio_del_dia

logger = logging.getLogger("app.errors")

MOTOR_REGLAS = "Motor de reglas YouShop"
FILAS_PANTALLA = 200
FILAS_MAXIMAS = 5000
TIEMPO_MAXIMO_MS = 5000
TIMEOUT_IA_SEGUNDOS = 30

# --- Catalogo permitido (lo unico que conoce la IA) --------------------------

METRICAS = {
    "ventas": {
        "monto": ("Monto vendido", "moneda"),
        "unidades": ("Unidades vendidas", "entero"),
        "ventas": ("Cantidad de ventas", "entero"),
        "ticket_promedio": ("Ticket promedio", "moneda"),
    },
    "devoluciones": {
        "casos": ("Casos de devolucion o cambio", "entero"),
        "unidades_devueltas": ("Prendas devueltas", "entero"),
        "monto_reembolsado": ("Monto devuelto al cliente", "moneda"),
    },
    "inventario": {
        "stock_actual": ("Stock actual", "entero"),
        "stock_disponible": ("Stock disponible", "entero"),
        "stock_reservado": ("Stock reservado", "entero"),
    },
}
DIMENSIONES = {
    "ventas": ("sucursal", "producto", "categoria", "talla", "color", "dia", "semana", "mes"),
    "devoluciones": ("sucursal", "producto", "categoria", "talla", "motivo", "estado", "dia", "semana", "mes"),
    "inventario": ("sucursal", "producto", "categoria", "talla", "color"),
}
ETIQUETA_DIMENSION = {
    "sucursal": "Sucursal", "producto": "Producto", "categoria": "Categoria", "talla": "Talla", "color": "Color",
    "dia": "Dia", "semana": "Semana", "mes": "Mes", "motivo": "Motivo", "estado": "Estado",
}
TEMPORALES = ("dia", "semana", "mes")
VISUALIZACIONES = ("tabla", "barras", "lineas", "torta")
EJEMPLOS = [
    "Mostrame las ventas de septiembre agrupadas por sucursal",
    "Los 10 productos mas vendidos por unidades este mes",
    "Ventas por semana de los ultimos 60 dias",
    "Devoluciones por talla del mes pasado",
    "Stock disponible por sucursal y categoria",
]


class FiltrosReporte(BaseModel):
    fecha_desde: date | None = None
    fecha_hasta: date | None = None
    sucursales: list[str] = Field(default_factory=list)
    categorias: list[str] = Field(default_factory=list)
    productos: list[str] = Field(default_factory=list)
    tallas: list[str] = Field(default_factory=list)
    colores: list[str] = Field(default_factory=list)


class Interpretacion(BaseModel):
    """Paso 3: lo que devuelve la IA (o el motor de reglas)."""

    accion: Literal["reporte", "aclarar", "rechazar"]
    fuente: Literal["ventas", "devoluciones", "inventario"] | None = None
    metricas: list[str] = Field(default_factory=list)
    dimensiones: list[str] = Field(default_factory=list)
    filtros: FiltrosReporte = Field(default_factory=FiltrosReporte)
    ordenarPor: str | None = None
    orden: Literal["desc", "asc"] = "desc"
    limite: int | None = None
    visualizacion: Literal["tabla", "barras", "lineas", "torta"] | None = None
    titulo: str | None = None
    pregunta: str | None = None
    opciones: list[str] = Field(default_factory=list)
    motivo: str | None = None
    periodoPorDefecto: bool = False


@dataclass
class Contexto:
    """Lo que se sabe del usuario: SIEMPRE del token, nunca del pedido (RNF02)."""

    id_tenant: int
    empresa: str
    sucursales: dict[int, str]          # todas las de la empresa
    visibles: set[int] | None           # None = todas (Administrador)
    categorias: list[str]
    tallas: list[str]
    colores: list[str]
    productos: list[str]
    hoy: date


@dataclass
class SolicitudValida:
    """Paso 4: la interpretacion ya validada y con los ids resueltos."""

    fuente: str
    metricas: list[str]
    dimensiones: list[str]
    desde: date | None
    hasta: date | None
    sucursales: set[int] | None
    categorias: list[str]
    productos: list[str]
    tallas: list[str]
    colores: list[str]
    ordenar_por: str
    orden: str
    limite: int
    visualizacion: str
    titulo: str
    filtros_texto: list[tuple[str, str]]
    avisos: list[str] = field(default_factory=list)


class Rechazo(Exception):
    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


# --- Motor de reglas (sin IA) ---------------------------------------------------

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
ESCRITURA = re.compile(r"\b(borr|elimin|actualiz|modific|insert|agreg|crea[rd]?\b|cambi(a|ar|ale) (el|los) precio|drop\b|delete\b|update\b|truncate)")
OTRA_EMPRESA = re.compile(r"\b(otras? empresas?|todas las empresas|la competencia|de otra tienda|de otro tenant)\b")
PALABRAS_REPORTE = re.compile(r"\b(vent|vend|factur|ingres|ticket|devol|cambio|reembols|stock|inventari|existenc|unidad|prenda|producto|sucursal|talla|categor)")


def _ultimo_dia(anio: int, mes: int) -> date:
    return (date(anio + (mes == 12), mes % 12 + 1, 1) - timedelta(days=1))


def periodo_en_texto(t: str, hoy: date) -> tuple[date, date] | None | str:
    """Fechas del texto ya normalizado. Devuelve "ambiguo" si hay que preguntar."""
    if "lo que va de este mes" in t or "lo que va del mes" in t:
        return hoy.replace(day=1), hoy
    m = re.search(r"ultim[oa]s?\s+(\d{1,3})\s+dias", t)
    if m:
        return hoy - timedelta(days=int(m.group(1)) - 1), hoy
    m = re.search(r"del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")(?:\s+(?:de\s+)?(\d{4}))?", t)
    if m:
        mes = MESES.index(m.group(3)) + 1
        anio = int(m.group(4)) if m.group(4) else (hoy.year if mes <= hoy.month else hoy.year - 1)
        return date(anio, mes, int(m.group(1))), date(anio, mes, min(int(m.group(2)), _ultimo_dia(anio, mes).day))
    if re.search(r"\bhoy\b", t):
        return hoy, hoy
    if re.search(r"\bayer\b", t):
        return hoy - timedelta(days=1), hoy - timedelta(days=1)
    if "semana pasada" in t:
        inicio = hoy - timedelta(days=hoy.weekday() + 7)
        return inicio, inicio + timedelta(days=6)
    if "esta semana" in t:
        return hoy - timedelta(days=hoy.weekday()), hoy
    if "mes pasado" in t or "mes anterior" in t:
        fin = hoy.replace(day=1) - timedelta(days=1)
        return fin.replace(day=1), fin
    if "este mes" in t or "mes actual" in t:
        # Alternativo 1: "este mes" el dia 1 a 3 casi no tiene datos todavia.
        if hoy.day <= 3:
            return "ambiguo"
        return hoy.replace(day=1), hoy
    if "este ano" in t or "este año" in t:
        return date(hoy.year, 1, 1), hoy
    for i, nombre in enumerate(MESES, start=1):
        m = re.search(rf"\b{nombre}\b(?:\s+(?:de\s+|del\s+)?(\d{{4}}))?", t)
        if m:
            anio = int(m.group(1)) if m.group(1) else (hoy.year if i <= hoy.month else hoy.year - 1)
            return date(anio, i, 1), min(_ultimo_dia(anio, i), hoy) if anio == hoy.year and i == hoy.month else _ultimo_dia(anio, i)
    return None


def _contiene_nombre(t: str, nombre: str) -> bool:
    n = normalizar(nombre)
    return bool(n) and re.search(rf"\b{re.escape(n)}\b", t) is not None


def interpretar_por_reglas(texto: str, ctx: Contexto) -> Interpretacion:
    t = normalizar(texto)
    # Alternativo 3: pedidos para modificar datos.
    if ESCRITURA.search(t):
        return Interpretacion(accion="rechazar", motivo="Solo se pueden consultar datos: los reportes no modifican, borran ni crean registros.")
    # Alternativo 4: datos de otra empresa.
    if OTRA_EMPRESA.search(t):
        return Interpretacion(accion="rechazar", motivo="Solo puede consultar datos de su propia empresa.")
    if not PALABRAS_REPORTE.search(t):
        return Interpretacion(accion="rechazar", motivo="No entendi que reporte necesita.")

    if re.search(r"\b(devol|cambio|reembols)", t):
        fuente = "devoluciones"
    elif re.search(r"\b(stock|inventari|existenc)", t):
        fuente = "inventario"
    else:
        fuente = "ventas"

    metricas: list[str] = []
    if fuente == "ventas":
        mas_vendidos = re.search(r"\b(mas|menos) vendid", t)
        por_unidades = re.search(r"\b(unidad|cantidad|prendas|piezas)", t)
        por_monto = re.search(r"\b(monto|ingres|dinero|bs\b|bolivian|factur|recaud)", t)
        if mas_vendidos and not (por_unidades or por_monto):
            base = texto.strip().rstrip(".?!")
            return Interpretacion(
                accion="aclarar", fuente="ventas",
                pregunta="¿Los mas vendidos por unidades o por ingresos?",
                opciones=[f"{base} por unidades vendidas", f"{base} por monto en Bs"],
            )
        if re.search(r"\bticket", t):
            metricas.append("ticket_promedio")
        if por_unidades:
            metricas.append("unidades")
        if por_monto:
            metricas.append("monto")
        if re.search(r"(numero|cantidad) de ventas|cuantas ventas|transacciones", t):
            metricas = [m for m in metricas if m != "unidades"] + ["ventas"]
        metricas = metricas or ["monto", "unidades"]
    elif fuente == "devoluciones":
        if re.search(r"\b(reembols|devuelto|dinero|monto)", t):
            metricas.append("monto_reembolsado")
        if re.search(r"\b(unidad|prendas|piezas)", t):
            metricas.append("unidades_devueltas")
        metricas = metricas or ["casos", "unidades_devueltas"]
    else:
        if "disponible" in t:
            metricas.append("stock_disponible")
        if "reservad" in t:
            metricas.append("stock_reservado")
        metricas = metricas or ["stock_actual", "stock_disponible"]

    dimensiones: list[str] = []
    claves = [
        ("sucursal", r"\b(sucursal|sucursales|tienda|tiendas|local|locales)\b"),
        ("producto", r"\b(producto|productos|prenda|prendas|modelo|modelos|articulo)s?\b"),
        ("categoria", r"\b(categoria|categorias|tipo de prenda|tipos)\b"),
        ("talla", r"\btallas?\b"),
        ("color", r"\bcolor(es)?\b"),
        ("motivo", r"\bmotivos?\b"),
        ("estado", r"\bestados?\b"),
        ("dia", r"\b(dia|dias|diari[oa]s?)\b"),
        ("semana", r"\b(semana|semanas|semanal(es)?)\b"),
        ("mes", r"\b(mes|meses|mensual(es)?)\b"),
    ]
    for dim, patron in claves:
        if dim not in DIMENSIONES[fuente]:
            continue
        # "por X", "agrupado por X", "de cada X", "segun X", "X por X"...
        if re.search(r"\b(por|cada|segun|agrupad[oa]s? por|desglosad[oa]s? por|entre)\s+(la |el |los |las )?" + patron.removeprefix(r"\b"), t):
            dimensiones.append(dim)
    # "por sucursal y categoria": la segunda agrupacion viene despues de la "y".
    for dim, patron in claves:
        if dimensiones and dim not in dimensiones and dim in DIMENSIONES[fuente]:
            if re.search(r"\by\s+(por\s+)?(la |el |los |las )?" + patron.removeprefix(r"\b"), t):
                dimensiones.append(dim)
    if re.search(r"\b(mas|menos) vendid|\btop\b", t) and "producto" not in dimensiones and fuente == "ventas":
        dimensiones.insert(0, "producto")
    if re.search(r"\b(evolucion|tendencia)\b", t) and not any(d in TEMPORALES for d in dimensiones):
        dimensiones.append("dia")
    # Un nombre de periodo usado como filtro ("ventas de septiembre") no es agrupacion.
    dimensiones = list(dict.fromkeys(dimensiones))[:2]

    filtros = FiltrosReporte()
    periodo_por_defecto = False
    if fuente != "inventario":
        periodo = periodo_en_texto(t, ctx.hoy)
        if periodo == "ambiguo":
            base = re.sub(r"\beste mes\b", "", texto, flags=re.IGNORECASE).strip()
            return Interpretacion(
                accion="aclarar", fuente=fuente,
                pregunta=f"Hoy es {ctx.hoy:%d/%m}: este mes casi no tiene datos todavia. ¿Que periodo quiere?",
                opciones=[f"{base} de lo que va de este mes", f"{base} del mes pasado"],
            )
        if periodo is None:
            # Alternativo 2: sin periodo se usa un valor por defecto y se avisa: el mes
            # actual, salvo que se agrupe por mes o por semana (un solo punto no dice nada).
            if "mes" in dimensiones:
                filtros.fecha_desde = (ctx.hoy.replace(day=1) - timedelta(days=150)).replace(day=1)
            elif "semana" in dimensiones:
                filtros.fecha_desde = ctx.hoy - timedelta(weeks=8)
            else:
                filtros.fecha_desde = ctx.hoy.replace(day=1)
            filtros.fecha_hasta = ctx.hoy
            periodo_por_defecto = True
        else:
            filtros.fecha_desde, filtros.fecha_hasta = periodo

    filtros.sucursales = [n for n in ctx.sucursales.values() if _contiene_nombre(t, n)]
    filtros.categorias = [c for c in ctx.categorias if _contiene_nombre(t, c)]
    filtros.colores = [c for c in ctx.colores if re.search(rf"\b{re.escape(normalizar(c))}s?\b", t)]
    m = re.search(r"\btallas?\s+([a-z0-9]{1,4}(?:\s*(?:,|y)\s*[a-z0-9]{1,4})*)\b", t)
    if m and not re.search(r"\btallas?\s+(mas|menos|de|del|con)\b", t):
        filtros.tallas = [x.upper() for x in re.split(r"\s*(?:,|y)\s*", m.group(1)) if x]
    filtros.productos = [p for p in ctx.productos if _contiene_nombre(t, p)]

    limite = None
    m = re.search(r"\b(top|primer[oa]s|ultim[oa]s|l[oa]s)\s+(\d{1,3})\b", t)
    if m and not re.search(r"ultim[oa]s?\s+\d+\s+dias", t):
        limite = int(m.group(2))
    orden = "asc" if re.search(r"\bmenos vendid|\bpeor|\bmenor", t) else "desc"

    visualizacion = None
    if re.search(r"\b(torta|pastel|circular)\b", t):
        visualizacion = "torta"
    elif re.search(r"\b(linea|lineas|evolucion|tendencia)\b", t):
        visualizacion = "lineas"
    elif re.search(r"\btabla\b", t):
        visualizacion = "tabla"
    elif re.search(r"\b(barra|barras|grafico)\b", t):
        visualizacion = "barras"

    return Interpretacion(
        accion="reporte", fuente=fuente, metricas=metricas, dimensiones=dimensiones, filtros=filtros,
        orden=orden, limite=limite, visualizacion=visualizacion, periodoPorDefecto=periodo_por_defecto,
    )


# --- Interpretacion con IA ----------------------------------------------------

def _instrucciones(ctx: Contexto) -> str:
    catalogo = "\n".join(
        f"- fuente '{f}': metricas {list(METRICAS[f])}; agrupaciones {list(DIMENSIONES[f])}" for f in METRICAS
    )
    return (
        "Traduces pedidos de reportes de una tienda de ropa a una solicitud estructurada. "
        "Solo puedes elegir del catalogo; nunca escribas SQL ni inventes campos.\n"
        f"Catalogo:\n{catalogo}\n"
        f"Hoy es {ctx.hoy.isoformat()}. Sucursales: {list(ctx.sucursales.values())}. Categorias: {ctx.categorias}. "
        f"Tallas: {ctx.tallas}. Colores: {ctx.colores}.\n"
        "Reglas: accion='rechazar' con motivo si el pedido intenta modificar datos o pide datos de otra empresa; "
        "accion='aclarar' con pregunta y 2 a 4 opciones (cada opcion es el pedido completo reescrito) si es ambiguo, "
        "por ejemplo 'los mas vendidos' sin decir unidades o ingresos, o 'este mes' en los primeros 3 dias del mes; "
        "si falta el periodo usa el mes actual y marca periodoPorDefecto=true; maximo 2 agrupaciones; "
        "las fechas en formato AAAA-MM-DD; titulo corto en espanol."
    )


async def interpretar_con_ia(texto: str, ctx: Contexto) -> Interpretacion:
    client = reportes_ia._client()
    try:
        respuesta = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=reportes_ia.MODEL,
                contents=texto,
                config=reportes_ia.types.GenerateContentConfig(
                    system_instruction=_instrucciones(ctx),
                    response_mime_type="application/json",
                    response_schema=Interpretacion,
                ),
            ),
            timeout=TIMEOUT_IA_SEGUNDOS,
        )
    except asyncio.TimeoutError as exc:
        raise reportes_ia.AnalisisNoDisponible("Gemini no respondio a tiempo") from exc
    interpretacion = respuesta.parsed
    if interpretacion is None:
        interpretacion = Interpretacion.model_validate(json.loads(respuesta.text))
    return interpretacion


async def interpretar(texto: str, ctx: Contexto) -> tuple[Interpretacion, str, str | None]:
    """Pasos 2-3. Devuelve (interpretacion, motor, aviso)."""
    try:
        return await interpretar_con_ia(texto, ctx), reportes_ia.MODEL, None
    except reportes_ia.GeminiNoConfigurado:
        aviso = None  # sin clave configurada el motor de reglas es lo esperado
    except Exception as exc:  # la IA nunca tumba el reporte
        logger.warning("Interpretacion por reglas en lugar de Gemini: %s", exc)
        aviso = "La IA no estuvo disponible: se interpreto el pedido con el motor de reglas."
    return interpretar_por_reglas(texto, ctx), MOTOR_REGLAS, aviso


# --- Paso 4: validacion -------------------------------------------------------

def _buscar(nombres: list[str], disponibles: list[str]) -> tuple[list[str], list[str]]:
    mapa = {normalizar(d): d for d in disponibles}
    encontrados, faltan = [], []
    for n in nombres:
        (encontrados if normalizar(n) in mapa else faltan).append(mapa.get(normalizar(n), n))
    return encontrados, faltan


def validar(interp: Interpretacion, ctx: Contexto) -> SolicitudValida:
    if interp.accion == "rechazar":
        raise Rechazo(interp.motivo or "El pedido no es un reporte disponible.")
    fuente = interp.fuente
    if fuente not in METRICAS:
        raise Rechazo("No es un reporte disponible.")
    metricas = [m for m in dict.fromkeys(interp.metricas) if m in METRICAS[fuente]]
    if not metricas:
        metricas = [next(iter(METRICAS[fuente]))]
    dimensiones = [d for d in dict.fromkeys(interp.dimensiones) if d in DIMENSIONES[fuente]][:2]
    avisos: list[str] = []
    f = interp.filtros

    desde, hasta = (f.fecha_desde, f.fecha_hasta) if fuente != "inventario" else (None, None)
    if desde and hasta and desde > hasta:
        desde, hasta = hasta, desde
    if hasta and hasta > ctx.hoy:
        hasta = ctx.hoy

    # Alternativo 5: el Encargado ve solo sus sucursales.
    pedidas = {c for c, n in ctx.sucursales.items() if normalizar(n) in {normalizar(x) for x in f.sucursales}}
    faltan_suc = [n for n in f.sucursales if normalizar(n) not in {normalizar(x) for x in ctx.sucursales.values()}]
    if faltan_suc:
        avisos.append(f"No se encontro la sucursal: {', '.join(faltan_suc)}")
    sucursales: set[int] | None = pedidas or None
    if ctx.visibles is not None:
        if sucursales is None:
            sucursales = set(ctx.visibles)
            avisos.append("El reporte se limito a sus sucursales: " + ", ".join(ctx.sucursales[c] for c in sorted(ctx.visibles) if c in ctx.sucursales))
        elif not sucursales <= ctx.visibles:
            sucursales = sucursales & ctx.visibles
            avisos.append("Solo puede consultar sus sucursales: se quitaron las demas del reporte.")

    categorias, faltan = _buscar(f.categorias, ctx.categorias)
    if faltan:
        avisos.append(f"Categoria desconocida: {', '.join(faltan)}")
    tallas = [t.upper() for t in f.tallas if t.upper() in {x.upper() for x in ctx.tallas}]
    colores, _ = _buscar(f.colores, ctx.colores)
    productos, _ = _buscar(f.productos, ctx.productos)

    limite = min(max(interp.limite or FILAS_PANTALLA, 1), FILAS_MAXIMAS)
    ordenar_por = interp.ordenarPor if interp.ordenarPor in metricas else metricas[0]
    if dimensiones and dimensiones[0] in TEMPORALES:
        visual_auto = "lineas"
    elif len(dimensiones) == 1:
        visual_auto = "barras"
    else:
        visual_auto = "tabla"
    visualizacion = interp.visualizacion if interp.visualizacion in VISUALIZACIONES else visual_auto
    if visualizacion == "torta" and (len(dimensiones) != 1 or len(metricas) != 1):
        visualizacion = visual_auto
    if visualizacion == "lineas" and not (dimensiones and dimensiones[0] in TEMPORALES):
        visualizacion = visual_auto

    filtros_texto: list[tuple[str, str]] = []
    if desde or hasta:
        periodo = f"{desde:%d/%m/%Y} al {hasta:%d/%m/%Y}" if desde and hasta else (f"desde {desde:%d/%m/%Y}" if desde else f"hasta {hasta:%d/%m/%Y}")
        filtros_texto.append(("Periodo", periodo + (" (valor por defecto: no se indico el periodo)" if interp.periodoPorDefecto else "")))
    if sucursales is not None:
        filtros_texto.append(("Sucursales", ", ".join(ctx.sucursales[c] for c in sorted(sucursales) if c in ctx.sucursales) or "ninguna"))
    for nombre, valores in (("Categorias", categorias), ("Productos", productos), ("Tallas", tallas), ("Colores", colores)):
        if valores:
            filtros_texto.append((nombre, ", ".join(valores)))
    if dimensiones:
        filtros_texto.append(("Agrupado por", ", ".join(ETIQUETA_DIMENSION[d] for d in dimensiones)))
    if interp.limite:
        filtros_texto.append(("Limite", f"{limite} filas"))

    titulo = (interp.titulo or "").strip() or (
        " y ".join(METRICAS[fuente][m][0] for m in metricas)
        + (" por " + " y ".join(ETIQUETA_DIMENSION[d].lower() for d in dimensiones) if dimensiones else "")
    )
    return SolicitudValida(
        fuente=fuente, metricas=metricas, dimensiones=dimensiones, desde=desde, hasta=hasta, sucursales=sucursales,
        categorias=categorias, productos=productos, tallas=tallas, colores=colores, ordenar_por=ordenar_por,
        orden=interp.orden, limite=limite, visualizacion=visualizacion, titulo=titulo[:150],
        filtros_texto=filtros_texto, avisos=avisos,
    )


# --- Paso 5: consulta de solo lectura -----------------------------------------

def _columna_dimension(dim: str, fecha_col, producto, sucursal_nombre):
    local = func.timezone(ZONA_BOLIVIA_SQL, fecha_col) if fecha_col is not None else None
    return {
        "sucursal": func.coalesce(sucursal_nombre, "Sin sucursal"),
        "producto": producto.nombre,
        "categoria": func.coalesce(producto.tipo, "Sin categoria"),
        "talla": func.coalesce(producto.talla, "Sin talla"),
        "color": func.coalesce(producto.color, "Sin color"),
        "dia": cast(local, Date) if local is not None else None,
        "semana": cast(func.date_trunc("week", local), Date) if local is not None else None,
        "mes": func.to_char(local, "YYYY-MM") if local is not None else None,
    }.get(dim)


def construir_consulta(s: SolicitudValida, id_tenant: int, limite: int):
    """Consulta parametrizada: los valores viajan como parametros, nunca pegados al SQL."""
    if s.fuente == "ventas":
        lineas = reportes_ia.lineas_venta_con_sucursal()
        base_fecha = lineas.c.fecha
        medidas = {
            "monto": func.coalesce(func.sum(lineas.c.monto), 0),
            "unidades": func.coalesce(func.sum(lineas.c.cantidad), 0),
            "ventas": func.count(func.distinct(lineas.c.idVenta)),
            "ticket_promedio": func.coalesce(func.sum(lineas.c.monto) / func.nullif(func.count(func.distinct(lineas.c.idVenta)), 0), 0),
        }
        stmt = (
            select()
            .select_from(lineas)
            .join(Producto, Producto.idProducto == lineas.c.idProducto)
            .outerjoin(Sucursal, Sucursal.codigoSucursal == lineas.c.codigoSucursal)
            .where(Producto.idTenant == id_tenant)
        )
        columna_sucursal = lineas.c.codigoSucursal
        dims = {d: _columna_dimension(d, base_fecha, Producto, Sucursal.nombre) for d in s.dimensiones}
    elif s.fuente == "devoluciones":
        base_fecha = Devolucion.fecha
        medidas = {
            "casos": func.count(Devolucion.idDevolucion),
            "unidades_devueltas": func.coalesce(func.sum(Devolucion.cantidad), 0),
            "monto_reembolsado": func.coalesce(func.sum(Devolucion.montoDevuelto), 0),
        }
        stmt = (
            select()
            .select_from(Devolucion)
            .join(Producto, Producto.idProducto == Devolucion.idProducto)
            .outerjoin(Sucursal, Sucursal.codigoSucursal == Devolucion.codigoSucursal)
            .where(Devolucion.idTenant == id_tenant)
        )
        columna_sucursal = Devolucion.codigoSucursal
        dims = {
            d: (Devolucion.motivoCategoria if d == "motivo" else Devolucion.estado if d == "estado"
                else _columna_dimension(d, base_fecha, Producto, Sucursal.nombre))
            for d in s.dimensiones
        }
    else:
        base_fecha = None
        medidas = {
            "stock_actual": func.coalesce(func.sum(Inventario.cantidad_actual), 0),
            "stock_disponible": func.coalesce(func.sum(Inventario.cantidad_actual - Inventario.cantidad_reservada), 0),
            "stock_reservado": func.coalesce(func.sum(Inventario.cantidad_reservada), 0),
        }
        stmt = (
            select()
            .select_from(Inventario)
            .join(Producto, Producto.idProducto == Inventario.idProducto)
            .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
            .where(Sucursal.idTenant == id_tenant, Producto.idTenant == id_tenant)
        )
        columna_sucursal = Inventario.codigoSucursal
        dims = {d: _columna_dimension(d, None, Producto, Sucursal.nombre) for d in s.dimensiones}

    columnas = [dims[d].label(d) for d in s.dimensiones] + [medidas[m].label(m) for m in s.metricas]
    stmt = stmt.with_only_columns(*columnas)
    if base_fecha is not None and s.desde:
        stmt = stmt.where(base_fecha >= inicio_del_dia(s.desde))
    if base_fecha is not None and s.hasta:
        stmt = stmt.where(base_fecha <= fin_del_dia(s.hasta))
    if s.sucursales is not None:
        stmt = stmt.where(columna_sucursal.in_(sorted(s.sucursales)))
    if s.categorias:
        stmt = stmt.where(Producto.tipo.in_(s.categorias))
    if s.productos:
        stmt = stmt.where(Producto.nombre.in_(s.productos))
    if s.tallas:
        stmt = stmt.where(func.upper(Producto.talla).in_(s.tallas))
    if s.colores:
        stmt = stmt.where(Producto.color.in_(s.colores))
    if s.dimensiones:
        stmt = stmt.group_by(*[dims[d] for d in s.dimensiones])
        if s.dimensiones[0] in TEMPORALES:
            stmt = stmt.order_by(dims[s.dimensiones[0]].asc())
        else:
            orden = medidas[s.ordenar_por]
            stmt = stmt.order_by(orden.asc() if s.orden == "asc" else orden.desc())
    return stmt.limit(limite + 1)


def _a_python(valor):
    if isinstance(valor, (Decimal, float)):
        return round(float(valor), 2)
    if isinstance(valor, date):
        return valor.isoformat()
    return valor


async def ejecutar(s: SolicitudValida, id_tenant: int, limite: int) -> tuple[list[dict], bool]:
    """Paso 5: transaccion de SOLO LECTURA con tiempo maximo. Devuelve (filas, hay_mas)."""
    async with AsyncSessionLocal() as session:
        await session.execute(text("SET TRANSACTION READ ONLY"))
        await session.execute(text(f"SET LOCAL statement_timeout = {TIEMPO_MAXIMO_MS}"))
        filas = (await session.execute(construir_consulta(s, id_tenant, limite))).mappings().all()
        await session.rollback()
    resultado = [{k: _a_python(v) for k, v in fila.items()} for fila in filas]
    return resultado[:limite], len(resultado) > limite


def columnas_de(s: SolicitudValida) -> list[dict]:
    return [{"clave": d, "etiqueta": ETIQUETA_DIMENSION[d], "tipo": "texto"} for d in s.dimensiones] + [
        {"clave": m, "etiqueta": METRICAS[s.fuente][m][0], "tipo": METRICAS[s.fuente][m][1]} for m in s.metricas
    ]


def totales_de(s: SolicitudValida, filas: list[dict]) -> dict:
    totales = {}
    for m in s.metricas:
        if m == "ticket_promedio":
            continue  # un promedio de promedios no es un total
        totales[m] = round(sum(float(f.get(m) or 0) for f in filas), 2)
    if "ticket_promedio" in s.metricas and "monto" in totales and "ventas" in totales and totales["ventas"]:
        totales["ticket_promedio"] = round(totales["monto"] / totales["ventas"], 2)
    return totales


# --- Paso 6: resumen narrativo --------------------------------------------------

def _formato(valor: float, tipo: str) -> str:
    return f"Bs {valor:,.2f}" if tipo == "moneda" else f"{valor:,.0f}"


def resumen_por_reglas(s: SolicitudValida, filas: list[dict], totales: dict) -> str:
    metrica = s.ordenar_por
    etiqueta, tipo = METRICAS[s.fuente][metrica]
    partes = []
    if metrica in totales:
        partes.append(f"{etiqueta}: {_formato(totales[metrica], tipo)} en total.")
    if s.dimensiones and filas:
        dim = s.dimensiones[0]
        if dim in TEMPORALES and len(filas) >= 2:
            primero, ultimo = float(filas[0].get(metrica) or 0), float(filas[-1].get(metrica) or 0)
            tendencia = "subio" if ultimo > primero else "bajo" if ultimo < primero else "se mantuvo"
            partes.append(f"Entre {filas[0][dim]} y {filas[-1][dim]} {tendencia} de {_formato(primero, tipo)} a {_formato(ultimo, tipo)}.")
        else:
            lider = max(filas, key=lambda f: float(f.get(metrica) or 0)) if s.orden == "desc" else min(filas, key=lambda f: float(f.get(metrica) or 0))
            valor = float(lider.get(metrica) or 0)
            total = totales.get(metrica) or 0
            participacion = f" ({valor * 100 / total:.0f}% del total)" if total and metrica != "ticket_promedio" else ""
            palabra = "lidera" if s.orden == "desc" else "tiene el valor mas bajo"
            partes.append(f"{lider[dim]} {palabra} con {_formato(valor, tipo)}{participacion}.")
    return " ".join(partes)


async def resumir(s: SolicitudValida, filas: list[dict], totales: dict) -> tuple[str, str]:
    """Devuelve (resumen, motor). La IA solo redacta sobre los numeros ya calculados."""
    base = resumen_por_reglas(s, filas, totales)
    try:
        client = reportes_ia._client()
        muestra = json.dumps({"titulo": s.titulo, "filtros": s.filtros_texto, "totales": totales, "filas": filas[:25]}, ensure_ascii=False, default=str)
        respuesta = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=reportes_ia.MODEL,
                contents=muestra,
                config=reportes_ia.types.GenerateContentConfig(
                    system_instruction=(
                        "Redacta en espanol, en 2 o 3 oraciones, la lectura de este reporte para la gerencia de una tienda de ropa. "
                        "Usa SOLO los numeros entregados; no inventes cifras ni recomiendes nada que no se derive de ellos."
                    ),
                ),
            ),
            timeout=TIMEOUT_IA_SEGUNDOS,
        )
        texto = (respuesta.text or "").strip()
        if texto:
            return texto, reportes_ia.MODEL
    except reportes_ia.GeminiNoConfigurado:
        pass
    except Exception as exc:
        logger.warning("Resumen por reglas en lugar de Gemini: %s", exc)
    return base, MOTOR_REGLAS


# --- Contexto del usuario -----------------------------------------------------

async def contexto(session: AsyncSession, id_tenant: int, empresa: str, visibles: set[int] | None) -> Contexto:
    sucursales = {
        c: n for c, n in (await session.execute(select(Sucursal.codigoSucursal, Sucursal.nombre).where(Sucursal.idTenant == id_tenant))).all()
    }

    async def distintos(columna) -> list[str]:
        filas = (await session.execute(select(columna).where(Producto.idTenant == id_tenant, columna.is_not(None)).distinct())).scalars().all()
        return sorted(str(v) for v in filas if str(v).strip())

    return Contexto(
        id_tenant=id_tenant, empresa=empresa, sucursales=sucursales, visibles=visibles,
        categorias=await distintos(Producto.tipo), tallas=await distintos(Producto.talla),
        colores=await distintos(Producto.color), productos=await distintos(Producto.nombre),
        hoy=datetime.now(HORA_BOLIVIA).date(),
    )
