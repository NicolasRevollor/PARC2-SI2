from dataclasses import dataclass
from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bitacora
from app.security import get_current_payload
from app.services.horario import HORA_BOLIVIA

# Largo de la columna Bitacora.accion (VARCHAR(150)).
MAX_ACCION = 150


# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU1] Registrar solicitud de devolucion o cambio en tienda
# [CU2] Solicitar devolucion o cambio desde la tienda en linea
# [CU3] Inspeccionar estado de la prenda devuelta
# [CU4] Procesar cambio de talla, color o medida
# [CU5] Procesar cambio por un producto diferente
# [CU6] Procesar reembolso de dinero
# [CU7] Emitir nota de devolucion
# [CU8] Gestionar cambio sin stock disponible
# [CU9] Configurar politica de devoluciones y cambios
# [CU10] Actualizar inventario por devolucion o cambio
# Diagramas del informe: "Robustez CU1" y "Clases CU1", "Robustez CU2" y "Clases CU2", "Robustez CU3" y "Clases CU3", "Robustez CU4" y "Clases CU4", "Robustez CU5" y "Clases CU5", "Robustez CU6" y "Clases CU6", "Robustez CU7" y "Clases CU7", "Robustez CU8" y "Clases CU8", "Robustez CU9" y "Clases CU9", "Robustez CU10" y "Clases CU10"
# Diagrama de clases: Bitacora.registrarBitacora()
# En palabras simples: guarda en la bitacora quien hizo que, cuando y desde que IP. Aparece en casi todos los diagramas de robustez.
# Robustez: entidad "Bitacora" -> CU1 msj 11 (REGISTRAR), CU2 msj 21 (SOLICITAR), CU3 msj 12 (INSPECCIONAR),
#   CU4 msj 17, CU5 msj 19, CU6 msj 15 (RESOLVER), CU8 msj 12, CU9 msj 10, CU10 msj 15
# Secuencia: lifeline "Bitacora" -> registrarBitacora(...) en CU1 (REGISTRAR), CU2 (SOLICITAR), CU3 (INSPECCIONAR), CU4/CU5/CU6/CU8/CU10 (RESOLVER),
#   CU9 (version de la politica)
# ==================================================================
async def registrar_bitacora(session: AsyncSession, accion: str, idUser: int, ip: str) -> None:
    # "hora" y "fecha" son columnas sin zona que se muestran tal cual.
    now = datetime.now(HORA_BOLIVIA)
    session.add(
        Bitacora(
            accion=accion[:MAX_ACCION],
            hora=now.time(),
            fecha=now.date(),
            ip=ip,
            idUser=idUser,
        )
    )


@dataclass(frozen=True)
class Actor:
    """Quien hace la accion: el usuario del JWT y la IP de la peticion."""

    id_user: int
    ip: str


def actor_actual(request: Request, payload: dict = Depends(get_current_payload)) -> Actor:
    return Actor(
        id_user=int(payload["sub"]),
        ip=request.client.host if request.client else "0.0.0.0",
    )


async def auditar(session: AsyncSession, actor: Actor, accion: str) -> None:
    """Registra en la bitacora una accion del usuario autenticado. Se agrega a
    la misma transaccion: si la operacion falla y no se commitea, tampoco
    queda registrada."""
    await registrar_bitacora(session, accion, actor.id_user, actor.ip)
