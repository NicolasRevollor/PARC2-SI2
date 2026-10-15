from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Colecciones, Temporada, TENANT_POR_DEFECTO
from app.schemas.fase2 import TemporadaIn, TemporadaOut, TemporadaUpdate
from app.security import require_permiso
from app.services.tenancy import ContextoTenant, contexto_actual, tenant_actual

router = APIRouter(prefix="/api/seasons", tags=["seasons"])


@router.get("", response_model=list[TemporadaOut])
async def list_seasons(idTenant: int | None = None, session: AsyncSession = Depends(get_db)):
    # Endpoint publico (la vitrina lo consume sin token): el tenant no se
    # puede derivar del JWT, llega por query o se asume el por defecto.
    rows = (
        await session.execute(
            select(Temporada)
            .where(Temporada.idTenant == (idTenant or TENANT_POR_DEFECTO))
            .order_by(Temporada.fecha_ini)
        )
    ).scalars().all()
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
    ctx: ContextoTenant = Depends(contexto_actual),
):
    if payload.fecha_fin < payload.fecha_ini:
        raise HTTPException(status_code=400, detail="fecha_fin no puede ser anterior a fecha_ini")
    t = Temporada(**payload.model_dump(), idTenant=ctx.tenant.idTenant)
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
    id_tenant: int = Depends(tenant_actual),
):
    t = await session.get(Temporada, idTemporada)
    if not t or t.idTenant != id_tenant:
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
    id_tenant: int = Depends(tenant_actual),
):
    t = await session.get(Temporada, idTemporada)
    if not t or t.idTenant != id_tenant:
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
