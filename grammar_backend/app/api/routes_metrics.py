from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.response import MetricsResponse
from app.services.pipeline import GrammarPipeline, get_pipeline

router = APIRouter(tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
async def metrics(pipeline: GrammarPipeline = Depends(get_pipeline)) -> MetricsResponse:
    m = pipeline.metrics
    total = int(m.get("total_requests", 0)) or 1
    stage_totals = m.get("stage_total_ms", {})
    stage_avg = {}
    if isinstance(stage_totals, dict):
        stage_avg = {k: round(v / total, 2) for k, v in stage_totals.items()}
    return MetricsResponse(
        total_requests=m.get("total_requests", 0),
        avg_latency_ms=m.get("avg_latency_ms", 0.0),
        avg_sentence_count=m.get("avg_sentence_count", 0.0),
        edit_rejection_rate=m.get("edit_rejection_rate", 0.0),
        ml_fallback_rate=m.get("ml_fallback_rate", 0.0),
        error_category_counts=m.get("error_category_counts", {}),
        stage_avg_ms=stage_avg,
        rule_pack_stats=m.get("rule_pack_stats", {}),
        verdicts=m.get("verdicts", {}),
    )
