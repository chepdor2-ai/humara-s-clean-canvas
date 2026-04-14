from __future__ import annotations

from app.schemas.edit import Edit
from app.schemas.response import CheckResponse
from app.schemas.sentence import SentenceResult


class Formatter:
    """Builds the final JSON-ready CheckResponse from pipeline results."""

    def format(
        self,
        original_text: str,
        sentence_results: list[SentenceResult],
        ml_used: bool = False,
        warnings: list[str] | None = None,
    ) -> CheckResponse:
        corrected_parts: list[str] = []
        total_edits = 0
        applied_edits = 0
        rejected_edits = 0

        # Rebuild corrected text from sentence results
        last_end = 0
        for sr in sentence_results:
            # Preserve any text between sentences (whitespace, newlines)
            # Use char offsets if available; otherwise just join
            corrected_parts.append(sr.corrected)
            for e in sr.edits:
                total_edits += 1
                if e.applied:
                    applied_edits += 1
                else:
                    rejected_edits += 1

        corrected_text = " ".join(corrected_parts)

        # Try to preserve original paragraph structure
        if "\n" in original_text:
            corrected_text = self._preserve_paragraphs(original_text, sentence_results)

        return CheckResponse(
            corrected_text=corrected_text,
            sentences=sentence_results,
            total_edits=total_edits,
            applied_edits=applied_edits,
            rejected_edit_count=rejected_edits,
            warnings=warnings or [],
            ml_used=ml_used,
        )

    def _preserve_paragraphs(
        self, original: str, sentence_results: list[SentenceResult]
    ) -> str:
        """Best-effort reconstruction that keeps paragraph breaks."""
        # Map original sentence texts to their corrected versions
        mapping: dict[str, str] = {}
        for sr in sentence_results:
            mapping[sr.original.strip()] = sr.corrected.strip()

        result = original
        for orig, corr in mapping.items():
            if orig != corr:
                result = result.replace(orig, corr, 1)
        return result
