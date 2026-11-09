# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU22] Administrar estado de las suscripciones
# Control del diagrama: ControlSuscripciones
# Pantalla (boundary) que lo usa: web/src/app/features/platform/platform-subscriptions.component.ts
# En palabras simples: la suscripcion pasa sola de "Activa" a "En periodo de gracia"
#   al vencer, y a "Suspendida" cuando termina la gracia. El Administrador de
#   plataforma la renueva (con un pago simulado), la suspende o la reactiva.
# ==================================================================
"""Ciclo de vida de la suscripcion de cada empresa (migraciones 023 y 027).

Estados guardados: Activa, Gracia, Suspendida, Cancelada y Finalizada (la que
reemplazo un cambio de plan). "Por vencer" no se guarda: es una Activa a la que
le quedan DIAS_AVISO dias o menos.

Antes la suscripcion se renovaba sola al vencer. El CU22 pide lo contrario: la
renovacion la registra el Administrador de plataforma.
"""

import calendar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PagoSuscripcion, Plan, Rol, Suscripcion, Tenant, Usuario, TENANT_POR_DEFECTO

VIGENTES = ("Activa", "Gracia", "Suspendida")
DIAS_GRACIA = 7
DIAS_AVISO = 7
ETIQUETAS = {
    "Activa": "Activa",
    "PorVencer": "Por vencer",
    "Gracia": "En periodo de gracia",
    "Suspendida": "Suspendida",
    "Cancelada": "Cancelada",
}


def ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def sumar_meses(fecha: datetime, meses: int) -> datetime:
    """Mismo dia del mes `meses` despues (el 31 cae en el ultimo dia si no existe)."""
    total = fecha.month - 1 + meses
    anio, mes = fecha.year + total // 12, total % 12 + 1
    return fecha.replace(year=anio, month=mes, day=min(fecha.day, calendar.monthrange(anio, mes)[1]))


# ==== [CU22] Flujo alternativo 3 ===================================
# En palabras simples: al vencer pasa a gracia (solo consulta) y al terminar la
# gracia, a suspendida. Funcion pura: se prueba sin base de datos.
# ===================================================================
def estado_por_fecha(estado: str, vencimiento: datetime, ahora: datetime, dias_gracia: int = DIAS_GRACIA) -> str:
    if estado == "Activa" and ahora >= vencimiento:
        estado = "Gracia"
    if estado == "Gracia" and ahora >= vencimiento + timedelta(days=dias_gracia):
        estado = "Suspendida"
    return estado


def clave_visible(estado: str, vencimiento: datetime, ahora: datetime) -> str:
    """Estado que se muestra (CU22 paso 2): agrega "Por vencer"."""
    if estado == "Activa" and vencimiento - ahora <= timedelta(days=DIAS_AVISO):
        return "PorVencer"
    return estado


@dataclass(frozen=True)
class EstadoSuscripcion:
    clave: str
    etiqueta: str
    dias_restantes: int
    fin_gracia: datetime


def describir(sus: Suscripcion, ahora: datetime | None = None) -> EstadoSuscripcion:
    ahora = ahora or ahora_utc()
    clave = clave_visible(sus.estado, sus.fechaVencimiento, ahora)
    return EstadoSuscripcion(
        clave=clave,
        etiqueta=ETIQUETAS.get(clave, sus.estado),
        dias_restantes=(sus.fechaVencimiento - ahora).days,
        fin_gracia=sus.fechaVencimiento + timedelta(days=DIAS_GRACIA),
    )


def _estado_empresa(estado_suscripcion: str) -> str:
    """En gracia la empresa sigue entrando (solo consulta); suspendida o cancelada, no."""
    return "Activo" if estado_suscripcion in ("Activa", "Gracia") else "Suspendido"


async def _aplicar_vencimiento(session: AsyncSession, sus: Suscripcion, ahora: datetime) -> bool:
    if sus.idTenant == TENANT_POR_DEFECTO:
        return False  # la empresa operadora de la plataforma no vence
    nuevo = estado_por_fecha(sus.estado, sus.fechaVencimiento, ahora)
    if nuevo == sus.estado:
        return False
    sus.estado = nuevo
    if nuevo == "Suspendida":
        # La suspension ocurrio al terminar la gracia, no cuando alguien la noto:
        # el CU17 acepta lo vendido sin conexion antes de esa hora.
        sus.fechaSuspension = sus.fechaVencimiento + timedelta(days=DIAS_GRACIA)
        sus.motivoSuspension = "Vencimiento sin renovacion"
    tenant = await session.get(Tenant, sus.idTenant)
    if tenant is not None:
        tenant.estado = _estado_empresa(nuevo)
    return True


