from __future__ import annotations

from dataclasses import dataclass, field

from app.core.constants import (
    CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM,
    CONFIDENCE_LOW,
    VERDICT_SAFE,
    VERDICT_REVIEW,
    VERDICT_REJECTED,
)
from app.schemas.edit import Edit


@dataclass
class ScoringSignals:
    """Explainable scoring signals for a sentence's corrections."""

    edit_count: int = 0
    applied_count: int = 0
    rejected_count: int = 0
    avg_confidence: float = 0.0
    min_confidence: float = 1.0
    change_ratio: float = 0.0
    has_ml_edits: bool = False
    has_rule_edits: bool = False
    has_normalizer_edits: bool = False
    high_risk_edit_types: list[str] = field(default_factory=list)
    explanation: str = ""

    def to_dict(self) -> dict:
        return {
            "edit_count": self.edit_count,
            "applied_count": self.applied_count,
            "rejected_count": self.rejected_count,
            "avg_confidence": round(self.avg_confidence, 3),
            "min_confidence": round(self.min_confidence, 3),
            "change_ratio": round(self.change_ratio, 4),
            "has_ml_edits": self.has_ml_edits,
            "has_rule_edits": self.has_rule_edits,
            "has_normalizer_edits": self.has_normalizer_edits,
            "high_risk_edit_types": self.high_risk_edit_types,
            "explanation": self.explanation,
        }


# Edit types considered higher risk (can change meaning)
_HIGH_RISK_TYPES = {"agreement", "tense", "preposition", "grammar"}


class Scorer:
    """Multi-signal scorer — assigns verdict + confidence with explainability."""

    def score(
        self,
        original: str,
        corrected: str,
        edits: list[Edit],
    ) -> tuple[str, float]:
        """Return (verdict, overall_confidence)."""
        signals = self.compute_signals(original, corrected, edits)
        verdict, confidence = self._decide(signals)
        return verdict, confidence

    def score_detailed(
        self,
        original: str,
        corrected: str,
        edits: list[Edit],
    ) -> tuple[str, float, ScoringSignals]:
        """Return (verdict, confidence, signals) with full explainability."""
        signals = self.compute_signals(original, corrected, edits)
        verdict, confidence = self._decide(signals)
        return verdict, confidence, signals

    def compute_signals(
        self,
        original: str,
        corrected: str,
        edits: list[Edit],
    ) -> ScoringSignals:
        """Compute all scoring signals from the edit set."""
        signals = ScoringSignals()

        if not edits:
            signals.explanation = "No edits — sentence is clean."
            return signals

        applied = [e for e in edits if e.applied]
        rejected = [e for e in edits if not e.applied]

        signals.edit_count = len(edits)
        signals.applied_count = len(applied)
        signals.rejected_count = len(rejected)

        if applied:
            confidences = [e.confidence for e in applied]
            signals.avg_confidence = sum(confidences) / len(confidences)
            signals.min_confidence = min(confidences)
        else:
            signals.avg_confidence = 0.0
            signals.min_confidence = 0.0

        # ── Token change ratio ──
        orig_tokens = original.split()
        corr_tokens = corrected.split()
        changed = sum(1 for a, b in zip(orig_tokens, corr_tokens) if a != b)
        changed += abs(len(orig_tokens) - len(corr_tokens))
        signals.change_ratio = changed / len(orig_tokens) if orig_tokens else 0.0

        # ── Source analysis ──
        for e in applied:
            if e.source == "ml":
                signals.has_ml_edits = True
            elif e.source == "normalizer":
                signals.has_normalizer_edits = True
            else:
                signals.has_rule_edits = True

        # ── High-risk edit detection ──
        for e in applied:
            if e.type in _HIGH_RISK_TYPES:
                signals.high_risk_edit_types.append(e.type)

        return signals

    def _decide(self, s: ScoringSignals) -> tuple[str, float]:
        """Core decision logic using multiple signals."""
        # No edits → clean
        if s.edit_count == 0:
            s.explanation = "No edits — sentence is clean."
            return VERDICT_SAFE, 1.0

        # All edits rejected → rejected
        if s.applied_count == 0:
            s.explanation = "All edits were rejected by safety checks."
            return VERDICT_REJECTED, 0.0

        # ── Build a composite score from 0-1 ──
        score = s.avg_confidence

        # Penalty: rejected edits indicate instability
        if s.rejected_count > 0:
            rejection_penalty = min(0.2, s.rejected_count * 0.05)
            score -= rejection_penalty

        # Penalty: high change ratio
        if s.change_ratio > 0.15:
            score -= 0.1
        elif s.change_ratio > 0.10:
            score -= 0.05

        # Penalty: many edits in a single sentence
        if s.applied_count > 4:
            score -= 0.1
        elif s.applied_count > 2:
            score -= 0.05

        # Penalty: low min confidence among applied edits
        if s.min_confidence < CONFIDENCE_LOW:
            score -= 0.1

        # Penalty: high-risk edit types
        if s.high_risk_edit_types:
            risk_penalty = min(0.15, len(s.high_risk_edit_types) * 0.03)
            score -= risk_penalty

        # Bonus: only normalizer edits (spacing/punctuation) are very safe
        if s.has_normalizer_edits and not s.has_rule_edits and not s.has_ml_edits:
            score = max(score, CONFIDENCE_HIGH)

        # Clamp
        score = max(0.0, min(1.0, score))

        # ── Map to verdict ──
        if score >= CONFIDENCE_HIGH:
            s.explanation = "High-confidence corrections with minimal change."
            return VERDICT_SAFE, round(score, 3)

        if score >= CONFIDENCE_MEDIUM:
            reasons = []
            if s.rejected_count > 0:
                reasons.append(f"{s.rejected_count} edit(s) rejected")
            if s.high_risk_edit_types:
                reasons.append(f"risk types: {', '.join(set(s.high_risk_edit_types))}")
            if s.change_ratio > 0.10:
                reasons.append(f"high change ratio ({s.change_ratio:.1%})")
            s.explanation = "Needs review: " + "; ".join(reasons) if reasons else "Moderate confidence."
            return VERDICT_REVIEW, round(score, 3)

        reasons = []
        if s.avg_confidence < CONFIDENCE_LOW:
            reasons.append("low confidence")
        if s.change_ratio > 0.15:
            reasons.append("excessive changes")
        if s.applied_count > 4:
            reasons.append("too many edits")
        s.explanation = "Rejected: " + "; ".join(reasons) if reasons else "Below confidence threshold."
        return VERDICT_REJECTED, round(score, 3)
