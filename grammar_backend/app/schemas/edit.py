from __future__ import annotations

from pydantic import BaseModel, Field


class Edit(BaseModel):
    type: str = Field(..., description="Edit category: spacing, punctuation, agreement, …")
    original: str = Field(..., description="Original span text")
    corrected: str = Field(..., description="Corrected span text")
    char_offset_start: int = Field(..., description="Char offset start in original sentence")
    char_offset_end: int = Field(..., description="Char offset end in original sentence")
    confidence: float = Field(..., ge=0.0, le=1.0)
    applied: bool = Field(True, description="Whether this edit was applied")
    reason: str | None = Field(None, description="Reason for rejection if not applied")
    source: str = Field("rule", description="rule | ml | normalizer")
    rule_id: str | None = Field(None, description="ID of the rule that produced this edit")
