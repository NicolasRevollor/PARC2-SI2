from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ciudad, Sucursal
from app.schemas.fase2 import SucursalIn, SucursalOut, SucursalUpdate
from app.security import require_permiso

router = APIRouter(prefix="/api/branches", tags=["branches"])


async def _serialize(s: Sucursal, session: AsyncSession) -> SucursalOut:
    c = await session.get(Ciudad, s.idCiudad)
    return SucursalOut(
        codigoSucursal=s.codigoSucursal,
        nombre=s.nombre,
        direccion=s.direccion,
        idCiudad=s.idCiudad,
        ciudad_nombre=c.nombCiudad if c else None,
    )


@router.get("", response_model=list[SucursalOut])
async def list_branches(session: AsyncSession = Depends(get_db),
                        _=Depends(require_permiso("inventario.ver"))):
    rows = (await session.execute(select(Sucursal).order_by(Sucursal.nombre))).scalars().all()
    return [await _serialize(s, session) for s in rows]


@router.get("/{codigoSucursal}", response_model=SucursalOut)
async def get_branch(codigoSucursal: int, session: AsyncSession = Depends(get_db),
                     _=Depends(require_permiso("inventario.ver"))):
    s = await session.get(Sucursal, codigoSucursal)
    if not s:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    return await _serialize(s, session)


@router.post("", response_model=SucursalOut, status_code=201)
async def create_branch(
    payload: SucursalIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    if not await session.get(Ciudad, payload.idCiudad):
        raise HTTPException(status_code=400, detail="Ciudad inexistente")
    s = Sucursal(**payload.model_dump())
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return await _serialize(s, session)


@router.put("/{codigoSucursal}", response_model=SucursalOut)
async def update_branch(
    codigoSucursal: int,
    payload: SucursalUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    s = await session.get(Sucursal, codigoSucursal)
    if not s:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "idCiudad" in data and not await session.get(Ciudad, data["idCiudad"]):
        raise HTTPException(status_code=400, detail="Ciudad inexistente")
    for k, v in data.items():
        setattr(s, k, v)
    await session.commit()
    await session.refresh(s)
    return await _serialize(s, session)


@router.delete("/{codigoSucursal}", status_code=204)
async def delete_branch(
    codigoSucursal: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("usuario.admin")),
):
    s = await session.get(Sucursal, codigoSucursal)
    if not s:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    await session.delete(s)
    await session.commit()
