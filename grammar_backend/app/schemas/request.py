from __future__ import annotations

from pydantic import BaseModel, Field


class CheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000, description="Text to check")
    language: str = Field("en-US", description="Language code")
    mode: str = Field("standard", description="Correction mode: standard | strict")
    domain: str = Field("general", description="Domain: general | academic | legal | medical | technical")
    preserve_citations: bool = Field(True, description="Protect citation spans")
    preserve_quotes: bool = Field(True, description="Protect quoted text")
    strict_minimal_edits: bool = Field(False, description="Extra-conservative editing")
    max_sentence_change_ratio: float = Field(
        0.15, ge=0.0, le=1.0, description="Max fraction of tokens changed per sentence"
    )


class SentenceCheckRequest(BaseModel):
    sentence: str = Field(..., min_length=1, max_length=2000)
    language: str = Field("en-US")
    domain: str = Field("general")
    preserve_citations: bool = Field(True)
    preserve_quotes: bool = Field(True)
    strict_minimal_edits: bool = Field(False)
    max_sentence_change_ratio: float = Field(0.15, ge=0.0, le=1.0)


class BatchCheckRequest(BaseModel):
    items: list[CheckRequest] = Field(..., min_length=1, max_length=20)
