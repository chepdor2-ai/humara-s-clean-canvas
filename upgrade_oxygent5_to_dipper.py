"""
Upgrade the oxygent5 HF Space to use the DIPPER 1B model instead of the
untrained generic T5.

This replaces the model files and updates the oxygen_server.py to use
the DIPPER prompt format (lexical/order controls).
"""
import os
from huggingface_hub import HfApi

HF_TOKEN = os.environ.get("HF_TOKEN", "")
SPACE_ID = "maguna956/oxygent5"

api = HfApi(token=HF_TOKEN)

# New app.py that wraps DIPPER in the FastAPI oxygen_server format
APP_CODE = '''#!/usr/bin/env python3
"""
Oxygen T5 Humanizer v3 — DIPPER 1B Paraphraser
Model: SamSJackson/paraphrase-dipper-no-ctx (MIT, 1B params)
FastAPI server compatible with the existing t5-humanizer.ts client.
"""
import logging
import os
import re
import random
import torch
from typing import Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Model ──
MODEL_ID = "SamSJackson/paraphrase-dipper-no-ctx"
TOKENIZER_ID = "google/t5-efficient-large-nl32"
API_KEY = os.environ.get("API_KEY", "r9oLifeDgK5PpZBhMUAHIYWtydaSk3wTO1mzbv7q6cJsXQCl")

device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Loading DIPPER model {MODEL_ID} on {device}...")
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_ID)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, torch_dtype=torch.float32).to(device)
model.eval()
n = sum(p.numel() for p in model.parameters())
logger.info(f"Model loaded ({n:,} params) on {device}")

# ── FastAPI ──
app = FastAPI(title="Oxygen T5 Humanizer v3 (DIPPER)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ── Schema ──
class HumanizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    strength: str = Field(default="medium")
    mode: str = Field(default="quality")
    min_change_ratio: float = Field(default=0.40, ge=0.1, le=0.9)
    max_retries: int = Field(default=5, ge=1, le=15)
    sentence_by_sentence: bool = Field(default=True)

# ── Mode → DIPPER diversity mapping ──
MODE_MAP = {
    "turbo":      {"lex": 40, "order": 0},
    "fast":       {"lex": 60, "order": 0},
    "quality":    {"lex": 60, "order": 20},
    "aggressive": {"lex": 80, "order": 40},
}

def split_sentences(text: str) -> list[str]:
    """Split text into sentences, preserving short headings."""
    sents = re.split(r'(?<=[.!?])\\s+', text.strip())
    return [s.strip() for s in sents if s.strip()]

def measure_change(orig: str, modified: str) -> float:
    a = orig.lower().split()
    b = modified.lower().split()
    n = max(len(a), len(b))
    if n == 0: return 1.0
    diff = sum(1 for i in range(n) if i >= len(a) or i >= len(b) or a[i] != b[i])
    return diff / n

def dipper_paraphrase(text: str, lex: int, order: int) -> str:
    """Run DIPPER inference on a single text."""
    prompt = f"lexical = {lex}, order = {order} {text}"
    input_ids = tokenizer(
        prompt, return_tensors="pt", padding="longest",
        max_length=1000, truncation=True,
    ).to(device)
    with torch.no_grad():
        outputs = model.generate(
            **input_ids, top_p=0.75, do_sample=True,
            max_new_tokens=500, num_beams=1,
        )
    decoded = tokenizer.batch_decode(outputs, skip_special_tokens=True)
    return " ".join(decoded).strip()

@app.get("/")
async def root():
    return {"service": "Oxygen T5 Humanizer v3 (DIPPER)", "status": "running", "model": MODEL_ID, "docs": "/docs"}

@app.post("/humanize")
async def humanize(req: HumanizeRequest, request: Request):
    # Auth check
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    mode_cfg = MODE_MAP.get(req.mode, MODE_MAP["quality"])
    lex, order = mode_cfg["lex"], mode_cfg["order"]

    # Strength override
    if req.strength == "light":
        lex = max(20, lex - 20)
    elif req.strength == "strong":
        lex = min(100, lex + 20)
        order = min(100, order + 20)

    if req.sentence_by_sentence:
        sentences = split_sentences(req.text)
        results = []
        stats = []
        for sent in sentences:
            best = sent
            best_ratio = 0.0
            for attempt in range(1, req.max_retries + 1):
                candidate = dipper_paraphrase(sent, lex, order)
                ratio = measure_change(sent, candidate)
                if ratio > best_ratio:
                    best = candidate
                    best_ratio = ratio
                if ratio >= req.min_change_ratio:
                    break
            results.append(best)
            stats.append({"attempts": attempt, "change_ratio": round(best_ratio, 3), "met_threshold": best_ratio >= req.min_change_ratio})
        
        humanized = " ".join(results)
        met = sum(1 for s in stats if s["met_threshold"])
        avg_change = sum(s["change_ratio"] for s in stats) / max(len(stats), 1)
        
        return {
            "humanized": humanized,
            "success": True,
            "params_used": {"mode": req.mode, "min_change_ratio": req.min_change_ratio, "max_retries": req.max_retries, "sentence_by_sentence": True, "lex": lex, "order": order},
            "stats": {
                "mode": req.mode, "total_sentences": len(sentences),
                "met_threshold": met, "threshold_ratio": round(met / max(len(sentences), 1), 3),
                "avg_change_ratio": round(avg_change, 3), "sentence_stats": stats,
            },
        }
    else:
        humanized = dipper_paraphrase(req.text, lex, order)
        ratio = measure_change(req.text, humanized)
        return {
            "humanized": humanized,
            "success": True,
            "params_used": {"mode": req.mode, "lex": lex, "order": order, "sentence_by_sentence": False},
            "stats": {"mode": req.mode, "total_sentences": 1, "met_threshold": 1 if ratio >= req.min_change_ratio else 0, "threshold_ratio": 1.0 if ratio >= req.min_change_ratio else 0.0, "avg_change_ratio": round(ratio, 3)},
        }
'''

