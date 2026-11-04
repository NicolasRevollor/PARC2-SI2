# ==== DIAGRAMA <-> CODIGO (informe Parcial 2) ====================
# [CU20] Gestionar apertura y cierre de caja
# Control del diagrama: ControlCaja
# En palabras simples: abre la caja con un monto inicial, anota cada ingreso y
#   egreso en efectivo y al cerrar compara lo esperado con lo que se conto.
# Pantalla (boundary) que lo usa: web/src/app/features/caja/caja.component.ts
# Las operaciones hechas sin conexion llegan por services/operaciones_offline.py.
# ==================================================================
"""Reglas de la caja (CU20)."""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Caja, ConfiguracionOperacion, ConflictoSincronizacion, MovimientoCaja, RegistroSincronizacion

INGRESOS = ("venta", "diferencia_cambio", "deposito_reserva")
EGRESOS = ("reembolso", "devolucion_deposito", "anulacion_venta")
ETIQUETAS = {
    "venta": "Ventas en efectivo",
    "diferencia_cambio": "Diferencias cobradas en cambios",
    "deposito_reserva": "Depositos de reservas",
    "reembolso": "Reembolsos en efectivo",
    "devolucion_deposito": "Depositos devueltos",
    "anulacion_venta": "Ventas anuladas",
}
ABIERTA = "Abierta"
CERRADA = "Cerrada"
PROVISIONAL = "CierreProvisional"
POR_APROBAR = "PendienteAprobacion"


