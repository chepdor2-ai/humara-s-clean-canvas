from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.schemas.response import ReloadResponse, ReplayTrace
from app.services.pipeline import GrammarPipeline, get_pipeline

router = APIRouter(tags=["admin"])


class RuleToggleRequest(BaseModel):
    rule_id: str = Field(..., description="Rule ID to enable/disable")
    enabled: bool = Field(..., description="Enable or disable")


class MLToggleRequest(BaseModel):
    enabled: bool = Field(..., description="Enable or disable ML corrector")


@router.post("/rules/reload", response_model=ReloadResponse)
async def reload_rules(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> ReloadResponse:
    count = pipeline.rule_engine.load_rules()
    pipeline._compute_rules_hash()
    pipeline.cache.clear()
    return ReloadResponse(status="ok", rules_loaded=count)


@router.post("/rules/toggle")
async def toggle_rule(
    req: RuleToggleRequest,
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """Enable or disable a specific rule by ID."""
    for rule in pipeline.rule_engine._rules:
        if rule.id == req.rule_id:
            rule.enabled = req.enabled
            pipeline.cache.clear()  # invalidate cache after rule change
            return {"status": "ok", "rule_id": req.rule_id, "enabled": req.enabled}
    return {"status": "error", "detail": f"Rule {req.rule_id} not found"}


@router.get("/rules/list")
async def list_rules(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> list[dict]:
    """List all loaded rules with their current status."""
    return [
        {
            "id": r.id,
            "name": r.name,
            "category": r.category,
            "domain": r.domain,
            "enabled": r.enabled,
            "priority": r.priority,
            "confidence": r.confidence,
        }
        for r in pipeline.rule_engine._rules
    ]


@router.post("/ml/toggle")
async def toggle_ml(
    req: MLToggleRequest,
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """Enable or disable ML corrector at runtime."""
    pipeline.ml_corrector._settings.ml_enabled = req.enabled
    if not req.enabled:
        pipeline.ml_corrector.model_loaded = False
    return {
        "status": "ok",
        "ml_enabled": req.enabled,
        "ml_loaded": pipeline.ml_corrector.model_loaded,
    }


@router.post("/cache/clear")
async def clear_cache(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """Clear the sentence cache."""
    pipeline.cache.clear()
    return {"status": "ok", "message": "Cache cleared"}


@router.get("/cache/stats")
async def cache_stats(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """Cache performance statistics."""
    return pipeline.cache.stats


@router.get("/ml/stats")
async def ml_stats(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """ML corrector statistics."""
    return pipeline.ml_corrector.stats


@router.get("/debug/replay", response_model=list[ReplayTrace])
async def get_replay_traces(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> list[ReplayTrace]:
    """Return replay traces from the last processed request."""
    return pipeline._replay_traces


@router.get("/admin/rules/status")
async def rules_status(
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> dict:
    """Rule pack summary: count, version hash, domains."""
    return {
        "rule_count": pipeline.rule_engine.rule_count,
        "rules_version": pipeline._rules_hash,
        "ml_loaded": pipeline.ml_corrector.model_loaded,
        "cache_stats": pipeline.cache.stats,
    }
