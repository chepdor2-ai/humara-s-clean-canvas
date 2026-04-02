from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import random
import os
import re
from humanizer import humanize
from multi_detector import get_detector
from post_processor import post_process as _post_process

# LLM humanizer for Ninja mode
try:
    from llm_humanizer import llm_humanize
    HAS_LLM = True
    print("[OK] LLM humanizer module loaded")
except Exception as e:
    HAS_LLM = False
    llm_humanize = None
    print(f"[*] LLM humanizer not available: {e}")

# 8-Phase LLM Pipeline for anti-detection refinement
try:
    from llm_pipeline import run_pipeline_async
    HAS_PIPELINE = True
    print("[OK] 8-phase LLM pipeline loaded")
except Exception as e:
    HAS_PIPELINE = False
    run_pipeline_async = None
    print(f"[*] LLM pipeline not available: {e}")

app = FastAPI(title="Ghost Humanizer API")

# Wire in the AI detector routes (adds /analyze and /detector-status)
try:
    from detector_integration import setup_detector_routes, load_detector
    load_detector()
    setup_detector_routes(app)
    print("[OK] AI detector routes registered")
except Exception as e:
    print(f"[*] AI detector integration skipped: {e}")

# Initialize multi-detector engine
_detector = get_detector()
print(f"[OK] Multi-detector initialized ({len(_detector.profiles)} engines)")


class HumanizeRequest(BaseModel):
    text: str
    engine: str = "ghost_mini"   # ghost_mini / ghost_pro / ninja
    strength: str = "balanced"   # light / balanced / deep
    preserve_sentences: bool = True
    strict_meaning: bool = True
    no_contractions: bool = True
    tone: str = "neutral"
    enable_post_processing: bool = True  # optional cleaning phase


class DetectRequest(BaseModel):
    text: str


# Serve static frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

@app.get("/app")
async def app_page():
    return FileResponse("static/app.html")

@app.get("/detector")
async def detector_page():
    return FileResponse("static/detector.html")

@app.get("/login")
async def login_page():
    return FileResponse("static/login.html")

@app.get("/signup")
async def signup_page():
    return FileResponse("static/signup.html")

@app.get("/reset-password")
async def reset_page():
    return FileResponse("static/reset-password.html")

@app.get("/pricing")
async def pricing_page():
    return FileResponse("static/pricing.html")

@app.get("/about")
async def about_page():
    return FileResponse("static/about.html")

@app.get("/how-it-works")
async def how_page():
    return FileResponse("static/how-it-works.html")

@app.get("/terms")
async def terms_page():
    return FileResponse("static/terms.html")

@app.get("/privacy")
async def privacy_page():
    return FileResponse("static/privacy.html")

from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates

@app.exception_handler(404)
async def not_found_exception_handler(request: Request, exc: Exception):
    # Returns a 404 page if a static HTML page exists
    return FileResponse("static/404.html", status_code=404)


