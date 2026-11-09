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

from datetime import datetime, time, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.models import Bitacora, ConfiguracionOperacion, PagoSuscripcion, Plan, Rol, Suscripcion, Tenant, Usuario, TENANT_POR_DEFECTO
from app.schemas.tenancy import (
    ActivacionOut,
    BitacoraEntradaOut,
    BitacoraPaginadaOut,
    CambiarEstadoIn,
    CambiarPlanIn,
    EmpresaCreadaOut,
    EmpresaIn,
    EmpresaOut,
    MotivoIn,
    PagoSuscripcionOut,
    PlanAdminOut,
    PlanIn,
    PlanOut,
    RenovarIn,
    PlanResumenOut,
    RenombrarEmpresaIn,
    ResumenPlataformaOut,
    SuscripcionOut,
    TenantOut,
    UsoTenantOut,
)
from app.security import hash_password, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services import acceso, cuentas, respaldos, suscripciones
from app.services import devoluciones as dv
from app.services import notificaciones as notif
from app.services.horario import HORA_BOLIVIA
from app.services.suscripciones import abrir_suscripcion, suscripcion_actual
from app.services.tenancy import excesos_para_plan, suscripcion_out, tenant_actual, uso_actual

router = APIRouter(prefix="/api/platform", tags=["platform"])

PERMISO = "plataforma.admin"
settings = get_settings()


def _campo(campo: str, mensaje: str) -> dict:
    """Error que el formulario marca en el campo indicado (CU21 alt. 1, CU23 alt. 3)."""
    return {"campo": campo, "mensaje": mensaje}


