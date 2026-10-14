"""Router generico de pagos con tarjeta via Stripe.

No conoce `Venta` ni `Reserva`: solo crea/verifica Payment Intents y, cuando
Stripe confirma un cobro como `succeeded`, escribe una fila en `metodo_pago`
que el llamante (venta, reserva) puede usar despues como un `idMetPago`
ordinario. El monto SIEMPRE se calcula aqui, del lado servidor, a partir de
`Producto.venta` — nunca del valor `amount` que pudiera mandar el cliente.
"""

from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import MetodoPago, Producto
from app.schemas.fase2 import PagoIntentIn, PagoIntentOut, PagoIntentVerificadoOut
from app.security import require_permiso
from app.services.disponibilidad import resolver_inventario
from app.services.pagos_stripe import (
    StripeNoConfigurado,
    StripePagoError,
    crear_payment_intent,
    obtener_payment_intent,
    stripe_configurado,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])

# CU12: anticipo de reserva = 10% de una sola unidad, con un piso minimo
# cobrable por Stripe (D4 en design.md). Por debajo del piso, el producto
# simplemente no es reservable en linea — se rechaza ANTES de llamar a
# Stripe, nunca se redondea el deposito hacia arriba.
#
# Nota de unidades (correccion review CU12, R2-currency-unit-mismatch): esta
# app no hace conversion real de moneda (alcance academico, confirmado). El
# valor numerico crudo de Producto.venta (denominado en Bs en toda la UI) se
# envia tal cual como "amount"/currency=usd a Stripe test-mode. Este piso y
# sus mensajes se etiquetan "Bs" — igual que la UI — para no insinuar una
# conversion que no existe.
DEPOSITO_PORCENTAJE = Decimal("0.10")
DEPOSITO_MINIMO = Decimal("0.50")


def _requerir_stripe_configurado() -> None:
    if not stripe_configurado():
        raise HTTPException(
            status_code=503,
            detail="El cobro con tarjeta no esta disponible: Stripe no esta configurado en este servidor",
        )


@router.post("/intents", response_model=PagoIntentOut, status_code=201)
async def create_payment_intent(
    payload: PagoIntentIn,
    session: AsyncSession = Depends(get_db),
    auth: dict = Depends(require_permiso("venta.crear")),
):
    _requerir_stripe_configurado()

    if not payload.items:
        raise HTTPException(status_code=400, detail="Debe enviar al menos un item")

    if payload.proposito == "reserva_deposito":
        # Anticipo de reserva (CU12): un solo producto, una sola unidad, monto
        # = 10% de Producto.venta con piso (D1/D2/D4 en design.md) — nunca la
        # suma de items del modo "venta".
        if payload.codigoSucursal is None:
            raise HTTPException(
                status_code=400,
                detail="codigoSucursal es obligatorio para el deposito de una reserva",
            )
        if len(payload.items) != 1 or payload.items[0].cantidad != 1:
            raise HTTPException(
                status_code=400,
                detail="El deposito de una reserva cubre una sola unidad de un solo producto",
            )

        item = payload.items[0]
        producto = await session.get(Producto, item.idProducto)
        if not producto:
            raise HTTPException(status_code=400, detail=f"Producto {item.idProducto} inexistente")

        # Stock verificado ANTES de cobrar, en la sucursal de la reserva
        # (Branch-Scoped Pre-Charge Stock Validation) — nunca branch-agnostico.
        inv = await resolver_inventario(session, item.idProducto, 1, payload.codigoSucursal)
        if inv is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"No hay stock disponible del producto {item.idProducto} en la "
                    f"sucursal {payload.codigoSucursal} para reservar"
                ),
            )

        total = (Decimal(str(producto.venta)) * DEPOSITO_PORCENTAJE).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if total < DEPOSITO_MINIMO:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Este producto no admite reserva en linea: el deposito del 10% "
                    f"(Bs {total}) es menor al minimo cobrable de Bs {DEPOSITO_MINIMO}"
                ),
            )
    else:
        total = Decimal("0")
        for item in payload.items:
            if item.cantidad <= 0:
                raise HTTPException(status_code=400, detail="cantidad debe ser > 0")
            producto = await session.get(Producto, item.idProducto)
            if not producto:
                raise HTTPException(status_code=400, detail=f"Producto {item.idProducto} inexistente")
            total += Decimal(str(producto.venta)) * item.cantidad

        # Stock verificado ANTES de cobrar (D5): branch-agnostico, la misma
        # formula de `create_sale` — ninguna fila individual de `Inventario`
        # cubre la cantidad => 400 y NUNCA se llama a Stripe.
        for item in payload.items:
            inv = await resolver_inventario(session, item.idProducto, item.cantidad, None)
            if inv is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Ninguna sucursal tiene stock disponible suficiente del "
                        f"producto {item.idProducto} para la cantidad solicitada"
                    ),
                )

    id_user = int(auth["sub"])
    clave_idempotencia = f"pi:{id_user}:{payload.claveIntento}"
    metadata = {
        "idUser": str(id_user),
        "concepto": payload.concepto or "",
        "proposito": payload.proposito,
    }
    if payload.proposito == "reserva_deposito":
        # Ligadura producto/sucursal (correccion review CU12,
        # R1/R3-deposit-product-mismatch): se persiste en el MetodoPago al
        # verificar, para que el anticipo verificado solo pueda usarse en la
        # reserva del MISMO producto/sucursal que se cobro — nunca en otro.
        metadata["idProducto"] = str(payload.items[0].idProducto)
        metadata["codigoSucursal"] = str(payload.codigoSucursal)

    try:
        intent = await crear_payment_intent(
            monto_usd=total,
            clave_idempotencia=clave_idempotencia,
            metadata=metadata,
        )
    except StripeNoConfigurado:
        raise HTTPException(status_code=503, detail="Stripe no esta configurado en este servidor")
    except StripePagoError:
        raise HTTPException(status_code=502, detail="No se pudo crear el intento de pago con Stripe")

    return PagoIntentOut(
        paymentIntentId=intent["id"],
        clientSecret=intent["client_secret"],
        monto=float(total),
    )


