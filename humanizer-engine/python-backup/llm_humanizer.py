"""
LLM-Powered Academic Humanizer — Ninja Engine
==============================================
The world's most aggressive AI-text humanizer.

Pipeline:
  PHASE A — LLM (4 OpenAI passes)
    Pass 1 - Core Draft (content fidelity)
    Pass 2 - Precision Humanizer (low-change mode)
    Pass 3 - Natural Variation (light realism)
    Pass 4 - Academic Consistency (final review)

  PHASE B — Non-LLM Stealth Processing (4 aggressive phases)
    Phase 5 - AI Pattern Elimination (kill marker words, AI phrases, starters)
    Phase 6 - Deep Structural Transform (voice shifts, clause reorder, restructure)
    Phase 7 - Synonym & Vocabulary Obfuscation (POS-aware + dictionary swap)
    Phase 8 - Human Texture Injection (burstiness, hedges, rhythm, connectors)

  PHASE C — Iterative Detection Loop
    Re-run Phase B until average AI detection score < 10% (max 6 iterations)
"""

import os
import re
import time
import random
import math

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

from style_memory import StyleProfile, get_style_memory
from text_analyzer import analyze_text, compute_gap, gap_to_instructions
from validation import validate_all
from ninja_post_processor import execute_ninja_non_llm_phases

# Non-LLM transform imports
import rules
import utils
from post_processor import post_process as _post_process

try:
    from advanced_transforms import (
        voice_shift, deep_restructure, expand_contractions,
    )
    HAS_ADVANCED = True
except Exception:
    HAS_ADVANCED = False

try:
    from dictionary import get_dictionary
    _dict = get_dictionary()
    HAS_DICTIONARY = True
except Exception:
    _dict = None
    HAS_DICTIONARY = False

try:
    from multi_detector import get_detector
    _stealth_detector = get_detector()
    HAS_STEALTH_DETECTOR = True
except Exception:
    _stealth_detector = None
    HAS_STEALTH_DETECTOR = False

try:
    from context_analyzer import analyze as analyze_context
    HAS_CONTEXT = True
except Exception:
    HAS_CONTEXT = False

try:
    from nltk.tokenize import sent_tokenize
except Exception:
    def sent_tokenize(text):
        parts = re.split(r'(?<=[.!?])\s+', text)
        return [p.strip() for p in parts if p.strip()]

# ---------------------------------------------------------------------
# OpenAI client setup
# ---------------------------------------------------------------------

_client = None
_MODEL = os.getenv("LLM_MODEL", "gpt-4o")


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not HAS_OPENAI:
        raise RuntimeError("openai package not installed. Run: pip install openai")

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set. Add it to .env or environment variables.")

    _client = OpenAI(api_key=api_key)
    return _client


def _llm_call(system: str, user: str, temperature: float) -> str:
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


# ---------------------------------------------------------------------
# Post-process safety net (no contractions)
# ---------------------------------------------------------------------

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


def _expand_contractions(text: str) -> str:
    def _replace(match):
        word = match.group(0)
        expanded = _EXPANSION_MAP.get(word.lower(), word)
        if word[:1].isupper() and expanded[:1].islower():
            expanded = expanded[0].upper() + expanded[1:]
        return expanded
    return _CONTRACTION_PAT.sub(_replace, text)


def _preserve_paragraph_structure(original: str, result: str) -> str:
    orig_paras = [p.strip() for p in re.split(r"\n\s*\n", original) if p.strip()]
    result_paras = [p.strip() for p in re.split(r"\n\s*\n", result) if p.strip()]
    if len(orig_paras) == len(result_paras):
        return result
    return result


# ---------------------------------------------------------------------
# Ninja LLM prompts
# ---------------------------------------------------------------------

_CORE_DRAFT_SYSTEM = (
    "You are an academic drafting assistant focused on content fidelity, "
    "logical structure, and completeness."
)

_CORE_DRAFT_USER = """Write a clear academic draft explaining the following content.

Rules:
- Preserve original meaning and argument order exactly.
- Keep the same paragraph structure.
- Do not add new ideas or remove ideas.
- Do not use contractions.
- Return only the draft text.

Text:
{text}"""

_PRECISION_SYSTEM = """You are a Controlled Academic Rewriting Engine with Style Memory.

Your task is to rewrite the provided text so it reads like natural human academic writing while preserving original meaning, structure, and nearly all wording.

Do low-change rewriting only. No aggressive paraphrasing."""


