from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── General ──
    app_name: str = "Grammar Correction API"
    debug: bool = False
    log_level: str = "INFO"

    # ── Server ──
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1

    # ── Paths ──
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    rules_dir: Path = base_dir / "app" / "rules"
    models_dir: Path = base_dir / "app" / "models" / "gec_model"

    # ── ML ──
    gec_model_name: str = "gotutiyan/gector-roberta-base-5k"
    use_onnx: bool = False
    ml_enabled: bool = True
    ml_timeout_seconds: float = 5.0
    ml_max_sentence_length: int = 128

    # ── Pipeline ──
    max_text_length: int = 50_000
    max_sentences: int = 500
    default_language: str = "en-US"
    default_domain: str = "general"
    default_max_sentence_change_ratio: float = 0.15

    # ── Cache ──
    redis_url: str | None = None
    cache_ttl_seconds: int = 3600

    # ── Metrics ──
    enable_metrics: bool = True

    model_config = {"env_prefix": "GRAMMAR_", "env_file": ".env"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
