# Entorno de la ejecucion

Fecha de corte: 8 de noviembre de 2026.

- Python: 3.12.10.
- Sistema: Windows.
- Entorno virtual temporal de pruebas con acceso a paquetes del interprete base.
- Configuracion: valores ficticios; no se cargo `.env`.
- Base de datos: no conectada; integraciones deshabilitadas.
- Servicios externos: no invocados por el lanzador; las pruebas correspondientes usan simulaciones.
- Revision local base: `731f9b6` (incluye la correccion del chatbot).
- Advertencias informadas por pytest: 4 (ReportLab y python-jose).

Estas son las versiones utilizadas en esta ejecucion, no una certificacion de que todos los paquetes coincidan con `backend/requirements.txt` ni de que sean los instalados en Render.

| Paquete | Version instalada |
|---|---|
| `pytest` | 8.3.4 |
| `google-genai` | 2.24.0 |
| `fastapi` | 0.115.6 |
| `sqlalchemy` | 2.0.49 |
| `asyncpg` | 0.30.0 |
| `pydantic` | 2.14.3 |
| `pydantic-settings` | 2.7.1 |
| `httpx` | 0.28.1 |
| `python-jose` | 3.3.0 |
| `reportlab` | 4.2.5 |
| `openpyxl` | 3.1.5 |
| `stripe` | 15.6.1 |
| `supabase` | 2.34.1 |
| `scikit-learn` | No instalado en este entorno |
| `markdownify` | 1.2.3 |
