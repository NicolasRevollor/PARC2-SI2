# ==== BANDEJA DE NOTIFICACIONES (correccion de la ingeniera: avisos "tipo push") ====
# En palabras simples: la web y la app movil le preguntan a este archivo "que avisos tengo?".
#   GET  /api/notificaciones            -> mis ultimos avisos (los mas nuevos primero)
#   GET  /api/notificaciones/no-leidas  -> cuantos avisos no lei (el numerito de la campanita)
#   POST /api/notificaciones/{id}/leida -> marcar uno como leido
#   POST /api/notificaciones/leer-todas -> marcar todos como leidos
# Cada usuario solo ve SUS avisos: el idUser sale del token, nunca de lo que manda la pantalla.
# Los avisos se crean en services/notificaciones.py.
# ==================================================================
"""Bandeja de notificaciones del usuario autenticado."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Notificacion
from app.security import get_current_payload

router = APIRouter(prefix="/api/notificaciones", tags=["Notificaciones"])


class NotificacionOut(BaseModel):
    idNotificacion: int
    tipo: str
    titulo: str
    mensaje: str
    referencia: str | None
    leida: bool
    fecha: datetime


class NoLeidasOut(BaseModel):
    noLeidas: int


@router.get("", response_model=list[NotificacionOut])
async def mis_notificaciones(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    # Los ultimos 50 avisos del usuario que inicio sesion.
    filas = (
        await session.execute(
            select(Notificacion)
            .where(Notificacion.idUser == int(auth["sub"]))
            .order_by(Notificacion.fecha.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        NotificacionOut(
            idNotificacion=n.idNotificacion, tipo=n.tipo, titulo=n.titulo, mensaje=n.mensaje,
            referencia=n.referencia, leida=n.leida, fecha=n.fecha,
        )
        for n in filas
    ]


@router.get("/no-leidas", response_model=NoLeidasOut)
async def no_leidas(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    total = await session.scalar(
        select(func.count()).select_from(Notificacion).where(
            Notificacion.idUser == int(auth["sub"]), Notificacion.leida.is_(False)
        )
    )
    return NoLeidasOut(noLeidas=int(total or 0))


@router.post("/leer-todas", response_model=NoLeidasOut)
async def leer_todas(session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    await session.execute(
        update(Notificacion)
        .where(Notificacion.idUser == int(auth["sub"]), Notificacion.leida.is_(False))
        .values(leida=True)
    )
    await session.commit()
    return NoLeidasOut(noLeidas=0)


@router.post("/{idNotificacion}/leida", response_model=NotificacionOut)
async def marcar_leida(idNotificacion: int, session: AsyncSession = Depends(get_db), auth: dict = Depends(get_current_payload)):
    aviso = await session.get(Notificacion, idNotificacion)
    # Si el aviso es de otro usuario, hacemos como si no existiera.
    if aviso is None or aviso.idUser != int(auth["sub"]):
        raise HTTPException(status_code=404, detail="Notificacion no encontrada")
    aviso.leida = True
    await session.commit()
    return NotificacionOut(
        idNotificacion=aviso.idNotificacion, tipo=aviso.tipo, titulo=aviso.titulo, mensaje=aviso.mensaje,
        referencia=aviso.referencia, leida=aviso.leida, fecha=aviso.fecha,
    )
