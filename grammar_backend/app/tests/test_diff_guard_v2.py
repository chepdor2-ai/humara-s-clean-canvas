"""Tests for the hardened diff guard (Phase 7)."""

from app.schemas.edit import Edit
from app.services.diff_guard import DiffGuard
from app.services.protected_spans import ProtectedSpan


def _make_edit(
    original: str,
    corrected: str,
    start: int = 0,
    end: int | None = None,
    source: str = "ml",
    confidence: float = 0.80,
    rule_id: str | None = None,
):
    if end is None:
        end = start + len(original)
    return Edit(
        type="grammar",
        original=original,
        corrected=corrected,
        char_offset_start=start,
        char_offset_end=end,
        confidence=confidence,
        applied=True,
        source=source,
        rule_id=rule_id,
    )


def _make_protected(start: int, end: int, ptype: str = "citation", mutability: str = "immutable"):
    return ProtectedSpan(
        start=start, end=end, text="x" * (end - start), kind=ptype, mutability=mutability,
    )


# ── Protected span enforcement ──

def test_immutable_span_blocks_edit():
    guard = DiffGuard(max_token_change_ratio=1.0)
    ps = _make_protected(0, 10, mutability="immutable")
    edit = _make_edit("the cats", "the dogs", start=2, end=10, source="ml")
    original = "of the cats is here."
    _, edits, warnings = guard.check(original, original, [edit], protected_spans=[ps])
    assert not edits[0].applied
    assert "immutable" in edits[0].reason


def test_format_only_span_allows_edit():
    guard = DiffGuard(max_token_change_ratio=1.0)
    ps = _make_protected(0, 10, ptype="abbreviation", mutability="format-only")
    edit = _make_edit("the cats", "the dogs", start=2, end=10, source="ml")
    original = "of the cats is here."
    _, edits, _ = guard.check(original, original, [edit], protected_spans=[ps])
    # format-only allows edits — not immutable, so no rejection from protected span check
    assert edits[0].applied


# ── Citation/quotation mutation ──

def test_citation_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=1.0)
    ps = _make_protected(5, 20, ptype="citation")
    edit = _make_edit("Smith", "Jones", start=6, end=11, source="ml")
    original = "See (Smith, 2020) for details."
    _, edits, warnings = guard.check(original, original, [edit], protected_spans=[ps])
    assert not edits[0].applied
    assert "citation" in edits[0].reason


def test_quotation_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=1.0)
    ps = _make_protected(5, 25, ptype="quotation")
    edit = _make_edit("said hello", "said hi", start=10, end=20, source="ml")
    original = 'He "said hello to them" today.'
    _, edits, warnings = guard.check(original, original, [edit], protected_spans=[ps])
    assert not edits[0].applied
    assert "quotation" in edits[0].reason


# ── Named entity protection ──

def test_named_entity_ml_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=1.0)
    # "John Smith" is a named entity at positions 0-10
    original = "John Smith went to the store."
    edit = _make_edit("John Smith", "Jane Doe", start=0, end=10, source="ml")
    _, edits, warnings = guard.check(original, original, [edit])
    assert not edits[0].applied
    assert "named entity" in edits[0].reason


def test_named_entity_rule_edit_passes():
    guard = DiffGuard(max_token_change_ratio=1.0)
    original = "John Smith went to the store."
    edit = _make_edit("John Smith", "John Smith", start=0, end=10, source="rule")
    _, edits, _ = guard.check(original, original, [edit])
    # Rule edits are not affected by NE check (only ML)
    assert edits[0].applied


# ── Single edit span limit ──

def test_oversized_ml_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=1.0)
    big_original = "a" * 100
    edit = _make_edit(big_original, "b" * 100, start=0, end=100, source="ml")
    _, edits, warnings = guard.check(big_original, "b" * 100, [edit])
    assert not edits[0].applied
    assert "span" in edits[0].reason


def test_normal_sized_edit_passes():
    guard = DiffGuard(max_token_change_ratio=1.0)
    edit = _make_edit("cats", "dogs", start=4, end=8, source="ml")
    original = "The cats are here."
    corrected = "The dogs are here."
    _, edits, _ = guard.check(original, corrected, [edit])
    assert edits[0].applied


# ── Original checks still work ──

def test_safe_edit_passes():
    guard = DiffGuard(max_token_change_ratio=0.30)
    original = "The cats is here."
    corrected = "The cats are here."
    edits = [_make_edit("is", "are", start=9, end=11)]
    final, updated_edits, warnings = guard.check(original, corrected, edits)
    assert final == corrected
    assert all(e.applied for e in updated_edits)
    assert len(warnings) == 0


def test_aggressive_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=0.10)
    original = "I went to the store yesterday."
    corrected = "She visited the market last week."
    edits = [_make_edit("went", "visited", start=2, end=6, confidence=0.6)]
    final, updated_edits, warnings = guard.check(original, corrected, edits)
    assert len(warnings) > 0
    ml_edits = [e for e in updated_edits if e.source == "ml"]
    assert all(not e.applied for e in ml_edits)
