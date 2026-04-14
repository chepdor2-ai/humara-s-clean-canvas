from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class CacheEntry:
    corrected: str
    edits_json: list[dict]
    verdict: str
    confidence: float
    created_at: float = field(default_factory=time.time)


class SentenceCache:
    """In-memory LRU sentence cache with TTL.

    Cache key = hash(normalized_sentence + domain + mode + rules_version).
    Falls back to no-op when Redis is configured but not available.
    """

    def __init__(self, max_size: int = 5000) -> None:
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._max_size = max_size
        self._settings = get_settings()
        self._ttl = self._settings.cache_ttl_seconds
        self._hits = 0
        self._misses = 0

    @property
    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 3) if total > 0 else 0.0,
        }

    @staticmethod
    def _make_key(
        sentence: str,
        domain: str,
        mode: str,
        rules_version: str,
    ) -> str:
        raw = f"{sentence.strip().lower()}|{domain}|{mode}|{rules_version}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def get(
        self,
        sentence: str,
        domain: str = "general",
        mode: str = "standard",
        rules_version: str = "",
    ) -> CacheEntry | None:
        key = self._make_key(sentence, domain, mode, rules_version)
        entry = self._cache.get(key)
        if entry is None:
            self._misses += 1
            return None

        # Check TTL
        if time.time() - entry.created_at > self._ttl:
            del self._cache[key]
            self._misses += 1
            return None

        # Move to end (most recently used)
        self._cache.move_to_end(key)
        self._hits += 1
        return entry

    def put(
        self,
        sentence: str,
        domain: str,
        mode: str,
        rules_version: str,
        corrected: str,
        edits_json: list[dict],
        verdict: str,
        confidence: float,
    ) -> None:
        key = self._make_key(sentence, domain, mode, rules_version)
        self._cache[key] = CacheEntry(
            corrected=corrected,
            edits_json=edits_json,
            verdict=verdict,
            confidence=confidence,
        )
        self._cache.move_to_end(key)

        # Evict oldest if over capacity
        while len(self._cache) > self._max_size:
            self._cache.popitem(last=False)

    def clear(self) -> None:
        self._cache.clear()
        self._hits = 0
        self._misses = 0
