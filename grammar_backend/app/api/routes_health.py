from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.constants import ENGINE_VERSION
from app.schemas.response import HealthResponse
from app.services.pipeline import GrammarPipeline, get_pipeline

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(pipeline: GrammarPipeline = Depends(get_pipeline)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=ENGINE_VERSION,
        ml_loaded=pipeline.ml_corrector.model_loaded if pipeline.ml_corrector else False,
        rules_loaded=pipeline.rule_engine.rule_count,
        uptime_seconds=round(time.time() - pipeline._start_time, 1),
    )


@router.get("/ready")
async def readiness(pipeline: GrammarPipeline = Depends(get_pipeline)):
    """Readiness check — returns 503 if pipeline isn't ready."""
    if pipeline.rule_engine.rule_count == 0:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "No rules loaded"},
        )
    return {"status": "ready", "rules": pipeline.rule_engine.rule_count}
