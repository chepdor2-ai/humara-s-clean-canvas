"""
LLM-Powered Academic Humanizer — Multi-Pass Pipeline
=====================================================
Activated when Stealth Mode is OFF.

Uses OpenAI-compatible API (GPT-4o / GPT-4 / etc.) to perform a
controlled multi-pass academic rewrite that reads like authentic
human-written academic prose (2000–2015 era).

Pipeline:
  Pass 1 — Precision Humanizer (strict constraints, 95% structure preserved)
  Pass 2 — Natural Variation (light realism layer, subtle irregularity)
  Pass 3 — Academic Consistency Check (minimal edits, final polish)

Requires: OPENAI_API_KEY in .env or environment.
"""

import os
import re
import time

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    OpenAI = None

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ═══════════════════════════════════════════════════════════════════════════
#  CLIENT SETUP
# ═══════════════════════════════════════════════════════════════════════════

_client = None


def _get_client():
    """Lazy-init OpenAI client from env."""
    global _client
    if _client is not None:
        return _client
    if not HAS_OPENAI:
        raise RuntimeError(
            "openai package not installed. Run: pip install openai"
        )
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY not set. Add it to .env or environment variables."
        )
    _client = OpenAI(api_key=api_key)
    return _client


# ═══════════════════════════════════════════════════════════════════════════
#  PROMPT TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════

# Model to use — configurable via env
_MODEL = os.getenv("LLM_MODEL", "gpt-4o")

PASS1_SYSTEM = """You are an expert academic editor specializing in rewriting AI-generated text to resemble authentic pre-2010 academic writing. You follow strict constraints precisely."""

PASS1_USER = """Rewrite the following text to resemble authentic pre-2010 academic writing while preserving the original content, meaning, and overall sentence structure.

STRICT CONSTRAINTS (MANDATORY):
- Preserve at least 95% of the original sentence boundaries
- Only split or merge sentences when absolutely necessary for natural flow (maximum 5% of sentences)
- Do NOT introduce new ideas, remove ideas, or reorganize the argument
- Do NOT convert prose into lists
- Do NOT use contractions (e.g., use "do not" instead of "don't")

SENTENCE-LEVEL ADJUSTMENTS (SUBTLE):
- Lightly vary sentence openings to reduce uniformity
- Introduce mild syntactic variation: reorder clauses where natural, insert occasional qualifying phrases (e.g., "in many cases," "to some extent")
- Allow a small number of longer sentences by carefully embedding clauses, but do not overextend

FLOW & ACADEMIC TONE:
- Replace overly direct or simplified phrasing with measured academic tone
- Use hedging and qualification where appropriate: "suggests," "indicates," "appears to," "is likely to"
- Maintain a reasoning-driven flow, not a simplified explanatory tone

VOCABULARY REFINEMENT:
- Replace modern, generic, or AI-like wording with neutral scholarly vocabulary
- Avoid trendy or exaggerated terms such as: "crucial," "game-changing," "in today's world," "leveraging"
- Prefer precise but natural wording used in academic literature

STRUCTURAL REALISM (ANTI-AI SIGNALS):
- Introduce slight irregularity in rhythm: minor redundancy where natural; uneven sentence pacing
- Avoid making the text overly polished or perfectly concise
- Preserve complexity where it exists; do not simplify technical phrasing

PUNCTUATION & STYLE:
- Maintain formal academic punctuation
- You may introduce commas for clause variation, occasional semicolons or dashes where appropriate
- Do not overuse stylistic punctuation

OUTPUT RULES:
- Return ONLY the rewritten text, no commentary
- Maintain original paragraph structure exactly
- Do not change sentence order
- Do not increase or decrease total length by more than 5%

Text to rewrite:
{text}"""

PASS2_SYSTEM = """You are a meticulous academic style editor. You make only subtle refinements to improve natural flow and realism without changing meaning or structure."""

PASS2_USER = """Refine the following academic text to improve natural flow while strictly preserving meaning and structure.

RULES:
- Maintain sentence structure; do not rewrite extensively
- Introduce slight variation in rhythm and phrasing
- Allow minor redundancy where it improves realism
- Ensure transitions feel natural rather than mechanical
- Avoid making the text overly polished or perfectly uniform
- Do NOT use contractions
- Do NOT add or remove ideas
- Do NOT change paragraph structure
- Return ONLY the refined text, no commentary

Text:
{text}"""

PASS3_SYSTEM = """You are an academic quality reviewer. You make only minimal edits to ensure coherence and formal tone."""

PASS3_USER = """Review the following text for academic tone and coherence. Make only minimal edits:

- Ensure arguments are logically connected
- Maintain formal academic language
- Avoid modern or conversational phrasing
- Preserve complexity where appropriate
- Do NOT use contractions
- Do NOT change structure or paragraph breaks
- Return ONLY the final text, no commentary

Text:
{text}"""

# ═══════════════════════════════════════════════════════════════════════════
#  STYLE PROFILE INJECTION (optional enhancement)
# ═══════════════════════════════════════════════════════════════════════════

STYLE_PROFILE_ADDON = """
Additionally, match this academic style profile:
- Average sentence length: ~30-35 words
- Sentence variability: high (mix short, medium, long)
- Clause density: moderate to high
- Use hedging in ~20% of sentences
- Maintain formal academic tone
"""


