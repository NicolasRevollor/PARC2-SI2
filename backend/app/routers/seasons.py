from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Colecciones, Temporada
from app.schemas.fase2 import TemporadaIn, TemporadaOut, TemporadaUpdate
from app.security import require_permiso

router = APIRouter(prefix="/api/seasons", tags=["seasons"])


@router.get("", response_model=list[TemporadaOut])
async def list_seasons(session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(Temporada).order_by(Temporada.fecha_ini))).scalars().all()
    return rows


@router.get("/{idTemporada}", response_model=TemporadaOut)
async def get_season(idTemporada: int, session: AsyncSession = Depends(get_db)):
    t = await session.get(Temporada, idTemporada)
    if not t:
        raise HTTPException(status_code=404, detail="Temporada no encontrada")
    return t


@router.post("", response_model=TemporadaOut, status_code=201)
async def create_season(
    payload: TemporadaIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.crear")),
):
    if payload.fecha_fin < payload.fecha_ini:
        raise HTTPException(status_code=400, detail="fecha_fin no puede ser anterior a fecha_ini")
    t = Temporada(**payload.model_dump())
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@router.put("/{idTemporada}", response_model=TemporadaOut)
async def update_season(
    idTemporada: int,
    payload: TemporadaUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.editar")),
):
    t = await session.get(Temporada, idTemporada)
    if not t:
        raise HTTPException(status_code=404, detail="Temporada no encontrada")
    data = payload.model_dump(exclude_unset=True)
    fin = data.get("fecha_fin", t.fecha_fin)
    ini = data.get("fecha_ini", t.fecha_ini)
    if fin < ini:
        raise HTTPException(status_code=400, detail="fecha_fin no puede ser anterior a fecha_ini")
    for k, v in data.items():
        setattr(t, k, v)
    await session.commit()
    await session.refresh(t)
    return t


@router.delete("/{idTemporada}", status_code=204)
async def delete_season(
    idTemporada: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.eliminar")),
):
    t = await session.get(Temporada, idTemporada)
    if not t:
        raise HTTPException(status_code=404, detail="Temporada no encontrada")
    count = (
        await session.execute(
            select(func.count()).select_from(Colecciones).where(Colecciones.idTemporada == idTemporada)
        )
    ).scalar_one()
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"No se puede eliminar: la temporada tiene {count} colección(es) asociada(s)",
        )
    await session.delete(t)
    await session.commit()
