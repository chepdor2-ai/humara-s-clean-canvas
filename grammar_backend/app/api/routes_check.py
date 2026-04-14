from __future__ import annotations

import time

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.errors import TextTooLongError
from app.schemas.request import BatchCheckRequest, CheckRequest, SentenceCheckRequest
from app.schemas.response import BatchCheckResponse, CheckResponse
from app.services.pipeline import GrammarPipeline, get_pipeline

router = APIRouter(tags=["check"])


@router.post("/check", response_model=CheckResponse)
async def check_text(
    req: CheckRequest,
    settings: Settings = Depends(get_settings),
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> CheckResponse:
    if len(req.text) > settings.max_text_length:
        raise TextTooLongError(len(req.text), settings.max_text_length)

    t0 = time.perf_counter()
    result = await pipeline.run(req)
    result.processing_time_ms = round((time.perf_counter() - t0) * 1000, 2)
    return result


@router.post("/check/sentence", response_model=CheckResponse)
async def check_sentence(
    req: SentenceCheckRequest,
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> CheckResponse:
    full_req = CheckRequest(
        text=req.sentence,
        language=req.language,
        domain=req.domain,
        preserve_citations=req.preserve_citations,
        preserve_quotes=req.preserve_quotes,
        strict_minimal_edits=req.strict_minimal_edits,
        max_sentence_change_ratio=req.max_sentence_change_ratio,
    )
    t0 = time.perf_counter()
    result = await pipeline.run(full_req)
    result.processing_time_ms = round((time.perf_counter() - t0) * 1000, 2)
    return result


@router.post("/batch", response_model=BatchCheckResponse)
async def batch_check(
    req: BatchCheckRequest,
    settings: Settings = Depends(get_settings),
    pipeline: GrammarPipeline = Depends(get_pipeline),
) -> BatchCheckResponse:
    results: list[CheckResponse] = []
    for item in req.items:
        if len(item.text) > settings.max_text_length:
            raise TextTooLongError(len(item.text), settings.max_text_length)
        t0 = time.perf_counter()
        r = await pipeline.run(item)
        r.processing_time_ms = round((time.perf_counter() - t0) * 1000, 2)
        results.append(r)
    return BatchCheckResponse(results=results)
