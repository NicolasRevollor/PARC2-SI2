"""Guard centralizado de un `metodo_pago` consumible (CU12).

Unico lugar donde se valida que un `idMetPago` puede ser usado para pagar
una obligacion nueva (una `Venta` o el anticipo/saldo de una `Reserva`).
Los tres escritores (`create_reservation`, `create_sale`,
`confirm_reservation`) llaman esta misma funcion en vez de duplicar las
clausulas — una sola vez, sin que un escritor individual pueda quedar
desalineado (D5 en design.md).

Reglas aplicadas, en orden:
1. El `MetodoPago` debe existir -> 400 si no.
2. Ownership tolerante a NULL: si `idUserPago` esta seteado, debe coincidir
   con el caller -> 403 si no (filas historicas Efectivo/QR con
   `idUserPago IS NULL` siguen pasando, ej. en `confirm_reservation`).
3. Si `exigir_tarjeta` es True, el `origen` debe ser `"tarjeta_stripe"` ->
   403 si no (compra/anticipo de un Cliente autoservicio; un caller staff
   pasa `exigir_tarjeta=False` y puede usar cualquier origen, paridad POS).
4. Ligadura producto/sucursal tolerante a NULL: si el caller pasa
   `id_producto`/`codigo_sucursal` (solo `create_reservation` lo hace) Y el
   MetodoPago tiene esos campos seteados (un anticipo verificado los trae),
   deben coincidir -> 403 si no. Evita que un anticipo verificado para un
   producto barato se reutilice para reservar uno caro.
5. Single-use ATOMICO: un UPDATE...WHERE "consumidoEn" IS NULL...RETURNING
   reclama la fila en la misma operacion que la verifica. Dos requests
   concurrentes con el mismo idMetPago ya no pueden pasar ambas el chequeo
   (Postgres serializa la fila): la segunda encuentra 0 filas afectadas y
   recibe 400. Reemplaza los dos SELECT sueltos sobre Venta/Reserva, que
   dejaban una ventana de carrera entre el chequeo y el commit.
"""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MetodoPago


async def exigir_metodo_pago_consumible(
    session: AsyncSession,
    idMetPago: int,
    id_user: int,
    exigir_tarjeta: bool,
    id_producto: int | None = None,
    codigo_sucursal: int | None = None,
) -> MetodoPago:
    metodo = await session.get(MetodoPago, idMetPago)
    if not metodo:
        raise HTTPException(status_code=400, detail="Metodo de pago inexistente")

    if metodo.idUserPago is not None and metodo.idUserPago != id_user:
        raise HTTPException(status_code=403, detail="El metodo de pago no pertenece a este usuario")

    if exigir_tarjeta and metodo.origen != "tarjeta_stripe":
        raise HTTPException(status_code=403, detail="Solo se admite pago con tarjeta para esta operacion")

    if metodo.idProducto is not None and id_producto is not None and metodo.idProducto != id_producto:
        raise HTTPException(status_code=403, detail="El anticipo verificado corresponde a otro producto")
    if (
        metodo.codigoSucursal is not None
        and codigo_sucursal is not None
        and metodo.codigoSucursal != codigo_sucursal
    ):
        raise HTTPException(status_code=403, detail="El anticipo verificado corresponde a otra sucursal")

    resultado = await session.execute(
        update(MetodoPago)
        .where(MetodoPago.idMetPago == idMetPago, MetodoPago.consumidoEn.is_(None))
        .values(consumidoEn=datetime.now(timezone.utc))
        .returning(MetodoPago.idMetPago)
    )
    if resultado.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="El metodo de pago ya fue utilizado")

    return metodo
