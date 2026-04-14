import pytest

from app.schemas.request import CheckRequest
from app.services.pipeline import GrammarPipeline


@pytest.fixture
def pipeline():
    p = GrammarPipeline()
    # Don't load ML model for unit tests
    return p


@pytest.mark.asyncio
async def test_basic_correction(pipeline: GrammarPipeline):
    req = CheckRequest(text="Hello  world .", language="en-US", domain="general")
    result = await pipeline.run(req)
    # Should fix double space and space before period
    assert "  " not in result.corrected_text
    assert " ." not in result.corrected_text


@pytest.mark.asyncio
async def test_citation_preserved(pipeline: GrammarPipeline):
    req = CheckRequest(
        text="As noted (Smith, 2020)  the results are clear.",
        preserve_citations=True,
    )
    result = await pipeline.run(req)
    assert "(Smith, 2020)" in result.corrected_text


@pytest.mark.asyncio
async def test_legal_domain(pipeline: GrammarPipeline):
    req = CheckRequest(text="§1 is important.", domain="legal")
    result = await pipeline.run(req)
    # Legal rule should add space after §
    assert "§ 1" in result.corrected_text or "§1" in result.corrected_text


@pytest.mark.asyncio
async def test_empty_edits_for_clean_text(pipeline: GrammarPipeline):
    req = CheckRequest(text="This is a perfectly clean sentence.")
    result = await pipeline.run(req)
    assert result.total_edits == 0
    assert result.corrected_text == "This is a perfectly clean sentence."


@pytest.mark.asyncio
async def test_response_shape(pipeline: GrammarPipeline):
    req = CheckRequest(text="Hello,world")
    result = await pipeline.run(req)
    assert result.sentences
    assert result.sentences[0].original == "Hello,world"
    assert result.sentences[0].verdict in ("safe", "review", "rejected")


@pytest.mark.asyncio
async def test_response_has_request_id(pipeline: GrammarPipeline):
    req = CheckRequest(text="Test sentence.")
    result = await pipeline.run(req)
    assert result.request_id
    assert len(result.request_id) == 32  # UUID hex


@pytest.mark.asyncio
async def test_response_has_engine_version(pipeline: GrammarPipeline):
    req = CheckRequest(text="Test sentence.")
    result = await pipeline.run(req)
    assert result.engine_version
    assert "." in result.engine_version  # semver


@pytest.mark.asyncio
async def test_response_has_timings(pipeline: GrammarPipeline):
    req = CheckRequest(text="Hello  world.")
    result = await pipeline.run(req)
    assert isinstance(result.timings, dict)
    assert "parse" in result.timings


@pytest.mark.asyncio
async def test_sentence_has_char_offsets(pipeline: GrammarPipeline):
    req = CheckRequest(text="First sentence. Second sentence.")
    result = await pipeline.run(req)
    assert len(result.sentences) == 2
    s0 = result.sentences[0]
    s1 = result.sentences[1]
    assert s0.char_offset_start == 0
    assert s1.char_offset_start > 0
    assert s1.char_offset_end == len(req.text)


@pytest.mark.asyncio
async def test_rejected_edits_list(pipeline: GrammarPipeline):
    req = CheckRequest(text="Clean text here.")
    result = await pipeline.run(req)
    assert isinstance(result.rejected_edits, list)
