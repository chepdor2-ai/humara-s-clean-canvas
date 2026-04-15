#!/usr/bin/env python3
"""
King Model Server — Pure LLM Multi-Phase Sentence-by-Sentence Humanizer
========================================================================

Uses GPT-4o-mini with the full Wikipedia AI Cleanup ruleset (29 patterns)
to remove every known sign of AI-generated text.

Pipeline per sentence:
  Phase 1:  Deep rewrite — apply all 29 AI pattern removal rules
  Phase 2:  Self-audit  — "What makes this obviously AI generated?"
  Phase 3:  Revision    — fix only the specific tells from Phase 2

Titles / headings are detected and preserved verbatim.
Paragraphs are split, sentences processed independently, then reassembled
in the original paragraph structure.

Start:
  OPENAI_API_KEY=sk-... python king_server.py
  (default port 8400)
"""
import logging
import os
import re
import time
import asyncio
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── OpenAI ──

import openai

_api_key = os.environ.get("OPENAI_API_KEY", "").strip()
if not _api_key:
    logger.warning("OPENAI_API_KEY not set — King server will fail on requests.")

_client: openai.AsyncOpenAI | None = None


def _get_client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        _client = openai.AsyncOpenAI(api_key=_api_key)
    return _client


LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
CONCURRENCY = int(os.environ.get("KING_CONCURRENCY", "10"))
LLM_TIMEOUT = float(os.environ.get("KING_LLM_TIMEOUT", "8"))


async def llm_call(system: str, user: str, temperature: float = 0.7, max_tokens: int = 1024) -> str:
    client = _get_client()
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            timeout=LLM_TIMEOUT,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning(f"LLM call failed: {e}")
        return ""


# ── Sentence splitting ──

_SENT_RE = re.compile(
    r'(?<=[.!?])\s+(?=[A-Z"])'
    r'|(?<=[.!?])\s*\n'
)


def robust_sentence_split(text: str) -> list[str]:
    """Split text into sentences, preserving abbreviations."""
    parts = _SENT_RE.split(text.strip())
    return [s.strip() for s in parts if s.strip()]


# ── Heading detection ──

