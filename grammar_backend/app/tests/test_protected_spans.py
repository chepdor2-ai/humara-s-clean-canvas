from app.services.protected_spans import ProtectedSpansDetector


def test_citation_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("As noted (Smith, 2020) the data shows.")
    kinds = [s.kind for s in spans]
    assert "citation" in kinds


def test_multi_citation():
    d = ProtectedSpansDetector()
    spans = d.detect("See (Smith, 2020; Jones, 2021) for details.")
    kinds = [s.kind for s in spans]
    assert "citation" in kinds


def test_case_name_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("In Brown v. Board of Education the court held.")
    kinds = [s.kind for s in spans]
    assert "case_name" in kinds


def test_url_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("Visit https://example.com/path for more.")
    kinds = [s.kind for s in spans]
    assert "url" in kinds


def test_email_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("Contact user@example.com for help.")
    kinds = [s.kind for s in spans]
    assert "email" in kinds


def test_quotation_detected():
    d = ProtectedSpansDetector()
    spans = d.detect('He said "hello world" loudly.')
    kinds = [s.kind for s in spans]
    assert "quotation" in kinds


def test_quotation_disabled():
    d = ProtectedSpansDetector(preserve_quotes=False)
    spans = d.detect('He said "hello world" loudly.')
    kinds = [s.kind for s in spans]
    assert "quotation" not in kinds


def test_citation_disabled():
    d = ProtectedSpansDetector(preserve_citations=False)
    spans = d.detect("As noted (Smith, 2020) the data.")
    kinds = [s.kind for s in spans]
    assert "citation" not in kinds


def test_code_span_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("Use `variable_name` in your code.")
    kinds = [s.kind for s in spans]
    assert "code_span" in kinds


def test_statute_detected():
    d = ProtectedSpansDetector()
    spans = d.detect("Under 42 U.S.C. § 1983 the plaintiff may sue.")
    kinds = [s.kind for s in spans]
    assert "statute" in kinds


def test_mutability_immutable():
    d = ProtectedSpansDetector()
    spans = d.detect("See (Smith, 2020) and https://example.com here.")
    for s in spans:
        if s.kind in ("citation", "url"):
            assert s.mutability == "immutable"


def test_mutability_format_only():
    d = ProtectedSpansDetector()
    spans = d.detect("In 2024 the value was $1,200.")
    for s in spans:
        if s.kind in ("year", "number"):
            assert s.mutability == "format-only"


def test_overlapping_spans_merged():
    d = ProtectedSpansDetector()
    # URL inside a quotation should merge
    spans = d.detect('Visit "https://example.com/test" for info.')
    # Should have merged or at least not have identical overlapping ranges
    for i in range(len(spans) - 1):
        # No span should be fully contained in the previous
        assert not (spans[i].start <= spans[i+1].start and spans[i+1].end <= spans[i].end)


def test_is_immutable():
    d = ProtectedSpansDetector()
    spans = d.detect('He said "do not change this" clearly.')
    # The quotation mark region should be immutable
    assert d.is_immutable(10, spans)  # inside the quote


def test_overlaps_immutable():
    d = ProtectedSpansDetector()
    spans = d.detect("Visit https://example.com please.")
    url_span = next(s for s in spans if s.kind == "url")
    assert d.overlaps_immutable(url_span.start, url_span.end, spans)
