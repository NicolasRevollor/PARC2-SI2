"""Consola de plataforma del SaaS (superadministrador, migracion 016).

A diferencia de `tenants.py` (cada administrador ve y gestiona SOLO su propia
empresa), estos endpoints cruzan la frontera entre tenants a proposito: el
operador de la plataforma necesita ver todas las empresas suscritas, darlas de
alta, cambiarles el plan y suspenderlas por falta de pago.

Por eso todo el router exige "plataforma.admin", un permiso que solo tiene el
rol Superadministrador. Ningun Administrador de empresa lo recibe.
"""

from datetime import date
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Bitacora, Plan, Rol, Tenant, Usuario, TENANT_POR_DEFECTO
from app.schemas.tenancy import (
    BitacoraEntradaOut,
    BitacoraPaginadaOut,
    CambiarEstadoIn,
    CambiarPlanIn,
    EmpresaIn,
    EmpresaOut,
    PlanOut,
    PlanResumenOut,
    RenombrarEmpresaIn,
    ResumenPlataformaOut,
    SuscripcionOut,
    TenantOut,
    UsoTenantOut,
)
from app.security import hash_password, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services.suscripciones import abrir_suscripcion, reflejar_estado_empresa, suscripcion_vigente
from app.services.tenancy import excesos_para_plan, tenant_actual, uso_actual

router = APIRouter(prefix="/api/platform", tags=["platform"])

PERMISO = "plataforma.admin"


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


async def _correo_admin(session: AsyncSession, id_tenant: int) -> str | None:
    """Correo del primer Administrador dado de alta en el tenant."""
    return await session.scalar(
        select(Usuario.correo)
        .join(Rol, Rol.codigoRol == Usuario.codigoRol)
        .where(Usuario.idTenant == id_tenant, Rol.nombreRol == "Administrador")
        .order_by(Usuario.idUser)
        .limit(1)
    )


async def _empresa_out(session: AsyncSession, tenant: Tenant, plan: Plan) -> EmpresaOut:
    sus = await suscripcion_vigente(session, tenant.idTenant)
    return EmpresaOut(
        tenant=TenantOut.model_validate(tenant),
        plan=PlanOut.model_validate(plan),
        uso=UsoTenantOut(**await uso_actual(session, tenant.idTenant)),
        suscripcion=SuscripcionOut.model_validate(sus) if sus else None,
        adminCorreo=await _correo_admin(session, tenant.idTenant),
    )


async def _tenant_con_plan(session: AsyncSession, id_tenant: int) -> tuple[Tenant, Plan]:
    fila = (
        await session.execute(
            select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan).where(Tenant.idTenant == id_tenant)
        )
    ).first()
    if fila is None:
        raise HTTPException(status_code=404, detail="La empresa no existe")
    return fila[0], fila[1]


@router.get("/resumen", response_model=ResumenPlataformaOut)
async def resumen(
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    filas = (
        await session.execute(select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan))
    ).all()
    activas = [(t, p) for t, p in filas if t.estado == "Activo"]

    planes = (await session.execute(select(Plan).order_by(Plan.orden))).scalars().all()
    por_plan = [
        PlanResumenOut(
            codigo=p.codigo,
            nombre=p.nombre,
            empresas=sum(1 for _, plan in filas if plan.idPlan == p.idPlan),
        )
        for p in planes
    ]

    return ResumenPlataformaOut(
        totalEmpresas=len(filas),
        activas=len(activas),
        suspendidas=len(filas) - len(activas),
        ingresoMensual=float(sum(p.precioMensual for _, p in activas)),
        porPlan=por_plan,
    )


@router.get("/tenants", response_model=list[EmpresaOut])
async def listar_empresas(
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    filas = (
        await session.execute(
            select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan).order_by(Tenant.idTenant)
        )
    ).all()
    return [await _empresa_out(session, t, p) for t, p in filas]


