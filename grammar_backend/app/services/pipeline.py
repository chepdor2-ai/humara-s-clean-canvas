from __future__ import annotations

import difflib
import hashlib
import time
import uuid
from functools import lru_cache

from app.core.constants import (
    EDIT_GRAMMAR,
    EDIT_SPACING,
    EDIT_PUNCTUATION,
    ENGINE_VERSION,
    STAGE_PARSE,
    STAGE_PROTECTED,
    STAGE_NORMALIZE,
    STAGE_RULES,
    STAGE_ML,
    STAGE_CONFLICT,
    STAGE_DIFF_GUARD,
    STAGE_SCORE,
    STAGE_FORMAT,
    VERDICT_SAFE,
    VERDICT_REVIEW,
    VERDICT_REJECTED,
)
from app.core.logging import get_logger, set_request_id
from app.schemas.edit import Edit
from app.schemas.request import CheckRequest
from app.schemas.response import CheckResponse, ReplayTrace
from app.schemas.sentence import SentenceResult
from app.services.conflict_resolver import ConflictResolver
from app.services.diff_guard import DiffGuard
from app.services.formatter import Formatter
from app.services.ml_corrector import MLCorrector
from app.services.normalizer import Normalizer
from app.services.protected_spans import ProtectedSpansDetector
from app.services.rule_engine import RuleEngine
from app.services.scorer import Scorer
from app.services.sentence_splitter import SentenceSplitter
from app.services.cache import SentenceCache

log = get_logger(__name__)


def _ms_since(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 3)


