"""
LLM Pipeline — 8-Phase Anti-Detection Engine
=============================================
Surgical AI-text refinement for achieving <5% detection across all detectors.

Architecture:
  PRE-LLM (Python, instant):
    Phase 1: Sentence Parsing & Chunking (<200 words per chunk)
    Phase 2: AI Vocabulary Purge (dictionary-based word/phrase replacement)

  LLM (Async concurrent, ~3s):
    Phases 3-6: Combined single-prompt per chunk (fired concurrently)
      3. Perplexity — swap 2-4 predictable words with less common alternatives
      4. Burstiness — sculpt sentence lengths toward human distribution
      5. Stylometry — mix active/passive voice for natural blog-like flow
      6. Cohesion — verify meaning preservation, fix grammar

  POST-LLM (Python, instant):
    Phase 7: Sentence Boundary Enforcer (hard 10-50 word limits)
    Phase 8: Format Scrub (no em-dashes, contraction expansion, cleanup)

Speed: <5 seconds for 5,000 words via concurrent chunk processing.
Target: <5% AI detection across all major detectors.
"""

import asyncio
import os
import re
import random
import json
import time
import math
from typing import List, Dict, Tuple, Optional

try:
    from openai import AsyncOpenAI
    HAS_ASYNC_OPENAI = True
except ImportError:
    HAS_ASYNC_OPENAI = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from nltk.tokenize import sent_tokenize
except ImportError:
    def sent_tokenize(text):
        parts = re.split(r'(?<=[.!?])\s+', text)
        return [p.strip() for p in parts if p.strip()]

import rules

# Load curated synonyms for Phase 2
_CURATED_SYNONYMS = {}
try:
    _CURATED_PATH = os.path.join(os.path.dirname(__file__), 'dictionaries', 'curated_synonyms.json')
    with open(_CURATED_PATH, 'r', encoding='utf-8') as f:
        _CURATED_SYNONYMS = json.load(f)
    print(f"  [Pipeline] Loaded {len(_CURATED_SYNONYMS)} curated synonyms")
except Exception as e:
    print(f"  [Pipeline] Curated synonyms not loaded: {e}")

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

_PIPELINE_MODEL = os.getenv("PIPELINE_MODEL", "gpt-4o-mini")
_CHUNK_MAX_WORDS = 200
_MIN_SENT_WORDS = 8
_MAX_SENT_WORDS = 50
_MERGE_SPLIT_BUDGET = 0.05
_CONCURRENCY_LIMIT = int(os.getenv("PIPELINE_CONCURRENCY", "15"))

# Target sentence length distribution (from Davis & Walters 2011 research)
# Human academic writing that scores 0% AI:
#   10-15 words: ~6%    16-25 words: ~13%    26-35 words: ~28%
#   36-45 words: ~31%   46-50 words: ~22%
TARGET_DISTRIBUTION = {
    (10, 15): 0.06,
    (16, 25): 0.13,
    (26, 35): 0.28,
    (36, 45): 0.31,
    (46, 50): 0.22,
}

