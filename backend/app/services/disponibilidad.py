"""Formula compartida de disponibilidad de `Inventario`.

Usada por `sales.py` (create_sale, resolucion automatica de sucursal para
una compra en linea) y `payments.py` (create_payment_intent, chequeo de
stock antes de cobrar). Ninguna de las dos suma disponibilidad entre
sucursales: `create_sale` siempre descuenta de UNA sola fila de
`Inventario`, asi que una suma multi-sucursal aceptaria pedidos que ningun
Inventario individual puede cubrir.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Inventario


async def resolver_inventario(
    session: AsyncSession,
    idProducto: int,
    cantidad: int,
    codigoSucursal: int | None = None,
) -> Inventario | None:
    """Resuelve la UNICA fila de `Inventario` que debe surtir `cantidad`
    unidades de `idProducto`.

    - `codigoSucursal` dado: se restringe la busqueda a esa sucursal
      (comportamiento historico de `create_sale` cuando el caller la
      especifica explicitamente).
    - `codigoSucursal is None`: se evalua entre TODAS las sucursales y se
      elige la fila con mayor disponibilidad (`cantidad_actual -
      cantidad_reservada`), desempatando por el `idInv` mas bajo, siempre
      que esa disponibilidad por si sola cubra `cantidad`.

    Devuelve `None` si ninguna fila individual cubre `cantidad` (400 para
    el llamante: "sin stock", nunca se suma entre sucursales).
    """
    stmt = select(Inventario).where(Inventario.idProducto == idProducto)
    if codigoSucursal is not None:
        stmt = stmt.where(Inventario.codigoSucursal == codigoSucursal)

    filas = (await session.execute(stmt)).scalars().all()

    mejor: Inventario | None = None
    mejor_disponible = -1
    for fila in filas:
        disponible = fila.cantidad_actual - fila.cantidad_reservada
        if disponible < cantidad:
            continue
        if mejor is None or disponible > mejor_disponible or (
            disponible == mejor_disponible and fila.idInv < mejor.idInv
        ):
            mejor = fila
            mejor_disponible = disponible

    return mejor
