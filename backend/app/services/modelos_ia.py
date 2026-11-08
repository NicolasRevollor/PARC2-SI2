# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU29] Entrenar y evaluar modelos de Machine Learning
# Control del diagrama: ServicioIA
#   datos_*()       -> paso 2: datos REALES de la empresa (solo su idTenant, alt. 4)
#   sinteticos_*()  -> paso 4: datos sinteticos segun cantidad, periodo y estacionalidad
#   entrenar()      -> pasos 4 y 5: limpieza, codificacion, normalizacion, division
#                      entrenamiento/prueba, entrenamiento y metricas
#   resultados      -> lo que muestra el dashboard (CU30): predicciones, segmentos, anomalias
# Modelos: supervisados (demanda: regresion; devolucion por talla: clasificacion) y
#   no supervisados (segmentacion: KMeans; anomalias: IsolationForest).
# ==================================================================
"""Preparacion de datos, entrenamiento y evaluacion de los modelos de IA.

Las funciones de entrenamiento son puras (reciben listas, devuelven metricas y
resultados): el router las corre en un hilo aparte para no trabar el servidor.
scikit-learn se importa adentro para que el arranque del backend no lo cargue.
"""

import math
import random
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cliente, DetalleVenta, Devolucion, Inventario, Producto, Sucursal, Venta
from app.services import reportes_ia
from app.services.horario import HORA_BOLIVIA, ZONA_BOLIVIA_SQL

TIPOS = ("demanda", "devolucion", "segmentacion", "anomalias")
ETIQUETAS = {
    "demanda": "Prediccion de demanda (regresion)",
    "devolucion": "Probabilidad de devolucion por talla (clasificacion)",
    "segmentacion": "Segmentacion de clientes (no supervisado)",
    "anomalias": "Deteccion de anomalias (no supervisado)",
}
# Paso 2 / alternativo 1: minimo de datos reales para entrenar sin sinteticos.
MINIMOS = {"demanda": 200, "devolucion": 200, "segmentacion": 30, "anomalias": 30}
# Alternativo 2: una version que no llega a estos umbrales no se puede publicar.
UMBRALES = {
    "demanda": {"r2": 0.25},
    "devolucion": {"f1": 0.30, "exactitud": 0.60},
    "segmentacion": {"silueta": 0.25},
    "anomalias": {"puntos": 30},
}
VARIABLES = {
    "demanda": ["lag1", "lag2", "lag3", "lag4", "media4", "semana_anio", "precio", "categoria", "talla", "sucursal"],
    "devolucion": ["talla", "categoria", "color", "precio", "mes", "sucursal", "cantidad"],
    "segmentacion": ["recencia", "frecuencia", "monto", "ticket"],
    "anomalias": ["monto", "unidades", "ventas", "dia_semana"],
}
SEMANAS_PREDICCION = 4
SEMILLA = 42


@dataclass
class Entrenamiento:
    metricas: dict
    cumple: bool
    algoritmo: str
    resultados: dict
    filas_reales: int
    filas_sinteticas: int
    variables: list[str] = field(default_factory=list)


class DatosInsuficientes(Exception):
    pass


# --- Paso 2: datos reales -------------------------------------------------------

async def datos_ventas(session: AsyncSession, id_tenant: int) -> list[dict]:
    """Una fila por linea de venta con su sucursal real (misma fuente que los reportes)."""
    lineas = reportes_ia.lineas_venta_con_sucursal()
    stmt = (
        select(
            lineas.c.idVenta, lineas.c.idProducto, lineas.c.cantidad, lineas.c.monto, lineas.c.codigoSucursal,
            func.timezone(ZONA_BOLIVIA_SQL, lineas.c.fecha).label("fecha"),
            Venta.idCliente, Producto.nombre, Producto.tipo, Producto.talla, Producto.color, Producto.venta.label("precio"),
            Sucursal.nombre.label("sucursal"),
        )
        .select_from(lineas)
        .join(Venta, Venta.idVenta == lineas.c.idVenta)
        .join(Producto, Producto.idProducto == lineas.c.idProducto)
        .join(Sucursal, Sucursal.codigoSucursal == lineas.c.codigoSucursal)
        .where(Producto.idTenant == id_tenant, Sucursal.idTenant == id_tenant)
    )
    return [dict(f) for f in (await session.execute(stmt)).mappings()]


