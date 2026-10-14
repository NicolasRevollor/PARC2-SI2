from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Proveedor
from app.schemas.fase2 import ProveedorIn, ProveedorOut, ProveedorUpdate
from app.security import require_permiso

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[ProveedorOut])
async def list_suppliers(session: AsyncSession = Depends(get_db),
                         _=Depends(require_permiso("producto.listar"))):
    rows = (await session.execute(select(Proveedor).order_by(Proveedor.nombre))).scalars().all()
    return rows


@router.get("/{idProveedor}", response_model=ProveedorOut)
async def get_supplier(idProveedor: int, session: AsyncSession = Depends(get_db),
                       _=Depends(require_permiso("producto.listar"))):
    p = await session.get(Proveedor, idProveedor)
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return p


@router.post("", response_model=ProveedorOut, status_code=201)
async def create_supplier(
    payload: ProveedorIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.crear")),
):
    p = Proveedor(**payload.model_dump())
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return p


@router.put("/{idProveedor}", response_model=ProveedorOut)
async def update_supplier(
    idProveedor: int,
    payload: ProveedorUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.editar")),
):
    p = await session.get(Proveedor, idProveedor)
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await session.commit()
    await session.refresh(p)
    return p


@router.delete("/{idProveedor}", status_code=204)
async def delete_supplier(
    idProveedor: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.eliminar")),
):
    p = await session.get(Proveedor, idProveedor)
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    await session.delete(p)
    await session.commit()