def dinero(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"))


# ==== [CU20] ControlCaja.calcularArqueo() ==========================
# Paso 5 del flujo normal: esperado = inicial + ingresos - egresos.
# ===================================================================
def calcular_arqueo(monto_inicial, ingresos, egresos, contado) -> tuple[Decimal, Decimal]:
    """Devuelve (monto esperado, diferencia). Positiva = sobrante; negativa = faltante."""
    esperado = dinero(monto_inicial) + dinero(ingresos) - dinero(egresos)
    return esperado, dinero(contado) - esperado


@dataclass(frozen=True)
class DecisionCierre:
    estado: str
    requiere_justificacion: bool


# ==== [CU20] ControlCaja.decidirCierre() ===========================
# Flujo alternativo 1 (la diferencia supera el umbral: justificacion y
# aprobacion del Encargado) y 2 (quedan operaciones sin confirmar: cierre
# provisional).
# ===================================================================
def decidir_cierre(diferencia, umbral, *, pendientes: int, puede_aprobar: bool) -> DecisionCierre:
    excede = abs(dinero(diferencia)) > dinero(umbral)
    if pendientes > 0:
        return DecisionCierre(PROVISIONAL, excede)
    if excede and not puede_aprobar:
        return DecisionCierre(POR_APROBAR, True)
    return DecisionCierre(CERRADA, excede)


async def configuracion(session: AsyncSession, id_tenant: int) -> ConfiguracionOperacion:
    """Configuracion de la empresa; se crea con los valores por defecto la primera vez."""
    fila = await session.get(ConfiguracionOperacion, id_tenant)
    if fila is None:
        fila = ConfiguracionOperacion(
            idTenant=id_tenant, horasDatosVigentes=24, horasSesionSinConexion=12, permiteVentaSinStock=False,
            umbralDiferenciaCaja=50, umbralConflicto=1000, horasRetiroReserva=48,
        )
        session.add(fila)
        await session.flush()
    return fila


async def caja_abierta(session: AsyncSession, codigo_sucursal: int) -> Caja | None:
    return await session.scalar(
        select(Caja).where(Caja.codigoSucursal == codigo_sucursal, Caja.estado == ABIERTA).with_for_update()
    )


async def exigir_caja_abierta(session: AsyncSession, codigo_sucursal: int) -> Caja:
    caja = await caja_abierta(session, codigo_sucursal)
    if caja is None:
        raise HTTPException(status_code=409, detail="La caja de la sucursal esta cerrada: abrala antes de mover efectivo (CU20)")
    return caja


async def caja_de_operacion(
    session: AsyncSession, id_tenant: int, codigo_sucursal: int | None, uuid_caja: str | None, fecha: datetime | None
) -> Caja | None:
    """Caja a la que pertenece una operacion sin conexion: la que el dispositivo
    tenia abierta; si esa apertura se unio a otra caja, la vinculada en el
    registro; y si no vino, la que estaba abierta a esa hora en la sucursal."""
    if uuid_caja:
        caja = await session.scalar(select(Caja).where(Caja.uuidOperacion == uuid_caja, Caja.idTenant == id_tenant))
        if caja is not None:
            return caja
        id_caja = await session.scalar(
            select(RegistroSincronizacion.idReferencia)
            .where(
                RegistroSincronizacion.uuidOperacion == uuid_caja,
                RegistroSincronizacion.tipoOperacion == "caja_apertura",
                RegistroSincronizacion.idTenant == id_tenant,
                RegistroSincronizacion.idReferencia.is_not(None),
            )
            .limit(1)
        )
        if id_caja is not None:
            return await session.get(Caja, id_caja)
    if codigo_sucursal is None:
        return None
    momento = fecha or datetime.now(timezone.utc)
    return await session.scalar(
        select(Caja)
        .where(Caja.codigoSucursal == codigo_sucursal, Caja.idTenant == id_tenant, Caja.fechaApertura <= momento)
        .order_by(Caja.fechaApertura.desc())
        .limit(1)
    )


async def totales(session: AsyncSession, id_caja: int) -> tuple[Decimal, Decimal]:
    filas = (
        await session.execute(
            select(MovimientoCaja.tipo, func.coalesce(func.sum(MovimientoCaja.monto), 0))
            .where(MovimientoCaja.idCaja == id_caja)
            .group_by(MovimientoCaja.tipo)
        )
    ).all()
    suma = {tipo: dinero(monto) for tipo, monto in filas}
    return suma.get("ingreso", dinero(0)), suma.get("egreso", dinero(0))


async def resumen_por_concepto(session: AsyncSession, id_caja: int) -> list[dict]:
    filas = (
        await session.execute(
            select(MovimientoCaja.tipo, MovimientoCaja.concepto, func.sum(MovimientoCaja.monto), func.count())
            .where(MovimientoCaja.idCaja == id_caja)
            .group_by(MovimientoCaja.tipo, MovimientoCaja.concepto)
            .order_by(MovimientoCaja.tipo.desc(), MovimientoCaja.concepto)
        )
    ).all()
    return [
        {"tipo": t, "concepto": c, "etiqueta": ETIQUETAS.get(c, c), "monto": float(m), "cantidad": n}
        for t, c, m, n in filas
    ]


async def recalcular(session: AsyncSession, caja: Caja) -> None:
    """Una operacion que llega despues del cierre tambien cuenta en el arqueo."""
    if caja.efectivoContado is None:
        return
    await session.flush()
    ingresos, egresos = await totales(session, caja.idCaja)
    caja.montoEsperado, caja.diferencia = calcular_arqueo(caja.montoInicial, ingresos, egresos, caja.efectivoContado)


# ==== [CU20] ControlCaja.registrarMovimiento() =====================
# Paso 3 del flujo normal: ingresos (ventas en efectivo, diferencias de cambios)
# y egresos (reembolsos en efectivo).
# ===================================================================
async def registrar_movimiento(
    session: AsyncSession,
    caja: Caja,
    *,
    concepto: str,
    monto,
    referencia: str | None,
    id_usuario: int | None,
    uuid_operacion: str | None = None,
    fecha: datetime | None = None,
) -> None:
    valor = dinero(monto)
    if valor <= 0:
        return
    tipo = "ingreso" if concepto in INGRESOS else "egreso"
    session.add(
        MovimientoCaja(
            idCaja=caja.idCaja, tipo=tipo, concepto=concepto, monto=valor, referencia=(referencia or "")[:60] or None,
            uuidOperacion=uuid_operacion, fecha=fecha or datetime.now(timezone.utc), idUsuario=id_usuario,
        )
    )
    await recalcular(session, caja)


async def efectivo_en_linea(
    session: AsyncSession,
    codigo_sucursal: int | None,
    *,
    concepto: str,
    monto,
    referencia: str,
    id_usuario: int,
    exigir: bool = True,
) -> None:
    """Efectivo de una operacion hecha con conexion (POS, CU4 a CU6): con
    `exigir` la caja tiene que estar abierta (precondicion de esos CU)."""
    if codigo_sucursal is None or dinero(monto) <= 0:
        return
    caja = await (exigir_caja_abierta(session, codigo_sucursal) if exigir else caja_abierta(session, codigo_sucursal))
    if caja is not None:
        await registrar_movimiento(session, caja, concepto=concepto, monto=monto, referencia=referencia, id_usuario=id_usuario)


# ==== [CU20] ControlCaja.cerrarCaja() ==============================
# Pasos 4-6 del flujo normal: arqueo con lo contado.
# ===================================================================
async def cerrar_caja(
    session: AsyncSession,
    caja: Caja,
    *,
    contado,
    justificacion: str | None,
    id_usuario: int,
    puede_aprobar: bool,
    pendientes: list[str],
    fecha: datetime | None = None,
    exigir_justificacion: bool = False,
) -> None:
    config = await configuracion(session, caja.idTenant)
    await session.flush()
    ingresos, egresos = await totales(session, caja.idCaja)
    esperado, diferencia = calcular_arqueo(caja.montoInicial, ingresos, egresos, contado)
    decision = decidir_cierre(diferencia, config.umbralDiferenciaCaja, pendientes=len(pendientes), puede_aprobar=puede_aprobar)
    if decision.requiere_justificacion and exigir_justificacion and not (justificacion or "").strip():
        raise HTTPException(
            status_code=400,
            detail=f"La diferencia de Bs {diferencia} supera el umbral de Bs {dinero(config.umbralDiferenciaCaja)}: escriba una justificacion",
        )
    ahora = fecha or datetime.now(timezone.utc)
    caja.efectivoContado, caja.montoEsperado, caja.diferencia = dinero(contado), esperado, diferencia
    caja.justificacion = (justificacion or "").strip()[:255] or None
    caja.idUsuarioCierre, caja.fechaCierre = id_usuario, ahora
    caja.operacionesPendientes = pendientes
    caja.estado = decision.estado
    if decision.estado == CERRADA and decision.requiere_justificacion:
        # Lo cerro quien podia aprobarlo (flujo alternativo 1).
        caja.idAprobador, caja.fechaAprobacion = id_usuario, ahora


# ==== [CU20] ControlCaja.revisarCierresProvisionales() =============
# Flujo alternativo 2: el cierre provisional pasa a definitivo cuando todas las
# operaciones de la jornada quedaron confirmadas o resueltas.
# ===================================================================
async def revisar_cierres_provisionales(session: AsyncSession, id_tenant: int) -> int:
    provisionales = (
        await session.execute(select(Caja).where(Caja.idTenant == id_tenant, Caja.estado == PROVISIONAL))
    ).scalars().all()
    convertidas = 0
    for caja in provisionales:
        pendientes = []
        for uuid in caja.operacionesPendientes or []:
            registro = await session.scalar(
                select(RegistroSincronizacion.resultado)
                .where(RegistroSincronizacion.uuidOperacion == uuid, RegistroSincronizacion.resultado != "Duplicada")
                .limit(1)
            )
            if registro is None:
                pendientes.append(uuid)
                continue
            abierto = await session.scalar(
                select(ConflictoSincronizacion.idConflicto).where(
                    ConflictoSincronizacion.uuidOperacion == uuid, ConflictoSincronizacion.estado == "Pendiente"
                )
            )
            if abierto is not None:
                pendientes.append(uuid)
        caja.operacionesPendientes = pendientes
        if pendientes:
            continue
        await recalcular(session, caja)
        config = await configuracion(session, id_tenant)
        excede = abs(dinero(caja.diferencia)) > dinero(config.umbralDiferenciaCaja)
        caja.estado = POR_APROBAR if excede and caja.idAprobador is None else CERRADA
        convertidas += 1
    return convertidas
