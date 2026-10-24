from math import ceil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalogo import error_de_catalogo
from app.database import get_db
from app.models import Colecciones, Producto, Proveedor
from app.schemas.products import (
    ImagenUploadOut,
    PaginatedProductos,
    ProductoIn,
    ProductoOut,
    ProductoUpdate,
)
from app.security import get_optional_payload, require_permiso
from app.services.tenancy import (
    ContextoTenant,
    contexto_actual,
    exigir_cupo,
    resolver_tenant_publico,
    tenant_actual,
)
from app.services.storage_supabase import (
    SupabaseNoConfigurado,
    SupabaseStorageError,
    subir_imagen_producto,
    supabase_configurado,
)
from app.services.bitacora import Actor, actor_actual, auditar

router = APIRouter(prefix="/api/products", tags=["products"])

_TIPOS_IMAGEN_PERMITIDOS = {"image/jpeg", "image/png", "image/webp"}
_TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024


async def _serialize(producto: Producto, session: AsyncSession) -> ProductoOut:
    proveedor = await session.get(Proveedor, producto.idProveedor)
    coleccion = await session.get(Colecciones, producto.idColeccion)
    return ProductoOut(
        idProducto=producto.idProducto,
        nombre=producto.nombre,
        descripcion=producto.descripcion,
        costo=float(producto.costo),
        venta=float(producto.venta),
        tipo=producto.tipo,
        talla=producto.talla,
        color=producto.color,
        idProveedor=producto.idProveedor,
        idColeccion=producto.idColeccion,
        proveedor_nombre=proveedor.nombre if proveedor else None,
        coleccion_nombre=coleccion.nombre_coleccion if coleccion else None,
        imagen_url=producto.imagen_url,
        imagenes_secundarias=producto.imagenes_secundarias or [],
    )


def _validar_catalogo(tipo: str | None, color: str | None, talla: str | None) -> None:
    """La tienda solo vende poleras oversize y jeans (app/catalogo.py)."""
    error = error_de_catalogo(tipo, color, talla)
    if error:
        raise HTTPException(status_code=400, detail=error)


async def _validar_referencias(session: AsyncSession, data: dict, id_tenant: int) -> None:
    """Proveedor y coleccion deben existir Y ser de la misma organizacion: sin
    esto un producto de la empresa 2 podia colgar de la coleccion de la 1."""
    if "idProveedor" in data:
        proveedor = await session.get(Proveedor, data["idProveedor"])
        if not proveedor or proveedor.idTenant != id_tenant:
            raise HTTPException(status_code=400, detail="Proveedor inexistente")
    if "idColeccion" in data:
        coleccion = await session.get(Colecciones, data["idColeccion"])
        if not coleccion or coleccion.idTenant != id_tenant:
            raise HTTPException(status_code=400, detail="Coleccion inexistente")