async def suscripcion_vigente(session: AsyncSession, id_tenant: int) -> Suscripcion | None:
    """La vigente, con los vencimientos ya aplicados (el llamador hace commit)."""
    sus = (
        await session.execute(
            select(Suscripcion)
            .where(Suscripcion.idTenant == id_tenant, Suscripcion.estado.in_(VIGENTES))
            .order_by(Suscripcion.fechaInicio.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if sus is not None:
        await _aplicar_vencimiento(session, sus, ahora_utc())
    return sus


async def suscripcion_actual(session: AsyncSession, id_tenant: int) -> Suscripcion | None:
    """[CU22] La que se muestra: la vigente o, si no hay, la ultima cancelada.

    Una cancelada deja de ser vigente, pero tiene que seguir apareciendo (filtro
    "Canceladas" de la consola) y el control de acceso debe verla como cancelada."""
    sus = await suscripcion_vigente(session, id_tenant)
    if sus is not None:
        return sus
    return (
        await session.execute(
            select(Suscripcion)
            .where(Suscripcion.idTenant == id_tenant, Suscripcion.estado == "Cancelada")
            .order_by(Suscripcion.fechaInicio.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def abrir_suscripcion(
    session: AsyncSession,
    id_tenant: int,
    plan: Plan,
    *,
    suspendida: bool = False,
    inicio: datetime | None = None,
    vencimiento: datetime | None = None,
) -> Suscripcion:
    """Alta (CU21) o cambio de plan: cierra la vigente y abre otra.

    En un cambio de plan se conserva el vencimiento: cambiar de plan no es renovar."""
    ahora = ahora_utc()
    anterior = await suscripcion_vigente(session, id_tenant)
    if anterior is not None:
        if anterior.estado != "Activa":
            raise HTTPException(
                status_code=409,
                detail=f"La suscripcion esta {ETIQUETAS.get(anterior.estado, anterior.estado)}: renuevela antes de cambiar de plan",
            )
        vencimiento = vencimiento or anterior.fechaVencimiento
        anterior.estado = "Finalizada"
        if anterior.fechaInicio < ahora:
            anterior.fechaVencimiento = ahora
        await session.flush()
    inicio = inicio or ahora
    nueva = Suscripcion(
        idTenant=id_tenant,
        idPlan=plan.idPlan,
        fechaInicio=inicio,
        fechaVencimiento=vencimiento or sumar_meses(inicio, 1),
        estado="Suspendida" if suspendida else "Activa",
        precioMensual=plan.precioMensual,
    )
    session.add(nueva)
    await session.flush()
    return nueva


async def _vigente_o_404(session: AsyncSession, id_tenant: int) -> Suscripcion:
    sus = await suscripcion_vigente(session, id_tenant)
    if sus is None:
        raise HTTPException(status_code=404, detail="La empresa no tiene una suscripcion vigente")
    return sus


# ==== [CU22] Pasos 3 a 5: renovar con pago simulado ================
# ===================================================================
async def renovar(session: AsyncSession, id_tenant: int, meses: int, id_usuario: int) -> PagoSuscripcion:
    ahora = ahora_utc()
    sus = await suscripcion_vigente(session, id_tenant)
    if sus is None:
        # Una cancelada se vuelve a contratar con su plan actual, desde hoy y por
        # los meses pagados (antes sumaba un mes de regalo).
        tenant = await session.get(Tenant, id_tenant)
        plan = await session.get(Plan, tenant.idPlan)
        sus = await abrir_suscripcion(session, id_tenant, plan, inicio=ahora, vencimiento=sumar_meses(ahora, meses))
        anterior = ahora
    else:
        anterior = sus.fechaVencimiento
        # Si ya vencio, el periodo nuevo corre desde hoy; si no, se suma al que queda.
        sus.fechaVencimiento = sumar_meses(max(anterior, ahora), meses)
    sus.estado = "Activa"
    sus.fechaSuspension = None
    sus.motivoSuspension = None
    tenant = await session.get(Tenant, id_tenant)
    tenant.estado = "Activo"
    pago = PagoSuscripcion(
        idSuscripcion=sus.idSuscripcion, idTenant=id_tenant, meses=meses, monto=float(sus.precioMensual) * meses,
        vencimientoAnterior=anterior, vencimientoNuevo=sus.fechaVencimiento, fecha=ahora, idUsuario=id_usuario,
    )
    session.add(pago)
    await session.flush()
    return pago


async def suspender(session: AsyncSession, id_tenant: int, motivo: str) -> Suscripcion:
    """[CU22] flujo alternativo 1: los usuarios de esa empresa ya no pueden operar."""
    if id_tenant == TENANT_POR_DEFECTO:
        raise HTTPException(status_code=409, detail="No se puede suspender la empresa operadora de la plataforma")
    sus = await _vigente_o_404(session, id_tenant)
    sus.estado = "Suspendida"
    sus.fechaSuspension = ahora_utc()
    sus.motivoSuspension = motivo[:255]
    (await session.get(Tenant, id_tenant)).estado = "Suspendido"
    return sus


async def reactivar(session: AsyncSession, id_tenant: int) -> Suscripcion:
    """[CU22] flujo alternativo 2. Si el periodo ya vencio, vuelve a la gracia
    (no se regala un mes): para que quede activa hay que renovarla."""
    sus = await _vigente_o_404(session, id_tenant)
    if sus.estado != "Suspendida":
        raise HTTPException(status_code=409, detail="La suscripcion no esta suspendida")
    sus.estado = "Activa"
    sus.fechaSuspension = None
    sus.motivoSuspension = None
    nuevo = estado_por_fecha("Activa", sus.fechaVencimiento, ahora_utc())
    if nuevo == "Suspendida":
        raise HTTPException(status_code=409, detail="El periodo y la gracia ya vencieron: renueve la suscripcion para reactivarla")
    sus.estado = nuevo
    (await session.get(Tenant, id_tenant)).estado = "Activo"
    return sus


async def cancelar(session: AsyncSession, id_tenant: int, motivo: str) -> Suscripcion:
    if id_tenant == TENANT_POR_DEFECTO:
        raise HTTPException(status_code=409, detail="No se puede cancelar la empresa operadora de la plataforma")
    sus = await _vigente_o_404(session, id_tenant)
    sus.estado = "Cancelada"
    sus.fechaSuspension = sus.fechaSuspension or ahora_utc()
    sus.motivoSuspension = motivo[:255]
    (await session.get(Tenant, id_tenant)).estado = "Suspendido"
    return sus


async def administradores(session: AsyncSession, id_tenant: int) -> list[int]:
    return list(
        (
            await session.execute(
                select(Usuario.idUser)
                .join(Rol, Rol.codigoRol == Usuario.codigoRol)
                .where(Usuario.idTenant == id_tenant, Rol.nombreRol == "Administrador", Usuario.activo.is_(True))
            )
        ).scalars()
    )


# ==== [CU22] Flujo alternativo 3: revision diaria ==================
# La llama el cron externo (GitHub Actions) una vez por dia, o el boton de la consola.
# ===================================================================
async def revisar_vencimientos(session: AsyncSession) -> dict:
    from app.services import notificaciones as notif

    ahora = ahora_utc()
    vigentes = (await session.execute(select(Suscripcion).where(Suscripcion.estado.in_(VIGENTES)))).scalars().all()
    resumen = {"porVencer": 0, "enGracia": 0, "suspendidas": 0}
    for sus in vigentes:
        antes = sus.estado
        await _aplicar_vencimiento(session, sus, ahora)
        info = describir(sus, ahora)
        mensaje = None
        if info.clave == "PorVencer":
            resumen["porVencer"] += 1
            mensaje = (f"Su suscripcion vence en {max(info.dias_restantes, 0)} dia(s)",
                       f"Vence el {sus.fechaVencimiento:%d/%m/%Y}. Contacte al administrador de la plataforma para renovarla.")
        elif sus.estado == "Gracia":
            resumen["enGracia"] += 1
            if antes != "Gracia":
                mensaje = ("Su suscripcion vencio: periodo de gracia",
                           f"Hasta el {info.fin_gracia:%d/%m/%Y} solo podra consultar. Renueve para seguir operando.")
        elif sus.estado == "Suspendida" and antes != "Suspendida":
            resumen["suspendidas"] += 1
            mensaje = ("Su suscripcion fue suspendida", "Termino el periodo de gracia sin renovacion.")
        if mensaje is None:
            continue
        # Un aviso por dia y por estado: si el cron corre dos veces no se repite.
        referencia = f"sus-{sus.idSuscripcion}-{info.clave}-{ahora:%Y%m%d}"
        ya = await session.scalar(select(notif.Notificacion.idNotificacion).where(notif.Notificacion.referencia == referencia).limit(1))
        if ya is None:
            for id_user in await administradores(session, sus.idTenant):
                await notif.notificar_usuario(session, id_user, sus.idTenant, tipo="suscripcion", titulo=mensaje[0], mensaje=mensaje[1], referencia=referencia)
    return resumen
