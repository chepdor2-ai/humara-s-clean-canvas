"""Grammar Correction API — orchestrates rules + ML for minimal, trustworthy edits."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.services.pipeline import init_pipeline

# ── Routes ──
from app.api.routes_check import router as check_router
from app.api.routes_health import router as health_router
from app.api.routes_metrics import router as metrics_router
from app.api.routes_admin import router as admin_router

setup_logging()
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("Starting Grammar Correction API")
    await init_pipeline()
    log.info("Pipeline ready")
    yield
    log.info("Shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request timeout middleware ──
    @app.middleware("http")
    async def timeout_middleware(request: Request, call_next):
        t0 = time.time()
        response = await call_next(request)
        elapsed = time.time() - t0
        response.headers["X-Processing-Time-Ms"] = str(round(elapsed * 1000, 2))
        if elapsed > 30.0:
            log.warning("Slow request: %s took %.1fs", request.url.path, elapsed)
        return response

    # ── Global error handler ──
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.exception("Unhandled error on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. Please try again."},
        )

    # ── Register routers ──
    app.include_router(check_router)
    app.include_router(health_router)
    app.include_router(metrics_router)
    app.include_router(admin_router)

    return app


app = create_app()