# AI vocabulary kill list — deterministic replacement before LLM
AI_WORD_PURGE = {
    # Transition words → conversational equivalents
    "furthermore": "also", "moreover": "also", "additionally": "also",
    "consequently": "so", "nevertheless": "still", "nonetheless": "still",
    "subsequently": "then", "henceforth": "from now on",
    "notwithstanding": "despite", "aforementioned": "previous",
    # AI-favorite academic words → simple alternatives
    "utilize": "use", "utilise": "use", "leverage": "use",
    "facilitate": "help", "comprehensive": "thorough",
    "multifaceted": "complex", "paramount": "key",
    "pivotal": "key", "crucial": "important",
    "delve": "look into", "foster": "encourage",
    "harness": "use", "robust": "strong",
    "innovative": "new", "groundbreaking": "important",
    "transformative": "major", "holistic": "whole",
    "nuanced": "detailed", "meticulous": "careful",
    "paradigm": "model", "methodology": "method",
    "framework": "approach", "trajectory": "path",
    "discourse": "discussion", "dichotomy": "divide",
    "ramification": "effect", "synergy": "cooperation",
    "tapestry": "mix", "cornerstone": "foundation",
    "bedrock": "basis", "catalyst": "driver",
    "nexus": "connection", "landscape": "field",
    "realm": "area", "myriad": "many",
    "plethora": "plenty", "multitude": "many",
    "underscore": "highlight", "exemplify": "show",
    "elucidate": "explain", "delineate": "describe",
    "ameliorate": "improve", "exacerbate": "worsen",
    "engender": "create", "perpetuate": "continue",
    "substantiate": "support", "corroborate": "confirm",
    "disseminate": "spread", "cultivate": "develop",
    "ascertain": "find out", "endeavor": "try",
    "spearhead": "lead", "streamline": "simplify",
    "optimize": "improve", "articulate": "express",
    "navigate": "handle", "mitigate": "reduce",
    "catalyze": "drive", "bolster": "support",
    "encompass": "include", "culminate": "end",
    "enhance": "improve", "ubiquitous": "widespread",
    "salient": "notable", "intricate": "complex",
    "profound": "deep", "inherent": "built-in",
    "overarching": "main", "substantive": "real",
    "efficacious": "effective", "noteworthy": "notable",
    "proliferate": "spread", "necessitate": "require",
    "illuminate": "clarify", "embark": "start",
    "unravel": "untangle", "unveil": "reveal",
    "notably": "in particular", "crucially": "importantly",
    "significantly": "greatly", "essentially": "basically",
    "fundamentally": "at its core", "undeniably": "clearly",
    "undoubtedly": "certainly", "remarkably": "unusually",
    "evidently": "clearly",
}

# AI phrase patterns to strip before LLM processing
AI_PHRASE_PURGE = [
    (re.compile(r"it is (?:important|crucial|essential|vital|imperative) (?:to note )?that\s*", re.I), ""),
    (re.compile(r"it (?:should|must|can) be (?:noted|argued|said|emphasized) that\s*", re.I), ""),
    (re.compile(r"in (?:order )?to\b", re.I), "to"),
    (re.compile(r"in today'?s (?:world|society|landscape|era)\b", re.I), "now"),
    (re.compile(r"in the modern (?:era|age|world)\b", re.I), "today"),
    (re.compile(r"plays? a (?:crucial|vital|key|significant|important|pivotal|critical) role\b", re.I), "matters"),
    (re.compile(r"a (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b", re.I), "many"),
    (re.compile(r"a (?:plethora|myriad|multitude|wealth|abundance) of\b", re.I), "many"),
    (re.compile(r"(?:due to|owing to) the fact that\b", re.I), "because"),
    (re.compile(r"first and foremost\b", re.I), "first"),
    (re.compile(r"each and every\b", re.I), "every"),
    (re.compile(r"serves? as a (?:testament|reminder|catalyst|cornerstone)\b", re.I), "shows"),
    (re.compile(r"the (?:importance|significance|impact) of\b", re.I), "how"),
    (re.compile(r"not only (.{5,40}?) but also\b", re.I), r"\1 and also"),
    (re.compile(r"(?:taken together|all things considered|on the whole)\b", re.I), "overall"),
    (re.compile(r"(?:that being said|having said that|with that in mind)\b", re.I), "still"),
    (re.compile(r"(?:in light of|in view of) (?:the above|this|these)\b", re.I), "given this"),
    (re.compile(r"at the end of the day\b", re.I), "ultimately"),
    (re.compile(r"needless to say\b", re.I), "clearly"),
    (re.compile(r"there is no doubt that\b", re.I), "clearly"),
]

# AI sentence starters to kill
AI_STARTER_PATTERNS = [
    (re.compile(r"^Furthermore,?\s+", re.I), ["Also, ", "On top of that, ", "Beyond this, "]),
    (re.compile(r"^Moreover,?\s+", re.I), ["Besides, ", "On top of that, ", "Then again, "]),
    (re.compile(r"^Additionally,?\s+", re.I), ["Also, ", "Along with this, ", "On top of this, "]),
    (re.compile(r"^Consequently,?\s+", re.I), ["So, ", "Because of this, ", "As a result, "]),
    (re.compile(r"^Subsequently,?\s+", re.I), ["Then, ", "After that, ", "From there, "]),
    (re.compile(r"^Nevertheless,?\s+", re.I), ["Still, ", "Even so, ", "That said, "]),
    (re.compile(r"^Nonetheless,?\s+", re.I), ["Yet, ", "All the same, ", "Even so, "]),
    (re.compile(r"^In\s+conclusion,?\s+", re.I), ["Overall, ", "All in all, ", "To wrap up, "]),
    (re.compile(r"^Ultimately,?\s+", re.I), ["In the end, ", "When it comes down to it, "]),
    (re.compile(r"^It is (?:important|crucial|essential|worth|vital) to (?:note|recognize|mention) that\s+", re.I), [""]),
    (re.compile(r"^In today'?s (?:world|society|era),?\s+", re.I), [""]),
    (re.compile(r"^In the modern (?:era|age|world),?\s+", re.I), [""]),
    (re.compile(r"^(?:This|These)\s+(?:findings?|results?)\s+(?:suggest|indicate|demonstrate)\s+that\s+", re.I), [""]),
]

