from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Cliente, Producto, Recomendaciones
from app.schemas.fase2 import RecomendacionIn, RecomendacionOut, RecomendacionUpdate
from app.security import get_current_payload, require_permiso

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


async def _serialize(r: Recomendaciones, session: AsyncSession) -> RecomendacionOut:
    producto = await session.get(Producto, r.idProducto) if r.idProducto else None
    return RecomendacionOut(
        idRecomendacion=r.idRecomendacion,
        nombre=r.nombre,
        importancia=r.importancia,
        idCliente=r.idCliente,
        idProducto=r.idProducto,
        producto_nombre=producto.nombre if producto else None,
    )


@router.get("", response_model=list[RecomendacionOut])
async def list_recommendations(
    idCliente: int | None = None,
    session: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_payload),
):
    permisos = payload.get("permisos", [])
    if "recomendacion.gestionar" in permisos:
        stmt = select(Recomendaciones).order_by(Recomendaciones.nombre)
        if idCliente is not None:
            stmt = stmt.where(Recomendaciones.idCliente == idCliente)
        rows = (await session.execute(stmt)).scalars().all()
        return [await _serialize(r, session) for r in rows]

    user_id = int(payload["sub"])
    cliente = (
        await session.execute(select(Cliente).where(Cliente.idUser == user_id))
    ).scalar_one_or_none()
    if cliente is None:
        return []
    stmt = select(Recomendaciones).where(Recomendaciones.idCliente == cliente.idCliente)
    rows = (await session.execute(stmt)).scalars().all()
    return [await _serialize(r, session) for r in rows]


@router.get("/{idRecomendacion}", response_model=RecomendacionOut)
async def get_recommendation(idRecomendacion: int, session: AsyncSession = Depends(get_db),
                             _=Depends(require_permiso("recomendacion.gestionar"))):
    r = await session.get(Recomendaciones, idRecomendacion)
    if not r:
        raise HTTPException(status_code=404, detail="Recomendacion no encontrada")
    return await _serialize(r, session)


@router.post("", response_model=RecomendacionOut, status_code=201)
async def create_recommendation(
    payload: RecomendacionIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("recomendacion.gestionar")),
):
    if not await session.get(Cliente, payload.idCliente):
        raise HTTPException(status_code=400, detail="Cliente inexistente")
    if payload.idProducto is not None and not await session.get(Producto, payload.idProducto):
        raise HTTPException(status_code=400, detail="Producto inexistente")
    r = Recomendaciones(**payload.model_dump())
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return await _serialize(r, session)


@router.put("/{idRecomendacion}", response_model=RecomendacionOut)
async def update_recommendation(
    idRecomendacion: int,
    payload: RecomendacionUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("recomendacion.gestionar")),
):
    r = await session.get(Recomendaciones, idRecomendacion)
    if not r:
        raise HTTPException(status_code=404, detail="Recomendacion no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "idCliente" in data and not await session.get(Cliente, data["idCliente"]):
        raise HTTPException(status_code=400, detail="Cliente inexistente")
    if "idProducto" in data and data["idProducto"] is not None and not await session.get(Producto, data["idProducto"]):
        raise HTTPException(status_code=400, detail="Producto inexistente")
    for k, v in data.items():
        setattr(r, k, v)
    await session.commit()
    await session.refresh(r)
    return await _serialize(r, session)


@router.delete("/{idRecomendacion}", status_code=204)
async def delete_recommendation(
    idRecomendacion: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("recomendacion.gestionar")),
):
    r = await session.get(Recomendaciones, idRecomendacion)
    if not r:
        raise HTTPException(status_code=404, detail="Recomendacion no encontrada")
    await session.delete(r)
    await session.commit()
