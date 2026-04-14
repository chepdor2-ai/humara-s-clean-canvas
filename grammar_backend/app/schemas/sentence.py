from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.edit import Edit


class SentenceResult(BaseModel):
    index: int = Field(..., description="Sentence index in the document")
    paragraph_index: int = Field(0, description="Paragraph index in the document")
    char_offset_start: int = Field(0, description="Start char offset in the original document")
    char_offset_end: int = Field(0, description="End char offset in the original document")
    original: str
    corrected: str
    edits: list[Edit] = Field(default_factory=list)
    verdict: str = Field("safe", description="safe | review | rejected")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    scoring_signals: dict | None = Field(None, description="Detailed scoring breakdown")