@app.post("/api/humanize")
async def humanize_endpoint(request: HumanizeRequest):
    strength_map = {
        "light": "light",
        "balanced": "medium",
        "deep": "strong"
    }
    engine_strength = strength_map.get(request.strength, "medium")
    engine_used = request.engine

    if request.engine == "ninja" and HAS_LLM:
        # ── Ninja: LLM multi-pass pipeline ─────────────────────────
        try:
            result = llm_humanize(
                request.text,
                strength=engine_strength,
                preserve_sentences=request.preserve_sentences,
                strict_meaning=request.strict_meaning,
                no_contractions=request.no_contractions,
                tone=request.tone,
                enable_post_processing=request.enable_post_processing,
            )
            engine_used = "ninja"
        except Exception as e:
            # Fallback to Ghost Pro if LLM fails
            print(f"[!] Ninja engine failed, falling back to Ghost Pro: {e}")
            result = humanize(
                request.text,
                strength=engine_strength,
                preserve_sentences=request.preserve_sentences,
                strict_meaning=request.strict_meaning,
                tone=request.tone,
                mode="ghost_pro",
                enable_post_processing=request.enable_post_processing,
            )
            engine_used = "ninja_fallback"
    elif request.engine == "ghost_pro":
        # ── Ghost Pro: world's best non-LLM humanizer ─────────────
        # ALL 22 detectors must score below 5% AI.
        # Uses signal-aware targeted transforms + up to 20 total passes.
        result = humanize(
            request.text,
            strength=engine_strength,
            preserve_sentences=request.preserve_sentences,
            strict_meaning=request.strict_meaning,
            tone=request.tone,
            mode="ghost_pro",
            enable_post_processing=request.enable_post_processing,
        )
        engine_used = "ghost_pro"
    else:
        # ── Ghost Mini: fast per-detector pipeline (default) ───────
        # Top 5 detectors (GPTZero, Turnitin, Originality, Winston,
        # Copyleaks) must ALL score below 20% AI.
        result = humanize(
            request.text,
            strength=engine_strength,
            preserve_sentences=request.preserve_sentences,
            strict_meaning=request.strict_meaning,
            tone=request.tone,
            mode="ghost_mini",
            enable_post_processing=request.enable_post_processing,
        )
        engine_used = "ghost_mini"

    # ── 8-Phase LLM Pipeline: anti-detection refinement ────────────
    # Runs AFTER initial humanization, BEFORE detection scoring.
    # Processes text in <200 word chunks concurrently for speed.
    if HAS_PIPELINE and run_pipeline_async is not None:
        try:
            result = await run_pipeline_async(
                result, no_contractions=request.no_contractions
            )
            print(f"[OK] LLM pipeline refinement complete ({engine_used})")
        except Exception as e:
            print(f"[!] LLM pipeline failed, using raw humanizer output: {e}")

    # Optional post-processing for all engines (moved to humanizer functions)
    # The post-processing is now handled inside humanize() and llm_humanize()

    # Run real multi-detector on the humanized output
    output_detection = _detector.analyze(result)
    output_top5 = {
        "gptzero": _find_detector_ai_score(output_detection, 'gptzero'),
        "turnitin": _find_detector_ai_score(output_detection, 'turnitin'),
        "originality": _find_detector_ai_score(output_detection, 'originality_ai'),
        "winston": _find_detector_ai_score(output_detection, 'winston_ai'),
        "copyleaks": _find_detector_ai_score(output_detection, 'copyleaks'),
    }
    output_results = {
        **output_top5,
        "zerogpt": _find_detector_ai_score(output_detection, 'zerogpt'),
        "crossplag": _find_detector_ai_score(output_detection, 'crossplag'),
        "top5_max": max(output_top5.values()) if output_top5 else 100.0,
        "overall": 100 - output_detection['summary']['overall_human_score'],
    }

    # Run real multi-detector on the input text
    input_detection = _detector.analyze(request.text)
    input_top5 = {
        "gptzero": _find_detector_ai_score(input_detection, 'gptzero'),
        "turnitin": _find_detector_ai_score(input_detection, 'turnitin'),
        "originality": _find_detector_ai_score(input_detection, 'originality_ai'),
        "winston": _find_detector_ai_score(input_detection, 'winston_ai'),
        "copyleaks": _find_detector_ai_score(input_detection, 'copyleaks'),
    }
    input_results = {
        **input_top5,
        "zerogpt": _find_detector_ai_score(input_detection, 'zerogpt'),
        "crossplag": _find_detector_ai_score(input_detection, 'crossplag'),
        "top5_max": max(input_top5.values()) if input_top5 else 100.0,
        "overall": 100 - input_detection['summary']['overall_human_score'],
    }

    return {
        "original": request.text[:200] + ("..." if len(request.text) > 200 else ""),
        "humanized": result,
        "word_count": len(result.split()),
        "engine_used": engine_used,
        "input_detector_results": input_results,
        "output_detector_results": output_results,
    }

@app.post("/api/detect")
async def detect_endpoint(request: DetectRequest):
    """Run text through all 20+ AI detection engines."""
    if not request.text or not request.text.strip():
        return {"error": "Empty text provided"}

    result = _detector.analyze(request.text)
    return result


def _find_detector_ai_score(detection: dict, name: str) -> float:
    """Find a specific detector's AI score from the analysis result."""
    aliases = {
        "originality_ai": {"originality_ai", "originalityai", "originality.ai"},
        "winston_ai": {"winston_ai", "winstonai", "winston.ai"},
        "copyleaks": {"copyleaks", "crossplag"},
    }

    def _norm(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "", (s or "").lower())

    requested = _norm(name)
    candidates = {_norm(name)}
    if name in aliases:
        candidates.update({_norm(v) for v in aliases[name]})

    for d in detection.get("detectors", []):
        det_norm = _norm(d.get("detector", ""))
        if det_norm in candidates or requested in det_norm or det_norm in requested:
            return round(100.0 - d["human_score"], 1)
    
    # Check fallback / basic
    fallback_score = 100.0 - detection.get("summary", {}).get("overall_human_score", 50.0)
    return round(fallback_score, 1)

def _find_detector_score(detection: dict, name: str) -> float:
    """Find a specific detector's human score from the analysis result."""
    for d in detection.get("detectors", []):
        if d.get("detector", "").lower().replace(" ", "").replace(".", "") == name.lower().replace(" ", "").replace(".", ""):
            return d["human_score"]
    return detection.get("summary", {}).get("overall_human_score", 50.0)


# Run with: uvicorn main:app --reload