def _inicio_del_dia(dia) -> datetime:
    return datetime.combine(dia, time(0, 0), tzinfo=HORA_BOLIVIA).astimezone(timezone.utc)


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
    sus = await suscripcion_actual(session, tenant.idTenant)
    return EmpresaOut(
        tenant=TenantOut.model_validate(tenant),
        plan=PlanOut.model_validate(plan),
        uso=UsoTenantOut(**await uso_actual(session, tenant.idTenant)),
        suscripcion=suscripcion_out(sus),
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


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU21] Registrar empresa contratante (tenant)
# Pantalla (boundary) que lo usa: web/src/app/features/platform/platform.component.ts -> crear()
# Control: ControlPlataforma.registrarEmpresa()
# En palabras simples: crea en UNA transaccion la empresa, su suscripcion, su
#   administrador, la politica de devoluciones y la configuracion por defecto, y le
#   manda al administrador el enlace para crear su contrasena.
# ==================================================================
@router.post("/tenants", response_model=EmpresaCreadaOut, status_code=201)
async def crear_empresa(
    payload: EmpresaIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    plan = (await session.execute(select(Plan).where(Plan.codigo == payload.codigoPlan))).scalar_one_or_none()
    if plan is None or not plan.activo:
        raise HTTPException(status_code=404, detail=_campo("codigoPlan", f"El plan '{payload.codigoPlan}' no esta disponible"))

    # Paso 4 y flujo alternativo 1: cada dato repetido se marca en su campo.
    if await session.scalar(select(func.count()).select_from(Tenant).where(Tenant.nit == payload.nit)):
        raise HTTPException(status_code=409, detail=_campo("nit", "Ya existe una empresa con ese NIT"))
    if await session.scalar(select(func.count()).select_from(Tenant).where(Tenant.slug == payload.slug)):
        raise HTTPException(status_code=409, detail=_campo("slug", f"Ya existe una empresa con el identificador '{payload.slug}'"))
    if await session.scalar(
        select(func.count()).select_from(Usuario).where(func.lower(Usuario.correo) == payload.adminCorreo.lower())
    ):
        raise HTTPException(status_code=409, detail=_campo("adminCorreo", "El correo ya esta en uso"))

    rol_admin = await session.scalar(select(Rol.codigoRol).where(Rol.nombreRol == "Administrador"))
    if rol_admin is None:
        raise HTTPException(status_code=500, detail="El rol Administrador no esta configurado en la base")

    # Paso 5: todo en una sola transaccion.
    tenant = Tenant(nombre=payload.nombre, nit=payload.nit, slug=payload.slug, estado="Activo", idPlan=plan.idPlan)
    session.add(tenant)
    await session.flush()
    await abrir_suscripcion(
        session, tenant.idTenant, plan,
        inicio=_inicio_del_dia(payload.fechaInicio), vencimiento=_inicio_del_dia(payload.fechaVencimiento),
    )
    admin = Usuario(
        nombre=payload.adminNombre, correo=payload.adminCorreo, contraseña=cuentas.contrasena_provisional(),
        codigoRol=rol_admin, idTenant=tenant.idTenant, cuentaActivada=False,
    )
    session.add(admin)
    session.add(dv.politica_inicial(tenant.idTenant))
    session.add(ConfiguracionOperacion(idTenant=tenant.idTenant))
    await session.flush()
    await registrar_bitacora(
        session,
        f"Plataforma: alta de la empresa '{payload.nombre}' (tenant {tenant.idTenant}, plan {plan.codigo})"[:150],
        int(auth["sub"]),
        _ip(request),
    )
    await session.commit()
    await session.refresh(tenant)
    # Paso 6 y flujo alternativo 3: si el correo falla, la empresa ya quedo registrada.
    enviado, enlace = await cuentas.enviar_activacion(admin, tenant.nombre)
    return EmpresaCreadaOut(
        empresa=await _empresa_out(session, tenant, plan), correoEnviado=enviado, enlaceActivacion=None if enviado else enlace
    )


@router.post("/tenants/{id_tenant}/activacion", response_model=ActivacionOut)
async def reenviar_activacion(
    id_tenant: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """[CU21] flujo alternativo 3: reenviar la activacion del administrador."""
    tenant, _ = await _tenant_con_plan(session, id_tenant)
    admin = await session.scalar(
        select(Usuario)
        .join(Rol, Rol.codigoRol == Usuario.codigoRol)
        .where(Usuario.idTenant == id_tenant, Rol.nombreRol == "Administrador", Usuario.cuentaActivada.is_(False))
        .order_by(Usuario.idUser)
        .limit(1)
    )
    if admin is None:
        raise HTTPException(status_code=409, detail="El administrador de esta empresa ya activo su cuenta")
    await registrar_bitacora(session, f"Plataforma: reenvio de activacion a {admin.correo}", int(auth["sub"]), _ip(request))
    await session.commit()
    enviado, enlace = await cuentas.enviar_activacion(admin, tenant.nombre)
    return ActivacionOut(correoEnviado=enviado, enlaceActivacion=None if enviado else enlace)


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

    if not nuevo.activo and nuevo.idPlan != tenant.idPlan:
        raise HTTPException(status_code=409, detail=f"El plan {nuevo.nombre} esta desactivado para nuevas contrataciones")
    if tenant.idPlan != nuevo.idPlan:
        await abrir_suscripcion(session, id_tenant, nuevo)
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
    """Atajo anterior al CU22: suspende o reactiva."""
    if payload.estado == "Suspendido":
        await suscripciones.suspender(session, id_tenant, "Suspendida desde la consola")
    else:
        await suscripciones.reactivar(session, id_tenant)
    return await _accion_suscripcion(session, request, auth, id_tenant, f"estado -> {payload.estado}")


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU22] Administrar estado de las suscripciones
# Pantalla (boundary) que lo usa: web/src/app/features/platform/platform-subscriptions.component.ts
# Control: ControlSuscripciones -> services/suscripciones.py
# ==================================================================
async def _accion_suscripcion(session: AsyncSession, request: Request, auth: dict, id_tenant: int, que: str, aviso: tuple[str, str] | None = None) -> EmpresaOut:
    tenant, plan = await _tenant_con_plan(session, id_tenant)
    await registrar_bitacora(session, f"Plataforma: suscripcion de '{tenant.nombre}': {que}"[:150], int(auth["sub"]), _ip(request))
    if aviso:
        # Paso 5: se notifica al administrador de la empresa.
        for id_user in await suscripciones.administradores(session, id_tenant):
            await notif.notificar_usuario(session, id_user, id_tenant, tipo="suscripcion", titulo=aviso[0], mensaje=aviso[1])
    await session.commit()
    acceso.invalidar(id_tenant)
    await session.refresh(tenant)
    return await _empresa_out(session, tenant, plan)


@router.get("/suscripciones", response_model=list[EmpresaOut])
async def listar_suscripciones(
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    """Paso 2: empresas con su plan, fechas y estado (con los vencimientos aplicados)."""
    filas = (
        await session.execute(select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan).order_by(Tenant.idTenant))
    ).all()
    salida = [await _empresa_out(session, t, p) for t, p in filas]
    await session.commit()
    return salida


@router.post("/tenants/{id_tenant}/renovar", response_model=EmpresaOut)
async def renovar_suscripcion(
    id_tenant: int,
    payload: RenovarIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Pasos 3 a 5: pago simulado, nueva fecha de vencimiento y estado "Activa"."""
    pago = await suscripciones.renovar(session, id_tenant, payload.meses, int(auth["sub"]))
    salida = await _accion_suscripcion(
        session, request, auth, id_tenant, f"renovada {payload.meses} mes(es), pago simulado Bs {pago.monto:.2f}",
        ("Su suscripcion fue renovada", f"Queda activa hasta el {pago.vencimientoNuevo:%d/%m/%Y}."),
    )
    notif.programar_correos(background_tasks)
    return salida


@router.post("/tenants/{id_tenant}/suspender", response_model=EmpresaOut)
async def suspender_suscripcion(
    id_tenant: int,
    payload: MotivoIn,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Flujo alternativo 1: con el motivo; sus usuarios ya no pueden operar."""
    await suscripciones.suspender(session, id_tenant, payload.motivo)
    salida = await _accion_suscripcion(
        session, request, auth, id_tenant, f"suspendida ({payload.motivo})",
        ("Su suscripcion fue suspendida", f"Motivo: {payload.motivo}. Contacte al administrador de la plataforma."),
    )
    notif.programar_correos(background_tasks)
    return salida


@router.post("/tenants/{id_tenant}/reactivar", response_model=EmpresaOut)
async def reactivar_suscripcion(
    id_tenant: int,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Flujo alternativo 2."""
    sus = await suscripciones.reactivar(session, id_tenant)
    salida = await _accion_suscripcion(
        session, request, auth, id_tenant, f"reactivada ({sus.estado})",
        ("Su suscripcion fue reactivada", "Ya puede volver a operar."),
    )
    notif.programar_correos(background_tasks)
    return salida


@router.post("/tenants/{id_tenant}/cancelar", response_model=EmpresaOut)
async def cancelar_suscripcion(
    id_tenant: int,
    payload: MotivoIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    await suscripciones.cancelar(session, id_tenant, payload.motivo)
    return await _accion_suscripcion(session, request, auth, id_tenant, f"cancelada ({payload.motivo})")


@router.get("/tenants/{id_tenant}/pagos", response_model=list[PagoSuscripcionOut])
async def pagos_suscripcion(
    id_tenant: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    filas = (
        await session.execute(
            select(PagoSuscripcion).where(PagoSuscripcion.idTenant == id_tenant).order_by(PagoSuscripcion.fecha.desc())
        )
    ).scalars().all()
    return [PagoSuscripcionOut.model_validate(p) for p in filas]


@router.post("/suscripciones/revisar")
async def revisar_ahora(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Flujo alternativo 3 a pedido (lo mismo que hace el cron cada dia)."""
    resumen = await suscripciones.revisar_vencimientos(session)
    await registrar_bitacora(session, f"Plataforma: revision de vencimientos {resumen}"[:150], int(auth["sub"]), _ip(request))
    await session.commit()
    acceso.invalidar()
    notif.programar_correos(background_tasks)
    return resumen


@router.post("/suscripciones/cron")
async def revisar_por_cron(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    x_backup_secret: str | None = Header(default=None),
):
    """Flujo alternativo 3: lo llama GitHub Actions cada dia con el mismo secreto que los respaldos."""
    if not settings.BACKUP_CRON_SECRET:
        raise HTTPException(status_code=503, detail="El cron no esta configurado (BACKUP_CRON_SECRET)")
    if not respaldos.secreto_valido(x_backup_secret, settings.BACKUP_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Secreto invalido")
    resumen = await suscripciones.revisar_vencimientos(session)
    await session.commit()
    acceso.invalidar()
    notif.programar_correos(background_tasks)
    return resumen


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU23] Configurar planes de suscripcion
# Pantalla (boundary) que lo usa: web/src/app/features/platform/platform-plans.component.ts
# Control: ControlPlanes
# ==================================================================
async def _plan_admin_out(session: AsyncSession, plan: Plan) -> PlanAdminOut:
    tenants = (await session.execute(select(Tenant).where(Tenant.idPlan == plan.idPlan).order_by(Tenant.nombre))).scalars().all()
    excedidas = []
    for t in tenants:
        if excesos_para_plan(await uso_actual(session, t.idTenant), plan):
            excedidas.append(t.nombre)
    return PlanAdminOut(**PlanOut.model_validate(plan).model_dump(), empresas=len(tenants), empresasExcedidas=excedidas)


@router.get("/planes", response_model=list[PlanAdminOut])
async def listar_planes_admin(
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    planes = (await session.execute(select(Plan).order_by(Plan.orden, Plan.idPlan))).scalars().all()
    return [await _plan_admin_out(session, p) for p in planes]


@router.post("/planes", response_model=PlanAdminOut, status_code=201)
async def crear_plan(
    payload: PlanIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    # Flujo alternativo 3.
    if await session.scalar(select(func.count()).select_from(Plan).where(Plan.codigo == payload.codigo)):
        raise HTTPException(status_code=409, detail=_campo("codigo", "Ya existe un plan con ese codigo"))
    plan = Plan(**payload.model_dump())
    session.add(plan)
    await session.flush()
    await registrar_bitacora(session, f"Plataforma: plan creado {plan.codigo}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _plan_admin_out(session, plan)


@router.put("/planes/{id_plan}", response_model=PlanAdminOut)
async def editar_plan(
    id_plan: int,
    payload: PlanIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    plan = await session.get(Plan, id_plan)
    if plan is None:
        raise HTTPException(status_code=404, detail="El plan no existe")
    if payload.codigo != plan.codigo and await session.scalar(
        select(func.count()).select_from(Plan).where(Plan.codigo == payload.codigo)
    ):
        raise HTTPException(status_code=409, detail=_campo("codigo", "Ya existe un plan con ese codigo"))
    for campo, valor in payload.model_dump().items():
        setattr(plan, campo, valor)
    # Las suscripciones vigentes conservan el precio con que se contrataron.
    await registrar_bitacora(session, f"Plataforma: plan {plan.codigo} actualizado", int(auth["sub"]), _ip(request))
    await session.commit()
    acceso.invalidar()
    return await _plan_admin_out(session, plan)


@router.delete("/planes/{id_plan}", status_code=204)
async def eliminar_plan(
    id_plan: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """Flujo alternativo 2: con empresas no se borra, se desactiva."""
    plan = await session.get(Plan, id_plan)
    if plan is None:
        raise HTTPException(status_code=404, detail="El plan no existe")
    usado = await session.scalar(select(func.count()).select_from(Tenant).where(Tenant.idPlan == id_plan))
    historial = await session.scalar(select(func.count()).select_from(Suscripcion).where(Suscripcion.idPlan == id_plan))
    if usado or historial:
        raise HTTPException(status_code=409, detail="El plan tiene empresas asociadas: desactivelo para nuevas contrataciones")
    await session.delete(plan)
    await registrar_bitacora(session, f"Plataforma: plan {plan.codigo} eliminado", int(auth["sub"]), _ip(request))
    await session.commit()