class GrammarPipeline:
    """Orchestrates the full correction pipeline:

    1. Input validation
    2. Document parsing (sentence splitting)
    3. Protected spans detection
    4. Normalization
    5. Rule-based grammar layer
    6. ML correction layer
    7. Conflict resolution
    8. Diff guard
    9. Scoring
    10. Response formatting
    """

    def __init__(self) -> None:
        self.splitter = SentenceSplitter()
        self.protected_detector = ProtectedSpansDetector()
        self.normalizer = Normalizer()
        self.rule_engine = RuleEngine()
        self.ml_corrector = MLCorrector()
        self.conflict_resolver = ConflictResolver()
        self.diff_guard = DiffGuard()
        self.scorer = Scorer()
        self.formatter = Formatter()
        self.cache = SentenceCache()

        # Simple in-memory metrics
        self.metrics: dict[str, float | int | dict] = {
            "total_requests": 0,
            "avg_latency_ms": 0.0,
            "avg_sentence_count": 0.0,
            "edit_rejection_rate": 0.0,
            "ml_fallback_rate": 0.0,
            "error_category_counts": {},
            "stage_total_ms": {},
            "rule_pack_stats": {},
            "verdicts": {VERDICT_SAFE: 0, VERDICT_REVIEW: 0, VERDICT_REJECTED: 0},
        }
        self._total_latency = 0.0
        self._total_sentences = 0
        self._total_edits = 0
        self._total_rejected = 0
        self._ml_fallbacks = 0
        self._start_time = time.time()  # for uptime tracking
        self._rules_hash = ""  # set after rule load
        self._replay_traces: list[ReplayTrace] = []  # last request's traces
        self._ml_consecutive_failures = 0
        self._ml_circuit_open = False
        self._compute_rules_hash()  # compute initial hash

    @staticmethod
    def _diff_edits(original: str, corrected: str) -> list[Edit]:
        """Build edit list by diffing original vs corrected at char level."""
        if original == corrected:
            return []

        edits: list[Edit] = []
        sm = difflib.SequenceMatcher(None, original, corrected)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                continue
            orig_span = original[i1:i2]
            corr_span = corrected[j1:j2]
            # Classify the edit
            edit_type = EDIT_GRAMMAR
            if orig_span.strip() == corr_span.strip():
                edit_type = EDIT_SPACING
            elif orig_span.replace(" ", "") == corr_span.replace(" ", ""):
                edit_type = EDIT_SPACING
            elif all(c in ".,;:!?\"'()-" for c in orig_span + corr_span if c.strip()):
                edit_type = EDIT_PUNCTUATION

            edits.append(
                Edit(
                    type=edit_type,
                    original=orig_span,
                    corrected=corr_span,
                    char_offset_start=i1,
                    char_offset_end=i2,
                    confidence=0.95,
                    applied=True,
                    source="rule",
                )
            )
        return edits

    async def load_models(self) -> None:
        await self.ml_corrector.load()
        self._compute_rules_hash()

    def _compute_rules_hash(self) -> None:
        """Compute a short hash of loaded rules for versioning."""
        rule_count = self.rule_engine.rule_count
        self._rules_hash = hashlib.md5(
            f"rules-v{rule_count}".encode()
        ).hexdigest()[:8]

    async def run(self, req: CheckRequest) -> CheckResponse:
        # ── Generate request ID and set correlation context ──
        request_id = uuid.uuid4().hex
        set_request_id(request_id)
        log.info("Processing request, text_length=%d domain=%s", len(req.text), req.domain)

        request_t0 = time.perf_counter()
        self.metrics["total_requests"] = int(self.metrics["total_requests"]) + 1
        all_warnings: list[str] = []
        ml_used = False
        timings: dict[str, float] = {}
        replay_traces: list[ReplayTrace] = []

        # ── 1. Parse document into sentences ──
        t0 = time.perf_counter()
        sentences = self.splitter.flat_sentences(req.text)
        timings[STAGE_PARSE] = _ms_since(t0)
        self._total_sentences += len(sentences)
        self.metrics["avg_sentence_count"] = (
            self._total_sentences / int(self.metrics["total_requests"])
        )

        # ── Configure per-request settings ──
        self.protected_detector.preserve_citations = req.preserve_citations
        self.protected_detector.preserve_quotes = req.preserve_quotes
        self.diff_guard.max_token_change_ratio = req.max_sentence_change_ratio

        sentence_results: list[SentenceResult] = []
        all_rejected_edits: list[Edit] = []

        # Aggregate stage timings across sentences
        stage_times: dict[str, float] = {}

        for idx, sent in enumerate(sentences):
            original = sent.text

            try:
                sentence_result = await self._process_sentence(
                    idx, sent, req, stage_times, all_warnings, all_rejected_edits, replay_traces
                )
                if sentence_result.edits and any(e.source == "ml" for e in sentence_result.edits if e.applied):
                    ml_used = True
                sentence_results.append(sentence_result)
            except Exception:
                log.exception("Sentence %d failed, returning original", idx)
                sentence_results.append(
                    SentenceResult(
                        index=idx,
                        paragraph_index=sent.paragraph_index,
                        char_offset_start=sent.start,
                        char_offset_end=sent.end,
                        original=original,
                        corrected=original,
                        edits=[],
                        verdict=VERDICT_SAFE,
                        confidence=1.0,
                    )
                )
        # ── 9. Format response ──
        t0 = time.perf_counter()
        response = self.formatter.format(
            original_text=req.text,
            sentence_results=sentence_results,
            ml_used=ml_used,
            warnings=all_warnings,
        )
        stage_times[STAGE_FORMAT] = stage_times.get(STAGE_FORMAT, 0) + _ms_since(t0)

        # Attach metadata
        timings.update(stage_times)
        response.request_id = request_id
        response.engine_version = ENGINE_VERSION
        response.timings = {k: round(v, 3) for k, v in timings.items()}
        response.rejected_edits = all_rejected_edits
        response.rejected_edit_count = len(all_rejected_edits)
        response.ml_available = self.ml_corrector.model_loaded
        response.rules_version = self._rules_hash
        response.domain = req.domain

        # ── Track latency ──
        request_latency = _ms_since(request_t0)
        self._total_latency += request_latency
        self.metrics["avg_latency_ms"] = round(
            self._total_latency / int(self.metrics["total_requests"]), 2
        )

        # ── Track per-stage averages ──
        stage_totals = self.metrics.get("stage_total_ms", {})
        if isinstance(stage_totals, dict):
            for k, v in stage_times.items():
                stage_totals[k] = stage_totals.get(k, 0) + v
            self.metrics["stage_total_ms"] = stage_totals

        # Store replay traces for debug endpoint
        self._replay_traces = replay_traces

        log.info(
            "Request complete, sentences=%d edits=%d rejected=%d latency_ms=%.1f",
            len(sentence_results),
            response.total_edits,
            response.rejected_edit_count,
            request_latency,
        )
        return response

    async def _process_sentence(
        self,
        idx: int,
        sent,
        req: CheckRequest,
        stage_times: dict[str, float],
        all_warnings: list[str],
        all_rejected_edits: list[Edit],
        replay_traces: list[ReplayTrace],
    ) -> SentenceResult:
        """Process a single sentence through the full pipeline."""
        original = sent.text

        # ── Cache check ──
        cached = self.cache.get(
            original, domain=req.domain, mode=req.mode,
            rules_version=self._rules_hash,
        )
        if cached is not None:
            cached_edits = [Edit(**e) for e in cached.edits_json]
            return SentenceResult(
                index=idx,
                paragraph_index=sent.paragraph_index,
                char_offset_start=sent.start,
                char_offset_end=sent.end,
                original=original,
                corrected=cached.corrected,
                edits=cached_edits,
                verdict=cached.verdict,
                confidence=cached.confidence,
            )

        # ── 2. Detect protected spans ──
        t0 = time.perf_counter()
        protected = self.protected_detector.detect(original)
        stage_times[STAGE_PROTECTED] = stage_times.get(STAGE_PROTECTED, 0) + _ms_since(t0)

        # ── 3. Normalize ──
        t0 = time.perf_counter()
        normalized, _norm_edits = self.normalizer.normalize(original, protected_spans=protected)
        stage_times[STAGE_NORMALIZE] = stage_times.get(STAGE_NORMALIZE, 0) + _ms_since(t0)

        # ── 4. Rule-based corrections ──
        t0 = time.perf_counter()
        protected_norm = self.protected_detector.detect(normalized)
        rule_corrected, _rule_edits = self.rule_engine.apply(
            normalized, domain=req.domain, protected_spans=protected_norm
        )
        stage_times[STAGE_RULES] = stage_times.get(STAGE_RULES, 0) + _ms_since(t0)

        # ── 5. ML corrections (conditional second pass) ──
        t0 = time.perf_counter()
        ml_corrected = rule_corrected
        if not self._ml_circuit_open and self.ml_corrector.should_run(
            original, rule_corrected, _rule_edits,
            strict_minimal=req.strict_minimal_edits,
        ):
            ml_corrected, _ml_edits = await self.ml_corrector.correct(
                rule_corrected, protected_spans=protected_norm
            )
            if _ml_edits:
                self._ml_consecutive_failures = 0
            elif self.ml_corrector._total_skipped > 0:
                self._ml_consecutive_failures += 1
                if self._ml_consecutive_failures >= 5:
                    self._ml_circuit_open = True
                    log.warning("ML circuit breaker opened after %d consecutive failures",
                                self._ml_consecutive_failures)
        elif not self.ml_corrector.model_loaded:
            self._ml_fallbacks += 1
            self.metrics["ml_fallback_rate"] = (
                self._ml_fallbacks / int(self.metrics["total_requests"])
            )
        stage_times[STAGE_ML] = stage_times.get(STAGE_ML, 0) + _ms_since(t0)

        # ── 6. Build accurate edits by diffing original vs final ──
        final_candidate = ml_corrected
        edits = self._diff_edits(original, final_candidate)

        # ── 6b. Conflict resolution ──
        t0 = time.perf_counter()
        resolved_edits = self.conflict_resolver.resolve(
            edits, protected_spans=protected_norm
        )
        stage_times[STAGE_CONFLICT] = stage_times.get(STAGE_CONFLICT, 0) + _ms_since(t0)

        # ── 7. Diff guard ──
        t0 = time.perf_counter()
        final_text, guarded_edits, warnings = self.diff_guard.check(
            original, final_candidate, resolved_edits,
            protected_spans=protected_norm,
        )
        stage_times[STAGE_DIFF_GUARD] = stage_times.get(STAGE_DIFF_GUARD, 0) + _ms_since(t0)
        all_warnings.extend(warnings)

        # ── 8. Score ──
        t0 = time.perf_counter()
        verdict, confidence, signals = self.scorer.score_detailed(
            original, final_text, guarded_edits
        )
        stage_times[STAGE_SCORE] = stage_times.get(STAGE_SCORE, 0) + _ms_since(t0)

        # ── Track verdict metrics ──
        verdicts = self.metrics.get("verdicts", {})
        if isinstance(verdicts, dict):
            verdicts[verdict] = verdicts.get(verdict, 0) + 1
            self.metrics["verdicts"] = verdicts

        # ── Build replay trace ──
        replay_traces.append(
            ReplayTrace(
                sentence_index=idx,
                original=original,
                after_normalize=normalized,
                after_rules=rule_corrected,
                after_ml=ml_corrected,
                final=final_text,
                protected_spans=[
                    {"text": ps.text, "kind": ps.kind, "start": ps.start, "end": ps.end}
                    for ps in protected
                ],
                edits_before_conflict=[e.model_dump() for e in edits],
                edits_after_conflict=[e.model_dump() for e in resolved_edits],
                edits_after_guard=[e.model_dump() for e in guarded_edits],
                warnings=warnings,
                verdict=verdict,
                confidence=confidence,
            )
        )

        # ── Track metrics ──
        for e in guarded_edits:
            self._total_edits += 1
            cat = e.type
            cats = self.metrics.get("error_category_counts", {})
            if isinstance(cats, dict):
                cats[cat] = cats.get(cat, 0) + 1
                self.metrics["error_category_counts"] = cats
            if e.rule_id:
                rp = self.metrics.get("rule_pack_stats", {})
                if isinstance(rp, dict):
                    pack = e.rule_id.split("-")[0] if "-" in e.rule_id else "other"
                    rp[pack] = rp.get(pack, 0) + 1
                    self.metrics["rule_pack_stats"] = rp
            if not e.applied:
                self._total_rejected += 1
                all_rejected_edits.append(e)

        if self._total_edits > 0:
            self.metrics["edit_rejection_rate"] = self._total_rejected / self._total_edits

        result = SentenceResult(
            index=idx,
            paragraph_index=sent.paragraph_index,
            char_offset_start=sent.start,
            char_offset_end=sent.end,
            original=sent.text,
            corrected=final_text,
            edits=guarded_edits,
            verdict=verdict,
            confidence=confidence,
            scoring_signals=signals.to_dict(),
        )

        # ── Store in cache ──
        self.cache.put(
            sentence=original,
            domain=req.domain,
            mode=req.mode,
            rules_version=self._rules_hash,
            corrected=final_text,
            edits_json=[e.model_dump() for e in guarded_edits],
            verdict=verdict,
            confidence=confidence,
        )

        return result


_pipeline: GrammarPipeline | None = None


async def init_pipeline() -> GrammarPipeline:
    global _pipeline
    _pipeline = GrammarPipeline()
    await _pipeline.load_models()
    return _pipeline


def get_pipeline() -> GrammarPipeline:
    if _pipeline is None:
        raise RuntimeError("Pipeline not initialized — call init_pipeline() at startup")
    return _pipeline