# Contraction expansion map
_CONTRACTION_PAT = re.compile(
    r"\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|"
    r"hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|"
    r"it's|that's|there's|here's|he's|she's|they're|we're|you're|"
    r"I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|"
    r"he'll|she'll|it'll|let's|who's|what's)\b",
    re.IGNORECASE,
)
_EXPANSION_MAP = {
    "can't": "cannot", "won't": "will not", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
    "mustn't": "must not", "it's": "it is", "that's": "that is",
    "there's": "there is", "here's": "here is", "he's": "he is",
    "she's": "she is", "they're": "they are", "we're": "we are",
    "you're": "you are", "i'm": "I am", "they've": "they have",
    "we've": "we have", "you've": "you have", "i've": "I have",
    "they'll": "they will", "we'll": "we will", "you'll": "you will",
    "i'll": "I will", "he'll": "he will", "she'll": "she will",
    "it'll": "it will", "let's": "let us", "who's": "who is",
    "what's": "what is",
}


# ═══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

_PARA_BREAK = "\n\n"


def _safe_downcase_first(s: str) -> str:
    if not s:
        return s
    first_word = s.split()[0] if s.split() else ""
    if first_word.isupper() and len(first_word) > 1:
        return s
    return s[0].lower() + s[1:]


def _word_count(text: str) -> int:
    return len(text.split())


def _sentence_lengths(sentences: List[str]) -> List[int]:
    return [len(s.split()) for s in sentences]


def _get_distribution(lengths: List[int]) -> Dict[Tuple[int, int], float]:
    """Calculate actual sentence length distribution."""
    if not lengths:
        return {}
    total = len(lengths)
    buckets = {
        (10, 15): 0, (16, 25): 0, (26, 35): 0,
        (36, 45): 0, (46, 50): 0,
    }
    for l in lengths:
        for (lo, hi) in buckets:
            if lo <= l <= hi:
                buckets[(lo, hi)] += 1
                break
    return {k: v / total for k, v in buckets.items()}


def _expand_contractions(text: str) -> str:
    """Expand all contractions deterministically."""
    def _replace(match):
        word = match.group(0)
        expanded = _EXPANSION_MAP.get(word.lower(), word)
        if word[0].isupper() and expanded[0].islower():
            expanded = expanded[0].upper() + expanded[1:]
        return expanded
    return _CONTRACTION_PAT.sub(_replace, text)


# ═══════════════════════════════════════════════════════════════════════════
#  PRE-LLM PHASE 1: Sentence Parsing & Chunking
# ═══════════════════════════════════════════════════════════════════════════

def phase1_parse_and_chunk(text: str) -> Tuple[List[List[str]], List[int]]:
    """Parse text into sentences, group into <200-word chunks.

    Returns:
        chunks: list of chunks, each chunk is a list of sentences
        para_boundaries: indices where paragraph breaks occur
    """
    paragraphs = re.split(r'\n\s*\n', text)
    all_items = []  # list of (sentence_str, is_para_break)

    for pi, para in enumerate(paragraphs):
        para = para.strip()
        if not para:
            continue
        sents = sent_tokenize(para)
        for s in sents:
            s = s.strip()
            if s:
                all_items.append(("SENT", s))
        if pi < len(paragraphs) - 1:
            all_items.append(("BREAK", ""))

    # Group into chunks of <200 words
    chunks = []
    current_chunk = []
    current_words = 0

    for item_type, item_text in all_items:
        if item_type == "BREAK":
            current_chunk.append(("[PARA_BREAK]", ""))
            continue

        wc = _word_count(item_text)
        if current_words + wc > _CHUNK_MAX_WORDS and current_chunk:
            # Check if current_chunk has any real sentences
            has_sents = any(t == "SENT" for t, _ in current_chunk
                           if t != "[PARA_BREAK]")
            if has_sents:
                chunks.append(current_chunk)
            current_chunk = [("SENT", item_text)]
            current_words = wc
        else:
            current_chunk.append(("SENT", item_text))
            current_words += wc

    if current_chunk:
        has_sents = any(t != "[PARA_BREAK]" for t, _ in current_chunk)
        if has_sents:
            chunks.append(current_chunk)

    return chunks


