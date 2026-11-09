"""Subida manual: archivo real, transparencia y foto separada del recorte."""

from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.schemas.products import ProductoUpdate
from app.services.imagenes_producto import validar_imagen


def imagen(formato="PNG", transparente=False):
    foto = Image.new("RGBA" if transparente else "RGB", (8, 8), (255, 255, 255, 0) if transparente else "white")
    if transparente:
        foto.putpixel((4, 4), (10, 20, 30, 255))
    archivo = BytesIO()
    foto.save(archivo, format=formato)
    return archivo.getvalue()


@pytest.mark.parametrize("formato,extension", [("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp")])
def test_fotos_de_catalogo(formato, extension):
    assert validar_imagen(imagen(formato)) == extension


def test_recorte_con_transparencia():
    assert validar_imagen(imagen(transparente=True), probador=True) == "png"


@pytest.mark.parametrize("contenido", [b"no soy una imagen", b"", b"<svg></svg>"])
def test_archivos_falsos_no_se_suben(contenido):
    with pytest.raises(HTTPException) as error:
        validar_imagen(contenido)
    assert error.value.status_code == 400


@pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
def test_una_foto_opaca_no_es_un_recorte(formato):
    with pytest.raises(HTTPException) as error:
        validar_imagen(imagen(formato), probador=True)
    assert "transparente" in error.value.detail


def test_no_acepta_imagen_completamente_invisible():
    archivo = BytesIO()
    Image.new("RGBA", (8, 8), (0, 0, 0, 0)).save(archivo, format="PNG")
    with pytest.raises(HTTPException):
        validar_imagen(archivo.getvalue(), probador=True)


def test_reemplazar_solo_recorte_conserva_foto_y_datos():
    payload = ProductoUpdate(imagen_probador_url="https://example.com/prenda.png")
    assert payload.model_dump(exclude_unset=True) == {"imagen_probador_url": "https://example.com/prenda.png"}
    quitar = ProductoUpdate(imagen_probador_url=None)
    assert quitar.model_dump(exclude_unset=True) == {"imagen_probador_url": None}


@pytest.mark.parametrize("permisos,transparente,esperado", [
    (["producto.editar"], True, 200),
    (["producto.crear"], True, 200),
    (["producto.listar"], True, 403),
    (["producto.editar"], False, 400),
])
def test_subida_recorte_permisos_y_transparencia(monkeypatch, permisos, transparente, esperado):
    import asyncio
    from unittest.mock import AsyncMock

    import httpx
    from fastapi import FastAPI
    from app.routers import products
    from app.security import get_current_payload

    monkeypatch.setattr(products, "supabase_configurado", lambda: True)
    subir = AsyncMock(return_value="https://example.com/productos/prenda.png")
    monkeypatch.setattr(products, "subir_imagen_producto", subir)
    app = FastAPI()
    app.include_router(products.router)
    app.dependency_overrides[get_current_payload] = lambda: {"sub": "1", "permisos": permisos}

    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.post("/api/products/upload-imagen", data={"uso": "probador"},
                                     files={"file": ("mi-prenda.png", imagen(transparente=transparente), "image/png")})

    response = asyncio.run(request())
    assert response.status_code == esperado, response.text
    assert subir.await_count == (1 if esperado == 200 else 0)