def _build_precision_prompt(
    text: str,
    profile: StyleProfile,
    gap_instructions: str,
    strength: str,
    strict_meaning: bool,
    preserve_sentences: bool,
) -> str:
    prompt = f"""Rewrite the following text to resemble authentic pre-2010 academic writing while preserving the original content, meaning, and overall sentence structure.

STRICT CONSTRAINTS (MANDATORY)
- Preserve at least 95% of original sentence boundaries.
- Only split or merge sentences when absolutely necessary (maximum 5%).
- Do NOT introduce new ideas, remove ideas, or reorganize argument flow.
- Do NOT convert prose into lists unless original text already contains lists.
- Do NOT use contractions.

{profile.summary_text()}

{gap_instructions}

Sentence-level adjustments (subtle):
- Lightly vary sentence openings.
- Introduce mild syntactic variation by reordering clauses where natural.
- Insert occasional qualifying phrases like "in many cases" or "to some extent".
- Allow a small number of longer sentences through clause embedding.

Flow and academic tone:
- Replace overly direct phrasing with measured academic tone.
- Use hedging where appropriate: "suggests", "indicates", "appears to", "is likely to".
- Keep reasoning-driven flow.

Vocabulary refinement:
- Replace modern, generic, or AI-like wording with neutral scholarly vocabulary.
- Avoid exaggerated wording such as "crucial", "game-changing", "in today's world", "leveraging".
- Keep key technical terminology unchanged.

Structural realism:
- Introduce slight irregularity in rhythm and pacing.
- Avoid making the text overly polished or perfectly concise.
- Preserve complexity where it exists.

Punctuation and style:
- Maintain formal academic punctuation.
- Use commas for clause variation and occasional semicolons or dashes where natural.
- Do not overuse stylistic punctuation.

Output rules:
- Return only the rewritten text.
- Preserve paragraph structure exactly.
- Do not change sentence order.
"""

    if strength == "light":
        prompt += "\nVariation control: target 3-5% maximum change, very low vocabulary drift.\n"
    elif strength in ("strong", "deep"):
        prompt += "\nVariation control: allow up to 8% change, while preserving content and order.\n"
    else:
        prompt += "\nVariation control: target 5-7% maximum change, low structural change.\n"

    if strict_meaning:
        prompt += "\nStrict meaning mode: content deviation must be zero.\n"
    if preserve_sentences:
        prompt += "\nSentence lock: do not split or merge any sentence.\n"

    prompt += f"\nText to rewrite:\n{text}"
    return prompt


_PASS3_SYSTEM = "You are a meticulous academic style editor."
_PASS3_USER = """Refine the text to improve natural academic flow while preserving meaning and structure.
- Maintain sentence structure; do not rewrite extensively.
- Introduce slight variation in rhythm and phrasing.
- Allow minor redundancy where it improves realism.
- Ensure transitions feel natural rather than mechanical.
- Avoid making the text overly polished or perfectly uniform.
- Do NOT use contractions.
- Return only the refined text.

Text:
{text}"""

_PASS4_SYSTEM = "You are an academic quality reviewer."
_PASS4_USER = """Review the text for academic tone and coherence.
- Ensure arguments are logically connected.
- Maintain formal academic language.
- Avoid modern or conversational phrasing.
- Preserve complexity where appropriate.
- Make only minimal edits.
- Do NOT use contractions.
- Return only the final text.

Text:
{text}"""

_FIX_SYSTEM = "You are a precise text editor. Fix only the listed issues and nothing else."


def _build_fix_prompt(text: str, issues: list) -> str:
    issue_text = "\n".join(f"- {item}" for item in issues)
    return f"""Fix only these issues:
{issue_text}

Rules:
- Do NOT use contractions.
- Do NOT change paragraph structure.
- Do NOT add or remove ideas.
- Return only the fixed text.

Text:
{text}"""


# ---------------------------------------------------------------------
# Non-LLM Stealth Helpers
# ---------------------------------------------------------------------

# Acceptable dictionary replacements (common words only)
_DICT_BLACKLIST = {
    "bodoni", "soh", "thence", "wherefore", "hitherto", "thereof",
    "mercantile", "pursuance", "pecuniary", "remunerative", "lucrative",
    "ain", "tis", "twas", "nay", "aye", "hath", "doth", "thee", "thou",
    "thy", "thine", "whence", "whilst", "atm", "homophile", "dodo",
    "grizzle", "braw", "facelift", "gloriole", "upwind", "ardor",
    "fogey", "carrefour", "gild", "cosmos", "aerofoil", "appall",
    "bionomical", "planer", "rick", "permeant", "enounce", "audacious",
    "stuff", "issue", "issues", "thing", "things",
}


def _syllable_count(word: str) -> int:
    word = word.lower().rstrip("es").rstrip("ed")
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    return max(1, count)


def _is_acceptable_word(word: str) -> bool:
    low = word.lower()
    if low in _DICT_BLACKLIST:
        return False
    if len(low) > 12 or len(low) < 3:
        return False
    if _syllable_count(low) > 3:
        return False
    if not low.isalpha():
        return False
    return True


def _safe_downcase_first(s: str) -> str:
    if not s:
        return s
    first_word = s.split()[0] if s.split() else ""
    if first_word.isupper() and len(first_word) > 1:
        return s
    return s[0].lower() + s[1:]


# --- Detection scoring ---