# ═══════════════════════════════════════════════════════════════════════════
#  PRE-LLM PHASE 2: AI Vocabulary Purge
# ═══════════════════════════════════════════════════════════════════════════

def phase2_vocabulary_purge(chunks: List[List[Tuple[str, str]]]) -> List[List[Tuple[str, str]]]:
    """Deterministic AI word/phrase replacement using dictionaries.

    Runs before LLM to reduce workload and prevent AI words surviving.
    """
    processed_chunks = []

    for chunk in chunks:
        processed = []
        for item_type, item_text in chunk:
            if item_type == "[PARA_BREAK]":
                processed.append((item_type, item_text))
                continue

            sent = item_text

            # 2a: Kill AI phrases (multi-word patterns)
            for pattern, replacement in AI_PHRASE_PURGE:
                sent = pattern.sub(replacement, sent)

            # 2b: Kill AI sentence starters
            for pattern, replacements in AI_STARTER_PATTERNS:
                m = pattern.match(sent)
                if m:
                    repl = random.choice(replacements)
                    rest = sent[m.end():]
                    if not repl and rest:
                        rest = rest[0].upper() + rest[1:] if rest else rest
                    sent = repl + rest
                    break

            # 2c: Replace AI vocabulary word-by-word (with inflection handling)
            words = sent.split()
            new_words = []
            for w in words:
                stripped = w.strip(".,;:!?\"'()-[]{}")
                lower = stripped.lower()

                # Check direct match first, then try removing common suffixes
                purge_match = None
                if lower in AI_WORD_PURGE:
                    purge_match = lower
                else:
                    for suffix in ("ed", "ing", "s", "es", "ly", "ment", "tion", "ness"):
                        stem = lower
                        if stem.endswith(suffix) and len(stem) > len(suffix) + 2:
                            stem = stem[:-len(suffix)]
                            # Handle doubled consonant (e.g., "leveraged" → "leverag")
                            if len(stem) >= 2 and stem[-1] == stem[-2]:
                                stem = stem[:-1]
                            if stem in AI_WORD_PURGE:
                                purge_match = stem
                                break
                            # Try with trailing 'e' (e.g., "utilized" → "utiliz" → "utilize")
                            if (stem + "e") in AI_WORD_PURGE:
                                purge_match = stem + "e"
                                break

                if purge_match:
                    replacement = AI_WORD_PURGE[purge_match]
                    # Preserve casing
                    if stripped and stripped[0].isupper():
                        replacement = replacement[0].upper() + replacement[1:]
                    # Preserve punctuation
                    pre = w[:len(w) - len(w.lstrip(".,;:!?\"'()-[]{}"))] if w != w.lstrip(".,;:!?\"'()-[]{}") else ""
                    suf = w[len(w.rstrip(".,;:!?\"'()-[]{}")):]  if w != w.rstrip(".,;:!?\"'()-[]{}") else ""
                    new_words.append(pre + replacement + suf)
                else:
                    # Try curated synonyms with low probability (15%)
                    if (lower in _CURATED_SYNONYMS
                            and random.random() < 0.15
                            and lower not in rules.PROTECTED_WORDS
                            and len(lower) > 3):
                        candidates = _CURATED_SYNONYMS[lower]
                        candidates = [c for c in candidates
                                      if ' ' not in c and len(c) <= 15 and len(c) >= 3]
                        if candidates:
                            repl = random.choice(candidates)
                            if stripped and stripped[0].isupper():
                                repl = repl[0].upper() + repl[1:]
                            pre = w[:len(w) - len(w.lstrip(".,;:!?\"'()-[]{}"))] if w != w.lstrip(".,;:!?\"'()-[]{}") else ""
                            suf = w[len(w.rstrip(".,;:!?\"'()-[]{}")):]  if w != w.rstrip(".,;:!?\"'()-[]{}") else ""
                            new_words.append(pre + repl + suf)
                        else:
                            new_words.append(w)
                    else:
                        new_words.append(w)

            sent = " ".join(new_words)

            # Fix capitalization after empty replacements
            sent = sent.strip()
            if sent and not sent[0].isupper():
                sent = sent[0].upper() + sent[1:]

            processed.append(("SENT", sent))

        processed_chunks.append(processed)

    return processed_chunks