def is_heading(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if re.match(r'^#{1,6}\s', t):
        return True
    if re.match(r'^[IVXLCDM]+\.\s', t, re.IGNORECASE):
        return True
    if re.match(
        r'^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|'
        r'References|Bibliography|Discussion|Results|Methods|Appendix)\b',
        t, re.IGNORECASE,
    ):
        return True
    if re.match(r'^[\d]+[.):]\s', t):
        return True
    words = t.split()
    if len(words) <= 10 and not re.search(r'[.!?]$', t) and t[0].isupper():
        return True
    return False


# ── Anti-hallucination ──

_STOP = frozenset([
    "this", "that", "with", "from", "have", "been", "were", "will",
    "would", "could", "should", "also", "than", "then", "them", "they",
    "their", "there", "these", "those", "which", "where", "about",
    "after", "before", "other", "some", "such", "more", "most", "very",
    "only", "just", "into", "over", "each", "well", "much", "many",
    "does", "made", "make", "when", "what", "while",
])


def _key_terms(text: str) -> set[str]:
    words = re.sub(r"[^a-z0-9\s'-]", "", text.lower()).split()
    return {w for w in words if len(w) > 3 and w not in _STOP}


def _word_change(a: str, b: str) -> float:
    wa = a.lower().split()
    wb = b.lower().split()
    n = max(len(wa), len(wb))
    if n == 0:
        return 1.0
    changed = sum(1 for i in range(n) if i >= len(wa) or i >= len(wb) or wa[i] != wb[i])
    return changed / n


def validate_not_hallucinated(original: str, output: str) -> bool:
    ow = original.split()
    rw = output.split()
    if len(rw) > len(ow) * 2.0 or len(rw) < len(ow) * 0.3:
        return False
    ot = _key_terms(original)
    rt = _key_terms(output)
    if not ot:
        return True
    overlap = sum(1 for t in ot if t in rt)
    if overlap / len(ot) < 0.30:
        return False
    return True


# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — Deep rewrite with full Wikipedia AI Cleanup ruleset
# ══════════════════════════════════════════════════════════════════════

PHASE1_SYSTEM = """You are a writing editor that removes ALL signs of AI-generated text.  You rewrite ONE sentence at a time.

ANTI-HALLUCINATION — OVERRIDES EVERYTHING:
- You PARAPHRASE the given sentence.  Never invent new facts or drop existing ones.
- Every proper noun, statistic, entity, and specific claim MUST survive in your output.
- Output ONLY the rewritten sentence.  No labels, no quotes, no commentary.

AI PATTERN REMOVAL CHECKLIST (apply ALL that are relevant):
1. SIGNIFICANCE INFLATION — Remove "pivotal", "testament", "crucial", "vital role", "enduring", "broader", "indelible mark", "setting the stage".  State facts plainly.
2. NOTABILITY PUFFING — Do not list media outlets for emphasis.  Cite one specific detail instead.
3. SUPERFICIAL -ING TAILS — Remove dangling "highlighting…", "underscoring…", "reflecting…", "showcasing…", "ensuring…", "fostering…" clauses tacked onto sentences.
4. PROMOTIONAL LANGUAGE — Kill "vibrant", "rich" (figurative), "profound", "nestled", "groundbreaking", "renowned", "breathtaking", "stunning", "must-visit", "boasts".
5. VAGUE ATTRIBUTIONS — Replace "experts argue", "industry reports", "observers have cited" with a concrete source or drop the hedge entirely.
6. CHALLENGES-AND-PROSPECTS — Remove formulaic "Despite challenges… continues to thrive" patterns.
7. OVERUSED AI VOCABULARY — Replace: additionally, align with, crucial, delve, emphasize, enduring, enhance, foster, garner, highlight (verb), interplay, intricate, key (adj), landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant.
8. COPULA AVOIDANCE — Replace "serves as", "stands as", "represents", "boasts", "features", "offers" with plain "is", "are", "has".
9. NEGATIVE PARALLELISMS — Rewrite "Not only X but Y" and "It's not just X, it's Y" as a single direct statement.  Remove tailing negation fragments ("no guessing").
10. RULE OF THREE — Do NOT group ideas into artificial triads.
11. ELEGANT VARIATION — Use one name for a referent, not cycling synonyms.
12. FALSE RANGES — Remove "from X to Y" constructions where X and Y are not on a real scale.
13. PASSIVE VOICE / SUBJECTLESS FRAGMENTS — Prefer active voice with a clear subject.
14. EM DASH OVERUSE — Replace em dashes with commas, periods, or parentheses.
15. BOLDFACE / EMOJIS — Strip bold markers and emojis.
16. INLINE-HEADER LISTS — Merge bolded-header bullet items into flowing prose.
17. TITLE CASE IN HEADINGS — Use sentence case.
18. CURLY QUOTES — Use straight quotes only.
19. COLLABORATIVE ARTIFACTS — Remove "I hope this helps", "Let me know", "Certainly!", "Of course!".
20. KNOWLEDGE-CUTOFF DISCLAIMERS — Remove "as of", "based on available information", "while specific details are limited".
21. SYCOPHANTIC TONE — Remove "Great question!", "You're absolutely right!".
22. FILLER PHRASES — "In order to" -> "To"; "Due to the fact that" -> "Because"; "It is important to note that" -> drop.
23. EXCESSIVE HEDGING — "could potentially possibly be argued" -> direct statement.
24. GENERIC POSITIVE CONCLUSIONS — Remove "the future looks bright", "exciting times lie ahead".
25. HYPHENATED PAIRS — Drop hyphens from common compounds: "cross-functional" -> "cross functional", "data-driven" -> "data driven".
26. PERSUASIVE AUTHORITY TROPES — Remove "The real question is", "at its core", "what really matters", "fundamentally".
27. SIGNPOSTING — Remove "Let's dive in", "Here's what you need to know", "Let's break this down".
28. FRAGMENTED HEADERS — Remove one-line restatements that follow a heading.
29. PERSONALITY — Vary sentence length.  Have opinions where appropriate.  Acknowledge complexity.

STRICT STYLE:
- Match the register of the original (formal, casual, technical).
- Change at least 50% of words while preserving ALL facts and meaning.
- Vary sentence structure: use clause fronting, appositives, participial openers.
- Do NOT start with "This", "It is", or "There is/are"."""

_PHASE1_PROMPTS = [
    "Rewrite this sentence removing every AI writing pattern.  Use clause fronting.  Position: {pos}.\n\nSentence: {sent}",
    "Paraphrase this sentence so it sounds fully human.  Restructure the grammar significantly.  Position: {pos}.\n\nSentence: {sent}",
    "Rewrite in a natural, human voice.  Vary the word order from the original.  Position: {pos}.\n\nSentence: {sent}",
    "Transform this sentence removing all AI tells.  Use a fresh opening and different main verb.  Position: {pos}.\n\nSentence: {sent}",
    "Restructure this sentence with a different grammatical pattern.  No AI vocabulary.  Position: {pos}.\n\nSentence: {sent}",
]


def _clean_llm_output(raw: str) -> str:
    cleaned = re.sub(r'^["\u201C\u201D\']+|["\u201C\u201D\']+$', '', raw)
    cleaned = re.sub(r"^(?:Here(?:'s| is)[^:]*:|Rewritten[^:]*:|Output[^:]*:|Revised[^:]*:)\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace('\u201C', '"').replace('\u201D', '"')
    cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'")
    return cleaned.strip()


async def phase1_sentence(sentence: str, idx: int, total: int) -> str:
    pos = "opening" if idx < total * 0.2 else ("closing" if idx > total * 0.8 else "body")
    prompt = _PHASE1_PROMPTS[idx % len(_PHASE1_PROMPTS)].format(pos=pos, sent=sentence)
    temp = 0.65 + (idx % 4) * 0.08

    for attempt in range(3):
        raw = await llm_call(PHASE1_SYSTEM, prompt, temp + attempt * 0.04)
        if not raw:
            continue
        cleaned = _clean_llm_output(raw)
        if not validate_not_hallucinated(sentence, cleaned):
            continue
        if _word_change(sentence, cleaned) >= 0.45 and len(cleaned) > 10:
            return cleaned
    return sentence


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — Self-audit
# ══════════════════════════════════════════════════════════════════════

PHASE2_SYSTEM = """You are evaluating a single sentence for remaining AI writing tells.
Answer with a SHORT bullet list (max 5 bullets) of specific remaining AI patterns.
If there are no remaining tells, respond with only: CLEAN
Do NOT rewrite the sentence — only diagnose."""


async def phase2_audit(sentence: str) -> str:
    result = await llm_call(
        PHASE2_SYSTEM,
        f"What makes this sentence obviously AI generated?\n\nSentence: {sentence}",
        0.3, 256,
    )
    return result or "CLEAN"


# ══════════════════════════════════════════════════════════════════════
# PHASE 3 — Targeted revision
# ══════════════════════════════════════════════════════════════════════

PHASE3_SYSTEM = """You are a writing editor.  You receive a sentence and a list of remaining AI writing patterns found in it.  Revise the sentence to eliminate ONLY those specific patterns.

RULES:
- Output ONLY the revised sentence.  No labels, no quotes, no commentary.
- Preserve all facts, entities, and meaning.
- If the diagnosis says "CLEAN", output the sentence unchanged.
- Do NOT introduce new AI patterns while fixing old ones.
- Use straight quotes, no em dashes, no filler, no hedging."""


async def phase3_revise(sentence: str, diagnosis: str) -> str:
    if diagnosis.strip().upper() == "CLEAN":
        return sentence
    prompt = f"Revise this sentence to fix ONLY the listed AI patterns.\n\nSentence: {sentence}\n\nRemaining AI patterns:\n{diagnosis}"
    raw = await llm_call(PHASE3_SYSTEM, prompt, 0.55, 512)
    if not raw:
        return sentence
    cleaned = _clean_llm_output(raw)
    if not validate_not_hallucinated(sentence, cleaned):
        return sentence
    return cleaned if len(cleaned) > 5 else sentence


# ══════════════════════════════════════════════════════════════════════
# Full pipeline per sentence
# ══════════════════════════════════════════════════════════════════════

async def process_sentence(sentence: str, idx: int, total: int) -> str:
    result = await phase1_sentence(sentence, idx, total)
    diagnosis = await phase2_audit(result)
    result = await phase3_revise(result, diagnosis)
    return result


# ══════════════════════════════════════════════════════════════════════
# Light post-processing (non-LLM)
# ══════════════════════════════════════════════════════════════════════

# Common AI vocabulary replacements
_AI_WORD_KILLS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\butilize[sd]?\b", re.I), "use"),
    (re.compile(r"\bleverag(?:e[sd]?|ing)\b", re.I), "using"),
    (re.compile(r"\bfacilitate[sd]?\b", re.I), "help"),
    (re.compile(r"\bdelve[sd]?\b", re.I), "look"),
    (re.compile(r"\bunderscore[sd]?\b", re.I), "show"),
    (re.compile(r"\bhighlight(?:s|ed|ing)?\b", re.I), "show"),
    (re.compile(r"\bshowcase[sd]?\b", re.I), "show"),
    (re.compile(r"\bfoster(?:s|ed|ing)?\b", re.I), "support"),
    (re.compile(r"\bgarner(?:s|ed|ing)?\b", re.I), "get"),
    (re.compile(r"\benhance[sd]?\b", re.I), "improve"),
    (re.compile(r"\bpivotal\b", re.I), "important"),
    (re.compile(r"\bcrucial\b", re.I), "important"),
    (re.compile(r"\bvibrant\b", re.I), "lively"),
    (re.compile(r"\bintricate\b", re.I), "complex"),
    (re.compile(r"\btapestry\b", re.I), "mix"),
    (re.compile(r"\btestament\b", re.I), "proof"),
    (re.compile(r"\blandscape\b", re.I), "field"),
    (re.compile(r"\badditionally\b", re.I), "also"),
    (re.compile(r"\bfurthermore\b", re.I), "also"),
    (re.compile(r"\bmoreover\b", re.I), "also"),
    (re.compile(r"\bin order to\b", re.I), "to"),
    (re.compile(r"\bdue to the fact that\b", re.I), "because"),
    (re.compile(r"\bit is important to note that\b", re.I), ""),
    (re.compile(r"\bgroundbreaking\b", re.I), "new"),
    (re.compile(r"\brendered\b", re.I), "made"),
]

_CONTRACTIONS = {
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "can't": "cannot", "couldn't": "could not", "won't": "will not",
    "wouldn't": "would not", "shouldn't": "should not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "it's": "it is", "that's": "that is", "there's": "there is",
    "they're": "they are", "we're": "we are", "you're": "you are",
    "he's": "he is", "she's": "she is", "who's": "who is",
    "let's": "let us", "i'm": "I am", "i've": "I have", "i'll": "I will",
    "i'd": "I would", "we've": "we have", "we'll": "we will",
    "you've": "you have", "you'll": "you will", "they've": "they have",
    "they'll": "they will",
}


def post_process(text: str) -> str:
    result = text
    for pat, repl in _AI_WORD_KILLS:
        result = pat.sub(repl, result)
    # Expand contractions
    for contr, expanded in _CONTRACTIONS.items():
        result = re.sub(re.escape(contr), expanded, result, flags=re.IGNORECASE)
    # Curly quotes
    result = result.replace('\u201C', '"').replace('\u201D', '"')
    result = result.replace('\u2018', "'").replace('\u2019', "'")
    # Em dashes
    result = re.sub(r'\s*\u2014\s*', ', ', result)
    result = re.sub(r'\s*--\s*', ', ', result)
    # Bold markers
    result = re.sub(r'\*\*([^*]+)\*\*', r'\1', result)
    # Sentence-initial lowercase
    result = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), result)
    # Double spaces
    result = re.sub(r' {2,}', ' ', result)
    # Space before punctuation
    result = re.sub(r' ([.,;:!?])', r'\1', result)
    # Missing space after punctuation
    result = re.sub(r'([.,;:!?])([A-Za-z])', r'\1 \2', result)
    # Double punctuation
    result = re.sub(r'([.!?]){2,}', r'\1', result)
    return result.strip()


