from app.schemas.edit import Edit
from app.services.conflict_resolver import ConflictResolver
from app.services.protected_spans import ProtectedSpan


def _make_edit(
    start: int,
    end: int,
    corrected: str = "fix",
    source: str = "rule",
    confidence: float = 0.90,
    rule_id: str | None = None,
):
    return Edit(
        type="grammar",
        original="x" * (end - start),
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
        start=start, end=end, text="x" * (end - start), kind=ptype, mutability=mutability
    )


# ── Basic overlap resolution ──

def test_non_overlapping_accepted():
    r = ConflictResolver()
    e1 = _make_edit(0, 5)
    e2 = _make_edit(10, 15)
    result = r.resolve([e1, e2])
    assert all(e.applied for e in result)


def test_overlapping_lower_priority_rejected():
    r = ConflictResolver()
    e1 = _make_edit(0, 10, source="normalizer")  # higher priority
    e2 = _make_edit(5, 15, source="ml")  # lower priority
    result = r.resolve([e1, e2])
    applied = [e for e in result if e.applied]
    assert len(applied) == 1
    assert applied[0].source == "normalizer"


def test_ml_loses_to_rule_on_overlap():
    r = ConflictResolver()
    e1 = _make_edit(0, 10, source="rule", confidence=0.85, rule_id="punct-001")
    e2 = _make_edit(5, 15, source="ml", confidence=0.90)
    result = r.resolve([e1, e2])
    applied = [e for e in result if e.applied]
    assert len(applied) == 1
    assert applied[0].source == "rule"


# ── Duplicate collapse ──

def test_duplicate_edits_collapsed():
    r = ConflictResolver()
    e1 = _make_edit(0, 5, corrected="fix", source="normalizer", rule_id="norm-sp-001")
    e2 = _make_edit(0, 5, corrected="fix", source="rule", rule_id="space-001")
    result = r.resolve([e1, e2])
    applied = [e for e in result if e.applied]
    assert len(applied) == 1
    assert applied[0].source == "normalizer"  # higher priority kept


def test_different_corrections_not_collapsed():
    r = ConflictResolver()
    e1 = _make_edit(0, 5, corrected="fix-a", source="normalizer")
    e2 = _make_edit(0, 5, corrected="fix-b", source="rule")
    result = r.resolve([e1, e2])
    applied = [e for e in result if e.applied]
    assert len(applied) == 1  # still only one wins (overlap)


# ── Protected span enforcement ──

def test_immutable_span_rejects_edit():
    r = ConflictResolver()
    ps = _make_protected(0, 10, mutability="immutable")
    e = _make_edit(2, 8, source="rule")
    result = r.resolve([e], protected_spans=[ps])
    assert not result[0].applied
    assert "immutable" in result[0].reason


def test_format_only_span_allows_edit():
    r = ConflictResolver()
    ps = _make_protected(0, 10, mutability="format-only")
    e = _make_edit(2, 8, source="rule")
    result = r.resolve([e], protected_spans=[ps])
    assert result[0].applied


# ── Conflict audit trail ──

def test_conflict_records_populated():
    r = ConflictResolver()
    e1 = _make_edit(0, 10, source="normalizer", rule_id="norm-001")
    e2 = _make_edit(5, 15, source="ml")
    r.resolve([e1, e2])
    assert len(r.conflicts) == 1
    assert r.conflicts[0].winner == "norm-001"
    assert r.conflicts[0].reason == "overlap"


def test_no_conflicts_for_clean_edits():
    r = ConflictResolver()
    e1 = _make_edit(0, 5, source="rule")
    e2 = _make_edit(10, 15, source="ml")
    r.resolve([e1, e2])
    assert len(r.conflicts) == 0


def test_empty_edits():
    r = ConflictResolver()
    result = r.resolve([])
    assert result == []
