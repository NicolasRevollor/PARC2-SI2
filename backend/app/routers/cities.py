from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ciudad
from app.schemas.fase2 import CiudadIn, CiudadOut, CiudadUpdate
from app.security import require_permiso

router = APIRouter(prefix="/api/cities", tags=["cities"])


@router.get("", response_model=list[CiudadOut])
async def list_cities(session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(Ciudad).order_by(Ciudad.nombCiudad))).scalars().all()
    return rows


@router.post("", response_model=CiudadOut, status_code=201)
async def create_city(
    payload: CiudadIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    ciudad = Ciudad(nombCiudad=payload.nombCiudad)
    session.add(ciudad)
    await session.commit()
    await session.refresh(ciudad)
    return ciudad


@router.put("/{idCiudad}", response_model=CiudadOut)
async def update_city(
    idCiudad: int,
    payload: CiudadUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    ciudad = await session.get(Ciudad, idCiudad)
    if not ciudad:
        raise HTTPException(status_code=404, detail="Ciudad no encontrada")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(ciudad, k, v)
    await session.commit()
    await session.refresh(ciudad)
    return ciudad


@router.delete("/{idCiudad}", status_code=204)
async def delete_city(
    idCiudad: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    ciudad = await session.get(Ciudad, idCiudad)
    if not ciudad:
        raise HTTPException(status_code=404, detail="Ciudad no encontrada")
    await session.delete(ciudad)
    await session.commit()
