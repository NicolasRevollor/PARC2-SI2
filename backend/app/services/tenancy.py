"""Multitenencia y planes de suscripcion (migracion 014).

Estrategia: base de datos compartida, esquema compartido, columna
discriminante "idTenant" en las entidades raiz (Usuario, Sucursal, producto,
Proveedor, Temporada, Colecciones). Las entidades hoja heredan el tenant por
su FK (Inventario -> Sucursal, Venta -> Cliente -> Usuario, ...).

El tenant viaja como claim "tenant" dentro del JWT (lo emite
services/usuarios.py::build_user_claims). Los tokens emitidos ANTES de esta
migracion no traen el claim: `tenant_actual()` cae a TENANT_POR_DEFECTO (1),
que es exactamente el tenant al que la migracion asigno todas las filas
preexistentes — ningun token viejo queda invalidado.

Nunca se acepta el tenant desde el body/query de la request: eso permitiria a
un usuario de un tenant leer datos de otro simplemente cambiando un numero.
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Plan, Producto, Rol, Sucursal, Tenant, Usuario, TENANT_POR_DEFECTO
from app.security import get_current_payload

# Valor centinela de los limites del plan: -1 == sin tope.
ILIMITADO = -1

# Recursos con cupo por plan: nombre -> (columna limite del plan, modelo).
RECURSOS_CON_CUPO = {
    "sucursales": ("maxSucursales", Sucursal),
    "usuarios": ("maxUsuarios", Usuario),
    "productos": ("maxProductos", Producto),
}

# Flags booleanos del plan que habilitan funcionalidades completas.
FLAGS_PLAN = ("permiteIA", "permiteOffline", "permiteMultiSucursal")


@dataclass(frozen=True)
class ContextoTenant:
    """Tenant resuelto del JWT junto con su plan vigente."""

    tenant: Tenant
    plan: Plan

    def permite(self, flag: str) -> bool:
        return bool(getattr(self.plan, flag, False))


def _tenant_de_payload(payload: dict) -> int:
    valor = payload.get("tenant")
    try:
        return int(valor) if valor is not None else TENANT_POR_DEFECTO
    except (TypeError, ValueError):
        return TENANT_POR_DEFECTO


def tenant_actual(payload: dict = Depends(get_current_payload)) -> int:
    """idTenant del JWT. Cae al tenant 1 para tokens previos a la migracion 014."""
    return _tenant_de_payload(payload)


def resolver_tenant_publico(id_tenant_query: int | None, payload: dict | None) -> int:
    """Tenant de un endpoint publico (catalogo, sucursales, temporadas...).

    Prioridad: el `idTenant` explicito del query (la vitrina de una empresa),
    luego el tenant del JWT si hay sesion (asi el staff de la empresa 2 ve SU
    catalogo y no el de la empresa 1), y por ultimo el tenant por defecto.
    """
    if id_tenant_query is not None:
        return id_tenant_query
    if payload is not None:
        return _tenant_de_payload(payload)
    return TENANT_POR_DEFECTO


async def cargar_contexto(session: AsyncSession, id_tenant: int) -> ContextoTenant:
    fila = (
        await session.execute(
            select(Tenant, Plan).join(Plan, Plan.idPlan == Tenant.idPlan).where(Tenant.idTenant == id_tenant)
        )
    ).first()
    if fila is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El tenant no existe")

    tenant, plan = fila
    if tenant.estado != "Activo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La suscripcion de esta organizacion no esta activa",
        )
    return ContextoTenant(tenant=tenant, plan=plan)


async def contexto_actual(
    session: AsyncSession = Depends(get_db),
    id_tenant: int = Depends(tenant_actual),
) -> ContextoTenant:
    """Dependencia FastAPI: contexto (tenant + plan) del usuario autenticado."""
    return await cargar_contexto(session, id_tenant)


def require_feature(flag: str):
    """Dependencia que exige que el plan del tenant habilite `flag`.

    Se usa junto con `require_permiso(...)`, no en su lugar: el permiso dice
    QUE PUEDE HACER el rol, el plan dice QUE INCLUYE LA SUSCRIPCION. Un
    administrador con permiso de reportes pero en plan Basico no accede a los
    reportes con IA.
    """
    if flag not in FLAGS_PLAN:
        raise ValueError(f"Flag de plan desconocido: {flag}")

    async def dependency(ctx: ContextoTenant = Depends(contexto_actual)) -> ContextoTenant:
        if not ctx.permite(flag):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"El plan {ctx.plan.nombre} no incluye esta funcionalidad. "
                    "Actualiza tu suscripcion para habilitarla."
                ),
            )
        return ctx

    return dependency


async def contar_recurso(session: AsyncSession, recurso: str, id_tenant: int) -> int:
    _, modelo = RECURSOS_CON_CUPO[recurso]
    stmt = select(func.count()).select_from(modelo).where(modelo.idTenant == id_tenant)
    if recurso == "usuarios":
        # El cupo de usuarios del plan es de PERSONAL: los clientes que se
        # registran en la vitrina no consumen licencias (sin esto, unas pocas
        # altas de clientes bloqueaban crear cajeros o bajar de plan).
        stmt = stmt.join(Rol, Rol.codigoRol == Usuario.codigoRol).where(Rol.nombreRol != "Cliente")
    total = await session.scalar(stmt)
    return int(total or 0)


async def uso_actual(session: AsyncSession, id_tenant: int) -> dict[str, int]:
    return {recurso: await contar_recurso(session, recurso, id_tenant) for recurso in RECURSOS_CON_CUPO}


def excesos_para_plan(uso: dict[str, int], plan: Plan) -> list[str]:
    """Recursos cuyo consumo actual supera los topes de `plan`.

    Lista vacia == el tenant cabe en ese plan. Se usa para rechazar un
    downgrade que dejaria sucursales/usuarios/productos por encima del cupo.
    """
    excesos = []
    for recurso, (columna_limite, _) in RECURSOS_CON_CUPO.items():
        limite = int(getattr(plan, columna_limite))
        if limite != ILIMITADO and uso[recurso] > limite:
            excesos.append(f"{recurso} ({uso[recurso]} > {limite})")
    return excesos


async def exigir_cupo(session: AsyncSession, ctx: ContextoTenant, recurso: str) -> None:
    """Rechaza la creacion de un recurso cuando el tenant llego al tope del plan.

    Se llama ANTES de insertar. 402 (Payment Required) en vez de 403 para que
    el frontend pueda ofrecer la mejora de plan en vez de un "no autorizado".
    """
    if recurso not in RECURSOS_CON_CUPO:
        raise ValueError(f"Recurso sin cupo definido: {recurso}")

    columna_limite, _ = RECURSOS_CON_CUPO[recurso]
    limite = int(getattr(ctx.plan, columna_limite))
    if limite == ILIMITADO:
        return

    usados = await contar_recurso(session, recurso, ctx.tenant.idTenant)
    if usados >= limite:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"El plan {ctx.plan.nombre} permite hasta {limite} {recurso} "
                f"y ya tienes {usados}. Actualiza tu suscripcion para agregar mas."
            ),
        )
