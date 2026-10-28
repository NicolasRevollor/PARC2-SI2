"""Resultado de la sincronizacion de operaciones sin conexion (CU16, RNF10)."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import RegistroSincronizacion, Usuario
from app.security import require_permiso
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/sync", tags=["sync"])


class RegistroSincronizacionOut(BaseModel):
    idRegistro: int
    uuidOperacion: str
    tipoOperacion: str
    resultado: str
    detalle: str | None
    idReferencia: int | None
    fechaOperacion: datetime | None
    fechaRecepcion: datetime
    dispositivo: str | None
    usuario: str | None


@router.get("/registro", response_model=list[RegistroSincronizacionOut])
async def registro_sincronizacion(
    resultado: str | None = Query(default=None, description="Aplicada, Duplicada o Rechazada"),
    limite: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso("venta.ver")),
    id_tenant: int = Depends(tenant_actual),
):
    """Operaciones recibidas de la cola de los dispositivos de la empresa, la
    mas reciente primero, con su resultado."""
    stmt = (
        select(RegistroSincronizacion, Usuario.nombre)
        .outerjoin(Usuario, Usuario.idUser == RegistroSincronizacion.idUsuario)
        .where(RegistroSincronizacion.idTenant == id_tenant)
        .order_by(RegistroSincronizacion.fechaRecepcion.desc())
        .limit(limite)
    )
    if resultado:
        stmt = stmt.where(RegistroSincronizacion.resultado == resultado)
    return [
        RegistroSincronizacionOut(
            idRegistro=r.idRegistro,
            uuidOperacion=str(r.uuidOperacion),
            tipoOperacion=r.tipoOperacion,
            resultado=r.resultado,
            detalle=r.detalle,
            idReferencia=r.idReferencia,
            fechaOperacion=r.fechaOperacion,
            fechaRecepcion=r.fechaRecepcion,
            dispositivo=r.dispositivo,
            usuario=nombre,
        )
        for r, nombre in (await session.execute(stmt)).all()
    ]
