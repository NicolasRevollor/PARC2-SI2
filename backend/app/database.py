from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()


def _url_asyncpg(url: str) -> str:
    """Fuerza el driver asyncpg en la URL de conexion.

    Supabase y Render entregan el string como "postgresql://..." (y algunos
    paneles todavia como "postgres://..."). Con ese esquema pelado SQLAlchemy
    elige su dialecto por defecto, psycopg2, que NO esta instalado (este
    proyecto es 100% async: solo `asyncpg` esta en requirements.txt), y el
    proceso muere al arrancar con "ModuleNotFoundError: No module named
    'psycopg2'" antes de servir una sola request.

    Normalizar aca evita que un copy-paste de la consola del proveedor tumbe
    el deploy. Si la URL ya trae un driver explicito, se respeta tal cual.
    """
    if url.startswith("postgresql+") or url.startswith("postgres+"):
        return url
    for esquema in ("postgresql://", "postgres://"):
        if url.startswith(esquema):
            return "postgresql+asyncpg://" + url[len(esquema):]
    return url


engine = create_async_engine(
    _url_asyncpg(settings.DATABASE_URL),
    echo=False,
    future=True,
    # El pooler de Supabase (Supavisor) en modo "transaction" no soporta
    # prepared statements: cada query puede caer en una conexion fisica
    # distinta del pool. "statement_cache_size" apaga la cache de asyncpg,
    # pero el dialecto asyncpg de SQLAlchemy mantiene su PROPIA cache de
    # statements nombrados por encima de esa (de ahi los nombres
    # "__asyncpg_stmt_N__" en el error); hay que apagar tambien esta con
    # "prepared_statement_cache_size" o el error persiste bajo concurrencia.
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)



class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
