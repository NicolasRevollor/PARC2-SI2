"""Hora de Bolivia (UTC-4, sin horario de verano).

Las tiendas operan en Bolivia: los cortes por dia (filtros de fecha, ventas
por dia) y la hora de la bitacora se calculan en esta zona para que no
dependan de la zona del servidor (UTC en la nube, local en una PC). Se usa
un desfase fijo porque Windows no trae la base tzdata para zoneinfo.
"""
from datetime import date, datetime, time, timedelta, timezone

HORA_BOLIVIA = timezone(timedelta(hours=-4), "BOT")
ZONA_BOLIVIA_SQL = "America/La_Paz"


def inicio_del_dia(dia: date) -> datetime:
    return datetime.combine(dia, time.min, tzinfo=HORA_BOLIVIA)


def fin_del_dia(dia: date) -> datetime:
    return datetime.combine(dia, time.max, tzinfo=HORA_BOLIVIA)