def _get_avg_score(text: str) -> float:
    if not HAS_STEALTH_DETECTOR or _stealth_detector is None or not text.strip():
        return 0.0
    try:
        result = _stealth_detector.analyze(text)
        ai_score = 100.0 - result.get('summary', {}).get('overall_human_score', 50.0)
        return ai_score
    except Exception:
        return 0.0


def _get_per_detector_scores(text: str) -> dict:
    if not HAS_STEALTH_DETECTOR or _stealth_detector is None:
        return {}
    try:
        result = _stealth_detector.analyze(text)
        scores = {}
        for d in result.get('detectors', []):
            name = d.get('detector', 'unknown').lower().replace(' ', '_')
            scores[name] = round(100.0 - d.get('human_score', 50.0), 1)
        scores['overall'] = round(
            100.0 - result.get('summary', {}).get('overall_human_score', 50.0), 1)
        return scores
    except Exception:
        return {}


# =====================================================================
# PHASE 5 — AI Pattern Elimination
# =====================================================================
# Aggressive removal of AI marker words, AI phrases, AI sentence starters

# Extended AI marker words to eliminate or replace
_AI_MARKERS_REPLACE = {
    "utilize": "use", "utilise": "use", "leverage": "use",
    "facilitate": "support", "comprehensive": "broad", "multifaceted": "complex",
    "paramount": "central", "furthermore": "also", "moreover": "also",
    "additionally": "also", "consequently": "so", "subsequently": "then",
    "nevertheless": "still", "notwithstanding": "despite",
    "aforementioned": "previous", "paradigm": "model",
    "methodology": "method", "framework": "approach",
    "trajectory": "path", "discourse": "discussion",
    "dichotomy": "divide", "conundrum": "problem",
    "ramification": "effect", "underpinning": "basis",
    "synergy": "cooperation", "robust": "strong",
    "nuanced": "detailed", "salient": "notable",
    "ubiquitous": "widespread", "pivotal": "key",
    "intricate": "complex", "meticulous": "careful",
    "profound": "deep", "inherent": "built-in",
    "overarching": "main", "substantive": "real",
    "efficacious": "effective", "holistic": "whole",
    "transformative": "major", "innovative": "new",
    "groundbreaking": "important", "noteworthy": "notable",
    "proliferate": "spread", "exacerbate": "worsen",
    "ameliorate": "improve", "engender": "produce",
    "delineate": "describe", "elucidate": "explain",
    "illuminate": "clarify", "necessitate": "require",
    "perpetuate": "continue", "underscore": "highlight",
    "exemplify": "show", "encompass": "include",
    "bolster": "support", "catalyze": "drive",
    "streamline": "simplify", "optimize": "improve",
    "mitigate": "reduce", "navigate": "handle",
    "prioritize": "focus on", "articulate": "express",
    "substantiate": "support", "corroborate": "confirm",
    "disseminate": "spread", "cultivate": "develop",
    "ascertain": "determine", "endeavor": "attempt",
    "delve": "look", "embark": "start", "foster": "encourage",
    "harness": "use", "spearhead": "lead", "unravel": "untangle",
    "unveil": "reveal", "notably": "in particular",
    "crucially": "importantly", "significantly": "greatly",
    "essentially": "basically", "fundamentally": "at its core",
    "arguably": "perhaps", "undeniably": "clearly",
    "undoubtedly": "certainly", "interestingly": "surprisingly",
    "remarkably": "unusually", "evidently": "clearly",
    "tapestry": "mix", "cornerstone": "foundation",
    "bedrock": "basis", "linchpin": "key element",
    "catalyst": "driver", "nexus": "connection",
    "spectrum": "range", "myriad": "many",
    "plethora": "abundance", "multitude": "many",
    "landscape": "field", "realm": "area",
    "culminate": "end", "enhance": "improve",
}

