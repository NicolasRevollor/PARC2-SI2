"""Respaldos (backups) por empresa (migracion 018).

- Manuales: los dispara el superadministrador desde la consola (JWT con
  "plataforma.admin").
- Automaticos: los dispara un cron EXTERNO (GitHub Actions, ver
  .github/workflows/respaldos-automaticos.yml) llamando a
  POST /api/platform/backups/automaticos con la cabecera X-Backup-Secret.

Por que un cron externo y no un scheduler dentro de la app: el plan gratuito
de Render duerme el servicio tras ~15 min sin trafico, asi que un scheduler
interno simplemente no correria. La llamada del cron ademas lo despierta.
"""

from math import ceil

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Respaldo, Tenant, Usuario
from app.schemas.respaldos import (
    EjecucionAutomaticaOut,
    RespaldoConfigOut,
    RespaldoIn,
    RespaldoOut,
    RespaldoPaginadoOut,
)
from app.security import require_permiso
from app.services import respaldos
from app.services.bitacora import registrar_bitacora

router = APIRouter(prefix="/api/platform/backups", tags=["backups"])
settings = get_settings()

PERMISO = "plataforma.admin"


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


def _a_out(r: Respaldo, empresa: str, creado_por: str | None) -> RespaldoOut:
    return RespaldoOut(
        idRespaldo=r.idRespaldo, idTenant=r.idTenant, empresa=empresa, tipo=r.tipo,
        estado=r.estado, almacenamiento=r.almacenamiento, tamanoBytes=r.tamanoBytes,
        filas=r.filas, error=r.error, creadoEn=r.creadoEn, creadoPor=creado_por,
    )


async def _respaldo_con_empresa(session: AsyncSession, id_respaldo: int) -> tuple[Respaldo, Tenant]:
    fila = (
        await session.execute(
            select(Respaldo, Tenant).join(Tenant, Tenant.idTenant == Respaldo.idTenant)
            .where(Respaldo.idRespaldo == id_respaldo)
        )
    ).first()
    if fila is None:
        raise HTTPException(status_code=404, detail="El respaldo no existe")
    return fila[0], fila[1]


@router.get("/config", response_model=RespaldoConfigOut)
async def configuracion(_=Depends(require_permiso(PERMISO))):
    return RespaldoConfigOut(
        almacenamiento=respaldos.almacenamiento_activo(),
        automaticosHabilitados=bool(settings.BACKUP_CRON_SECRET),
        retencionAutomaticos=settings.BACKUP_RETENCION_AUTOMATICOS,
    )


@router.get("", response_model=RespaldoPaginadoOut)
async def listar_respaldos(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    idTenant: int | None = None,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso(PERMISO)),
):
    base = (
        select(Respaldo, Tenant.nombre, Usuario.correo)
        .join(Tenant, Tenant.idTenant == Respaldo.idTenant)
        .outerjoin(Usuario, Usuario.idUser == Respaldo.idUsuario)
    )
    if idTenant is not None:
        base = base.where(Respaldo.idTenant == idTenant)

    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    filas = (
        await session.execute(
            base.order_by(Respaldo.creadoEn.desc(), Respaldo.idRespaldo.desc())
            .offset((page - 1) * size).limit(size)
        )
    ).all()
    return RespaldoPaginadoOut(
        items=[_a_out(r, empresa, correo) for r, empresa, correo in filas],
        total=total, page=page, size=size, pages=ceil(total / size) if total else 0,
    )


@router.post("", response_model=RespaldoOut, status_code=201)
async def respaldar_ahora(
    payload: RespaldoIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    tenant = await session.get(Tenant, payload.idTenant)
    if tenant is None:
        raise HTTPException(status_code=404, detail="La empresa no existe")
    nombre_empresa = tenant.nombre
    id_usuario = int(auth["sub"])

    registro = await respaldos.crear_respaldo(session, payload.idTenant, "manual", id_usuario)
    await registrar_bitacora(
        session,
        f"Plataforma: respaldo manual de '{nombre_empresa}' ({registro.estado})"[:150],
        id_usuario,
        _ip(request),
    )
    await session.commit()

    if registro.estado != "Completado":
        # El intento queda registrado (y visible en la consola) igual.
        raise HTTPException(status_code=502, detail=f"No se pudo generar el respaldo: {registro.error}")
    return _a_out(registro, nombre_empresa, auth.get("correo"))


@router.post("/automaticos", response_model=EjecucionAutomaticaOut)
async def respaldos_automaticos(
    session: AsyncSession = Depends(get_db),
    x_backup_secret: str | None = Header(default=None),
):
    """Lo llama el cron externo. Sin BACKUP_CRON_SECRET configurado queda
    deshabilitado (503); con secreto incorrecto, 401."""
    if not settings.BACKUP_CRON_SECRET:
        raise HTTPException(status_code=503, detail="Los respaldos automaticos no estan configurados (BACKUP_CRON_SECRET)")
    if not respaldos.secreto_valido(x_backup_secret, settings.BACKUP_CRON_SECRET):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Secreto de respaldo invalido")

    resultados = await respaldos.respaldar_empresas_activas(session)
    completados = sum(1 for r in resultados if r.estado == "Completado")
    return EjecucionAutomaticaOut(
        empresas=len(resultados), completados=completados, fallidos=len(resultados) - completados
    )


@router.get("/{id_respaldo}/descargar")
async def descargar_respaldo(
    id_respaldo: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    """La descarga pasa SIEMPRE por el backend: el bucket es privado y el
    archivo tiene datos personales, asi que no se expone una URL publica."""
    respaldo, tenant = await _respaldo_con_empresa(session, id_respaldo)
    if respaldo.estado != "Completado" or not respaldo.ruta:
        raise HTTPException(status_code=409, detail="Ese respaldo fallo y no tiene archivo")
    try:
        datos = await respaldos.leer_archivo(respaldo.almacenamiento, respaldo.ruta)
    except respaldos.RespaldoNoEncontrado:
        raise HTTPException(status_code=410, detail="El archivo del respaldo ya no existe en el almacenamiento")

    await registrar_bitacora(
        session, f"Plataforma: descarga del respaldo {id_respaldo} de '{tenant.nombre}'"[:150],
        int(auth["sub"]), _ip(request),
    )
    await session.commit()

    nombre = f"respaldo-{tenant.slug}-{respaldo.creadoEn.strftime('%Y%m%d-%H%M%S')}.json.gz"
    return Response(
        content=datos,
        media_type=respaldos.CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.delete("/{id_respaldo}", status_code=204)
async def borrar_respaldo(
    id_respaldo: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso(PERMISO)),
):
    respaldo, tenant = await _respaldo_con_empresa(session, id_respaldo)
    if respaldo.ruta:
        await respaldos.borrar_archivo(respaldo.almacenamiento, respaldo.ruta)
    await session.delete(respaldo)
    await registrar_bitacora(
        session, f"Plataforma: respaldo {id_respaldo} de '{tenant.nombre}' eliminado"[:150],
        int(auth["sub"]), _ip(request),
    )
    await session.commit()