async def devueltas(session: AsyncSession, id_tenant: int) -> set[tuple[int, int]]:
    filas = (
        await session.execute(
            select(Devolucion.idVenta, Devolucion.idProducto).where(Devolucion.idTenant == id_tenant).distinct()
        )
    ).all()
    return {(v, p) for v, p in filas}


async def stock_disponible(session: AsyncSession, id_tenant: int) -> dict[tuple[int, int], int]:
    filas = (
        await session.execute(
            select(Inventario.idProducto, Inventario.codigoSucursal, Inventario.cantidad_actual - Inventario.cantidad_reservada)
            .join(Sucursal, Sucursal.codigoSucursal == Inventario.codigoSucursal)
            .where(Sucursal.idTenant == id_tenant)
        )
    ).all()
    return {(p, s): int(d) for p, s, d in filas}


def semana_de(fecha: datetime) -> date:
    d = fecha.date() if isinstance(fecha, datetime) else fecha
    return d - timedelta(days=d.weekday())


def contar_datos(tipo: str, ventas: list[dict]) -> int:
    """Paso 2: cuantas filas reales hay para cada modelo."""
    if tipo == "demanda":
        return len({(v["idProducto"], v["codigoSucursal"], semana_de(v["fecha"])) for v in ventas})
    if tipo == "devolucion":
        return len(ventas)
    if tipo == "segmentacion":
        return len({v["idCliente"] for v in ventas})
    return len({(v["codigoSucursal"], v["fecha"].date()) for v in ventas})


# --- Paso 4: datos sinteticos -----------------------------------------------------

