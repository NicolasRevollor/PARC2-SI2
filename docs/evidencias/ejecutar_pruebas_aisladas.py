"""Ejecuta pytest sin leer .env ni conectar una base de datos real.

Desde la raiz del proyecto:
    python docs/evidencias/ejecutar_pruebas_aisladas.py

Requiere las dependencias del backend. Las integraciones PostgreSQL se omiten.
"""

import os
from pathlib import Path
import sys
from types import SimpleNamespace


def main():
    root = Path(__file__).resolve().parents[2]
    backend = root / "backend"
    evidence = root / "docs" / "evidencias"
    os.chdir(backend)
    sys.path.insert(0, str(backend))
    # Las pruebas de integracion modifican datos y exigen autorizacion explicita
    # mediante TEST_DATABASE_URL. Esta ejecucion no las habilita.
    os.environ.pop("TEST_DATABASE_URL", None)

    import app.config as config

    # Leer las definiciones de campos no instancia Settings ni carga .env.
    values = {name: field.default for name, field in config.Settings.model_fields.items()}
    values.update(
        DATABASE_URL="postgresql+asyncpg://prueba:prueba@127.0.0.1:1/pruebas",
        SECRET_KEY="secreto-exclusivo-de-pruebas-sin-valor-en-produccion",
        GEMINI_API_KEY=None,
        BREVO_API_KEY=None,
        STRIPE_SECRET_KEY=None,
        SUPABASE_SERVICE_ROLE_KEY=None,
        BACKUP_CRON_SECRET=None,
    )
    config.get_settings = lambda: SimpleNamespace(**values)

    import pytest

    return pytest.main([
        "tests", "-v", "--tb=short", "-p", "no:cacheprovider",
        f"--junitxml={evidence / 'resultados_pytest.xml'}",
    ])


if __name__ == "__main__":
    raise SystemExit(main())
