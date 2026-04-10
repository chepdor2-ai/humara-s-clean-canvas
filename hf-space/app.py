#!/usr/bin/env python3
"""
Hugging Face Spaces wrapper for oxygen_server.py
Adds Bearer-token authentication via HF_API_SECRET environment variable
and runs on port 7860 (HF Spaces default).

Deploy instructions:
  1. Upload this file + oxygen_server.py + validation_post_process.py + oxygen-model/ + Dockerfile + requirements.txt
  2. Set HF_API_SECRET in the Space's Settings → Repository secrets
"""
import os
import hmac
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

# Import the full server app (model loads via its own @app.on_event("startup"))
from oxygen_server import app  # noqa: F401 — re-exported for uvicorn

logger = logging.getLogger(__name__)

API_SECRET = os.environ.get("HF_API_SECRET", "")


@app.get("/")
async def root():
    """Root endpoint — basic info page."""
    return {"service": "Oxygen T5 Humanizer", "status": "running", "docs": "/docs"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Protect /humanize endpoint with Bearer token auth."""
    # Allow health check and docs without auth
    if request.url.path in ("/health", "/docs", "/openapi.json", "/"):
        return await call_next(request)

    if not API_SECRET:
        # No secret configured — allow all requests (dev mode)
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"error": "Missing Bearer token"})

    token = auth_header[7:]
    if not hmac.compare_digest(token, API_SECRET):
        return JSONResponse(status_code=403, content={"error": "Invalid API token"})

    return await call_next(request)