# ══════════════════════════════════════════════════════════════════════
# FastAPI app
# ══════════════════════════════════════════════════════════════════════

app = FastAPI(title="King Humanizer Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HumanizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100_000)


class HumanizeResponse(BaseModel):
    humanized: str
    input_words: int
    output_words: int
    total_change: float
    elapsed_ms: int


@app.get("/health")
async def health():
    return {"status": "ok", "model": LLM_MODEL, "server": "king", "version": "1.0.0"}


@app.post("/humanize", response_model=HumanizeResponse)
async def humanize(req: HumanizeRequest):
    if not _api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    start = time.time()
    input_words = len(text.split())

    # Split into paragraphs
    raw_paragraphs = text.split("\n\n") if "\n\n" in text else text.split("\n")
    paragraph_results: list[str] = []

    for raw_para in raw_paragraphs:
        para = raw_para.strip()
        if not para:
            paragraph_results.append("")
            continue

        if is_heading(para):
            paragraph_results.append(para)
            continue

        sentences = robust_sentence_split(para)
        total = len(sentences)

        # Process in batches with concurrency
        rewritten: list[str] = [""] * total
        sem = asyncio.Semaphore(CONCURRENCY)

        async def _process(idx: int, sent: str):
            async with sem:
                return await process_sentence(sent, idx, total)

        tasks = [_process(i, s) for i, s in enumerate(sentences)]
        results = await asyncio.gather(*tasks)
        for i, r in enumerate(results):
            rewritten[i] = r

        paragraph_results.append(" ".join(rewritten))

    humanized = "\n\n".join(paragraph_results)
    humanized = post_process(humanized)

    elapsed_ms = int((time.time() - start) * 1000)
    output_words = len(humanized.split())
    total_change = _word_change(text, humanized)

    logger.info(
        f"King: {input_words}w -> {output_words}w, "
        f"{total_change:.1%} change, {elapsed_ms}ms"
    )

    return HumanizeResponse(
        humanized=humanized,
        input_words=input_words,
        output_words=output_words,
        total_change=round(total_change, 3),
        elapsed_ms=elapsed_ms,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8400"))
    logger.info(f"Starting King server on port {port} (model: {LLM_MODEL})")
    uvicorn.run(app, host="0.0.0.0", port=port)
