from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Colecciones, Temporada, TENANT_POR_DEFECTO
from app.schemas.fase2 import ColeccionIn, ColeccionOut, ColeccionUpdate
from app.security import require_permiso
from app.services.tenancy import ContextoTenant, contexto_actual, tenant_actual

router = APIRouter(prefix="/api/collections", tags=["collections"])


async def _serialize(c: Colecciones, session: AsyncSession) -> ColeccionOut:
    t = await session.get(Temporada, c.idTemporada)
    return ColeccionOut(
        idColeccion=c.idColeccion,
        nombre_coleccion=c.nombre_coleccion,
        idTemporada=c.idTemporada,
        temporada_nombre=t.nombreTemporada if t else None,
    )


@router.get("", response_model=list[ColeccionOut])
async def list_collections(idTenant: int | None = None, session: AsyncSession = Depends(get_db)):
    # Endpoint publico (la vitrina lo consume sin token): el tenant llega
    # por query o se asume el por defecto.
    rows = (
        await session.execute(
            select(Colecciones)
            .where(Colecciones.idTenant == (idTenant or TENANT_POR_DEFECTO))
            .order_by(Colecciones.nombre_coleccion)
        )
    ).scalars().all()
    return [await _serialize(c, session) for c in rows]


@router.get("/{idColeccion}", response_model=ColeccionOut)
async def get_collection(idColeccion: int, session: AsyncSession = Depends(get_db)):
    c = await session.get(Colecciones, idColeccion)
    if not c:
        raise HTTPException(status_code=404, detail="Coleccion no encontrada")
    return await _serialize(c, session)


@router.post("", response_model=ColeccionOut, status_code=201)
async def create_collection(
    payload: ColeccionIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.crear")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    if not await session.get(Temporada, payload.idTemporada):
        raise HTTPException(status_code=400, detail="Temporada inexistente")
    c = Colecciones(
        nombre_coleccion=payload.nombre_coleccion,
        idTemporada=payload.idTemporada,
        idTenant=ctx.tenant.idTenant,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return await _serialize(c, session)


@router.put("/{idColeccion}", response_model=ColeccionOut)
async def update_collection(
    idColeccion: int,
    payload: ColeccionUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.editar")),
    id_tenant: int = Depends(tenant_actual),
):
    c = await session.get(Colecciones, idColeccion)
    if not c or c.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Coleccion no encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "idTemporada" in data and not await session.get(Temporada, data["idTemporada"]):
        raise HTTPException(status_code=400, detail="Temporada inexistente")
    for k, v in data.items():
        setattr(c, k, v)
    await session.commit()
    await session.refresh(c)
    return await _serialize(c, session)


@router.delete("/{idColeccion}", status_code=204)
async def delete_collection(
    idColeccion: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.eliminar")),
    id_tenant: int = Depends(tenant_actual),
):
    c = await session.get(Colecciones, idColeccion)
    if not c or c.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Coleccion no encontrada")
    await session.delete(c)
    await session.commit()
