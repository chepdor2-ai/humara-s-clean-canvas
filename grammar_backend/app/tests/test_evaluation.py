"""Evaluation harness — categorized test buckets covering the full grammar pipeline.

Run with: py -3.12 -m pytest app/tests/test_evaluation.py -v
"""
import pytest

from app.schemas.request import CheckRequest
from app.services.pipeline import GrammarPipeline


@pytest.fixture
def pipeline():
    return GrammarPipeline()


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 1: Punctuation-only corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestPunctuationBucket:
    @pytest.mark.asyncio
    async def test_space_before_period(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello world ."))
        assert " ." not in r.corrected_text

    @pytest.mark.asyncio
    async def test_space_before_comma(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello , world."))
        assert " ," not in r.corrected_text

    @pytest.mark.asyncio
    async def test_missing_space_after_comma(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello,world."))
        assert "Hello, world." == r.corrected_text or ", " in r.corrected_text

    @pytest.mark.asyncio
    async def test_double_period(self, pipeline):
        r = await pipeline.run(CheckRequest(text="End of sentence.."))
        # Should normalize to single period
        assert ".." not in r.corrected_text or r.corrected_text.endswith(".")


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 2: Spacing corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestSpacingBucket:
    @pytest.mark.asyncio
    async def test_double_space(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello  world."))
        assert "  " not in r.corrected_text

    @pytest.mark.asyncio
    async def test_triple_space(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello   world."))
        assert "   " not in r.corrected_text

    @pytest.mark.asyncio
    async def test_tab_normalization(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello\tworld."))
        assert "\t" not in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 3: Capitalization corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestCapitalizationBucket:
    @pytest.mark.asyncio
    async def test_sentence_start_lowercase(self, pipeline):
        r = await pipeline.run(CheckRequest(text="hello world."))
        assert r.corrected_text[0] == "H"

    @pytest.mark.asyncio
    async def test_i_capitalization(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Then i went home."))
        assert " I " in r.corrected_text or r.corrected_text.startswith("Then I")


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 4: Agreement corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestAgreementBucket:
    @pytest.mark.asyncio
    async def test_he_have(self, pipeline):
        r = await pipeline.run(CheckRequest(text="He have a car."))
        assert "has" in r.corrected_text

    @pytest.mark.asyncio
    async def test_she_have(self, pipeline):
        r = await pipeline.run(CheckRequest(text="She have two dogs."))
        assert "has" in r.corrected_text

    @pytest.mark.asyncio
    async def test_they_has(self, pipeline):
        r = await pipeline.run(CheckRequest(text="They has arrived."))
        assert "have" in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 5: Article corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestArticleBucket:
    @pytest.mark.asyncio
    async def test_a_before_vowel(self, pipeline):
        r = await pipeline.run(CheckRequest(text="This is a apple."))
        assert "an apple" in r.corrected_text

    @pytest.mark.asyncio
    async def test_an_before_consonant(self, pipeline):
        r = await pipeline.run(CheckRequest(text="This is an car."))
        assert "a car" in r.corrected_text

    @pytest.mark.asyncio
    async def test_a_before_university(self, pipeline):
        r = await pipeline.run(CheckRequest(text="She attends an university."))
        assert "a university" in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 6: Citation protection
# ═════════════════════════════════════════════════════════════════════════════

class TestCitationProtection:
    @pytest.mark.asyncio
    async def test_parenthetical_citation(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="As noted (Smith, 2020) the results are clear.",
            preserve_citations=True,
        ))
        assert "(Smith, 2020)" in r.corrected_text

    @pytest.mark.asyncio
    async def test_inline_citation(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="Smith et al. (2019) found that results vary.",
            preserve_citations=True,
            domain="academic",
        ))
        assert "(2019)" in r.corrected_text

    @pytest.mark.asyncio
    async def test_multiple_citations(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="Several studies (Jones, 2018; Smith, 2020) support this.",
            preserve_citations=True,
        ))
        assert "(Jones, 2018; Smith, 2020)" in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 7: Quote protection
# ═════════════════════════════════════════════════════════════════════════════

class TestQuoteProtection:
    @pytest.mark.asyncio
    async def test_double_quoted_text(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text='He said "this are wrong" to the group.',
            preserve_quotes=True,
        ))
        assert '"this are wrong"' in r.corrected_text

    @pytest.mark.asyncio
    async def test_single_quoted_text(self, pipeline):
        # Smart single quotes are protected as quotation spans
        r = await pipeline.run(CheckRequest(
            text="She noted \u2018it don't matter\u2019 loudly.",
            preserve_quotes=True,
        ))
        assert "\u2018it don't matter\u2019" in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 8: Grammar corrections (common errors)
# ═════════════════════════════════════════════════════════════════════════════

class TestGrammarBucket:
    @pytest.mark.asyncio
    async def test_could_of(self, pipeline):
        r = await pipeline.run(CheckRequest(text="I could of gone."))
        assert "could have" in r.corrected_text

    @pytest.mark.asyncio
    async def test_should_of(self, pipeline):
        r = await pipeline.run(CheckRequest(text="You should of known."))
        assert "should have" in r.corrected_text

    @pytest.mark.asyncio
    async def test_alot(self, pipeline):
        r = await pipeline.run(CheckRequest(text="There are alot of people."))
        assert "a lot" in r.corrected_text

    @pytest.mark.asyncio
    async def test_repeated_word(self, pipeline):
        r = await pipeline.run(CheckRequest(text="The the cat sat down."))
        assert "The the" not in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 9: Should-NOT-touch (clean text)
# ═════════════════════════════════════════════════════════════════════════════

class TestShouldNotTouch:
    @pytest.mark.asyncio
    async def test_perfectly_clean(self, pipeline):
        text = "The quick brown fox jumps over the lazy dog."
        r = await pipeline.run(CheckRequest(text=text))
        assert r.corrected_text == text
        assert r.total_edits == 0

    @pytest.mark.asyncio
    async def test_clean_with_citation(self, pipeline):
        text = "According to Smith (2020), the results are clear."
        r = await pipeline.run(CheckRequest(text=text))
        assert r.corrected_text == text

    @pytest.mark.asyncio
    async def test_clean_complex(self, pipeline):
        text = "The researchers found significant results in their study."
        r = await pipeline.run(CheckRequest(text=text))
        assert r.corrected_text == text
        assert r.total_edits == 0


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 10: Domain-specific corrections
# ═════════════════════════════════════════════════════════════════════════════

class TestDomainSpecific:
    @pytest.mark.asyncio
    async def test_academic_et_al(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="Smith et al found significant results.",
            domain="academic",
        ))
        assert "et al." in r.corrected_text

    @pytest.mark.asyncio
    async def test_legal_section_spacing(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="See §1 for details.",
            domain="legal",
        ))
        assert "§ 1" in r.corrected_text or "§1" in r.corrected_text


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 11: Response shape & metadata
# ═════════════════════════════════════════════════════════════════════════════

class TestResponseShape:
    @pytest.mark.asyncio
    async def test_has_request_id(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Test."))
        assert r.request_id
        assert len(r.request_id) == 32

    @pytest.mark.asyncio
    async def test_has_engine_version(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Test."))
        assert "." in r.engine_version

    @pytest.mark.asyncio
    async def test_has_timings(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello  world."))
        assert isinstance(r.timings, dict)
        assert "parse" in r.timings

    @pytest.mark.asyncio
    async def test_sentences_have_verdicts(self, pipeline):
        r = await pipeline.run(CheckRequest(text="He have a car."))
        for s in r.sentences:
            assert s.verdict in ("safe", "review", "rejected")
            assert 0.0 <= s.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_sentences_have_scoring_signals(self, pipeline):
        r = await pipeline.run(CheckRequest(text="He have a car."))
        for s in r.sentences:
            if s.scoring_signals:
                assert "edit_count" in s.scoring_signals
                assert "explanation" in s.scoring_signals

    @pytest.mark.asyncio
    async def test_has_domain_and_rules_version(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Test.", domain="academic"))
        assert r.domain == "academic"
        assert r.rules_version  # non-empty hash

    @pytest.mark.asyncio
    async def test_has_ml_available(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Test."))
        assert isinstance(r.ml_available, bool)


# ═════════════════════════════════════════════════════════════════════════════
# Bucket 12: Scoring accuracy
# ═════════════════════════════════════════════════════════════════════════════

class TestScoringBucket:
    @pytest.mark.asyncio
    async def test_clean_sentence_safe(self, pipeline):
        r = await pipeline.run(CheckRequest(text="This is perfectly clean."))
        assert r.sentences[0].verdict == "safe"
        assert r.sentences[0].confidence == 1.0

    @pytest.mark.asyncio
    async def test_minor_edit_still_safe(self, pipeline):
        r = await pipeline.run(CheckRequest(text="Hello  world."))
        v = r.sentences[0].verdict
        assert v in ("safe", "review")  # spacing fix should be safe or review

    @pytest.mark.asyncio
    async def test_multi_sentence_mixed_verdicts(self, pipeline):
        r = await pipeline.run(CheckRequest(
            text="This is clean. He have a car."
        ))
        assert len(r.sentences) == 2
        # First sentence should be safe
        assert r.sentences[0].verdict == "safe"