# AI phrases to eliminate (regex patterns → simpler replacements)
_AI_PHRASE_KILLS = [
    (re.compile(r"it is (?:important|crucial|essential|vital|imperative) (?:to note )?that\s*", re.I), ""),
    (re.compile(r"it (?:should|must|can|cannot) be (?:noted|argued|said|emphasized|stressed|acknowledged) that\s*", re.I), ""),
    (re.compile(r"in (?:order )?to\b", re.I), "to"),
    (re.compile(r"in today'?s (?:world|society|landscape|era)\b", re.I), "today"),
    (re.compile(r"in the modern (?:era|age|world)\b", re.I), "today"),
    (re.compile(r"plays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central) role\b", re.I), "matters"),
    (re.compile(r"a (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b", re.I), "many"),
    (re.compile(r"a (?:plethora|myriad|multitude|wealth|abundance) of\b", re.I), "many"),
    (re.compile(r"(?:due to|owing to) the fact that\b", re.I), "because"),
    (re.compile(r"as a (?:result|consequence)\b", re.I), "so"),
    (re.compile(r"(?:with (?:respect|regard) to)\b", re.I), "about"),
    (re.compile(r"first and foremost\b", re.I), "first"),
    (re.compile(r"each and every\b", re.I), "every"),
    (re.compile(r"needless to say\b", re.I), "clearly"),
    (re.compile(r"there is no doubt that\b", re.I), "clearly"),
    (re.compile(r"at the end of the day\b", re.I), "ultimately"),
    (re.compile(r"on the other hand\b", re.I), "but"),
    (re.compile(r"this (?:paper|essay|study|analysis) (?:discusses|examines|explores|investigates|delves into|aims to)\b", re.I), "this work considers"),
    (re.compile(r"serves? as a (?:testament|reminder|catalyst|cornerstone|foundation)\b", re.I), "shows"),
    (re.compile(r"the (?:importance|significance|impact) of\b", re.I), "how"),
    (re.compile(r"(?:moving|going|looking) forward\b", re.I), "next"),
    (re.compile(r"not only (.{5,40}?) but also\b", re.I), r"\1 and also"),
    (re.compile(r"it (?:remains|is) (?:unclear|debatable|yet to be seen)\b", re.I), "the question remains"),
    (re.compile(r"(?:taken together|all things considered|on the whole)\b", re.I), "overall"),
    (re.compile(r"(?:that being said|having said that|with that in mind)\b", re.I), "still"),
    (re.compile(r"(?:in light of|in view of) (?:the above|this|these)\b", re.I), "given this"),
]


def _phase5_ai_pattern_elimination(text: str, intensity: float = 1.5) -> str:
    """Aggressively remove or replace AI marker words and phrases."""
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # Kill AI phrases first (before word-level, since phrases are multi-word)
        for pattern, replacement in _AI_PHRASE_KILLS:
            para = pattern.sub(replacement, para)

        # Replace AI marker words
        words = para.split()
        new_words = []
        for w in words:
            stripped = w.strip(".,;:!?\"'()-[]{}")
            lower = stripped.lower()
            if lower in _AI_MARKERS_REPLACE and random.random() < min(0.85 * intensity, 0.95):
                replacement = _AI_MARKERS_REPLACE[lower]
                # Preserve casing
                if stripped[0].isupper() and replacement[0].islower():
                    replacement = replacement[0].upper() + replacement[1:]
                # Preserve punctuation
                prefix = w[:len(w) - len(w.lstrip(".,;:!?\"'()-[]{}"))] if w != w.lstrip(".,;:!?\"'()-[]{}") else ""
                suffix = w[len(w.rstrip(".,;:!?\"'()-[]{}")):]  if w != w.rstrip(".,;:!?\"'()-[]{}") else ""
                new_words.append(prefix + replacement + suffix)
            else:
                new_words.append(w)

        para = " ".join(new_words)

        # Replace AI sentence starters
        sentences = sent_tokenize(para)
        new_sentences = []
        for sent in sentences:
            sent = utils.replace_ai_starters(sent)
            new_sentences.append(sent)

        processed_paras.append(" ".join(new_sentences))

    return "\n\n".join(processed_paras)


# =====================================================================
# PHASE 6 — Deep Structural Transform
# =====================================================================
# Voice shifts, clause reordering, sentence restructuring

# Natural connector replacements for stiff AI connectors
_CONNECTOR_SWAPS = {
    "Furthermore, ": ["Plus, ", "On top of that, ", "And beyond that, "],
    "Moreover, ": ["Besides, ", "Adding to this, ", "On a related note, "],
    "Additionally, ": ["Also, ", "On top of this, ", "Then there is "],
    "Consequently, ": ["So, ", "As a result, ", "The outcome? "],
    "Nevertheless, ": ["Still, ", "Even so, ", "But then again, "],
    "Nonetheless, ": ["Even still, ", "Yet, ", "All the same, "],
    "In contrast, ": ["But, ", "On the flip side, ", "Then again, "],
    "Subsequently, ": ["After that, ", "Then, ", "From there, "],
    "In conclusion, ": ["All things considered, ", "When it comes down to it, "],
    "Ultimately, ": ["In the end, ", "When it comes down to it, "],
    "Therefore, ": ["So, ", "For this reason, ", "Hence, "],
    "Accordingly, ": ["In response, ", "As a result, "],
}


