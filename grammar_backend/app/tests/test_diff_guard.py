from app.schemas.edit import Edit
from app.services.diff_guard import DiffGuard


def _make_edit(original: str, corrected: str, source: str = "ml", confidence: float = 0.8):
    return Edit(
        type="grammar",
        original=original,
        corrected=corrected,
        char_offset_start=0,
        char_offset_end=len(original),
        confidence=confidence,
        applied=True,
        source=source,
    )


def test_safe_edit_passes():
    guard = DiffGuard(max_token_change_ratio=0.30)
    original = "The cats is here."
    corrected = "The cats are here."
    edits = [_make_edit("is", "are")]
    final, updated_edits, warnings = guard.check(original, corrected, edits)
    assert final == corrected
    assert all(e.applied for e in updated_edits)
    assert len(warnings) == 0


def test_aggressive_edit_rejected():
    guard = DiffGuard(max_token_change_ratio=0.10)
    original = "I went to the store yesterday."
    corrected = "She visited the market last week."  # total rewrite
    edits = [_make_edit("went", "visited", confidence=0.6)]
    final, updated_edits, warnings = guard.check(original, corrected, edits)
    assert len(warnings) > 0
    # ML edits should be rejected
    ml_edits = [e for e in updated_edits if e.source == "ml"]
    assert all(not e.applied for e in ml_edits)


def test_length_shift_rejected():
    guard = DiffGuard(max_token_change_ratio=1.0)  # disable token-ratio check
    original = "This is a sentence."
    corrected = "This."
    edits = [_make_edit("is a sentence", "", confidence=0.5)]
    final, updated_edits, warnings = guard.check(original, corrected, edits)
    assert any("length" in w.lower() for w in warnings)
