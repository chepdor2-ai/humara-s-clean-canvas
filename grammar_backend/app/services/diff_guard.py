from __future__ import annotations

import re

from app.core.constants import MAX_TOKEN_CHANGE_RATIO, MAX_CONTENT_WORD_CHANGES
from app.core.logging import get_logger
from app.schemas.edit import Edit
from app.services.protected_spans import ProtectedSpan

log = get_logger(__name__)

# Common function words that are safe to change
_FUNCTION_WORDS = frozenset(
    "a an the is am are was were be been being have has had do does did "
    "shall will should would may might can could must need to of in on at "
    "by for with from into onto upon as but or and nor so yet if then "
    "that this these those it its he she they we you his her their our my".split()
)

# Maximum char-level span a single edit may cover
MAX_SINGLE_EDIT_SPAN = 80

# Named-entity-like pattern: capitalized multi-word sequence (2+ words)
_NE_PATTERN = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b")


class DiffGuard:
    """Safety wall that rejects edits which look like paraphrasing."""

    def __init__(
        self,
        max_token_change_ratio: float = MAX_TOKEN_CHANGE_RATIO,
        max_content_word_changes: int = MAX_CONTENT_WORD_CHANGES,
    ) -> None:
        self.max_token_change_ratio = max_token_change_ratio
        self.max_content_word_changes = max_content_word_changes

    def check(
        self,
        original: str,
        corrected: str,
        edits: list[Edit],
        protected_spans: list[ProtectedSpan] | None = None,
    ) -> tuple[str, list[Edit], list[str]]:
        """Validate proposed corrections against safety thresholds.

        Returns (final_text, updated_edits, warnings).
        If edits are too aggressive, they are rejected and the original text is kept.
        """
        warnings: list[str] = []
        protected = protected_spans or []

        # ── Per-edit safety checks ──
        self._check_protected_span_edits(edits, protected, warnings)
        self._check_citation_quotation_edits(edits, original, protected, warnings)
        self._check_named_entity_edits(edits, original, warnings)
        self._check_single_edit_span(edits, warnings)

        orig_tokens = original.split()
        corr_tokens = corrected.split()

        if not orig_tokens:
            return corrected, edits, warnings

        # ── Token change ratio ──
        changed = sum(1 for a, b in zip(orig_tokens, corr_tokens) if a != b)
        changed += abs(len(orig_tokens) - len(corr_tokens))
        ratio = changed / len(orig_tokens) if orig_tokens else 0.0

        if ratio > self.max_token_change_ratio:
            warnings.append(
                f"Token change ratio {ratio:.2f} exceeds threshold {self.max_token_change_ratio:.2f}"
            )
            for e in edits:
                if e.source == "ml" and e.applied:
                    e.applied = False
                    e.reason = "token change ratio too high"
            return self._rebuild_or_fallback(original, edits, warnings)

        # ── Content word changes ──
        content_changes = 0
        for a, b in zip(orig_tokens, corr_tokens):
            if a != b and a.lower() not in _FUNCTION_WORDS and b.lower() not in _FUNCTION_WORDS:
                content_changes += 1

        if content_changes > self.max_content_word_changes:
            high_conf = all(e.confidence >= 0.90 for e in edits if e.source == "ml" and e.applied)
            if not high_conf:
                warnings.append(
                    f"Content word changes ({content_changes}) exceed threshold ({self.max_content_word_changes})"
                )
                for e in edits:
                    if e.source == "ml" and e.applied:
                        e.applied = False
                        e.reason = "too many content word changes"
                return self._rebuild_or_fallback(original, edits, warnings)

        # ── Sentence length shift ──
        len_ratio = len(corr_tokens) / len(orig_tokens) if orig_tokens else 1.0
        if len_ratio < 0.7 or len_ratio > 1.3:
            warnings.append(f"Sentence length shifted {len_ratio:.2f}x — possible paraphrase")
            for e in edits:
                if e.source == "ml" and e.applied:
                    e.applied = False
                    e.reason = "sentence length shift too large"
            return self._rebuild_or_fallback(original, edits, warnings)

        # Rebuild if any per-edit checks rejected edits
        if any(not e.applied and e.reason for e in edits):
            return self._rebuild_or_fallback(original, edits, warnings)

        return corrected, edits, warnings

    # ── Per-edit safety checks ──────────────────────────────────

    def _check_protected_span_edits(
        self,
        edits: list[Edit],
        protected: list[ProtectedSpan],
        warnings: list[str],
    ) -> None:
        """Reject any edit that overlaps an immutable protected span."""
        for edit in edits:
            if not edit.applied:
                continue
            for ps in protected:
                if ps.mutability != "immutable":
                    continue
                if ps.start < edit.char_offset_end and edit.char_offset_start < ps.end:
                    edit.applied = False
                    edit.reason = f"overlaps immutable protected span ({ps.kind})"
                    warnings.append(
                        f"Edit at {edit.char_offset_start}-{edit.char_offset_end} "
                        f"rejected: overlaps immutable {ps.kind}"
                    )
                    log.debug(
                        "diff_guard: rejected edit [%s] at %d-%d — immutable %s",
                        edit.rule_id or edit.source,
                        edit.char_offset_start,
                        edit.char_offset_end,
                        ps.kind,
                    )
                    break

    def _check_citation_quotation_edits(
        self,
        edits: list[Edit],
        original: str,
        protected: list[ProtectedSpan],
        warnings: list[str],
    ) -> None:
        """Reject edits that modify content inside citations or quotations."""
        cit_quote_types = frozenset({
            "citation", "multi_citation", "quotation", "inline_quote",
        })
        for edit in edits:
            if not edit.applied:
                continue
            for ps in protected:
                if ps.kind not in cit_quote_types:
                    continue
                if ps.start < edit.char_offset_end and edit.char_offset_start < ps.end:
                    edit.applied = False
                    edit.reason = f"modifies {ps.kind} content"
                    warnings.append(
                        f"Edit at {edit.char_offset_start}-{edit.char_offset_end} "
                        f"rejected: modifies {ps.kind}"
                    )
                    break

    def _check_named_entity_edits(
        self,
        edits: list[Edit],
        original: str,
        warnings: list[str],
    ) -> None:
        """Reject ML edits that change a likely named entity."""
        ne_spans: list[tuple[int, int, str]] = []
        for m in _NE_PATTERN.finditer(original):
            ne_spans.append((m.start(), m.end(), m.group()))

        if not ne_spans:
            return

        for edit in edits:
            if not edit.applied or edit.source != "ml":
                continue
            for ne_start, ne_end, ne_text in ne_spans:
                if ne_start < edit.char_offset_end and edit.char_offset_start < ne_end:
                    # The edit overlaps a named entity — check if it actually changes the NE
                    orig_slice = original[edit.char_offset_start : edit.char_offset_end]
                    if orig_slice != edit.corrected:
                        edit.applied = False
                        edit.reason = f"modifies named entity '{ne_text}'"
                        warnings.append(
                            f"Edit at {edit.char_offset_start}-{edit.char_offset_end} "
                            f"rejected: modifies named entity '{ne_text}'"
                        )
                        break

    def _check_single_edit_span(
        self, edits: list[Edit], warnings: list[str]
    ) -> None:
        """Reject individual edits that span too many characters (likely paraphrase)."""
        for edit in edits:
            if not edit.applied or edit.source != "ml":
                continue
            span_len = edit.char_offset_end - edit.char_offset_start
            if span_len > MAX_SINGLE_EDIT_SPAN:
                edit.applied = False
                edit.reason = f"edit span {span_len} chars exceeds max {MAX_SINGLE_EDIT_SPAN}"
                warnings.append(
                    f"ML edit at {edit.char_offset_start}-{edit.char_offset_end} "
                    f"rejected: span {span_len} > {MAX_SINGLE_EDIT_SPAN}"
                )

    # ── Rebuild ─────────────────────────────────────────────────

    def _rebuild_or_fallback(
        self, original: str, edits: list[Edit], warnings: list[str]
    ) -> tuple[str, list[Edit], list[str]]:
        """When ML edits are rejected, apply only the non-ML edits."""
        applied = [e for e in edits if e.applied]
        if not applied:
            return original, edits, warnings

        # Re-apply only safe edits on the original text
        result = original
        # Sort by offset descending so replacements don't shift indices
        safe_edits = sorted(applied, key=lambda e: -e.char_offset_start)
        for e in safe_edits:
            result = result[: e.char_offset_start] + e.corrected + result[e.char_offset_end :]

        return result, edits, warnings