def _phase6_deep_structural_transform(text: str, intensity: float = 1.5) -> str:
    """Deep restructuring: voice shifts, clause reorder, connector swap."""
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sentences = sent_tokenize(para)
        transformed = []

        for i, sent in enumerate(sentences):
            sent = sent.strip()
            if not sent:
                continue

            # Connector replacement
            for formal, replacements in _CONNECTOR_SWAPS.items():
                if sent.startswith(formal):
                    sent = random.choice(replacements) + sent[len(formal):]
                    break

            # Deep restructuring (clause reorder, fronting)
            if HAS_ADVANCED and len(sent.split()) > 8:
                if random.random() < min(0.40 * intensity, 0.80):
                    sent = deep_restructure(sent, intensity)

            # Voice shift (active ↔ passive)
            if HAS_ADVANCED and 10 <= len(sent.split()) <= 25:
                voice_prob = min(0.12 * intensity, 0.45)
                sent = voice_shift(sent, probability=voice_prob)

            # Clause reordering via utils
            sent = utils.restructure_sentence(sent, intensity)

            # Connector variation
            sent = utils.vary_connectors(sent)

            transformed.append(sent)

        # Vary repetitive sentence starts
        result = []
        _OPENER_VARIANTS = [
            "On that note, ", "Tied to this, ", "Related to this, ",
            "Meanwhile, ", "At the same time, ", "Then again, ",
            "Put differently, ", "In other words, ", "Equally worth noting, ",
        ]
        result.append(transformed[0] if transformed else "")
        for i in range(1, len(transformed)):
            prev_start = result[-1].split()[0].lower() if result[-1].split() else ""
            curr_start = transformed[i].split()[0].lower() if transformed[i].split() else ""
            if prev_start and curr_start == prev_start and len(transformed[i].split()) > 5:
                opener = random.choice(_OPENER_VARIANTS)
                result.append(opener + _safe_downcase_first(transformed[i]))
            else:
                result.append(transformed[i])

        processed_paras.append(" ".join(result))

    return "\n\n".join(processed_paras)


# =====================================================================
# PHASE 7 — Synonym & Vocabulary Obfuscation
# =====================================================================
# POS-aware synonym replacement + dictionary-powered fallback

def _dict_synonym_replace(sent: str, intensity: float, used: set) -> str:
    """Dictionary-powered synonym replacement."""
    if not HAS_DICTIONARY or _dict is None:
        return sent
    replace_prob = min(0.08 * intensity, 0.40)
    words = sent.split()
    new_words = []
    for i, w in enumerate(words):
        stripped = w.strip(".,!?;:\"'()-[]{}")
        lower = stripped.lower()
        if (len(stripped) <= 3 or lower in rules.PROTECTED_WORDS
                or random.random() > replace_prob):
            new_words.append(w)
            continue
        try:
            replacement = _dict.replace_word_smartly(lower, sent, avoid_words=used)
        except Exception:
            replacement = lower
        if (replacement and replacement != lower
                and replacement.lower() not in _DICT_BLACKLIST
                and len(replacement) < 20 and ' ' not in replacement
                and _is_acceptable_word(replacement)):
            if _dict.is_valid_word(replacement):
                if stripped[0].isupper():
                    replacement = replacement[0].upper() + replacement[1:]
                prefix = w[:len(w) - len(w.lstrip(".,!?;:\"'()-[]{}"))] if w != w.lstrip(".,!?;:\"'()-[]{}") else ""
                suffix = w[len(w.rstrip(".,!?;:\"'()-[]{}")):]  if w != w.rstrip(".,!?;:\"'()-[]{}") else ""
                new_words.append(prefix + replacement + suffix)
                used.add(lower)
                used.add(replacement.lower())
            else:
                new_words.append(w)
        else:
            new_words.append(w)
    return " ".join(new_words)


def _phase7_synonym_obfuscation(text: str, intensity: float = 1.5) -> str:
    """Conservative synonym replacement — curated SYNONYM_BANK only.
    Intensity is capped at 0.6 to prevent garbled output.
    Dictionary-powered replacement is deliberately excluded."""
    capped = min(intensity, 0.6)  # prevent aggressive over-replacement
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sentences = sent_tokenize(para)
        used_words = set()
        ctx = None
        if HAS_CONTEXT:
            try:
                ctx = analyze_context(para)
            except Exception:
                pass

        transformed = []
        for sent in sentences:
            # POS-aware synonym replacement (curated SYNONYM_BANK only)
            sent = utils.synonym_replace(
                sent, capped, used_words,
                protected_extra=ctx.protected_terms if ctx else None
            )
            # Phrase-level substitutions (safe — uses curated map)
            sent = utils.phrase_substitute(sent, capped)
            transformed.append(sent)

        processed_paras.append(" ".join(transformed))

    return "\n\n".join(processed_paras)


# =====================================================================
# PHASE 8 — Human Texture Injection
# =====================================================================
# Burstiness, hedges, rhythm variation, natural imperfections

_HUMAN_STARTERS = [
    "And ", "But ", "Yet ", "Still, ", "Now, ", "Sure, ",
    "Of course, ", "Then again, ", "True, ", "Granted, ",
    "To be fair, ", "In practice, ", "Not surprisingly, ",
    "Put simply, ", "It helps to remember that ",
    "Part of the issue is that ", "In many ways, ",
]

_HUMAN_HEDGES = [
    " -- at least in theory --",
    " -- and this matters --",
    " -- or so it seems --",
    " -- to a point --",
    " (arguably)",
    " (at least partly)",
    " (to some degree)",
    " (in most cases)",
    ", to some extent,",
    ", it seems,",
    ", in practice,",
    ", admittedly,",
]

