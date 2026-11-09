"""Validacion de fotos reales y recortes transparentes del probador."""

from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError


def validar_imagen(contenido: bytes, *, probador: bool = False) -> str:
    try:
        with Image.open(BytesIO(contenido)) as imagen:
            extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}.get(imagen.format)
            if extension is None:
                raise HTTPException(status_code=400, detail="Use una imagen JPEG, PNG o WEBP")
            if imagen.width * imagen.height > 20_000_000:
                raise HTTPException(status_code=400, detail="La imagen es demasiado grande; reduzca su resolucion")
            imagen.load()
            if probador:
                minimo, maximo = imagen.convert("RGBA").getchannel("A").getextrema()
                if minimo == 255 or maximo == 0:
                    raise HTTPException(status_code=400, detail=(
                        "El probador necesita una prenda con fondo transparente (PNG o WEBP). "
                        "Quite el fondo antes de subirla; cambiar la extension no elimina el fondo."
                    ))
            return extension
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="El archivo no es una imagen valida") from None
