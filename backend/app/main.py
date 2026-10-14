import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import (
    auth,
    branches,
    chat,
    cities,
    collections,
    customers,
    dashboard,
    dispatches,
    inventory,
    logs,
    payment_methods,
    payments,
    products,
    purchase_history,
    recommendations,
    reports,
    reservations,
    sales,
    seasons,
    suppliers,
    team,
)

settings = get_settings()
logger = logging.getLogger("app.errors")

app = FastAPI(
    title="API Ropa Unisex",
    description="Backend unico para web (Angular) y mobile (Flutter)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Sin esto, una excepcion no controlada la resuelve directamente
    # ServerErrorMiddleware por fuera del CORSMiddleware y la respuesta
    # sale sin cabeceras CORS (el navegador lo reporta como error de CORS
    # en vez de mostrar el 500 real). Al capturarla aca, FastAPI la trata
    # como una respuesta normal y si pasa por el CORSMiddleware.
    logger.error(
        "Excepcion no controlada en %s %s:\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    body = {"detail": "Internal Server Error"}
    if settings.DEBUG:
        body["exception_type"] = type(exc).__name__
        body["exception_detail"] = str(exc)
    return JSONResponse(status_code=500, content=body)


@app.get("/")
def root():
    return {"message": "API Ropa Unisex", "docs": "/docs", "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


for router in (
    auth.router,
    products.router,
    inventory.router,
    dispatches.router,
    team.router,
    cities.router,
    seasons.router,
    suppliers.router,
    collections.router,
    branches.router,
    customers.router,
    chat.router,
    dashboard.router,
    payment_methods.router,
    payments.router,
    recommendations.router,
    reports.router,
    sales.router,
    reservations.router,
    purchase_history.router,
    logs.router,
):
    app.include_router(router)
