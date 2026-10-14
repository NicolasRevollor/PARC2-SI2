from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
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
