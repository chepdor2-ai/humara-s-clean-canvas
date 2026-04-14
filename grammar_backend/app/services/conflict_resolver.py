from __future__ import annotations

from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.schemas.edit import Edit
from app.services.protected_spans import ProtectedSpan

log = get_logger(__name__)

_SOURCE_PRIORITY = {"normalizer": 0, "rule": 1, "ml": 2}


@dataclass
class ConflictRecord:
    """Audit record for a single conflict resolution decision."""
    winner: str  # rule_id or source
    loser: str
    span: tuple[int, int]
    reason: str


class ConflictResolver:
    """Merges edits from normalizer, rule engine, and ML corrector.

    Priority:
      1. Normalizer edits (deterministic, safe)
      2. High-confidence rule edits
      3. High-confidence ML edits
      4. Remaining rule edits
      5. Remaining ML edits

    Features:
      - Duplicate collapse: identical edits from different sources merge
      - Protected-span enforcement: edits inside immutable spans rejected
      - Conflict logging with audit trail
      - Source-aware ranking with confidence tiebreak
    """

    def __init__(self) -> None:
        self._conflicts: list[ConflictRecord] = []

    @property
    def conflicts(self) -> list[ConflictRecord]:
        return list(self._conflicts)

    # ── public API ──────────────────────────────────────────────

    def resolve(
        self,
        edits: list[Edit],
        protected_spans: list[ProtectedSpan] | None = None,
    ) -> list[Edit]:
        self._conflicts = []
        if not edits:
            return []

        protected = protected_spans or []

        # Step 1: collapse duplicates
        deduped = self._collapse_duplicates(edits)

        # Step 2: reject edits inside immutable protected spans
        surviving: list[Edit] = []
        for edit in deduped:
            if self._overlaps_immutable(edit, protected):
                edit.applied = False
                edit.reason = "overlaps immutable protected span"
                surviving.append(edit)
                log.debug(
                    "rejected edit [%s] at %d-%d: immutable span",
                    edit.rule_id or edit.source,
                    edit.char_offset_start,
                    edit.char_offset_end,
                )
            else:
                surviving.append(edit)

        # Step 3: sort by priority
        surviving.sort(key=self._sort_key)

        # Step 4: greedy non-overlapping selection
        accepted: list[Edit] = []
        occupied: list[tuple[int, int]] = []

        for edit in surviving:
            if not edit.applied and edit.reason:
                # already rejected (immutable span)
                accepted.append(edit)
                continue

            span = (edit.char_offset_start, edit.char_offset_end)

            blocker = self._find_overlap(span, occupied)
            if blocker is not None:
                edit.applied = False
                edit.reason = "overlaps with higher-priority edit"
                self._conflicts.append(
                    ConflictRecord(
                        winner=self._edit_label(accepted, blocker),
                        loser=edit.rule_id or edit.source,
                        span=span,
                        reason="overlap",
                    )
                )
                log.debug(
                    "conflict: rejected [%s] at %d-%d (blocked by %s)",
                    edit.rule_id or edit.source,
                    span[0],
                    span[1],
                    self._edit_label(accepted, blocker),
                )
                accepted.append(edit)
            else:
                edit.applied = True
                occupied.append(span)
                accepted.append(edit)

        if self._conflicts:
            log.info("resolved %d edit conflicts", len(self._conflicts))

        return accepted

    # ── helpers ──────────────────────────────────────────────────

    @staticmethod
    def _sort_key(e: Edit) -> tuple[int, float, int]:
        """Lower tuple = higher priority."""
        src = _SOURCE_PRIORITY.get(e.source, 3)
        return (src, -e.confidence, e.char_offset_start)

    @staticmethod
    def _find_overlap(
        span: tuple[int, int], occupied: list[tuple[int, int]]
    ) -> int | None:
        """Return index of first occupied range that overlaps *span*, or None."""
        for idx, occ in enumerate(occupied):
            if occ[0] < span[1] and span[0] < occ[1]:
                return idx
        return None

    @staticmethod
    def _edit_label(accepted: list[Edit], idx: int) -> str:
        """Human-readable label for the edit at *idx* in accepted list."""
        # idx is into *occupied* list; we need to find the idx-th applied edit
        applied_count = 0
        for e in accepted:
            if e.applied:
                if applied_count == idx:
                    return e.rule_id or e.source
                applied_count += 1
        return "unknown"

    @staticmethod
    def _overlaps_immutable(edit: Edit, protected: list[ProtectedSpan]) -> bool:
        for ps in protected:
            if ps.mutability != "immutable":
                continue
            if ps.start < edit.char_offset_end and edit.char_offset_start < ps.end:
                return True
        return False

    def _collapse_duplicates(self, edits: list[Edit]) -> list[Edit]:
        """Merge edits with identical span + correction, keeping higher-priority source."""
        seen: dict[tuple[int, int, str], Edit] = {}
        result: list[Edit] = []
        collapsed = 0

        for edit in edits:
            key = (edit.char_offset_start, edit.char_offset_end, edit.corrected)
            if key in seen:
                existing = seen[key]
                # Keep the one with better priority
                if self._sort_key(edit) < self._sort_key(existing):
                    # new edit is better — swap
                    existing.applied = False
                    existing.reason = f"duplicate of {edit.rule_id or edit.source}"
                    seen[key] = edit
                    result.append(edit)
                else:
                    edit.applied = False
                    edit.reason = f"duplicate of {existing.rule_id or existing.source}"
                collapsed += 1
                result.append(edit)
            else:
                seen[key] = edit
                result.append(edit)

        if collapsed:
            log.debug("collapsed %d duplicate edits", collapsed)

        return result
