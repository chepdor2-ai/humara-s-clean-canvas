#!/usr/bin/env python3
"""
Humarin Paraphraser Server v2 — OPTIMIZED for speed.
Model: humarin/chatgpt_paraphraser_on_T5_base (222M params)

Speed optimizations:
  1. Batch inference — process ALL sentences in one model.generate() call
  2. Dynamic max_length — sized to input, not fixed 256
  3. num_return_sequences=1 — diverse beam search picks best internally
  4. Retry only for failed sentences, not the whole batch
  5. torch.set_num_threads() — use all CPU cores
"""
import logging
import os
import re
import asyncio
from typing import Any

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Use all available CPU cores
torch.set_num_threads(os.cpu_count() or 2)
torch.set_num_interop_threads(1)

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
    logger.info(f"Model loaded ({n:,} params) on {device}, threads={torch.get_num_threads()}")


# ── FastAPI ──
app = FastAPI(title="Humarin Paraphraser v2")
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


# ── Mode presets (optimized for speed) ──
MODE_PRESETS = {
    "quality": {
        "num_beams": 5,
        "num_beam_groups": 5,
        "diversity_penalty": 3.0,
        "repetition_penalty": 10.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
    },
    "fast": {
        "num_beams": 3,
        "num_beam_groups": 3,
        "diversity_penalty": 2.0,
        "repetition_penalty": 8.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
    },
    "aggressive": {
        "num_beams": 5,
        "num_beam_groups": 5,
        "diversity_penalty": 5.0,
        "repetition_penalty": 12.0,
        "no_repeat_ngram_size": 2,
        "temperature": 0.9,
    },
    "turbo": {
        "num_beams": 1,
        "num_beam_groups": 1,
        "diversity_penalty": 0.0,
        "repetition_penalty": 1.5,
        "no_repeat_ngram_size": 2,
        "temperature": 0.7,
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


# ── BATCHED inference (main speed optimization) ──
@torch.no_grad()
def batch_paraphrase(sentences: list[str], preset: dict) -> list[str]:
    """Process ALL sentences in a single model.generate() call.
    
    This is 3-5x faster than sequential processing because:
    - One tokenization pass with padding
    - One forward pass through the model with batch dimension
    - Less Python/framework overhead
    """
    if not sentences:
        return []

    # Dynamic max_length based on actual input (not fixed 256)
    max_input_tokens = max(
        len(tokenizer.encode(f'paraphrase: {s}', add_special_tokens=True))
        for s in sentences
    )
    max_len = min(256, max_input_tokens * 2 + 10)

    inputs = tokenizer(
        [f'paraphrase: {s}' for s in sentences],
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=max_len,
    ).to(device)

    gen_kwargs = {
        "max_length": max_len,
        "no_repeat_ngram_size": preset["no_repeat_ngram_size"],
        "num_return_sequences": 1,  # Key speed win: 1 result per input
    }

    if preset["num_beams"] > 1:
        gen_kwargs.update({
            "num_beams": preset["num_beams"],
            "num_beam_groups": preset["num_beam_groups"],
            "diversity_penalty": preset["diversity_penalty"],
            "repetition_penalty": preset["repetition_penalty"],
            "temperature": preset["temperature"],
        })
    else:
        # Turbo mode: greedy decoding (fastest possible)
        gen_kwargs.update({
            "num_beams": 1,
            "do_sample": False,
            "repetition_penalty": preset["repetition_penalty"],
        })

    outputs = model.generate(**inputs, **gen_kwargs)
    results = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    return [r.strip() for r in results]


@torch.no_grad()
def single_paraphrase_retry(sentence: str, preset: dict) -> list[str]:
    """Retry a single sentence with escalated diversity. Returns multiple candidates."""
    max_input_tokens = len(tokenizer.encode(f'paraphrase: {sentence}', add_special_tokens=True))
    max_len = min(256, max_input_tokens * 2 + 10)

    inputs = tokenizer(
        f'paraphrase: {sentence}',
        return_tensors="pt",
        padding="longest",
        max_length=max_len,
        truncation=True,
    ).to(device)

    # Escalated settings for retry: more return sequences, higher diversity
    outputs = model.generate(
        **inputs,
        temperature=min(preset["temperature"] + 0.2, 1.0),
        repetition_penalty=min(preset["repetition_penalty"] + 3.0, 15.0),
        num_return_sequences=min(preset["num_beams"], 5),
        no_repeat_ngram_size=preset["no_repeat_ngram_size"],
        num_beams=max(preset["num_beams"], 5),
        num_beam_groups=max(preset["num_beam_groups"], 5),
        max_length=max_len,
        diversity_penalty=min(preset["diversity_penalty"] + 2.0, 8.0),
    )

    results = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    return [r.strip() for r in results if r.strip()]


def humanize_text(text: str, mode: str = "quality",
                  min_change_ratio: float = 0.40,
                  max_retries: int = 5,
                  sentence_by_sentence: bool = True) -> tuple[str, dict]:
    preset = MODE_PRESETS.get(mode, MODE_PRESETS["quality"])

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

            # Skip very short sentences
            to_process = []
            skip_indices = set()
            for i, sent in enumerate(sentences):
                if len(sent.split()) < 3:
                    skip_indices.add(i)
                else:
                    to_process.append(sent)

            # ── BATCH PASS: process all sentences at once ──
            if to_process:
                batch_results = batch_paraphrase(to_process, preset)
            else:
                batch_results = []

            # Map results back and check thresholds
            processed = []
            batch_idx = 0
            for i, sent in enumerate(sentences):
                if i in skip_indices:
                    processed.append(sent)
                    all_stats.append({"skipped": True, "reason": "too_short"})
                    met_count += 1
                    continue

                candidate = batch_results[batch_idx] if batch_idx < len(batch_results) else sent
                batch_idx += 1

                # Length sanity check
                orig_len = len(sent.split())
                cand_len = len(candidate.split())
                if cand_len < max(3, orig_len * 0.5) or cand_len > orig_len * 2.0:
                    candidate = sent  # Reject bad length

                ratio = measure_change(sent, candidate)

                # If batch result meets threshold, use it
                if ratio >= min_change_ratio:
                    processed.append(candidate)
                    all_stats.append({"attempts": 1, "change_ratio": round(ratio, 3), "met_threshold": True})
                    met_count += 1
                    continue

                # ── RETRY only for sentences that failed ──
                best = candidate
                best_ratio = ratio
                for retry in range(min(max_retries - 1, 3)):
                    candidates = single_paraphrase_retry(sent, preset)
                    for cand in candidates:
                        cand_len = len(cand.split())
                        if cand_len < max(3, orig_len * 0.5) or cand_len > orig_len * 2.0:
                            continue
                        r = measure_change(sent, cand)
                        if r > best_ratio:
                            best = cand
                            best_ratio = r
                    if best_ratio >= min_change_ratio:
                        break

                processed.append(best)
                all_stats.append({
                    "attempts": 2 + retry if best_ratio >= min_change_ratio else max_retries,
                    "change_ratio": round(best_ratio, 3),
                    "met_threshold": best_ratio >= min_change_ratio,
                })
                if best_ratio >= min_change_ratio:
                    met_count += 1

            all_results.append({'text': " ".join(processed), 'is_title': False})
        else:
            # Bulk mode: batch all sentences in paragraph
            total_sentences += 1
            sentences = split_sentences(para)
            if sentences:
                batch_results = batch_paraphrase(sentences, preset)
                # Pick results with good change ratios
                processed = []
                for sent, cand in zip(sentences, batch_results):
                    if measure_change(sent, cand) > 0.1:
                        processed.append(cand)
                    else:
                        processed.append(sent)
                result = " ".join(processed)
            else:
                result = para
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
    humanized = re.sub(r'  +', ' ', humanized)
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
    return {"service": "Humarin Paraphraser v2 (batch-optimized)", "status": "running", "model": MODEL_ID}


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok", "model": MODEL_ID, "device": device}


@app.post("/humanize", response_model=HumanizeResponse)
async def humanize_endpoint(req: HumanizeRequest, request: Request):
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