_PUNCHY_INSERTS = [
    "That matters.",
    "This is not trivial.",
    "The stakes are real.",
    "And it shows.",
    "That distinction matters.",
    "Few would dispute this.",
    "That alone says a lot.",
    "The shift is noticeable.",
]


def _phase8_human_texture(text: str, intensity: float = 1.5) -> str:
    """Inject human-like imperfections: varied rhythm, hedges, casual starters."""
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        sentences = sent_tokenize(para)
        if len(sentences) < 3:
            processed_paras.append(para)
            continue

        # --- Rhythm variation: break uniform sentence lengths ---
        lengths = [len(s.split()) for s in sentences]
        avg_len = sum(lengths) / len(lengths) if lengths else 15
        variance = sum((l - avg_len) ** 2 for l in lengths) / len(lengths) if lengths else 100

        if variance < 25:  # Too uniform — force variation
            new_sents = []
            for i, s in enumerate(sentences):
                words = s.split()
                if len(words) > 20 and random.random() < 0.30:
                    mid = len(words) // 2
                    for offset in range(min(5, mid)):
                        for pos in [mid + offset, mid - offset]:
                            if 0 < pos < len(words) and words[pos - 1].endswith(','):
                                if words[pos].lower() not in ("which", "who", "that", "where", "when"):
                                    part1 = " ".join(words[:pos])
                                    part2 = " ".join(words[pos:])
                                    part2 = part2[0].upper() + part2[1:] if part2 else part2
                                    new_sents.append(part1.rstrip('.'))
                                    new_sents.append(part2)
                                    break
                        else:
                            continue
                        break
                    else:
                        new_sents.append(s)
                else:
                    new_sents.append(s)
            sentences = new_sents

        # --- Inject casual human starters (max 2) ---
        prob_start = min(0.15 * intensity, 0.40)
        starter_count = 0
        used_starters = set()
        result = [sentences[0]]
        for i in range(1, len(sentences)):
            s = sentences[i]
            if (random.random() < prob_start and len(s.split()) > 6
                    and starter_count < 2):
                available = [st for st in _HUMAN_STARTERS if st not in used_starters]
                if available:
                    starter = random.choice(available)
                    used_starters.add(starter)
                    s = starter + _safe_downcase_first(s)
                    starter_count += 1
            result.append(s)
        sentences = result

        # --- Inject hedging/asides (max 1) ---
        prob_hedge = min(0.10 * intensity, 0.05)  # minimal hedging
        hedge_done = False
        result2 = []
        for s in sentences:
            words = s.split()
            if (not hedge_done and random.random() < prob_hedge and len(words) > 12):
                comma_positions = [j for j, w in enumerate(words)
                                  if w.endswith(',') and 4 < j < len(words) - 4]
                if comma_positions:
                    pos = random.choice(comma_positions)
                    hedge = random.choice(_HUMAN_HEDGES)
                    words.insert(pos + 1, hedge.strip())
                    s = " ".join(words)
                    hedge_done = True
            result2.append(s)
        sentences = result2

        # --- Insert punchy sentences (max 1) ---
        result3 = []
        punchy_done = False
        for i, s in enumerate(sentences):
            result3.append(s)
            if (not punchy_done and len(s.split()) > 18
                    and random.random() < 0.20
                    and i < len(sentences) - 1):
                result3.append(random.choice(_PUNCHY_INSERTS))
                punchy_done = True
        sentences = result3

        processed_paras.append(" ".join(sentences))

    return "\n\n".join(processed_paras)


# =====================================================================
# CLEANUP — final polish
# =====================================================================

_DOUBLE_SPACE = re.compile(r"  +")
_DOUBLE_PERIOD = re.compile(r"\.{2,}")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([.,;:!?])")


def _cleanup_text(text: str) -> str:
    """Fix artifacts from chained transformations."""
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paras = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        para = _DOUBLE_SPACE.sub(" ", para)
        para = _DOUBLE_PERIOD.sub(".", para)
        para = _SPACE_BEFORE_PUNCT.sub(r"\1", para)
        para = re.sub(r',{2,}', ',', para)
        para = re.sub(r';{2,}', ';', para)
        para = re.sub(r'—{2,}', '—', para)
        para = re.sub(r'\(\s*\)', '', para)
        para = re.sub(r'[^\S\n]+', ' ', para)
        para = re.sub(r'\band\b[,;]?\s+\band\b', 'and', para, flags=re.IGNORECASE)
        para = re.sub(r'\bbut\b[,;]?\s+\bbut\b', 'but', para, flags=re.IGNORECASE)
        # Fix a/an agreement
        para = re.sub(r'\ba ([aeiouAEIOU])', r'an \1', para)
        para = re.sub(r'\bA ([aeiouAEIOU])', r'An \1', para)
        para = re.sub(r'\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])', r'a \1', para)
        # Capitalize sentence starts
        sentences = sent_tokenize(para)
        cleaned = []
        for s in sentences:
            s = s.strip()
            if s:
                s = s[0].upper() + s[1:]
                cleaned.append(s)
        processed_paras.append(" ".join(cleaned))
    return "\n\n".join(processed_paras)