# ═══════════════════════════════════════════════════════════════════════════
#  LLM PHASES 3-6: Combined Async Prompt
# ═══════════════════════════════════════════════════════════════════════════

_COMBINED_SYSTEM = "Precision text editor. Surgical word-level edits only. Return edited text, nothing else."


def _build_combined_prompt(chunk_text: str, current_distribution: str,
                           sentence_count: int) -> str:
    """Build the single combined prompt with per-sentence word count annotations."""
    # Parse sentences and annotate each with word count
    sentences = sent_tokenize(chunk_text)
    annotated_lines = []
    for sent in sentences:
        wc = len(sent.split())
        annotated_lines.append(f"[{wc}w] {sent}")
    annotated_text = "\n".join(annotated_lines)

    return f"""Edit each sentence. [Nw] = current word count.

RULES:
1. Swap 1-3 formal/predictable words with simpler ones. Word-for-word only. Do NOT remove words.
2. If 3+ consecutive sentences share voice (active/passive), convert ONE to the opposite.
3. Each sentence must stay within ±3 words of its [Nw] count and be at least 8 words.
4. Keep exactly {len(sentences)} sentences. No merging, splitting, adding, removing.

DO NOT CHANGE these terms: artificial intelligence, machine learning, AI, deep learning, natural language, neural network, data science, blockchain, cybersecurity, internet of things, cloud computing, human.
BANNED: em-dash, en-dash, semicolon, Furthermore, Moreover, Additionally, Consequently, Nevertheless, crucial, utilize, foster, delve, leverage, paradigm, tapestry, pivotal, holistic.

Output only the edited flowing text. No labels, commentary, markdown.

{annotated_text}"""


async def _async_llm_call(client, semaphore, chunk_text: str,
                           current_distribution: str,
                           sentence_count: int) -> str:
    """Make a single async LLM call for one chunk with timeout."""
    prompt = _build_combined_prompt(chunk_text, current_distribution, sentence_count)

    try:
        async with semaphore:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=_PIPELINE_MODEL,
                    messages=[
                        {"role": "system", "content": _COMBINED_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=400,
                ),
                timeout=float(os.getenv("PIPELINE_TIMEOUT", "8"))
            )
    except asyncio.TimeoutError:
        return chunk_text  # Return original on timeout
    result = response.choices[0].message.content.strip()

    # Strip any markdown code fences the LLM might add
    if result.startswith("```"):
        lines = result.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        result = "\n".join(lines).strip()

    return result