@router.post("/intents/{payment_intent_id}/verify", response_model=PagoIntentVerificadoOut)
async def verify_payment_intent(
    payment_intent_id: str,
    session: AsyncSession = Depends(get_db),
    _auth: dict = Depends(require_permiso("venta.crear")),
):
    id_user = int(_auth["sub"])
    _requerir_stripe_configurado()

    try:
        intent = await obtener_payment_intent(payment_intent_id)
    except StripeNoConfigurado:
        raise HTTPException(status_code=503, detail="Stripe no esta configurado en este servidor")
    except StripePagoError:
        raise HTTPException(status_code=502, detail="No se pudo verificar el intento de pago con Stripe")

    if intent["status"] != "succeeded":
        return PagoIntentVerificadoOut(
            paymentIntentId=intent["id"],
            estado=intent["status"],
            pagado=False,
        )

    existente = (
        await session.execute(
            select(MetodoPago).where(MetodoPago.stripePaymentIntentId == intent["id"])
        )
    ).scalar_one_or_none()

    if existente is not None:
        return PagoIntentVerificadoOut(
            paymentIntentId=intent["id"],
            estado=intent["status"],
            pagado=True,
            idMetPago=existente.idMetPago,
            monto=float(existente.monto),
        )

    monto_recibido = Decimal(str(intent["amount_received"] or 0)) / Decimal(100)
    metadata = intent.get("metadata") or {}
    metodo = MetodoPago(
        tipo="Tarjeta (Stripe)",
        estado="Activo",
        monto=float(monto_recibido),
        stripePaymentIntentId=intent["id"],
        moneda=intent.get("currency"),
        estadoStripe=intent["status"],
        origen="tarjeta_stripe",
        idUserPago=id_user,
        idProducto=int(metadata["idProducto"]) if "idProducto" in metadata else None,
        codigoSucursal=int(metadata["codigoSucursal"]) if "codigoSucursal" in metadata else None,
    )
    session.add(metodo)
    await session.commit()
    await session.refresh(metodo)

    return PagoIntentVerificadoOut(
        paymentIntentId=intent["id"],
        estado=intent["status"],
        pagado=True,
        idMetPago=metodo.idMetPago,
        monto=float(metodo.monto),
    )