@router.get("", response_model=PaginatedProductos)
async def list_products(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    tipo: str | None = None,
    talla: str | None = None,
    color: str | None = None,
    idColeccion: int | None = None,
    idProveedor: int | None = None,
    query: str | None = Query(None, alias="q"),
    idTenant: int | None = Query(
        None,
        description=(
            "Organizacion cuyo catalogo se consulta. El endpoint es publico (la "
            "vitrina del cliente no manda token): sin este parametro se usa el "
            "tenant del JWT si hay sesion, o el tenant por defecto."
        ),
    ),
    session: AsyncSession = Depends(get_db),
    sesion: dict | None = Depends(get_optional_payload),
):
    filters = [Producto.idTenant == resolver_tenant_publico(idTenant, sesion)]
    if tipo:
        filters.append(Producto.tipo.ilike(f"%{tipo}%"))
    if talla:
        filters.append(Producto.talla == talla)
    if color:
        filters.append(Producto.color.ilike(f"%{color}%"))
    if idColeccion is not None:
        filters.append(Producto.idColeccion == idColeccion)
    if idProveedor is not None:
        filters.append(Producto.idProveedor == idProveedor)
    if query:
        filters.append(Producto.nombre.ilike(f"%{query}%"))

    total = (
        await session.execute(select(func.count(Producto.idProducto)).where(*filters))
    ).scalar_one()

    stmt = (
        select(Producto)
        .where(*filters)
        .order_by(Producto.idProducto.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await session.execute(stmt)).scalars().all()

    items = [await _serialize(p, session) for p in rows]
    return PaginatedProductos(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=ceil(total / size) if total else 0,
    )


@router.post("/upload-imagen", response_model=ImagenUploadOut)
async def upload_imagen_producto(
    file: UploadFile = File(...),
    _=Depends(require_permiso("producto.crear")),
):
    if not supabase_configurado():
        raise HTTPException(
            status_code=503, detail="Almacenamiento de imagenes no configurado"
        )
    if file.content_type not in _TIPOS_IMAGEN_PERMITIDOS:
        raise HTTPException(
            status_code=400,
            detail="Formato de imagen no soportado (solo JPEG, PNG o WEBP)",
        )

    contenido = await file.read()
    if len(contenido) > _TAMANO_MAXIMO_BYTES:
        raise HTTPException(status_code=400, detail="La imagen supera los 5MB")

    try:
        url = await subir_imagen_producto(file.filename or "imagen", contenido)
    except SupabaseNoConfigurado:
        raise HTTPException(
            status_code=503, detail="Almacenamiento de imagenes no configurado"
        )
    except SupabaseStorageError as exc:
        raise HTTPException(status_code=502, detail=f"Error subiendo imagen: {exc}")

    return ImagenUploadOut(imagen_url=url)


@router.get("/{idProducto}", response_model=ProductoOut)
async def get_product(idProducto: int, session: AsyncSession = Depends(get_db)):
    producto = await session.get(Producto, idProducto)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return await _serialize(producto, session)


@router.post("", response_model=ProductoOut, status_code=201)
async def create_product(
    payload: ProductoIn,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("producto.crear")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    _validar_catalogo(payload.tipo, payload.color, payload.talla)
    await exigir_cupo(session, ctx, "productos")
    await _validar_referencias(session, payload.model_dump(), ctx.tenant.idTenant)

    producto = Producto(**payload.model_dump(), idTenant=ctx.tenant.idTenant)
    session.add(producto)
    await auditar(session, actor, f"Producto creado: {producto.nombre} talla {producto.talla}")
    await session.commit()
    await session.refresh(producto)
    return await _serialize(producto, session)


@router.put("/{idProducto}", response_model=ProductoOut)
async def update_product(
    idProducto: int,
    payload: ProductoUpdate,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("producto.editar")),
    id_tenant: int = Depends(tenant_actual),
):
    producto = await session.get(Producto, idProducto)
    if not producto or producto.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = payload.model_dump(exclude_unset=True)
    # La combinacion resultante (lo que cambia + lo que queda) tiene que
    # seguir siendo parte de la oferta.
    if {"tipo", "color", "talla"} & data.keys():
        _validar_catalogo(
            data.get("tipo", producto.tipo),
            data.get("color", producto.color),
            data.get("talla", producto.talla),
        )
    await _validar_referencias(session, data, id_tenant)

    for key, value in data.items():
        setattr(producto, key, value)

    await auditar(session, actor, f"Producto actualizado: {producto.nombre} talla {producto.talla} (#{idProducto})")
    await session.commit()
    await session.refresh(producto)
    return await _serialize(producto, session)


@router.delete("/{idProducto}", status_code=204)
async def delete_product(
    idProducto: int,
    session: AsyncSession = Depends(get_db),
    actor: Actor = Depends(actor_actual),
    _=Depends(require_permiso("producto.eliminar")),
    id_tenant: int = Depends(tenant_actual),
):
    producto = await session.get(Producto, idProducto)
    if not producto or producto.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await session.delete(producto)
    await auditar(session, actor, f"Producto eliminado: {producto.nombre} talla {producto.talla} (#{idProducto})")
    await session.commit()
