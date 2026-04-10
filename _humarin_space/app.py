#!/usr/bin/env python3
"""
Humarin Paraphraser Server — ChatGPT-trained T5-base paraphraser.
Model: humarin/chatgpt_paraphraser_on_T5_base (222M params, MIT-ish/OpenRAIL)
FastAPI server compatible with the existing t5-humanizer.ts client pattern.
"""
import logging
import os
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ──
MODEL_ID = "humarin/chatgpt_paraphraser_on_T5_base"
API_KEY = os.environ.get("API_KEY", "hm_r9oLifeDgK5PpZBhMUAHIYWtydaSk3wTO1mzbv7q6cJsXQCl")
device = "cuda" if torch.cuda.is_available() else "cpu"

model = None
tokenizer = None


def load_model():
    global model, tokenizer
    logger.info(f"Loading {MODEL_ID} on {device}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, torch_dtype=torch.float32).to(device)
    model.eval()
    n = sum(p.numel() for p in model.parameters())
    logger.info(f"Model loaded ({n:,} params) on {device}")


# ── FastAPI ──
app = FastAPI(title="Humarin Paraphraser v1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schema ──
class HumanizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    strength: str = Field(default="medium")
    mode: str = Field(default="quality")
    min_change_ratio: float = Field(default=0.40, ge=0.1, le=0.9)
    max_retries: int = Field(default=5, ge=1, le=15)
    sentence_by_sentence: bool = Field(default=True)


class HumanizeResponse(BaseModel):
    humanized: str
    success: bool = True
    params_used: dict[str, Any] = Field(default_factory=dict)
    stats: dict[str, Any] = Field(default_factory=dict)


# ── Mode presets ──
MODE_PRESETS = {
    "quality": {
        "num_beams": 5,
        "num_beam_groups": 5,
        "diversity_penalty": 3.0,
        "repetition_penalty": 10.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
        "max_length": 256,
        "max_retries": 5,
    },
    "fast": {
        "num_beams": 3,
        "num_beam_groups": 3,
        "diversity_penalty": 2.0,
        "repetition_penalty": 8.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
        "max_length": 256,
        "max_retries": 2,
    },
    "aggressive": {
        "num_beams": 5,
        "num_beam_groups": 5,
        "diversity_penalty": 5.0,
        "repetition_penalty": 12.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.9,
        "max_length": 256,
        "max_retries": 8,
    },
    "turbo": {
        "num_beams": 3,
        "num_beam_groups": 3,
        "diversity_penalty": 2.0,
        "repetition_penalty": 8.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
        "max_length": 256,
        "max_retries": 1,
    },
}


# ── Helpers ──
def split_sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in parts if s.strip()]


def is_title_line(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 100:
        return False
    if line[-1] in '.!?':
        return False
    if len(line.split()) > 12:
        return False
    words = line.split()
    capital_words = sum(1 for w in words if w and w[0].isupper())
    return capital_words >= len(words) * 0.6


def split_paragraphs(text: str) -> list[dict]:
    raw = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    result = []
    for para in raw:
        lines = para.split('\n')
        if len(lines) == 1 and is_title_line(lines[0]):
            result.append({'text': para, 'is_title': True})
        else:
            if len(lines) > 1 and is_title_line(lines[0]):
                result.append({'text': lines[0], 'is_title': True})
                body = ' '.join(lines[1:]).strip()
                if body:
                    result.append({'text': body, 'is_title': False})
            else:
                result.append({'text': para, 'is_title': False})
    return result


def measure_change(original: str, modified: str) -> float:
    orig_set = {w.lower().strip(".,;:!?\"'()[]") for w in original.split() if w.strip()}
    mod_set = {w.lower().strip(".,;:!?\"'()[]") for w in modified.split() if w.strip()}
    if not orig_set:
        return 1.0
    overlap = orig_set & mod_set
    return 1.0 - (len(overlap) / max(len(orig_set), len(mod_set)))


@torch.no_grad()
def paraphrase_sentence(sentence: str, preset: dict) -> list[str]:
    """Generate diverse paraphrases for a single sentence using the humarin model."""
    input_ids = tokenizer(
        f'paraphrase: {sentence}',
        return_tensors="pt",
        padding="longest",
        max_length=preset["max_length"],
        truncation=True,
    ).input_ids.to(device)

    outputs = model.generate(
        input_ids,
        temperature=preset["temperature"],
        repetition_penalty=preset["repetition_penalty"],
        num_return_sequences=min(preset["num_beams"], 5),
        no_repeat_ngram_size=preset["no_repeat_ngram_size"],
        num_beams=preset["num_beams"],
        num_beam_groups=preset["num_beam_groups"],
        max_length=preset["max_length"],
        diversity_penalty=preset["diversity_penalty"],
    )

    results = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    return [r.strip() for r in results if r.strip()]


def humanize_sentence(original: str, preset: dict, min_change: float,
                      max_retries: int) -> tuple[str, dict]:
    """Pick the best paraphrase that meets the change threshold."""
    if len(original.split()) < 3:
        return original, {"skipped": True, "reason": "too_short"}

    best_result = original
    best_ratio = 0.0
    attempts = 0

    for attempt in range(max_retries):
        attempts = attempt + 1
        candidates = paraphrase_sentence(original, preset)

        for cand in candidates:
            # Reject if too short (< 50% of original) or too long (> 200%)
            orig_len = len(original.split())
            cand_len = len(cand.split())
            if cand_len < max(3, orig_len * 0.5) or cand_len > orig_len * 2.0:
                continue

            ratio = measure_change(original, cand)
            if ratio > best_ratio:
                best_result = cand
                best_ratio = ratio

            if ratio >= min_change:
                return best_result, {
                    "attempts": attempts,
                    "change_ratio": round(best_ratio, 3),
                    "met_threshold": True,
                }

        # Escalate diversity for retry
        preset = {**preset}
        preset["diversity_penalty"] = min(preset["diversity_penalty"] + 1.0, 8.0)
        preset["repetition_penalty"] = min(preset["repetition_penalty"] + 2.0, 15.0)

    return best_result, {
        "attempts": attempts,
        "change_ratio": round(best_ratio, 3),
        "met_threshold": best_ratio >= min_change,
    }


# Thread pool for parallel sentence processing (cpu-basic = 2 vCPU)
_pool = ThreadPoolExecutor(max_workers=2)


def humanize_text(text: str, mode: str = "quality",
                  min_change_ratio: float = 0.40,
                  max_retries: int = 5,
                  sentence_by_sentence: bool = True) -> tuple[str, dict]:
    preset = MODE_PRESETS.get(mode, MODE_PRESETS["quality"])
    preset = {**preset}

    paragraphs = split_paragraphs(text)
    all_results = []
    all_stats = []
    total_sentences = 0
    met_count = 0

    for para_dict in paragraphs:
        if para_dict['is_title']:
            all_results.append({'text': para_dict['text'], 'is_title': True})
            continue

        para = para_dict['text']

        if sentence_by_sentence:
            sentences = split_sentences(para)
            total_sentences += len(sentences)

            futures = [
                _pool.submit(humanize_sentence, sent, {**preset}, min_change_ratio, max_retries)
                for sent in sentences
            ]
            processed = []
            for fut in futures:
                result, stats = fut.result()
                processed.append(result)
                all_stats.append(stats)
                if stats.get("met_threshold", False) or stats.get("skipped", False):
                    met_count += 1

            all_results.append({'text': " ".join(processed), 'is_title': False})
        else:
            total_sentences += 1
            sentences = split_sentences(para)
            processed = []
            for sent in sentences:
                candidates = paraphrase_sentence(sent, preset)
                best = candidates[0] if candidates else sent
                best_ratio = measure_change(sent, best)
                for cand in candidates[1:]:
                    ratio = measure_change(sent, cand)
                    if ratio > best_ratio:
                        best = cand
                        best_ratio = ratio
                processed.append(best)
            result = " ".join(processed)
            ratio = measure_change(para, result)
            all_stats.append({"change_ratio": round(ratio, 3), "met_threshold": ratio >= min_change_ratio})
            if ratio >= min_change_ratio:
                met_count += 1
            all_results.append({'text': result, 'is_title': False})

    # Reassemble
    final = []
    for item in all_results:
        t = item['text'].strip()
        if t:
            if t[0].islower():
                t = t[0].upper() + t[1:]
            final.append(t)

    humanized = "\n\n".join(final)
    # Fix double spaces
    humanized = re.sub(r'  +', ' ', humanized)
    # Fix sentence-initial lowercase
    humanized = re.sub(r'([.!?])\s+([a-z])', lambda m: f"{m.group(1)} {m.group(2).upper()}", humanized)

    avg_change = sum(s.get("change_ratio", 0) for s in all_stats) / max(len(all_stats), 1)

    stats = {
        "mode": mode,
        "total_sentences": total_sentences,
        "met_threshold": met_count,
        "threshold_ratio": round(met_count / max(total_sentences, 1), 3),
        "avg_change_ratio": round(avg_change, 3),
        "sentence_stats": all_stats[:20],
    }

    return humanized, stats


# ── Routes ──
@app.get("/")
async def root():
    return {"service": "Humarin Paraphraser v1", "status": "running", "model": MODEL_ID}


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok", "model": MODEL_ID, "device": device}


@app.post("/humanize", response_model=HumanizeResponse)
async def humanize_endpoint(req: HumanizeRequest, request: Request):
    # Auth check
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Missing or invalid Bearer token")

    if model is None or tokenizer is None:
        raise HTTPException(503, "Model not loaded")

    try:
        humanized, stats = await asyncio.to_thread(
            humanize_text,
            text=req.text,
            mode=req.mode,
            min_change_ratio=req.min_change_ratio,
            max_retries=req.max_retries,
            sentence_by_sentence=req.sentence_by_sentence,
        )
        return HumanizeResponse(
            humanized=humanized,
            success=True,
            params_used={
                "mode": req.mode,
                "min_change_ratio": req.min_change_ratio,
                "max_retries": req.max_retries,
                "sentence_by_sentence": req.sentence_by_sentence,
            },
            stats=stats,
        )
    except Exception as e:
        logger.exception("Inference error")
        raise HTTPException(500, str(e))


@app.on_event("startup")
async def startup():
    if model is None:
        load_model()


if __name__ == "__main__":
    import uvicorn
    load_model()
    uvicorn.run(app, host="127.0.0.1", port=5002, log_level="info")
