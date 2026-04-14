from __future__ import annotations

import hashlib


def sentence_cache_key(
    sentence: str,
    language: str = "en-US",
    domain: str = "general",
    rule_version: str = "1",
    model_version: str = "1",
) -> str:
    raw = f"{sentence.strip().lower()}|{language}|{domain}|{rule_version}|{model_version}"
    return hashlib.sha256(raw.encode()).hexdigest()