@router.post("/tenants", response_model=EmpresaOut, status_code=201)
async def crear_empresa(
    payload: EmpresaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Alta de una empresa con su administrador inicial, en una sola transaccion:
    una empresa sin nadie que pueda entrar a operarla no sirve."""
    plan = (
        await session.execute(select(Plan).where(Plan.codigo == payload.codigoPlan))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=404, detail=f"El plan '{payload.codigoPlan}' no existe")

    if await session.scalar(select(func.count()).select_from(Tenant).where(Tenant.slug == payload.slug)):
        raise HTTPException(status_code=409, detail=f"Ya existe una empresa con el identificador '{payload.slug}'")
    if await session.scalar(
        select(func.count()).select_from(Usuario).where(func.lower(Usuario.correo) == payload.adminCorreo.lower())
    ):
        raise HTTPException(status_code=409, detail="El correo del administrador ya esta registrado")

    rol_admin = await session.scalar(select(Rol.codigoRol).where(Rol.nombreRol == "Administrador"))
    if rol_admin is None:
        raise HTTPException(status_code=500, detail="El rol Administrador no esta configurado en la base")

    tenant = Tenant(nombre=payload.nombre, slug=payload.slug, estado="Activo", idPlan=plan.idPlan)
    session.add(tenant)
    await session.flush()
    await abrir_suscripcion(session, tenant.idTenant, plan)

    session.add(
        Usuario(
            nombre=payload.adminNombre,
            correo=payload.adminCorreo,
            contraseña=hash_password(payload.adminPassword),
            codigoRol=rol_admin,
            idTenant=tenant.idTenant,
        )
    )
    await registrar_bitacora(
        session,
        f"Plataforma: alta de la empresa '{payload.nombre}' (tenant {tenant.idTenant}, plan {plan.codigo})",
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    await session.refresh(tenant)
    return await _empresa_out(session, tenant, plan)


@router.patch("/tenants/{id_tenant}", response_model=EmpresaOut)
async def renombrar_empresa(
    id_tenant: int,
    payload: RenombrarEmpresaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Cambia el nombre visible de la empresa. El identificador (slug) NO
    cambia: es estable a proposito, porque puede estar en enlaces o
    integraciones de la empresa."""
    tenant, plan = await _tenant_con_plan(session, id_tenant)
    anterior = tenant.nombre
    if payload.nombre == anterior:
        return await _empresa_out(session, tenant, plan)

    tenant.nombre = payload.nombre
    await registrar_bitacora(
        session,
        f"Plataforma: empresa {id_tenant} renombrada '{anterior}' -> '{payload.nombre}'"[:150],
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    await session.refresh(tenant)
    return await _empresa_out(session, tenant, plan)


@router.get("/bitacora", response_model=BitacoraPaginadaOut)
async def bitacora_global(
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=100),
    idTenant: int | None = None,
    q: str | None = Query(None, max_length=100, description="Busca en la accion, el nombre o el correo del usuario"),
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    """Bitacora de TODAS las empresas, de la mas reciente a la mas antigua.

    La tabla Bitacora no guarda la empresa: se obtiene por el usuario que hizo
    la accion (Bitacora -> Usuario.idTenant -> tenant).
    """
    filtros = []
    if idTenant is not None:
        filtros.append(Usuario.idTenant == idTenant)
    if q:
        patron = f"%{q.strip()}%"
        filtros.append(or_(Bitacora.accion.ilike(patron), Usuario.nombre.ilike(patron), Usuario.correo.ilike(patron)))
    if fecha_desde is not None:
        filtros.append(Bitacora.fecha >= fecha_desde)
    if fecha_hasta is not None:
        filtros.append(Bitacora.fecha <= fecha_hasta)

    base = (
        select(Bitacora, Usuario, Tenant)
        .join(Usuario, Usuario.idUser == Bitacora.idUser)
        .join(Tenant, Tenant.idTenant == Usuario.idTenant)
        .where(*filtros)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    filas = (
        await session.execute(
            base.order_by(Bitacora.fecha.desc(), Bitacora.hora.desc(), Bitacora.idBitacora.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()

    return BitacoraPaginadaOut(
        items=[
            BitacoraEntradaOut(
                idBitacora=b.idBitacora,
                fecha=b.fecha.isoformat(),
                hora=b.hora.strftime("%H:%M:%S"),
                accion=b.accion,
                ip=str(b.ip),
                idUser=u.idUser,
                usuarioNombre=u.nombre,
                usuarioCorreo=u.correo,
                idTenant=t.idTenant,
                empresa=t.nombre,
            )
            for b, u, t in filas
        ],
        total=total,
        page=page,
        size=size,
        pages=ceil(total / size) if total else 0,
    )


@router.patch("/tenants/{id_tenant}/plan", response_model=EmpresaOut)
async def cambiar_plan_empresa(
    id_tenant: int,
    payload: CambiarPlanIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    tenant, plan_actual = await _tenant_con_plan(session, id_tenant)
    nuevo = (
        await session.execute(select(Plan).where(Plan.codigo == payload.codigo))
    ).scalar_one_or_none()
    if nuevo is None:
        raise HTTPException(status_code=404, detail=f"El plan '{payload.codigo}' no existe")

    # Misma regla que aplica el admin de la empresa: bajar de plan no puede
    # dejar recursos por encima del nuevo cupo.
    excesos = excesos_para_plan(await uso_actual(session, id_tenant), nuevo)
    if excesos:
        raise HTTPException(
            status_code=409,
            detail=(
                f"'{tenant.nombre}' no cabe en el plan {nuevo.nombre}: supera sus limites en "
                + ", ".join(excesos)
            ),
        )

    if tenant.idPlan != nuevo.idPlan:
        await abrir_suscripcion(session, id_tenant, nuevo, suspendida=tenant.estado != "Activo")
    tenant.idPlan = nuevo.idPlan
    await registrar_bitacora(
        session,
        f"Plataforma: plan de '{tenant.nombre}' {plan_actual.codigo} -> {nuevo.codigo}",
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    await session.refresh(tenant)
    return await _empresa_out(session, tenant, nuevo)


@router.patch("/tenants/{id_tenant}/estado", response_model=EmpresaOut)
async def cambiar_estado_empresa(
    id_tenant: int,
    payload: CambiarEstadoIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Activa o suspende una empresa. Suspendida, sus usuarios no pueden
    iniciar sesion (ver auth.py::login)."""
    tenant, plan = await _tenant_con_plan(session, id_tenant)

    # El tenant del operador no se puede suspender: el superadmin quedaria
    # bloqueado fuera de la plataforma sin nadie que pueda reactivarlo.
    if payload.estado == "Suspendido" and id_tenant in (TENANT_POR_DEFECTO, tenant_actual(auth)):
        raise HTTPException(status_code=409, detail="No se puede suspender la empresa operadora de la plataforma")

    anterior = tenant.estado
    tenant.estado = payload.estado
    await reflejar_estado_empresa(session, id_tenant, payload.estado)
    await registrar_bitacora(
        session,
        f"Plataforma: estado de '{tenant.nombre}' {anterior} -> {payload.estado}",
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    await session.refresh(tenant)
    return await _empresa_out(session, tenant, plan)