def sinteticos_ventas(base: list[dict], registros: int, semanas: int, estacionalidad: float, hoy: date) -> list[dict]:
    """Ventas sinteticas con la forma de las reales (mismos productos y sucursales).

    Tienen patrones que un modelo puede aprender: estacionalidad anual, tallas
    extremas que se devuelven mas y cuatro perfiles de cliente."""
    rnd = random.Random(SEMILLA)
    productos = {(v["idProducto"], v["nombre"], v["tipo"], v["talla"], v["color"], float(v["precio"])) for v in base} or {
        (0, "Prenda sintetica", "Polera", "M", "Negro", 120.0)
    }
    sucursales = {(v["codigoSucursal"], v["sucursal"]) for v in base} or {(0, "Sucursal sintetica")}
    productos, sucursales = sorted(productos), sorted(sucursales)
    popularidad = {p[0]: rnd.uniform(0.5, 2.0) for p in productos}
    perfiles = [(0.9, 6, 2.0), (0.6, 3, 1.0), (0.3, 1, 0.7), (0.1, 1, 0.5)]  # (recencia, frecuencia, gasto)
    clientes = [(-(i + 1), rnd.choice(perfiles)) for i in range(max(registros // 8, 40))]
    salida = []
    inicio = hoy - timedelta(weeks=semanas)
    for i in range(registros):
        dia = inicio + timedelta(days=rnd.randrange(semanas * 7))
        factor = 1 + estacionalidad * math.sin(2 * math.pi * dia.timetuple().tm_yday / 365)
        if rnd.random() > factor / (1 + estacionalidad):
            continue
        p = rnd.choices(productos, weights=[popularidad[x[0]] for x in productos])[0]
        s = rnd.choice(sucursales)
        id_cliente, (rec, frec, gasto) = rnd.choice(clientes)
        cantidad = 1 + (rnd.random() < 0.15 * gasto)
        # Ids negativos: el modelo aprende de estas filas, pero nunca se suman a las
        # series reales (predicciones y anomalias del dashboard salen solo de datos reales).
        salida.append({
            "idVenta": -(i + 1), "idProducto": -abs(p[0] or 1), "nombre": p[1], "tipo": p[2], "talla": p[3], "color": p[4],
            "precio": p[5], "cantidad": cantidad, "monto": p[5] * cantidad, "codigoSucursal": -abs(s[0] or 1), "sucursal": s[1],
            "fecha": datetime.combine(dia, datetime.min.time()) + timedelta(hours=rnd.randint(9, 20)),
            "idCliente": id_cliente, "sintetica": True,
            "devuelta": rnd.random() < (0.32 if str(p[3]) in ("S", "XL", "28", "36") else 0.07),
        })
    return salida


# --- Pasos 4 y 5: entrenamiento y evaluacion --------------------------------------

def _codigos(valores: list) -> dict:
    return {v: i for i, v in enumerate(sorted({str(x) for x in valores}))}


def entrenar_demanda(ventas: list[dict], disponible: dict, hoy: date) -> Entrenamiento:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, r2_score

    # Limpieza: serie semanal continua por producto y sucursal (semanas sin venta = 0).
    serie: dict[tuple, dict[date, float]] = defaultdict(lambda: defaultdict(float))
    info: dict[tuple, dict] = {}
    for v in ventas:
        clave = (v["idProducto"], v["codigoSucursal"])
        serie[clave][semana_de(v["fecha"])] += float(v["cantidad"])
        info[clave] = v
    if not serie:
        raise DatosInsuficientes("No hay ventas con sucursal para predecir la demanda")
    primera = min(min(s) for s in serie.values())
    ultima = semana_de(datetime.combine(hoy, datetime.min.time())) - timedelta(weeks=1)
    semanas = [primera + timedelta(weeks=i) for i in range(max((ultima - primera).days // 7 + 1, 1))]
    if len(semanas) < 8:
        raise DatosInsuficientes("Hacen falta al menos 8 semanas de ventas")
    categorias = _codigos([i["tipo"] for i in info.values()])
    tallas = _codigos([i["talla"] for i in info.values()])
    sucursales = _codigos([i["codigoSucursal"] for i in info.values()])

    def fila(clave, historia: list[float], semana: date) -> list[float]:
        i = info[clave]
        lags = (historia[-4:] if len(historia) >= 4 else [0.0] * (4 - len(historia)) + historia)[::-1]
        return lags + [sum(lags) / 4, math.sin(2 * math.pi * semana.isocalendar()[1] / 52), float(i["precio"]),
                       categorias[str(i["tipo"])], tallas[str(i["talla"])], sucursales[str(i["codigoSucursal"])]]

    X, y, corte = [], [], []
    limite = semanas[int(len(semanas) * 0.8)]
    for clave, por_semana in serie.items():
        historia = [por_semana.get(s, 0.0) for s in semanas]
        for k in range(4, len(semanas)):
            X.append(fila(clave, historia[:k], semanas[k]))
            y.append(historia[k])
            corte.append(semanas[k] >= limite)
    # Division temporal: se prueba con las ultimas semanas (no se mezcla el futuro).
    Xe = [x for x, c in zip(X, corte) if not c]
    ye = [v for v, c in zip(y, corte) if not c]
    Xp = [x for x, c in zip(X, corte) if c]
    yp = [v for v, c in zip(y, corte) if c]
    if len(Xe) < 20 or len(Xp) < 5:
        raise DatosInsuficientes("No hay suficientes semanas para entrenar y probar")
    modelo = RandomForestRegressor(n_estimators=150, max_depth=8, min_samples_leaf=3, random_state=SEMILLA, n_jobs=1)
    modelo.fit(Xe, ye)
    pred = modelo.predict(Xp)
    metricas = {"mae": round(float(mean_absolute_error(yp, pred)), 3), "r2": round(float(r2_score(yp, pred)), 3),
                "muestrasEntrenamiento": len(Xe), "muestrasPrueba": len(Xp)}

    # Lo que usa el dashboard: proximas 4 semanas por producto y sucursal reales.
    reales = [c for c in serie if c[0] > 0]
    historias = {c: [serie[c].get(s, 0.0) for s in semanas] for c in reales}
    futuras_por_clave: dict[tuple, list[float]] = {c: [] for c in reales}
    for k in range(SEMANAS_PREDICCION):
        # Una prediccion por semana para todas las series juntas (rapido).
        semana = ultima + timedelta(weeks=k + 1)
        if not reales:
            break
        valores = modelo.predict([fila(c, historias[c], semana) for c in reales])
        for c, v in zip(reales, valores):
            futuras_por_clave[c].append(round(max(float(v), 0.0), 1))
            historias[c].append(max(float(v), 0.0))
    predicciones = []
    for clave in reales:
        i = info[clave]
        futuras = futuras_por_clave[clave]
        stock = disponible.get(clave, 0)
        total = sum(futuras)
        predicciones.append({
            "idProducto": i["idProducto"], "producto": i["nombre"], "talla": i["talla"], "color": i["color"], "categoria": i["tipo"],
            "codigoSucursal": i["codigoSucursal"], "sucursal": i["sucursal"], "semanas": futuras,
            "total": round(total, 1), "disponible": stock, "reponer": max(math.ceil(total - stock), 0),
        })
    predicciones.sort(key=lambda p: -p["reponer"])
    semanas_futuras = [(ultima + timedelta(weeks=k + 1)).isoformat() for k in range(SEMANAS_PREDICCION)]
    return Entrenamiento(metricas, metricas["r2"] >= UMBRALES["demanda"]["r2"], "RandomForestRegressor",
                         {"semanas": semanas_futuras, "predicciones": predicciones}, 0, 0)


def entrenar_devolucion(ventas: list[dict], devueltas_reales: set) -> Entrenamiento:
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    X, y, tallas = [], [], []
    for v in ventas:
        etiqueta = v.get("devuelta") if v.get("sintetica") else (v["idVenta"], v["idProducto"]) in devueltas_reales
        X.append([str(v["talla"]), str(v["tipo"]), str(v["color"]), str(v["codigoSucursal"]), float(v["precio"]), v["fecha"].month, float(v["cantidad"])])
        y.append(int(bool(etiqueta)))
        tallas.append((str(v["tipo"]), str(v["talla"])))
    if sum(y) < 10:
        raise DatosInsuficientes("Hay muy pocas devoluciones para aprender (minimo 10)")
    # Codificacion de categorias + normalizacion de numericas, en un solo pipeline.
    prep = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), [0, 1, 2, 3]), ("num", StandardScaler(), [4, 5, 6])])
    modelo = Pipeline([("prep", prep), ("clf", RandomForestClassifier(n_estimators=200, max_depth=6, class_weight="balanced", random_state=SEMILLA, n_jobs=1))])
    Xe, Xp, ye, yp = train_test_split(X, y, test_size=0.25, random_state=SEMILLA, stratify=y)
    modelo.fit(Xe, ye)
    pred = modelo.predict(Xp)
    metricas = {"exactitud": round(float(accuracy_score(yp, pred)), 3), "f1": round(float(f1_score(yp, pred, zero_division=0)), 3),
                "tasaReal": round(sum(y) / len(y), 3), "muestrasEntrenamiento": len(Xe), "muestrasPrueba": len(Xp)}
    probabilidades = modelo.predict_proba(X)[:, 1]
    por_talla: dict[tuple, list[float]] = defaultdict(list)
    for clave, p in zip(tallas, probabilidades):
        por_talla[clave].append(float(p))
    resultado = sorted(
        ({"categoria": c, "talla": t, "probabilidad": round(sum(ps) / len(ps), 3), "ventas": len(ps)} for (c, t), ps in por_talla.items()),
        key=lambda r: -r["probabilidad"],
    )
    cumple = metricas["f1"] >= UMBRALES["devolucion"]["f1"] and metricas["exactitud"] >= UMBRALES["devolucion"]["exactitud"]
    return Entrenamiento(metricas, cumple, "RandomForestClassifier (balanceado)", {"porTalla": resultado}, 0, 0)


def _rfm(ventas: list[dict], hoy: date) -> dict:
    por_cliente: dict[int, dict] = {}
    for v in ventas:
        c = por_cliente.setdefault(v["idCliente"], {"ultima": v["fecha"], "ventas": set(), "monto": 0.0, "sucursales": set(), "sintetico": v.get("sintetica", False)})
        c["ultima"] = max(c["ultima"], v["fecha"])
        c["ventas"].add(v["idVenta"])
        c["monto"] += float(v["monto"])
        c["sucursales"].add(v["codigoSucursal"])
    return {
        k: {"recencia": (hoy - c["ultima"].date()).days, "frecuencia": len(c["ventas"]), "monto": round(c["monto"], 2),
            "ticket": round(c["monto"] / len(c["ventas"]), 2), "sucursales": sorted(c["sucursales"]), "sintetico": c["sintetico"]}
        for k, c in por_cliente.items()
    }


def _nombre_segmento(centro: dict, medias: dict) -> str:
    if centro["monto"] >= medias["monto"] * 1.3 and centro["recencia"] <= medias["recencia"]:
        return "Clientes VIP"
    if centro["frecuencia"] >= medias["frecuencia"] * 1.2:
        return "Frecuentes"
    if centro["recencia"] > medias["recencia"] * 1.3:
        return "En riesgo de abandono"
    return "Ocasionales"


def entrenar_segmentacion(ventas: list[dict], hoy: date, nombres: dict[int, str]) -> Entrenamiento:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    rfm = _rfm(ventas, hoy)
    ids = list(rfm)
    if len(ids) < 10:
        raise DatosInsuficientes("Hacen falta al menos 10 clientes con compras")
    X = StandardScaler().fit_transform([[math.log1p(rfm[i]["recencia"]), math.log1p(rfm[i]["frecuencia"]), math.log1p(rfm[i]["monto"])] for i in ids])
    mejor = None
    for k in range(2, min(6, len(ids) - 1)):
        modelo = KMeans(n_clusters=k, n_init=10, random_state=SEMILLA).fit(X)
        silueta = float(silhouette_score(X, modelo.labels_))
        if mejor is None or silueta > mejor[0]:
            mejor = (silueta, k, modelo.labels_)
    silueta, k, etiquetas = mejor
    medias = {m: sum(rfm[i][m] for i in ids) / len(ids) for m in ("recencia", "frecuencia", "monto")}
    grupos: dict[int, list] = defaultdict(list)
    for i, e in zip(ids, etiquetas):
        grupos[int(e)].append(i)
    segmentos, nombres_usados, clientes = [], defaultdict(int), []
    for e, miembros in sorted(grupos.items(), key=lambda g: -sum(rfm[i]["monto"] for i in g[1]) / len(g[1])):
        centro = {m: sum(rfm[i][m] for i in miembros) / len(miembros) for m in ("recencia", "frecuencia", "monto", "ticket")}
        nombre = _nombre_segmento(centro, medias)
        nombres_usados[nombre] += 1
        if nombres_usados[nombre] > 1:
            nombre = f"{nombre} {nombres_usados[nombre]}"
        segmentos.append({"segmento": nombre, "clientes": len(miembros), **{m: round(v, 1) for m, v in centro.items()}})
        clientes += [{"idCliente": i, "cliente": nombres.get(i, "Cliente"), "segmento": nombre, **{m: rfm[i][m] for m in ("recencia", "frecuencia", "monto", "sucursales")}}
                     for i in miembros if not rfm[i]["sintetico"]]
    metricas = {"silueta": round(silueta, 3), "segmentos": k, "clientes": len(ids)}
    return Entrenamiento(metricas, silueta >= UMBRALES["segmentacion"]["silueta"], f"KMeans (k={k})",
                         {"segmentos": segmentos, "clientes": clientes}, 0, 0)


def entrenar_anomalias(ventas: list[dict], devueltas_reales: set) -> Entrenamiento:
    from sklearn.ensemble import IsolationForest

    dias: dict[tuple, dict] = {}
    for v in ventas:
        d = dias.setdefault((v["codigoSucursal"], v["fecha"].date()), {"sucursal": v["sucursal"], "monto": 0.0, "unidades": 0, "ventas": set(), "sintetica": v.get("sintetica", False)})
        d["monto"] += float(v["monto"])
        d["unidades"] += int(v["cantidad"])
        d["ventas"].add(v["idVenta"])
    claves = list(dias)
    if len(claves) < UMBRALES["anomalias"]["puntos"]:
        raise DatosInsuficientes("Hacen falta al menos 30 dias de ventas")
    # Normalizacion por sucursal: cada una se compara contra si misma (una sucursal
    # chica no es "anomala" por vender menos que la grande, ni los sinteticos mueven la vara).
    por_sucursal: dict[int, list] = defaultdict(list)
    for c in claves:
        por_sucursal[c[0]].append((dias[c]["monto"], dias[c]["unidades"], len(dias[c]["ventas"])))

    def z(valor: float, valores: list[float]) -> float:
        media = sum(valores) / len(valores)
        desvio = (sum((x - media) ** 2 for x in valores) / len(valores)) ** 0.5 or 1.0
        return (valor - media) / desvio

    columnas = {s: list(zip(*filas)) for s, filas in por_sucursal.items()}
    X = [[z(dias[c]["monto"], columnas[c[0]][0]), z(dias[c]["unidades"], columnas[c[0]][1]),
          z(len(dias[c]["ventas"]), columnas[c[0]][2]), c[1].weekday() / 6] for c in claves]
    modelo = IsolationForest(contamination=0.05, random_state=SEMILLA).fit(X)
    marcas = modelo.predict(X)
    puntaje = modelo.score_samples(X)
    medias: dict[int, float] = defaultdict(float)
    cuenta: dict[int, int] = defaultdict(int)
    for c in claves:
        medias[c[0]] += dias[c]["monto"]
        cuenta[c[0]] += 1
    anomalias = []
    for c, marca, p in zip(claves, marcas, puntaje):
        if marca == -1 and not dias[c]["sintetica"]:
            media = medias[c[0]] / cuenta[c[0]]
            anomalias.append({
                "tipo": "Venta atipica", "fecha": c[1].isoformat(), "codigoSucursal": c[0], "sucursal": dias[c]["sucursal"],
                "detalle": f"Bs {dias[c]['monto']:,.2f} en el dia (promedio de la sucursal Bs {media:,.2f})",
                "desvio": round((dias[c]["monto"] - media) / media * 100, 1) if media else 0.0, "puntaje": round(float(p), 3),
            })
    # Devoluciones inusuales de una talla o producto: tasa muy por encima del resto.
    por_talla: dict[tuple, list[int]] = defaultdict(lambda: [0, 0])
    for v in ventas:
        if v.get("sintetica"):
            continue
        clave = (v["nombre"], v["talla"], v["codigoSucursal"], v["sucursal"])
        por_talla[clave][0] += 1
        por_talla[clave][1] += int((v["idVenta"], v["idProducto"]) in devueltas_reales)
    total_v = sum(a for a, _ in por_talla.values()) or 1
    tasa_media = sum(b for _, b in por_talla.values()) / total_v
    for (nombre, talla, cod, suc), (vendidas, devueltas_n) in por_talla.items():
        if vendidas >= 5 and devueltas_n >= 2 and devueltas_n / vendidas > max(tasa_media * 3, 0.15):
            anomalias.append({
                "tipo": "Devolucion inusual", "fecha": None, "codigoSucursal": cod, "sucursal": suc,
                "detalle": f"{nombre} talla {talla}: {devueltas_n} de {vendidas} devueltas ({devueltas_n * 100 / vendidas:.0f}% frente a {tasa_media * 100:.1f}% de la empresa)",
                "desvio": round((devueltas_n / vendidas - tasa_media) * 100, 1), "puntaje": None,
            })
    metricas = {"puntos": len(claves), "anomalias": len(anomalias), "tasaAnomalias": round(sum(1 for m in marcas if m == -1) / len(marcas), 3)}
    return Entrenamiento(metricas, len(claves) >= UMBRALES["anomalias"]["puntos"], "IsolationForest (5% de contaminacion)",
                         {"anomalias": sorted(anomalias, key=lambda a: -abs(a["desvio"] or 0))}, 0, 0)


def entrenar(tipo: str, reales: list[dict], sinteticos: list[dict], *, disponible: dict, devueltas_reales: set,
             hoy: date, nombres: dict[int, str], variables: list[str]) -> Entrenamiento:
    datos = reales + sinteticos
    if tipo == "demanda":
        resultado = entrenar_demanda(datos, disponible, hoy)
    elif tipo == "devolucion":
        resultado = entrenar_devolucion(datos, devueltas_reales)
    elif tipo == "segmentacion":
        resultado = entrenar_segmentacion(datos, hoy, nombres)
    else:
        resultado = entrenar_anomalias(datos, devueltas_reales)
    resultado.filas_reales = contar_datos(tipo, reales)
    resultado.filas_sinteticas = contar_datos(tipo, sinteticos) if sinteticos else 0
    resultado.variables = variables
    return resultado


def comparar(nuevas: dict, anteriores: dict | None) -> dict:
    """Paso 6: diferencia de cada metrica contra la version publicada."""
    if not anteriores:
        return {}
    return {
        k: round(float(v) - float(anteriores[k]), 3)
        for k, v in nuevas.items()
        if k in anteriores and isinstance(v, (int, float)) and isinstance(anteriores[k], (int, float))
    }


async def nombres_clientes(session: AsyncSession, ids: set[int]) -> dict[int, str]:
    reales = [i for i in ids if i and i > 0]
    if not reales:
        return {}
    return {c: n for c, n in (await session.execute(select(Cliente.idCliente, Cliente.nombre).where(Cliente.idCliente.in_(reales)))).all()}


def hoy_bolivia() -> date:
    return datetime.now(HORA_BOLIVIA).date()
