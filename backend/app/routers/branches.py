from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Ciudad, Sucursal
from app.schemas.fase2 import SucursalIn, SucursalOut, SucursalUpdate
from app.security import require_permiso
from app.services.tenancy import ContextoTenant, contexto_actual, exigir_cupo, tenant_actual
from app.services.bitacora import Actor, actor_actual, auditar

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


async def _get_de_mi_tenant(session: AsyncSession, codigoSucursal: int, id_tenant: int) -> Sucursal:
    """Una sucursal de otro tenant se responde 404, no 403: que exista no es
    informacion que deba filtrarse fuera de la organizacion."""
    s = await session.get(Sucursal, codigoSucursal)
    if not s or s.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    return s


@router.get("", response_model=list[SucursalOut])
async def list_branches(session: AsyncSession = Depends(get_db),
                        _=Depends(require_permiso("inventario.ver")),
                        id_tenant: int = Depends(tenant_actual)):
    rows = (
        await session.execute(
            select(Sucursal).where(Sucursal.idTenant == id_tenant).order_by(Sucursal.nombre)
        )
    ).scalars().all()
    return [await _serialize(s, session) for s in rows]


@router.get("/{codigoSucursal}", response_model=SucursalOut)
async def get_branch(codigoSucursal: int, session: AsyncSession = Depends(get_db),
                     _=Depends(require_permiso("inventario.ver")),
                     id_tenant: int = Depends(tenant_actual)):
    s = await _get_de_mi_tenant(session, codigoSucursal, id_tenant)
    return await _serialize(s, session)


@router.post("", response_model=SucursalOut, status_code=201)
async def create_branch(
    payload: SucursalIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("usuario.admin")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    # Cupo del plan ANTES de validar la ciudad: si el tenant ya llego al tope
    # no tiene sentido seguir (402 con el mensaje de mejora de plan).
    await exigir_cupo(session, ctx, "sucursales")
    if not await session.get(Ciudad, payload.idCiudad):
        raise HTTPException(status_code=400, detail="Ciudad inexistente")
    s = Sucursal(**payload.model_dump(), idTenant=ctx.tenant.idTenant)
    session.add(s)
    await auditar(session, actor, f"Sucursal creada: {s.nombre}")
    await session.commit()
    await session.refresh(s)
    return await _serialize(s, session)


@router.put("/{codigoSucursal}", response_model=SucursalOut)
async def update_branch(
    codigoSucursal: int,
    payload: SucursalUpdate,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("usuario.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    s = await _get_de_mi_tenant(session, codigoSucursal, id_tenant)
    data = payload.model_dump(exclude_unset=True)
    if "idCiudad" in data and not await session.get(Ciudad, data["idCiudad"]):
        raise HTTPException(status_code=400, detail="Ciudad inexistente")
    for k, v in data.items():
        setattr(s, k, v)
    await auditar(session, actor, f"Sucursal actualizada: {s.nombre}")
    await session.commit()
    await session.refresh(s)
    return await _serialize(s, session)


@router.delete("/{codigoSucursal}", status_code=204)
async def delete_branch(
    codigoSucursal: int,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("usuario.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    s = await _get_de_mi_tenant(session, codigoSucursal, id_tenant)
    await session.delete(s)
    await auditar(session, actor, f"Sucursal eliminada: {s.nombre}")
    await session.commit()
