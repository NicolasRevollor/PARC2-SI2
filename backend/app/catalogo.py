"""Oferta de la tienda: solo poleras oversize y jeans.

Misma definicion que siembra la migracion 020 y que usa la web
(web/src/app/core/catalogo.ts). El alta y la edicion de productos se validan
contra esto para que nadie cargue una prenda fuera de la oferta (un blazer,
un color que no se vende, una talla que no existe).
"""

TIPO_POLERA = "Polera Oversize"
TIPO_JEANS = "Jeans"

CATALOGO: dict[str, dict[str, list[str]]] = {
    TIPO_POLERA: {
        "colores": ["Blanco", "Negro", "Guinda", "Gris"],
        "tallas": ["S", "M", "L", "XL"],
    },
    TIPO_JEANS: {
        "colores": ["Negro", "Blanco"],
        "tallas": ["28", "30", "32", "34", "36"],
    },
}


def error_de_catalogo(tipo: str | None, color: str | None, talla: str | None) -> str | None:
    """Mensaje de error si la combinacion no es parte de la oferta; None si es valida."""
    if tipo not in CATALOGO:
        return f"Solo se venden {TIPO_POLERA.lower()}s y {TIPO_JEANS.lower()}: el tipo debe ser '{TIPO_POLERA}' o '{TIPO_JEANS}'"
    reglas = CATALOGO[tipo]
    if color not in reglas["colores"]:
        return f"Color invalido para {tipo}: se vende en {', '.join(reglas['colores'])}"
    if talla not in reglas["tallas"]:
        return f"Talla invalida para {tipo}: tallas disponibles {', '.join(reglas['tallas'])}"
    return None
