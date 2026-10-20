from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "https://parc-2-si-2.vercel.app",
    ]
    # Vercel genera una URL distinta por cada despliegue de prueba
    # ("parc-2-si-2-<hash>-<equipo>.vercel.app"), imposible de listar arriba.
    # La regex acepta cualquier preview o rama, pero SOLO del equipo propio:
    # el sufijo del equipo impide que pase otro proyecto de Vercel con un
    # nombre parecido.
    CORS_ORIGIN_REGEX: str | None = (
        r"^https://parc-2-si-2-[a-z0-9-]+-nicolasrevolloroman-6484s-projects\.vercel\.app$"
    )

    FRONTEND_URL: str = "https://parc-2-si-2.vercel.app"

    DEBUG: bool = False

    # Recuperacion de contrasena via la API transaccional de Brevo (no SMTP
    # — email_utils.py llama a api.brevo.com directamente con esta key).
    BREVO_API_KEY: str | None = None
    BREVO_SENDER_EMAIL: str | None = None
    BREVO_SENDER_NAME: str = "YouShop"

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None

    GEMINI_API_KEY: str | None = None

    # Storage de imagenes de producto via Supabase Storage (bucket publico
    # "primSI2") — storage_supabase.py usa la service role key para subir.
    SUPABASE_URL: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    SUPABASE_STORAGE_BUCKET: str = "primSI2"

    # Respaldos por empresa (migracion 018). BACKUP_BUCKET es un bucket
    # PRIVADO de Supabase, distinto del de imagenes (que es publico): los
    # respaldos traen datos personales y hashes de contrasenas. Sin bucket, los
    # archivos van a disco local (BACKUP_DIR_LOCAL), que sirve en desarrollo
    # pero en Render se BORRA en cada redeploy.
    BACKUP_BUCKET: str | None = None
    BACKUP_DIR_LOCAL: str = "respaldos"
    # Secreto que debe mandar el disparador externo (GitHub Actions) para
    # correr los respaldos automaticos. Sin el, el endpoint queda deshabilitado.
    BACKUP_CRON_SECRET: str | None = None
    # Cuantos respaldos AUTOMATICOS se conservan por empresa (los manuales no
    # se borran solos).
    BACKUP_RETENCION_AUTOMATICOS: int = 7

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
