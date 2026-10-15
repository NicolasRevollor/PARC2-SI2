from math import ceil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Colecciones, Producto, Proveedor, Temporada, TENANT_POR_DEFECTO
from app.schemas.products import (
    ImagenUploadOut,
    PaginatedProductos,
    ProductoIn,
    ProductoOut,
    ProductoUpdate,
)
from app.security import require_permiso
from app.services.tenancy import ContextoTenant, contexto_actual, exigir_cupo, tenant_actual
from app.services.storage_supabase import (
    SupabaseNoConfigurado,
    SupabaseStorageError,
    subir_imagen_producto,
    supabase_configurado,
)

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
            "vitrina del cliente no manda token), asi que el tenant no se puede "
            "derivar del JWT: sin este parametro se devuelve el catalogo del "
            "tenant por defecto."
        ),
    ),
    session: AsyncSession = Depends(get_db),
):
    filters = [Producto.idTenant == (idTenant or TENANT_POR_DEFECTO)]
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
    _=Depends(require_permiso("producto.crear")),
    ctx: ContextoTenant = Depends(contexto_actual),
):
    await exigir_cupo(session, ctx, "productos")
    if not await session.get(Proveedor, payload.idProveedor):
        raise HTTPException(status_code=400, detail="Proveedor inexistente")
    if not await session.get(Colecciones, payload.idColeccion):
        raise HTTPException(status_code=400, detail="Coleccion inexistente")

    producto = Producto(**payload.model_dump(), idTenant=ctx.tenant.idTenant)
    session.add(producto)
    await session.commit()
    await session.refresh(producto)
    return await _serialize(producto, session)


@router.put("/{idProducto}", response_model=ProductoOut)
async def update_product(
    idProducto: int,
    payload: ProductoUpdate,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.editar")),
    id_tenant: int = Depends(tenant_actual),
):
    producto = await session.get(Producto, idProducto)
    if not producto or producto.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "idProveedor" in data and not await session.get(Proveedor, data["idProveedor"]):
        raise HTTPException(status_code=400, detail="Proveedor inexistente")
    if "idColeccion" in data and not await session.get(Colecciones, data["idColeccion"]):
        raise HTTPException(status_code=400, detail="Coleccion inexistente")

    for key, value in data.items():
        setattr(producto, key, value)

    await session.commit()
    await session.refresh(producto)
    return await _serialize(producto, session)


@router.delete("/{idProducto}", status_code=204)
async def delete_product(
    idProducto: int,
    session: AsyncSession = Depends(get_db),
    _=Depends(require_permiso("producto.eliminar")),
    id_tenant: int = Depends(tenant_actual),
):
    producto = await session.get(Producto, idProducto)
    if not producto or producto.idTenant != id_tenant:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await session.delete(producto)
    await session.commit()
