"""Operaciones registradas sin conexion (CU14-CU17, RF05, RNF05, RNF10).

El dispositivo asigna un UUID a cada venta o reserva que guarda en su cola
local y lo reenvia al sincronizar. El servidor:

- si el UUID es nuevo, aplica la operacion y la marca "sin_conexion" con la
  hora real del dispositivo y la hora en que llego;
- si el UUID ya existe, NO la vuelve a aplicar: devuelve la que ya estaba
  (idempotencia, RNF05);
- en todos los casos deja una fila en `registro_sincronizacion` con el
  resultado (Aplicada, Duplicada o Rechazada) para el log del RNF10.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegistroSincronizacion


def campos_sincronizacion(uuid_operacion: UUID | None, fecha_operacion: datetime | None) -> dict:
    """Columnas de sincronizacion de una Venta/Reserva nueva."""
    if uuid_operacion is None:
        return {"origenRegistro": "en_linea", "estadoSincronizacion": "Sincronizada"}
    return {
        "uuidOperacion": str(uuid_operacion),
        "origenRegistro": "sin_conexion",
        "estadoSincronizacion": "Sincronizada",
        "fechaOperacion": fecha_operacion,
        "fechaSincronizacion": datetime.now(timezone.utc),
    }


def dispositivo(request: Request | None) -> str | None:
    if request is None:
        return None
    return (request.headers.get("user-agent") or "")[:120] or None


async def registrar(
    session: AsyncSession,
    *,
    uuid_operacion: UUID,
    tipo: str,
    resultado: str,
    detalle: str | None = None,
    id_referencia: int | None = None,
    fecha_operacion: datetime | None = None,
    request: Request | None = None,
    id_usuario: int | None = None,
    id_tenant: int | None = None,
) -> None:
    session.add(
        RegistroSincronizacion(
            uuidOperacion=str(uuid_operacion),
            tipoOperacion=tipo,
            resultado=resultado,
            detalle=(detalle or "")[:255] or None,
            idReferencia=id_referencia,
            fechaOperacion=fecha_operacion,
            dispositivo=dispositivo(request),
            idUsuario=id_usuario,
            idTenant=id_tenant,
        )
    )