DOCKERFILE = '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
'''

REQUIREMENTS = '''fastapi>=0.110.0
uvicorn>=0.27.0
torch>=2.0.0
transformers>=4.40.0
sentencepiece
protobuf
'''

README = '''---
title: OxygenT5
emoji: ⚡
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Oxygen T5 Humanizer v3 (DIPPER)

FastAPI T5 humanization server powered by the DIPPER 1B paraphraser model.
'''

print("Uploading new files to oxygent5 Space...")

for fname, content in [
    ("app.py", APP_CODE),
    ("Dockerfile", DOCKERFILE),
    ("requirements.txt", REQUIREMENTS),
    ("README.md", README),
]:
    print(f"  Uploading {fname}...")
    api.upload_file(
        path_or_fileobj=content.encode(),
        path_in_repo=fname,
        repo_id=SPACE_ID,
        repo_type="space",
        token=HF_TOKEN,
    )

# Delete old oxygen-model folder files (they'll be ignored since we load from HF hub)
print("\nDeleting old oxygen-model files...")
try:
    api.delete_folder(
        path_in_repo="oxygen-model",
        repo_id=SPACE_ID,
        repo_type="space",
        token=HF_TOKEN,
        commit_message="Remove old generic T5 model — now using DIPPER from HF Hub",
    )
    print("  Deleted oxygen-model/")
except Exception as e:
    print(f"  Note: {e}")

# Delete old files we don't need
for old_file in ["oxygen_server.py", "validation_post_process.py"]:
    try:
        api.delete_file(
            path_in_repo=old_file,
            repo_id=SPACE_ID,
            repo_type="space",
            token=HF_TOKEN,
            commit_message=f"Remove old {old_file}",
        )
        print(f"  Deleted {old_file}")
    except Exception as e:
        print(f"  Note ({old_file}): {e}")

print(f"\nDone! Space will rebuild: https://huggingface.co/spaces/{SPACE_ID}")
print("The DIPPER model (~4GB) will download from HF Hub on first boot.")