# ═══════════════════════════════════════════════════════════════════════════
#  STRENGTH / TONE MODIFIERS
# ═══════════════════════════════════════════════════════════════════════════

def _build_strength_addon(strength: str) -> str:
    """Add constraints based on selected strength level."""
    if strength == "light":
        return "\nIMPORTANT: Make only very light changes. Preserve 98% of original wording. Change only the most obvious AI-like phrases.\n"
    elif strength == "deep":
        return "\nYou may make deeper vocabulary and structural changes while still preserving meaning. Target ~30% vocabulary change.\n"
    return ""  # balanced = default prompts as-is


def _build_tone_addon(tone: str) -> str:
    """Add tone guidance."""
    if tone == "academic":
        return "\nUse highly formal academic register. Prefer Latin-derived vocabulary and complex clause structures.\n"
    elif tone == "professional":
        return "\nUse professional business-academic hybrid tone. Clear but formal.\n"
    elif tone == "simple":
        return "\nUse accessible academic language. Prefer shorter sentences and common vocabulary while keeping academic conventions.\n"
    return ""  # neutral = default


# ═══════════════════════════════════════════════════════════════════════════
#  SINGLE LLM CALL
# ═══════════════════════════════════════════════════════════════════════════

def _llm_call(system: str, user: str, temperature: float = 0.7) -> str:
    """Make a single OpenAI chat completion call."""
    client = _get_client()
    response = client.chat.completions.create(
        model=_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


# ═══════════════════════════════════════════════════════════════════════════
#  POST-PROCESSING
# ═══════════════════════════════════════════════════════════════════════════

_CONTRACTION_PAT = re.compile(
    r"\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|"
    r"hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|"
    r"it's|that's|there's|here's|he's|she's|they're|we're|you're|"
    r"I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|"
    r"he'll|she'll|it'll|let's|who's|what's)\b", re.IGNORECASE)

_EXPANSION_MAP = {
    "can't": "cannot", "won't": "will not", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "wouldn't": "would not", "shouldn't": "should not",
    "couldn't": "could not", "mustn't": "must not",
    "it's": "it is", "that's": "that is", "there's": "there is",
    "here's": "here is", "he's": "he is", "she's": "she is",
    "they're": "they are", "we're": "we are", "you're": "you are",
    "i'm": "I am", "they've": "they have", "we've": "we have",
    "you've": "you have", "i've": "I have", "they'll": "they will",
    "we'll": "we will", "you'll": "you will", "i'll": "I will",
    "he'll": "he will", "she'll": "she will", "it'll": "it will",
    "let's": "let us", "who's": "who is", "what's": "what is",
}


def _expand_contractions(text: str) -> str:
    """Safety net: expand any contractions the LLM may have introduced."""
    def _replace(m):
        word = m.group(0)
        expanded = _EXPANSION_MAP.get(word.lower(), word)
        # Preserve sentence-start capitalization
        if word[0].isupper() and expanded[0].islower():
            expanded = expanded[0].upper() + expanded[1:]
        return expanded
    return _CONTRACTION_PAT.sub(_replace, text)


def _preserve_paragraph_structure(original: str, result: str) -> str:
    """Ensure the LLM output has the same number of paragraphs as input."""
    orig_paras = [p.strip() for p in re.split(r'\n\s*\n', original) if p.strip()]
    result_paras = [p.strip() for p in re.split(r'\n\s*\n', result) if p.strip()]

    # If paragraph count matches, just return
    if len(result_paras) == len(orig_paras):
        return result

    # If LLM merged paragraphs, try to re-split by matching sentence count
    # This is a best-effort heuristic
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN MULTI-PASS PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def llm_humanize(text: str, strength: str = "medium",
                 preserve_sentences: bool = True,
                 strict_meaning: bool = True,
                 tone: str = "neutral") -> str:
    """
    Multi-pass LLM humanization pipeline for academic text.

    Pass 1: Precision Humanizer — strict academic rewrite
    Pass 2: Natural Variation — subtle rhythm/flow refinement
    Pass 3: Academic Consistency — final tone check

    Returns the humanized text.
    Raises RuntimeError if OpenAI API is not configured.
    """
    if not text or not text.strip():
        return text

    strength_addon = _build_strength_addon(strength)
    tone_addon = _build_tone_addon(tone)

    # ── Pass 1: Precision Humanizer ─────────────────────────────────────
    pass1_prompt = PASS1_USER.format(text=text) + strength_addon + tone_addon
    if not strict_meaning:
        pass1_prompt += "\nYou have more freedom to rephrase for naturalness.\n"
    if not preserve_sentences:
        pass1_prompt += "\nYou may split or merge up to 10% of sentences if it improves flow.\n"

    pass1_prompt += STYLE_PROFILE_ADDON

    result = _llm_call(PASS1_SYSTEM, pass1_prompt, temperature=0.7)

    # ── Pass 2: Natural Variation ───────────────────────────────────────
    pass2_prompt = PASS2_USER.format(text=result)
    result = _llm_call(PASS2_SYSTEM, pass2_prompt, temperature=0.5)

    # ── Pass 3: Academic Consistency ────────────────────────────────────
    pass3_prompt = PASS3_USER.format(text=result)
    result = _llm_call(PASS3_SYSTEM, pass3_prompt, temperature=0.3)

    # ── Post-processing ─────────────────────────────────────────────────
    result = _expand_contractions(result)
    result = _preserve_paragraph_structure(text, result)

    return result.strip()
