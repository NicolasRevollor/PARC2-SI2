"""Suscripcion de cada empresa a su plan (migracion 023).

Una empresa tiene una sola suscripcion vigente (Activa o Suspendida) con su
fecha de inicio y la de vencimiento del periodo mensual en curso; cambiar de
plan cierra la vigente ("Finalizada") y abre otra, asi queda el historial.

No hay cobro real en el sistema: al vencer un periodo de una empresa activa,
la suscripcion se renueva automaticamente por meses completos. La suspension
la decide el administrador de la plataforma (CU22).
"""

import calendar
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Plan, Suscripcion

VIGENTES = ("Activa", "Suspendida")


def sumar_meses(fecha: datetime, meses: int) -> datetime:
    """Mismo dia del mes `meses` despues (el 31 cae en el ultimo dia si no existe)."""
    total = fecha.month - 1 + meses
    anio, mes = fecha.year + total // 12, total % 12 + 1
    return fecha.replace(year=anio, month=mes, day=min(fecha.day, calendar.monthrange(anio, mes)[1]))


async def suscripcion_vigente(session: AsyncSession, id_tenant: int) -> Suscripcion | None:
    sus = (
        await session.execute(
            select(Suscripcion)
            .where(Suscripcion.idTenant == id_tenant, Suscripcion.estado.in_(VIGENTES))
            .order_by(Suscripcion.fechaInicio.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    ahora = datetime.now(timezone.utc)
    if sus is not None and sus.estado == "Activa" and sus.fechaVencimiento <= ahora:
        # Renovacion automatica mensual (no hay pasarela de cobro de planes).
        meses = 1
        while sumar_meses(sus.fechaInicio, meses) <= ahora:
            meses += 1
        sus.fechaVencimiento = sumar_meses(sus.fechaInicio, meses)
    return sus


async def abrir_suscripcion(session: AsyncSession, id_tenant: int, plan: Plan, *, suspendida: bool = False) -> Suscripcion:
    """Alta o cambio de plan: cierra la vigente y abre una nueva desde ahora."""
    ahora = datetime.now(timezone.utc)
    anterior = await suscripcion_vigente(session, id_tenant)
    if anterior is not None:
        anterior.estado = "Finalizada"
        if anterior.fechaInicio < ahora:
            anterior.fechaVencimiento = ahora
    nueva = Suscripcion(
        idTenant=id_tenant,
        idPlan=plan.idPlan,
        fechaInicio=ahora,
        fechaVencimiento=sumar_meses(ahora, 1),
        estado="Suspendida" if suspendida else "Activa",
        precioMensual=plan.precioMensual,
    )
    session.add(nueva)
    await session.flush()
    return nueva


async def reflejar_estado_empresa(session: AsyncSession, id_tenant: int, estado_tenant: str) -> None:
    """Suspender o reactivar la empresa suspende o reactiva su suscripcion."""
    sus = await suscripcion_vigente(session, id_tenant)
    if sus is not None:
        sus.estado = "Activa" if estado_tenant == "Activo" else "Suspendida"
