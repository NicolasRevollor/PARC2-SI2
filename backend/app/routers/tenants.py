"""Organizacion (tenant) y plan de suscripcion vigente (migracion 014).

El frontend consume `GET /api/tenant/me` una sola vez tras el login para
saber que puede mostrar (reportes con IA, modo offline, cuantas sucursales
puede crear). El backend NO confia en ese gating: cada endpoint sensible
vuelve a exigir el flag con `require_feature(...)`.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Plan, Tenant
from app.schemas.tenancy import (
    CambiarPlanIn,
    PlanOut,
    SuscripcionOut,
    TenantMeOut,
    TenantOut,
    UsoTenantOut,
)
from app.security import get_current_payload, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services.suscripciones import abrir_suscripcion, suscripcion_vigente
from app.services.tenancy import cargar_contexto, excesos_para_plan, tenant_actual, uso_actual

router = APIRouter(prefix="/api", tags=["tenant"])


@router.get("/plans", response_model=list[PlanOut])
async def listar_planes(
    session: AsyncSession = Depends(get_db),
    _=Depends(get_current_payload),
):
    """Catalogo de planes. Visible para cualquier usuario autenticado: es lo
    que alimenta la pantalla de comparacion/mejora de plan."""
    planes = (await session.execute(select(Plan).order_by(Plan.orden))).scalars().all()
    return [PlanOut.model_validate(p) for p in planes]


@router.get("/tenant/me", response_model=TenantMeOut)
async def mi_tenant(
    session: AsyncSession = Depends(get_db),
    id_tenant: int = Depends(tenant_actual),
    _=Depends(require_permiso("tenant.ver")),
):
    ctx = await cargar_contexto(session, id_tenant)
    sus = await suscripcion_vigente(session, id_tenant)
    salida = TenantMeOut(
        tenant=TenantOut.model_validate(ctx.tenant),
        plan=PlanOut.model_validate(ctx.plan),
        uso=UsoTenantOut(**await uso_actual(session, id_tenant)),
        suscripcion=SuscripcionOut.model_validate(sus) if sus else None,
    )
    await session.commit()  # persiste una renovacion automatica, si la hubo
    return salida


@router.patch("/tenant/plan", response_model=TenantMeOut)
async def cambiar_plan(
    payload: CambiarPlanIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    id_tenant: int = Depends(tenant_actual),
    auth: dict = Depends(require_permiso("tenant.admin")),
):
    """Cambia el plan del tenant.

    Un downgrade que dejaria al tenant por ENCIMA de los topes del nuevo plan
    se rechaza: bajar de plan no puede dejar sucursales/usuarios/productos
    huerfanos ni volver inconsistente el cupo.
    """
    nuevo = (
        await session.execute(select(Plan).where(Plan.codigo == payload.codigo))
    ).scalar_one_or_none()
    if nuevo is None:
        raise HTTPException(status_code=404, detail=f"El plan '{payload.codigo}' no existe")

    uso = await uso_actual(session, id_tenant)
    excedidos = excesos_para_plan(uso, nuevo)
    if excedidos:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede cambiar al plan {nuevo.nombre}: el uso actual supera sus limites en "
                + ", ".join(excedidos)
            ),
        )

    tenant = await session.get(Tenant, id_tenant)
    if tenant is None:
        raise HTTPException(status_code=404, detail="El tenant no existe")

    anterior = tenant.idPlan
    tenant.idPlan = nuevo.idPlan
    if anterior != nuevo.idPlan:
        await abrir_suscripcion(session, id_tenant, nuevo)
    await registrar_bitacora(
        session,
        f"Cambio de plan del tenant {id_tenant}: {anterior} -> {nuevo.idPlan}",
        int(auth["sub"]),
        request.client.host if request.client else "0.0.0.0",
    )
    await session.commit()

    ctx = await cargar_contexto(session, id_tenant)
    sus = await suscripcion_vigente(session, id_tenant)
    return TenantMeOut(
        tenant=TenantOut.model_validate(ctx.tenant),
        plan=PlanOut.model_validate(ctx.plan),
        uso=UsoTenantOut(**uso),
        suscripcion=SuscripcionOut.model_validate(sus) if sus else None,
    )
