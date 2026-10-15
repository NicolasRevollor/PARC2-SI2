from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Proveedor
from app.schemas.fase2 import ProveedorIn, ProveedorOut, ProveedorUpdate
from app.security import require_permiso
from app.services.tenancy import ContextoTenant, contexto_actual, tenant_actual

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


async def _get_de_mi_tenant(session: AsyncSession, idProveedor: int, id_tenant: int) -> Proveedor:
    p = await session.get(Proveedor, idProveedor)
    if not p or p.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return p


@router.get("", response_model=list[ProveedorOut])
async def list_suppliers(session: AsyncSession = Depends(get_db),
                         _=Depends(require_permiso("producto.listar")),
                         id_tenant: int = Depends(tenant_actual)):
    rows = (
        await session.execute(
            select(Proveedor).where(Proveedor.idTenant == id_tenant).order_by(Proveedor.nombre)
        )
    ).scalars().all()
    return rows


@router.get("/{idProveedor}", response_model=ProveedorOut)
async def get_supplier(idProveedor: int, session: AsyncSession = Depends(get_db),
                       _=Depends(require_permiso("producto.listar")),
                       id_tenant: int = Depends(tenant_actual)):
    return await _get_de_mi_tenant(session, idProveedor, id_tenant)


@router.post("", response_model=ProveedorOut, status_code=201)
async def create_supplier(
    payload: ProveedorIn,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.crear")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    p = Proveedor(**payload.model_dump(), idTenant=ctx.tenant.idTenant)
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
    id_tenant: int = Depends(tenant_actual),
):
    p = await _get_de_mi_tenant(session, idProveedor, id_tenant)
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
    id_tenant: int = Depends(tenant_actual),
):
    p = await _get_de_mi_tenant(session, idProveedor, id_tenant)
    await session.delete(p)
    await session.commit()
