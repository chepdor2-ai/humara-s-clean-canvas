from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.edit import Edit
from app.schemas.sentence import SentenceResult


class CheckResponse(BaseModel):
    request_id: str = Field("", description="Unique request identifier (UUID v4)")
    engine_version: str = Field("", description="Semantic version of the correction engine")
    corrected_text: str = Field(..., description="Full corrected document text")
    sentences: list[SentenceResult] = Field(default_factory=list)
    total_edits: int = Field(0)
    applied_edits: int = Field(0)
    rejected_edit_count: int = Field(0)
    rejected_edits: list[Edit] = Field(default_factory=list, description="Edits that were rejected by the pipeline")
    warnings: list[str] = Field(default_factory=list)
    ml_used: bool = Field(False, description="Whether ML corrector was used")
    ml_available: bool = Field(True, description="Whether ML model is loaded")
    processing_time_ms: float = Field(0.0)
    timings: dict[str, float] = Field(default_factory=dict, description="Per-stage wall-clock ms")
    rules_version: str = Field("", description="Hash of loaded rule packs")
    domain: str = Field("general", description="Domain used for this request")


class BatchCheckResponse(BaseModel):
    results: list[CheckResponse]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    ml_loaded: bool = False
    rules_loaded: int = 0
    uptime_seconds: float = 0.0


class MetricsResponse(BaseModel):
    total_requests: int = 0
    avg_latency_ms: float = 0.0
    avg_sentence_count: float = 0.0
    edit_rejection_rate: float = 0.0
    ml_fallback_rate: float = 0.0
    error_category_counts: dict[str, int] = Field(default_factory=dict)
    stage_avg_ms: dict[str, float] = Field(default_factory=dict, description="Average ms per pipeline stage")
    rule_pack_stats: dict[str, int] = Field(default_factory=dict, description="Edits triggered per rule pack")
    verdicts: dict[str, int] = Field(default_factory=dict, description="Count of each verdict type")


class ReloadResponse(BaseModel):
    status: str = "ok"
    rules_loaded: int = 0


class ReplayTrace(BaseModel):
    """Full pipeline replay trace for a single sentence — useful for debugging."""
    sentence_index: int
    original: str
    after_normalize: str = ""
    after_rules: str = ""
    after_ml: str = ""
    after_conflict: str = ""
    final: str = ""
    protected_spans: list[dict] = Field(default_factory=list)
    edits_before_conflict: list[dict] = Field(default_factory=list)
    edits_after_conflict: list[dict] = Field(default_factory=list)
    edits_after_guard: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    verdict: str = ""
    confidence: float = 0.0