async def phases3_6_llm_process(chunks: List[List[Tuple[str, str]]]) -> List[str]:
    """Process all chunks concurrently through the combined 4-phase LLM prompt.

    Returns list of processed text strings (one per chunk).
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or not HAS_ASYNC_OPENAI:
        print("  [Phase 3-6] No LLM available, returning text as-is")
        results = []
        for chunk in chunks:
            text = _chunk_to_text(chunk)
            results.append(text)
        return results

    client = AsyncOpenAI(api_key=api_key)
    semaphore = asyncio.Semaphore(_CONCURRENCY_LIMIT)

    tasks = []
    for chunk in chunks:
        chunk_text = _chunk_to_text(chunk)
        sentences = [text for typ, text in chunk if typ == "SENT"]
        lengths = _sentence_lengths(sentences)
        dist = _get_distribution(lengths)

        dist_str = "\n".join(
            f"  {lo}-{hi} words: {pct * 100:.0f}%"
            for (lo, hi), pct in sorted(dist.items())
            if pct > 0
        )
        if not dist_str:
            dist_str = "  (too few sentences to calculate)"

        tasks.append(
            _async_llm_call(client, semaphore, chunk_text, dist_str, len(sentences))
        )

    # Fire all calls concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Handle failures — fall back to original text
    processed = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            fallback = _chunk_to_text(chunks[i])
            processed.append(fallback)
            print(f"  [Phase 3-6] Chunk {i + 1} LLM failed: {result}")
        else:
            processed.append(result)

    return processed


def _chunk_to_text(chunk: List[Tuple[str, str]]) -> str:
    """Convert a chunk (list of tagged items) back to plain text."""
    parts = []
    current_para = []
    for item_type, item_text in chunk:
        if item_type == "[PARA_BREAK]":
            if current_para:
                parts.append(" ".join(current_para))
                current_para = []
        else:
            current_para.append(item_text)
    if current_para:
        parts.append(" ".join(current_para))
    return "\n\n".join(parts)


# ═══════════════════════════════════════════════════════════════════════════
#  POST-LLM PHASE 7: Sentence Boundary Enforcer
# ═══════════════════════════════════════════════════════════════════════════

def phase7_enforce_boundaries(text: str) -> str:
    """Hard enforcement of sentence length constraints + distribution shaping.

    Pass 1: Merge short consecutive sentences to build 26-50 word sentences
            (up to MERGE_SPLIT_BUDGET of total sentences)
    Pass 2: Merges any remaining sentence < 10 words with its neighbor
    Pass 3: Splits any sentence > 50 words at nearest natural break
    Deterministic Python — no AI can subvert this.
    """
    paragraphs = re.split(r'\n\s*\n', text)
    enforced = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sentences = sent_tokenize(para)
        if len(sentences) < 1:
            enforced.append(para)
            continue

        total_count = len(sentences)
        merge_budget = math.ceil(total_count * _MERGE_SPLIT_BUDGET) if total_count >= 6 else 0

        # Pass 1: Distribution shaping — merge short sentences to create longer ones
        # Only if we have enough sentences and budget
        if merge_budget > 0 and total_count >= 4:
            # Score each possible merge pair by how well it fills target gaps
            merge_candidates = []
            for i in range(len(sentences) - 1):
                wc1 = len(sentences[i].split())
                wc2 = len(sentences[i + 1].split())
                combined_wc = wc1 + wc2 + 1  # +1 for conjunction

                # Only merge pairs where both are ≤30 words and combined is 26-50
                if wc1 <= 30 and wc2 <= 30 and 26 <= combined_wc <= _MAX_SENT_WORDS:
                    # Prefer merges that hit the 36-50 range (most needed)
                    if 36 <= combined_wc <= 50:
                        score = 3
                    elif 26 <= combined_wc <= 35:
                        score = 1
                    else:
                        score = 0
                    merge_candidates.append((score, i))

            # Sort by score desc, then pick top merges respecting budget and no overlaps
            merge_candidates.sort(key=lambda x: -x[0])
            merge_indices = set()
            merges_planned = 0
            for score, idx in merge_candidates:
                if merges_planned >= merge_budget:
                    break
                # No overlapping merges
                if idx not in merge_indices and (idx + 1) not in merge_indices:
                    merge_indices.add(idx)
                    merges_planned += 1

            # Build result with planned merges
            result = []
            i = 0
            while i < len(sentences):
                if i in merge_indices:
                    sent = sentences[i]
                    next_sent = sentences[i + 1]
                    joiners = ["and", "while", "because", "since", "as"]
                    joiner = random.choice(joiners)
                    merged = (sent.rstrip(". ") + ", " + joiner + " "
                              + _safe_downcase_first(next_sent))
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    result.append(merged)
                    i += 2
                else:
                    result.append(sentences[i])
                    i += 1
            sentences = result

        # Pass 2: Fix too-short sentences (< 10 words) by merging
        # Always merge — if result is >50 words, Pass 3 will split it
        result = []
        i = 0
        while i < len(sentences):
            sent = sentences[i]
            wc = len(sent.split())

            if wc < _MIN_SENT_WORDS:
                # Merge with next sentence
                if i + 1 < len(sentences):
                    next_sent = sentences[i + 1]
                    merged = sent.rstrip(". ") + ", " + _safe_downcase_first(next_sent)
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    result.append(merged)
                    i += 2
                    continue
                # Merge with previous
                if result:
                    merged = result[-1].rstrip(". ") + ", " + _safe_downcase_first(sent)
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    result[-1] = merged
                    i += 1
                    continue
            result.append(sent)
            i += 1

        sentences = result

        # Pass 2: Fix too-long sentences (> 50 words) by splitting
        result = []
        for sent in sentences:
            words = sent.split()
            wc = len(words)

            if wc > _MAX_SENT_WORDS:
                mid = wc // 2
                split_done = False
                for offset in range(0, min(15, mid - _MIN_SENT_WORDS)):
                    for pos in [mid + offset, mid - offset]:
                        if pos < _MIN_SENT_WORDS or pos > wc - _MIN_SENT_WORDS:
                            continue
                        w = words[pos - 1]
                        next_w = words[pos].lower().rstrip(".,;:")
                        if (w.endswith(",") or w.endswith(";")
                                or next_w in ("and", "but", "while", "though",
                                              "although", "because", "since",
                                              "whereas", "however", "so")):
                            s1 = " ".join(words[:pos]).rstrip(",;") + "."
                            s2_words = list(words[pos:])
                            # Skip leading conjunction
                            if (s2_words and s2_words[0].lower().rstrip(".,;:")
                                    in ("and", "but", "so")):
                                if len(s2_words) > 1:
                                    s2_words = s2_words[1:]
                            if s2_words:
                                s2_words[0] = s2_words[0][0].upper() + s2_words[0][1:]
                            s2 = " ".join(s2_words)
                            if not s2.endswith((".", "!", "?")):
                                s2 = s2.rstrip(".,;: ") + "."
                            # Both halves must meet minimum
                            if (len(s1.split()) >= _MIN_SENT_WORDS
                                    and len(s2.split()) >= _MIN_SENT_WORDS):
                                result.append(s1)
                                result.append(s2)
                                split_done = True
                                break
                    if split_done:
                        break
                if not split_done:
                    result.append(sent)
            else:
                result.append(sent)

        enforced.append(" ".join(result))

    return "\n\n".join(enforced)


# ═══════════════════════════════════════════════════════════════════════════
#  POST-LLM PHASE 8: Format Scrub
# ═══════════════════════════════════════════════════════════════════════════

def phase8_format_scrub(text: str, no_contractions: bool = True) -> str:
    """Final deterministic cleanup.

    - Remove em-dashes, en-dashes (replace with commas)
    - Remove semicolons (replace with periods)
    - Expand contractions
    - Fix whitespace, punctuation, capitalization
    """
    # Remove em-dashes → commas
    text = text.replace(" — ", ", ")
    text = text.replace("—", ", ")
    text = text.replace(" – ", ", ")
    text = text.replace("–", ", ")
    # Spaced hyphens used as dashes
    text = re.sub(r' - (?=[A-Za-z])', ', ', text)

    # Remove semicolons → periods + capitalize
    text = re.sub(r';\s*', '. ', text)
    text = re.sub(
        r'\.\s+([a-z])',
        lambda m: '. ' + m.group(1).upper(),
        text
    )

    # Clean whitespace (preserve paragraph breaks)
    text = re.sub(r'[^\S\n]+', ' ', text)

    # Fix double periods
    text = re.sub(r'\.{2,}', '.', text)

    # Fix space before punctuation
    text = re.sub(r'\s+([.,!?:])', r'\1', text)

    # Fix double commas from em-dash replacement
    text = re.sub(r',\s*,', ',', text)

    # Fix comma-period sequences
    text = re.sub(r',\.', '.', text)

    # Fix a/an agreement
    text = re.sub(r'\ba ([aeiouAEIOU])', r'an \1', text)
    text = re.sub(r'\bA ([aeiouAEIOU])', r'An \1', text)
    text = re.sub(r'\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])', r'a \1', text)

    # Expand contractions
    if no_contractions:
        text = _expand_contractions(text)

    # Ensure sentences start with capitals and end with periods
    paragraphs = re.split(r'\n\s*\n', text)
    cleaned_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sentences = sent_tokenize(para)
        cleaned = []
        for s in sentences:
            s = s.strip()
            if s:
                s = s[0].upper() + s[1:]
                if not s.endswith((".", "!", "?")):
                    s = s.rstrip(".,;: ") + "."
                cleaned.append(s)
        cleaned_paras.append(" ".join(cleaned))

    return "\n\n".join(cleaned_paras)


# ═══════════════════════════════════════════════════════════════════════════
#  PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════

async def run_pipeline_async(text: str, no_contractions: bool = True) -> str:
    """Run the full 8-phase anti-detection pipeline (async).

    Phase 1 (Non-LLM): Parse & chunk text into <200 word blocks
    Phase 2 (Non-LLM): Purge AI vocabulary using dictionaries
    Phase 3-6 (LLM):   Combined async processing per chunk (concurrent)
    Phase 7 (Non-LLM): Enforce sentence boundaries (10-50 words)
    Phase 8 (Non-LLM): Format scrub (no em-dashes, contraction expansion)

    Returns the processed text.
    """
    if not text or not text.strip():
        return text

    start = time.time()
    print("[Pipeline] Starting 8-phase anti-detection pipeline")

    # ── Phase 1: Parse & Chunk ──────────────────────────────────────
    chunks = phase1_parse_and_chunk(text)
    total_sents = sum(1 for chunk in chunks for t, _ in chunk if t == "SENT")
    total_words = sum(
        _word_count(txt) for chunk in chunks for t, txt in chunk if t == "SENT"
    )
    print(f"  [Phase 1] {len(chunks)} chunks, {total_sents} sentences, {total_words} words")

    # ── Phase 2: AI Vocabulary Purge ────────────────────────────────
    chunks = phase2_vocabulary_purge(chunks)
    print(f"  [Phase 2] AI vocabulary purged")

    # ── Phases 3-6: LLM Processing (concurrent) ────────────────────
    llm_start = time.time()
    processed_chunks = await phases3_6_llm_process(chunks)
    llm_elapsed = time.time() - llm_start
    print(f"  [Phase 3-6] LLM done ({llm_elapsed:.1f}s, {len(processed_chunks)} chunks)")

    # Stitch chunks back together
    full_text = "\n\n".join(processed_chunks)

    # ── Phase 7: Format Scrub ───────────────────────────────────────
    full_text = phase8_format_scrub(full_text, no_contractions=no_contractions)

    # ── Phase 8: Boundary Enforcer (runs LAST to catch violations from scrub) ──
    full_text = phase7_enforce_boundaries(full_text)
    # Count violations after enforcement
    all_sents = sent_tokenize(full_text)
    all_lengths = _sentence_lengths(all_sents)
    violations = [l for l in all_lengths if l < _MIN_SENT_WORDS or l > _MAX_SENT_WORDS]
    print(f"  [Phase 8] Boundaries enforced. Violations remaining: {len(violations)}")

    # ── Final stats ─────────────────────────────────────────────────
    final_sents = sent_tokenize(full_text)
    final_lengths = _sentence_lengths(final_sents)
    elapsed = time.time() - start

    if final_lengths:
        dist = _get_distribution(final_lengths)
        avg_len = sum(final_lengths) / len(final_lengths)
        std_dev = (sum((l - avg_len) ** 2 for l in final_lengths) / len(final_lengths)) ** 0.5
        min_len = min(final_lengths)
        max_len = max(final_lengths)

        print(f"  [Pipeline] Final: {len(final_sents)} sents, "
              f"avg={avg_len:.1f}, min={min_len}, max={max_len}, std={std_dev:.1f}")
        print(f"  [Pipeline] Distribution: " +
              ", ".join(f"{lo}-{hi}:{pct * 100:.0f}%"
                        for (lo, hi), pct in sorted(dist.items())))
    print(f"  [Pipeline] Complete in {elapsed:.1f}s")

    return full_text


def run_pipeline(text: str, no_contractions: bool = True) -> str:
    """Run the full 8-phase pipeline (sync wrapper).

    Use run_pipeline_async() in async contexts (FastAPI).
    """
    try:
        loop = asyncio.get_running_loop()
        # Already in async context — create a new thread to run
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, run_pipeline_async(text, no_contractions))
            return future.result()
    except RuntimeError:
        # No running loop — use asyncio.run directly
        return asyncio.run(run_pipeline_async(text, no_contractions))
