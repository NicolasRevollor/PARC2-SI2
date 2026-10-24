"""La tienda solo vende poleras oversize y jeans (app/catalogo.py)."""

from app.catalogo import CATALOGO, error_de_catalogo


def test_combinaciones_de_la_oferta_son_validas():
    for tipo, reglas in CATALOGO.items():
        for color in reglas["colores"]:
            for talla in reglas["tallas"]:
                assert error_de_catalogo(tipo, color, talla) is None, (tipo, color, talla)


def test_la_oferta_tiene_26_productos():
    # 4 colores x 4 tallas de polera + 2 colores x 5 tallas de jean = lo que
    # siembra la migracion 020 en cada empresa.
    total = sum(len(r["colores"]) * len(r["tallas"]) for r in CATALOGO.values())
    assert total == 26


def test_rechaza_prendas_fuera_de_la_oferta():
    assert "tipo" in error_de_catalogo("Chaqueta", "Gris", "M")
    assert "tipo" in error_de_catalogo(None, "Negro", "M")


def test_rechaza_color_o_talla_que_no_corresponde_al_tipo():
    assert "Color" in error_de_catalogo("Polera Oversize", "Azul", "M")
    assert "Color" in error_de_catalogo("Jeans", "Guinda", "32")  # el jean no viene en guinda
    assert "Talla" in error_de_catalogo("Jeans", "Negro", "M")  # el jean se talla por cintura
    assert "Talla" in error_de_catalogo("Polera Oversize", "Gris", "32")
