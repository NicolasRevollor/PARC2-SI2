# ==== AVISOS AL CLIENTE (correccion de la ingeniera) =============
# Que pidio la ingeniera:
#   - "Puede llegar de tipo PUSH o CORREO, y se le devuelve el dinero si es que compro algo sin internet"
#   - "Tipo push: su prenda sera enviada el dia viernes"
# Como lo hicimos (en palabras simples):
#   1. notificar_cliente() / notificar_personal() GUARDAN el aviso en la tabla "notificacion".
#      La web y la app movil lo muestran en la bandeja de notificaciones (como un push dentro de la app).
#   2. Despues de guardar todo (commit), programar_correos() manda esos mismos avisos POR CORREO (Brevo),
#      en segundo plano, para que el usuario no tenga que esperar.
#   3. Si el correo falla o Brevo no esta configurado, el aviso igual queda en la app: nunca se pierde.
# Quien lo llama: services/devoluciones.py (envios, reembolsos, vencimientos), routers/returns.py
#   (solicitud recibida, resultado de la inspeccion) y routers/sales.py (compra sin internet rechazada).
# ==================================================================
"""Avisos a clientes y personal: bandeja en la app + correo (Brevo)."""

import asyncio
import logging
from datetime import datetime

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.email_utils import send_email
from app.models import Cliente, Notificacion, Rol, Usuario
from app.services.horario import HORA_BOLIVIA

logger = logging.getLogger(__name__)

DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")


def fecha_texto(fecha: datetime | None) -> str:
    """Fecha facil de leer en el aviso: "viernes 06/11" (hora de Bolivia)."""
    if fecha is None:
        return "-"
    local = fecha.astimezone(HORA_BOLIVIA)
    return f"{DIAS[local.weekday()]} {local:%d/%m}"


async def notificar_usuario(
    session: AsyncSession,
    id_user: int,
    id_tenant: int | None,
    *,
    tipo: str,
    titulo: str,
    mensaje: str,
    referencia: str | None = None,
    por_correo: bool = True,
) -> Notificacion:
    """Guarda un aviso para un usuario. Va en la MISMA transaccion que el resto:
    si la operacion falla y se deshace, el aviso tambien se deshace."""
    aviso = Notificacion(
        idUser=id_user,
        idTenant=id_tenant,
        tipo=tipo,
        titulo=titulo[:150],
        mensaje=mensaje[:600],
        referencia=referencia,
        porCorreo=por_correo,
    )
    session.add(aviso)
    return aviso


async def notificar_cliente(
    session: AsyncSession,
    id_cliente: int | None,
    id_tenant: int | None,
    *,
    tipo: str,
    titulo: str,
    mensaje: str,
    referencia: str | None = None,
) -> Notificacion | None:
    """Aviso para un CLIENTE (se busca su usuario para saber a quien mostrarlo y a que correo mandarlo)."""
    if id_cliente is None:
        return None
    cliente = await session.get(Cliente, id_cliente)
    if cliente is None or cliente.idUser is None:
        # "Cliente generico" sin cuenta: no hay a quien avisar.
        return None
    return await notificar_usuario(
        session, cliente.idUser, id_tenant, tipo=tipo, titulo=titulo, mensaje=mensaje, referencia=referencia
    )


async def notificar_personal(
    session: AsyncSession,
    id_tenant: int,
    *,
    tipo: str,
    titulo: str,
    mensaje: str,
    referencia: str | None = None,
) -> None:
    """Aviso para TODO el personal de la empresa (por ejemplo: "hay que devolverle Bs 80 a un cliente").
    Al personal solo se le avisa en la app (no por correo), para no llenarle la bandeja.

    Si se pasa `referencia`, el aviso NO se repite: a cada usuario que ya tiene uno
    con esa misma referencia se lo saltea (evita la campanita con el mismo mensaje
    duplicado cuando el dispositivo reintenta la sincronizacion)."""
    ids = (
        await session.execute(
            select(Usuario.idUser)
            .join(Rol, Rol.codigoRol == Usuario.codigoRol)
            .where(Usuario.idTenant == id_tenant, Rol.nombreRol != "Cliente")
        )
    ).scalars().all()
    ya_avisados: set[int] = set()
    if referencia is not None:
        ya_avisados = set(
            (
                await session.execute(
                    select(Notificacion.idUser).where(
                        Notificacion.idTenant == id_tenant, Notificacion.referencia == referencia
                    )
                )
            ).scalars()
        )
    for id_user in ids:
        if id_user in ya_avisados:
            continue
        await notificar_usuario(
            session, id_user, id_tenant, tipo=tipo, titulo=titulo, mensaje=mensaje, referencia=referencia, por_correo=False
        )


async def enviar_correos_pendientes(limite: int = 30) -> int:
    """Manda por correo los avisos que todavia no se mandaron. Abre su PROPIA sesion
    porque corre despues de responder al usuario (en segundo plano)."""
    enviados = 0
    async with AsyncSessionLocal() as session:
        filas = (
            await session.execute(
                select(Notificacion, Usuario.correo)
                .join(Usuario, Usuario.idUser == Notificacion.idUser)
                .where(Notificacion.porCorreo.is_(True), Notificacion.correoEnviado.is_(False))
                .order_by(Notificacion.fecha)
                .limit(limite)
            )
        ).all()
        for aviso, correo in filas:
            if not correo or correo.endswith(".invalid"):
                # [CU14]: cliente registrado en tienda sin correo real.
                aviso.correoEnviado = True
                continue
            # El envio es una llamada HTTP lenta: se hace en un hilo aparte para no trabar el servidor.
            ok = await asyncio.to_thread(send_email, correo, aviso.titulo, aviso.mensaje)
            if ok:
                aviso.correoEnviado = True
                enviados += 1
        await session.commit()
    return enviados


async def _enviar_sin_romper() -> None:
    try:
        await enviar_correos_pendientes()
    except Exception:
        # Un correo que falla nunca debe tumbar nada: el aviso ya esta guardado en la app.
        logger.exception("No se pudieron enviar los correos de los avisos")


def programar_correos(background_tasks: BackgroundTasks | None) -> None:
    """Se llama DESPUES del commit: deja programado el envio de correos para cuando
    ya se respondio al usuario."""
    if background_tasks is not None:
        background_tasks.add_task(_enviar_sin_romper)
