"""Notas de credito (CU7 de docs/iconix/2do parcial SI2.md, migracion 022).

Una nota nace de un saldo a favor de una devolucion (CU4, CU5 o CU6,
`app/services/devoluciones.py`) y es nominativa: solo la usa el cliente a
cuyo nombre esta, en cualquier sucursal de la empresa que la emitio, hasta
su vencimiento. Cada movimiento (emision, consumo, reintegro, anulacion,
extension) queda registrado con el saldo resultante.

El canje sigue el mismo patron que el cobro en efectivo o con tarjeta del
POS: primero se obtiene un `metodo_pago` (descontando el saldo de la nota y,
si no alcanza, cobrando el resto con otro medio) y despues se registra la
venta con ese `idMetPago`. Sin conexion no se aceptan notas (la caja no
puede validar el saldo).
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cliente, Devolucion, MetodoPago, NotaCredito, NotaCreditoMovimiento, Tenant, Usuario, Venta
from app.database import get_db
from app.schemas.returns import (
    AnulacionIn,
    CanjeIn,
    CanjeOut,
    ExtensionIn,
    MovimientoNotaOut,
    NotaCreditoOut,
)
from app.security import get_current_payload, require_permiso
from app.services.bitacora import registrar_bitacora
from app.services.devoluciones import como_utc, dinero, estado_nota, movimiento_nota
from app.services.tenancy import tenant_actual

router = APIRouter(prefix="/api/credit-notes", tags=["credit-notes"])

ORIGEN_NOTA = "nota_credito"
ETIQUETA_COMPLEMENTO = {"efectivo": "Efectivo", "qr": "QR / Transferencia"}


def _ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"


async def _a_out(session: AsyncSession, nota: NotaCredito, cliente: str | None, empresa: str | None, codigo_caso: str | None) -> NotaCreditoOut:
    movimientos = (
        await session.execute(
            select(NotaCreditoMovimiento, Venta.idVenta, Usuario.nombre)
            .outerjoin(Venta, Venta.idMetPago == NotaCreditoMovimiento.idMetPago)
            .outerjoin(Usuario, Usuario.idUser == NotaCreditoMovimiento.idUsuario)
            .where(NotaCreditoMovimiento.idNotaCredito == nota.idNotaCredito)
            .order_by(NotaCreditoMovimiento.fecha, NotaCreditoMovimiento.idMovimiento)
        )
    ).all()
    return NotaCreditoOut(
        idNotaCredito=nota.idNotaCredito,
        codigo=nota.codigo,
        monto=float(nota.monto),
        saldo=float(nota.saldo),
        estado=estado_nota(nota.estado, nota.fechaVencimiento, datetime.now(timezone.utc)),
        fechaEmision=nota.fechaEmision,
        fechaVencimiento=nota.fechaVencimiento,
        motivo=nota.motivo,
        motivoAnulacion=nota.motivoAnulacion,
        idCliente=nota.idCliente,
        cliente_nombre=cliente,
        idDevolucion=nota.idDevolucion,
        codigoDevolucion=codigo_caso,
        idTenant=nota.idTenant,
        empresa=empresa,
        movimientos=[
            MovimientoNotaOut(
                idMovimiento=m.idMovimiento, tipo=m.tipo, monto=float(m.monto), saldoResultante=float(m.saldoResultante),
                montoComplemento=float(m.montoComplemento), metodoComplemento=m.metodoComplemento, idMetPago=m.idMetPago,
                idVenta=id_venta, detalle=m.detalle, fecha=m.fecha, usuario=usuario,
            )
            for m, id_venta, usuario in movimientos
        ],
    )


def _consulta():
    return (
        select(NotaCredito, Cliente.nombre, Tenant.nombre, Devolucion.codigo)
        .join(Cliente, Cliente.idCliente == NotaCredito.idCliente)
        .join(Tenant, Tenant.idTenant == NotaCredito.idTenant)
        .outerjoin(Devolucion, Devolucion.idDevolucion == NotaCredito.idDevolucion)
        .order_by(NotaCredito.fechaEmision.desc())
    )


@router.get("", response_model=list[NotaCreditoOut])
async def listar_notas(
    idCliente: int | None = None,
    estado: str | None = None,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    """El personal ve las notas de su empresa; un cliente, "Mis notas de credito"."""
    stmt = _consulta()
    if "devolucion.ver" in auth.get("permisos", []):
        stmt = stmt.where(NotaCredito.idTenant == id_tenant)
        if idCliente is not None:
            stmt = stmt.where(NotaCredito.idCliente == idCliente)
    else:
        propio = (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()
        if propio is None:
            return []
        stmt = stmt.where(NotaCredito.idCliente == propio.idCliente)
    salida = [await _a_out(session, *fila) for fila in (await session.execute(stmt)).all()]
    return [n for n in salida if n.estado == estado] if estado else salida


async def _nota_de_la_empresa(session: AsyncSession, id_tenant: int, *, codigo: str | None = None, id_nota: int | None = None, bloquear: bool = False):
    stmt = select(NotaCredito).where(NotaCredito.idTenant == id_tenant)
    stmt = stmt.where(NotaCredito.codigo == codigo.strip().upper()) if codigo else stmt.where(NotaCredito.idNotaCredito == id_nota)
    nota = (await session.execute(stmt.with_for_update() if bloquear else stmt)).scalar_one_or_none()
    if nota is None:
        # Una nota de otra empresa responde igual que una inexistente (CU7 alternativo 2).
        raise HTTPException(status_code=404, detail="Nota de credito no encontrada")
    return nota


async def _out_por_id(session: AsyncSession, id_nota: int) -> NotaCreditoOut:
    fila = (await session.execute(_consulta().where(NotaCredito.idNotaCredito == id_nota))).first()
    return await _a_out(session, *fila)


@router.get("/codigo/{codigo}", response_model=NotaCreditoOut)
async def buscar_por_codigo(
    codigo: str,
    session: AsyncSession = Depends(get_db),
    _: dict = Depends(require_permiso("venta.crear")),
    id_tenant: int = Depends(tenant_actual),
):
    """CU7 paso 3: la caja consulta saldo, titular y vencimiento antes de canjear."""
    nota = await _nota_de_la_empresa(session, id_tenant, codigo=codigo)
    return await _out_por_id(session, nota.idNotaCredito)


@router.get("/{idNotaCredito}", response_model=NotaCreditoOut)
async def ver_nota(
    idNotaCredito: int,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(get_current_payload),
    id_tenant: int = Depends(tenant_actual),
):
    nota = await session.get(NotaCredito, idNotaCredito)
    if nota is not None and "devolucion.ver" not in auth.get("permisos", []):
        propio = (await session.execute(select(Cliente).where(Cliente.idUser == int(auth["sub"])))).scalar_one_or_none()
        if propio is None or propio.idCliente != nota.idCliente:
            nota = None
    elif nota is not None and nota.idTenant != id_tenant:
        nota = None
    if nota is None:
        raise HTTPException(status_code=404, detail="Nota de credito no encontrada")
    return await _out_por_id(session, idNotaCredito)


@router.post("/canjear", response_model=CanjeOut)
async def canjear(
    payload: CanjeIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.crear")),
    id_tenant: int = Depends(tenant_actual),
):
    """CU7 pasos 3-6: valida la nota, aplica su saldo al total de la venta y,
    si no alcanza, cobra el resto con otro medio; devuelve el metodo de pago."""
    nota = await _nota_de_la_empresa(session, id_tenant, codigo=payload.codigo, bloquear=True)
    estado = estado_nota(nota.estado, nota.fechaVencimiento, datetime.now(timezone.utc))
    if estado != "Vigente":
        motivo = {"Vencida": "vencio", "Anulada": "fue anulada", "Usada": "no tiene saldo"}.get(estado, estado.lower())
        raise HTTPException(status_code=409, detail=f"La nota {nota.codigo} {motivo}")
    if nota.idCliente != payload.idCliente:
        raise HTTPException(status_code=403, detail="La nota de credito es nominativa: pertenece a otro cliente")
    total = dinero(payload.montoTotal)
    saldo = dinero(nota.saldo)
    de_nota = min(saldo, total)
    complemento = total - de_nota
    if complemento > 0 and payload.metodoComplemento is None:
        raise HTTPException(
            status_code=400,
            detail=f"El saldo de la nota (Bs {saldo:.2f}) no cubre Bs {total:.2f}: indique como se cobran los Bs {complemento:.2f} restantes",
        )
    tipo = f"Nota de credito {nota.codigo}"
    if complemento > 0:
        tipo += f" + {ETIQUETA_COMPLEMENTO[payload.metodoComplemento]}"
    pago = MetodoPago(tipo=tipo[:50], estado="Activo", monto=total, origen=ORIGEN_NOTA)
    session.add(pago)
    await session.flush()
    nota.saldo = saldo - de_nota
    if nota.saldo == 0:
        nota.estado = "Usada"
    await movimiento_nota(
        session, nota, "consumo", de_nota, int(auth["sub"]),
        idMetPago=pago.idMetPago,
        montoComplemento=complemento,
        metodoComplemento=payload.metodoComplemento if complemento > 0 else None,
        detalle="Pago en caja",
    )
    await registrar_bitacora(
        session, f"Nota de credito {nota.codigo} aplicada por Bs {de_nota:.2f}", int(auth["sub"]), _ip(request)
    )
    await session.commit()
    return CanjeOut(
        idMetPago=pago.idMetPago,
        montoTotal=float(total),
        montoNota=float(de_nota),
        montoComplemento=float(complemento),
        metodoComplemento=payload.metodoComplemento if complemento > 0 else None,
        codigo=nota.codigo,
        saldoRestante=float(nota.saldo),
    )


@router.post("/{idNotaCredito}/anular", response_model=NotaCreditoOut)
async def anular(
    idNotaCredito: int,
    payload: AnulacionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("tenant.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    """CU7 flujo alternativo 4: el Administrador anula registrando el motivo."""
    nota = await _nota_de_la_empresa(session, id_tenant, id_nota=idNotaCredito, bloquear=True)
    if nota.estado == "Anulada":
        raise HTTPException(status_code=409, detail="La nota ya esta anulada")
    anulado = dinero(nota.saldo)
    nota.estado = "Anulada"
    nota.motivoAnulacion = payload.motivo
    nota.saldo = Decimal("0.00")
    await movimiento_nota(session, nota, "anulacion", anulado, int(auth["sub"]), detalle=payload.motivo)
    await registrar_bitacora(session, f"Nota de credito {nota.codigo} anulada: {payload.motivo}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _out_por_id(session, idNotaCredito)


@router.post("/{idNotaCredito}/extender", response_model=NotaCreditoOut)
async def extender(
    idNotaCredito: int,
    payload: ExtensionIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("tenant.admin")),
    id_tenant: int = Depends(tenant_actual),
):
    """CU7 flujo alternativo 4: el Administrador extiende el vencimiento."""
    nota = await _nota_de_la_empresa(session, id_tenant, id_nota=idNotaCredito, bloquear=True)
    if nota.estado == "Anulada":
        raise HTTPException(status_code=409, detail="Una nota anulada no se puede extender")
    nueva = como_utc(payload.fechaVencimiento)
    if nueva <= como_utc(nota.fechaVencimiento) or nueva <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="La nueva fecha debe ser posterior al vencimiento actual y a hoy")
    nota.fechaVencimiento = nueva
    await movimiento_nota(
        session, nota, "extension", 0, int(auth["sub"]),
        detalle=f"Vence el {nueva:%d/%m/%Y}" + (f": {payload.motivo}" if payload.motivo else ""),
    )
    await registrar_bitacora(session, f"Nota de credito {nota.codigo} extendida al {nueva:%d/%m/%Y}", int(auth["sub"]), _ip(request))
    await session.commit()
    return await _out_por_id(session, idNotaCredito)