# =====================================================================
# FULL NON-LLM STEALTH PASS (Phases 5-8)
# =====================================================================

def _run_stealth_phases(text: str, intensity: float, no_contractions: bool = True,
                        iteration: int = 0,
                        enable_post_processing: bool = True) -> str:
    """Run non-LLM stealth phases once.
    iteration 0: full intensity synonym replacement.
    iteration 1+: reduced synonym intensity (0.3) to avoid corruption."""
    # Phase 5: AI Pattern Elimination
    text = _phase5_ai_pattern_elimination(text, intensity)

    # Phase 6: Deep Structural Transform
    text = _phase6_deep_structural_transform(text, intensity)

    # Phase 7: Synonym & Vocabulary Obfuscation
    # Full intensity on first pass, gentle on repeats (curated bank only)
    syn_intensity = intensity if iteration == 0 else 0.3
    text = _phase7_synonym_obfuscation(text, syn_intensity)

    # Phase 8: Human Texture Injection
    text = _phase8_human_texture(text, intensity)

    # Cleanup
    text = _cleanup_text(text)

    # Expand contractions if needed
    if no_contractions:
        text = _expand_contractions(text)
    if HAS_ADVANCED:
        text = expand_contractions(text)

    # Post-process (deduplicate phrases, fix repetitions, etc.)
    if enable_post_processing:
        text = _post_process(text)

    return text


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------

_MAX_STEALTH_ITERATIONS = 6
_TARGET_AI_SCORE = 5.0  # ALL individual detector scores must be below this

def llm_humanize(
    text: str,
    strength: str = "medium",
    preserve_sentences: bool = True,
    strict_meaning: bool = True,
    tone: str = "neutral",
    no_contractions: bool = True,
    enable_post_processing: bool = True,
) -> str:
    """Run the Ninja multi-pass LLM + non-LLM stealth pipeline.

    PHASE A: 4 LLM passes (OpenAI)
    PHASE B: 4 non-LLM stealth phases (repeated)
    PHASE C: Detection loop — iterate Phase B until avg AI score < 10%
    """
    if not text or not text.strip():
        return text

    start = time.time()
    metrics = {"llm_passes": 0, "stealth_iterations": 0, "fixes": 0}

    original_text = text.strip()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", original_text) if p.strip()]
    cleaned = "\n\n".join(paragraphs)

    # ── PHASE A: LLM Pipeline (4 passes) ───────────────────────────
    style_memory = get_style_memory()
    target_profile = style_memory.select_for_tone(tone)

    current_stats = analyze_text(cleaned)
    gap = compute_gap(current_stats, target_profile)
    gap_instructions = gap_to_instructions(gap)

    print(f"  [Ninja] Style profile: {target_profile.name}")

    # Pass 1: Core Draft
    result = _llm_call(_CORE_DRAFT_SYSTEM, _CORE_DRAFT_USER.format(text=cleaned), temperature=0.3)
    metrics["llm_passes"] += 1
    print("  [Ninja] Pass 1 complete (core draft)")

    # Pass 2: Precision Humanizer
    precision_prompt = _build_precision_prompt(
        result, target_profile, gap_instructions,
        strength, strict_meaning, preserve_sentences,
    )
    result = _llm_call(_PRECISION_SYSTEM, precision_prompt, temperature=0.45)
    metrics["llm_passes"] += 1
    print("  [Ninja] Pass 2 complete (precision humanizer)")

    # Pass 3: Natural Variation
    result = _llm_call(_PASS3_SYSTEM, _PASS3_USER.format(text=result), temperature=0.4)
    metrics["llm_passes"] += 1
    print("  [Ninja] Pass 3 complete (natural variation)")

    # Pass 4: Academic Consistency
    result = _llm_call(_PASS4_SYSTEM, _PASS4_USER.format(text=result), temperature=0.25)
    metrics["llm_passes"] += 1
    print("  [Ninja] Pass 4 complete (academic consistency)")

    # Execute deterministic post-processing phases
    result = execute_ninja_non_llm_phases(result)
    print("  [Ninja] Non-LLM aggressive processing completed")

    # Contractions & paragraph preservation
    if no_contractions:
        result = _expand_contractions(result)
    result = _preserve_paragraph_structure(original_text, result)

    # LLM validation + fix
    validation = validate_all(original_text, result)
    print(f"  [Ninja] LLM validation: {'PASSED' if validation['all_passed'] else 'ISSUES FOUND'}")

    if not validation["all_passed"] and metrics["fixes"] < 2:
        checks = validation["checks"]
        fix_issues = []
        if no_contractions and not checks["contractions"]["passed"]:
            fix_issues.append(f"Expand contractions: {checks['contractions']['contractions_found']}")
        if not checks["structure"]["passed"]:
            fix_issues.append(
                f"Restore sentence count near {checks['structure']['original_sentences']} "
                f"(currently {checks['structure']['result_sentences']})."
            )
        if not checks["length"]["passed"]:
            fix_issues.append(
                f"Adjust word count near {checks['length']['original_words']} "
                f"(currently {checks['length']['result_words']})."
            )
        if not checks["lists"]["passed"]:
            fix_issues.append("Remove introduced list formatting and keep prose.")
        if not checks["meaning"]["passed"]:
            missing = checks["meaning"].get("missing_keywords", [])
            if missing:
                fix_issues.append("Reintroduce missing key terms: " + ", ".join(missing[:8]))
        if fix_issues:
            fix_prompt = _build_fix_prompt(result, fix_issues)
            result = _llm_call(_FIX_SYSTEM, fix_prompt, temperature=0.2)
            if no_contractions:
                result = _expand_contractions(result)
            metrics["llm_passes"] += 1
            metrics["fixes"] += 1
            print(f"  [Ninja] LLM auto-fix applied ({len(fix_issues)} issues)")

    print(f"  [Ninja] LLM phase complete ({metrics['llm_passes']} passes)")

    # ── PHASE B+C: Non-LLM Stealth Processing + Detection Loop ──────
    # Map strength to non-LLM intensity (start low, escalate per iteration)
    intensity_map = {"light": 1.0, "medium": 1.5, "strong": 2.0}
    base_intensity = intensity_map.get(strength, 1.5)
    intensity_cap = {"light": 2.5, "medium": 3.5, "strong": 4.5}.get(strength, 3.5)

    best_result = result
    best_score = 100.0  # worst individual detector score

    def _all_below_target(scores: dict) -> bool:
        """Check if ALL individual detector scores are below _TARGET_AI_SCORE."""
        if not scores:
            return False
        return all(s < _TARGET_AI_SCORE for k, s in scores.items() if k != 'overall')

    def _worst_score(scores: dict) -> float:
        """Get the worst (highest) individual detector score."""
        if not scores:
            return 100.0
        non_overall = [s for k, s in scores.items() if k != 'overall']
        return max(non_overall) if non_overall else 100.0

    # Check initial score after LLM passes
    initial_per_detector = _get_per_detector_scores(result)
    initial_worst = _worst_score(initial_per_detector)
    print(f"  [Ninja] Post-LLM worst detector: {initial_worst:.1f}% (target: all <{_TARGET_AI_SCORE}%)")

    if _all_below_target(initial_per_detector):
        best_result = result
        best_score = initial_worst
        print(f"  [Ninja] Already below {_TARGET_AI_SCORE}% — skipping stealth phases")
    else:
        for iteration in range(_MAX_STEALTH_ITERATIONS):
            # Escalate intensity each iteration
            intensity = min(base_intensity + (iteration * 0.3), intensity_cap)

            source = best_result
            stealth_result = _run_stealth_phases(source, intensity, no_contractions,
                                                  iteration=iteration,
                                                  enable_post_processing=enable_post_processing)

            metrics["stealth_iterations"] += 1

            # Score the result — check ALL individual detectors
            per_detector = _get_per_detector_scores(stealth_result)
            worst = _worst_score(per_detector)

            print(
                f"  [Ninja] Stealth iteration {iteration + 1}: "
                f"worst={worst:.1f}% "
                f"(scores: {per_detector})"
            )

            # Keep best result (lowest worst-detector score)
            if worst < best_score:
                best_result = stealth_result
                best_score = worst

            # Exit if ALL detectors below target
            if _all_below_target(per_detector):
                print(f"  [Ninja] Target reached: all detectors < {_TARGET_AI_SCORE}%")
                break
        else:
            print(
                f"  [Ninja] Max iterations reached. Best worst-detector: {best_score:.1f}% "
                f"(target was all <{_TARGET_AI_SCORE}%)"
            )

    # ── Final stats ──────────────────────────────────────────────────
    output_stats = analyze_text(best_result)
    elapsed = time.time() - start
    final_scores = _get_per_detector_scores(best_result)
    print(
        f"  [Ninja] Output stats: "
        f"sents={output_stats['sentence_count']}, "
        f"words={output_stats['word_count']}, "
        f"avg_sl={output_stats['avg_sentence_length']}, "
        f"hedge={output_stats['hedging_rate']:.2f}, "
        f"ttr={output_stats['lexical_diversity']:.2f}"
    )
    print(
        f"  [Ninja] Final scores: {final_scores}"
    )
    print(
        f"  [Ninja] Complete: {metrics['llm_passes']} LLM passes, "
        f"{metrics['stealth_iterations']} stealth iterations, "
        f"{metrics['fixes']} fixes, {elapsed:.1f}s"
    )

    return best_result.strip()
