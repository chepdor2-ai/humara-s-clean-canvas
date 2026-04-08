#!/usr/bin/env python3
"""
Oxygen Model Server v2 — Multi-phase T5 humanizer with quality enforcement.

Architecture:
  Phase 1: T5 beam-search paraphrase (sentence-by-sentence, greedy/beam only)
  Phase 2: Word-level diversity injection (synonym swap, filler removal)
  Phase 3: Structural variance (sentence reordering, clause fronting)
  Phase 4: Quality gate — enforce min change ratio per sentence with retry loop

Key findings from model testing:
  - Greedy (no prefix): produces coherent paraphrases, ~64% word change
  - Beam=4 (no prefix): higher change (~86%) and coherent
  - Sampling at ANY temperature: produces garbage/hallucinated text
  - "paraphrase:" prefix: echoes input unchanged
  - Best config: beam=4, no_repeat_ngram_size=3, length_penalty=1.0
  
  => NEVER use sampling (do_sample=True) with this model.
  => ALWAYS use greedy or beam search.
"""
import logging
import os
import re
import random
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, T5ForConditionalGeneration

# Import validation module
from validation_post_process import validate_and_repair_output

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Model ──
MODEL_DIR = "oxygen-model"
device = "cuda" if torch.cuda.is_available() else "cpu"
model: T5ForConditionalGeneration | None = None
tokenizer: AutoTokenizer | None = None


def load_model():
    global model, tokenizer
    if not os.path.exists(MODEL_DIR):
        raise FileNotFoundError(f"Model directory not found: {MODEL_DIR}")
    logger.info(f"Loading model from {MODEL_DIR} ...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
    model = T5ForConditionalGeneration.from_pretrained(
        MODEL_DIR, local_files_only=True, torch_dtype=torch.float32,
    ).to(device)
    model.eval()
    n = sum(p.numel() for p in model.parameters())
    logger.info(f"Model loaded ({n:,} params) on {device}")


# ── FastAPI ──
app = FastAPI(title="Oxygen T5 Humanizer v2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response ──
class HumanizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    strength: str = Field(default="medium")
    mode: str = Field(default="quality")  # quality | fast | aggressive
    min_change_ratio: float = Field(default=0.40, ge=0.1, le=0.9)
    max_retries: int = Field(default=5, ge=1, le=15)
    sentence_by_sentence: bool = Field(default=True)


class HumanizeResponse(BaseModel):
    humanized: str
    success: bool = True
    params_used: dict[str, Any] = Field(default_factory=dict)
    stats: dict[str, Any] = Field(default_factory=dict)


# ── Phase 2: Word-level diversity (Python-side post-processing) ──

# AI marker words that detectors flag — replace with human alternatives
AI_WORD_KILLS: list[tuple[str, str]] = [
    # Multi-word phrases first (order matters — longer before shorter)
    (r"\bit is important to note that\b", "worth noting,"),
    (r"\bit is worth noting that\b", "notably,"),
    (r"\bin today'?s rapidly evolving\b", "in the current"),
    (r"\bin the realm of\b", "in"),
    (r"\bin the context of\b", "regarding"),
    (r"\bplays a (?:crucial|vital|pivotal) role\b", "matters greatly"),
    (r"\bserves as a\b", "acts as a"),
    (r"\bit should be noted that\b", "note that"),
    (r"\bthis suggests that\b", "this means"),
    (r"\bthe fact that\b", "that"),
    (r"\bin order to\b", "to"),
    (r"\ba wide range of\b", "many"),
    (r"\ba growing body of\b", "increasing"),
    (r"\bas a result of\b", "because of"),
    (r"\bin light of\b", "given"),
    (r"\bwith respect to\b", "about"),
    (r"\bon the other hand\b", "yet"),
    (r"\bin addition to\b", "besides"),
    (r"\bin terms of\b", "regarding"),
    (r"\bdue to the fact that\b", "because"),
    (r"\bfor the purpose of\b", "to"),
    # Single-word replacements
    (r"\butilize[sd]?\b", "use"),
    (r"\butilizing\b", "using"),
    (r"\bleverage[sd]?\b", "use"),
    (r"\bleveraging\b", "using"),
    (r"\bfacilitate[sd]?\b", "help"),
    (r"\bfacilitating\b", "helping"),
    (r"\bmoreover\b", "also"),
    (r"\bfurthermore\b", "also"),
    (r"\bnevertheless\b", "still"),
    (r"\bnonetheless\b", "still"),
    (r"\bconsequently\b", "so"),
    (r"\bsubsequently\b", "then"),
    (r"\badditionally\b", "also"),
    (r"\bpivotal\b", "key"),
    (r"\bcrucial\b", "important"),
    (r"\bunderscores?\b", "highlights"),
    (r"\bunderscoring\b", "highlighting"),
    (r"\bdelve[sd]?\b", "explore"),
    (r"\bdelving\b", "exploring"),
    (r"\bcommence[sd]?\b", "start"),
    (r"\bcommencing\b", "starting"),
    (r"\bdemonstrate[sd]?\b", "show"),
    (r"\bdemonstrating\b", "showing"),
    (r"\benchance[sd]?\b", "improve"),
    (r"\benchancing\b", "improving"),
    (r"\benhancement\b", "improvement"),
    (r"\bimplementation\b", "use"),
    (r"\btransformative\b", "major"),
    (r"\bholistic\b", "complete"),
    (r"\bparadigm\b", "model"),
    (r"\bsynergy\b", "cooperation"),
    (r"\brobust\b", "strong"),
    (r"\bseamless(?:ly)?\b", "smooth"),
    (r"\binnovative\b", "new"),
    (r"\bcutting-edge\b", "modern"),
    (r"\bgroundbreaking\b", "new"),
    (r"\bcomprehensive\b", "thorough"),
    (r"\bmultifaceted\b", "complex"),
    (r"\bintricate\b", "complex"),
    (r"\bplethora\b", "many"),
    (r"\bmyriad\b", "many"),
    (r"\bundeniably\b", "clearly"),
    (r"\bindeed\b", "in fact"),
    (r"\bexemplif(?:y|ies|ied)\b", "show"),
    (r"\bexemplifying\b", "showing"),
    (r"\bmeticulous(?:ly)?\b", "careful"),
    (r"\bprofound(?:ly)?\b", "deep"),
    (r"\bencompass(?:es|ed|ing)?\b", "include"),
    (r"\boverarch(?:ing)?\b", "broad"),
    (r"\bdramatically\b", "greatly"),
    (r"\bnotably\b", "especially"),
    (r"\bremarkab(?:le|ly)\b", "striking"),
    (r"\bexponential(?:ly)?\b", "rapid"),
    (r"\blandscape\b", "scene"),
    (r"\becosystem\b", "network"),
    (r"\bframework\b", "structure"),
    (r"\btrajectory\b", "path"),
    (r"\bparadigm shift\b", "major change"),
]

# Sentence starters that AI detectors look for (uniform pattern)
AI_STARTERS = [
    r"^(In conclusion,?)\s",
    r"^(Overall,?)\s",
    r"^(To summarize,?)\s",
    r"^(In summary,?)\s",
    r"^(As (?:we|one) can see,?)\s",
    r"^(It is (?:clear|evident|apparent) that)\s",
    r"^(This (?:essay|paper|analysis) (?:has|will))\s",
]

HUMAN_STARTERS = [
    "Looking at this,", "From what we see,", "Putting it together,",
    "The picture here is that", "Taking stock,", "All things considered,",
    "Stepping back,", "At the end of the day,", "When we add it all up,",
]

# Filler phrases humans rarely use at the density AI does
FILLER_CUTS = [
    (r"\s*,\s*however\s*,\s*", " but "),
    (r"\s*,\s*therefore\s*,\s*", ", so "),
    (r"\s*,\s*thus\s*,\s*", ", so "),
    (r"\bdespite the fact that\b", "even though"),
    (r"\bregardless of the fact that\b", "even though"),
    (r"\bthe notion that\b", "the idea that"),
    (r"\bthe concept of\b", "the idea of"),
]


def apply_ai_word_kill(text: str) -> str:
    """Phase 2a: Kill AI-marker vocabulary."""
    for pattern, replacement in AI_WORD_KILLS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def apply_filler_cuts(text: str) -> str:
    """Phase 2b: Remove verbose filler phrases."""
    for pattern, replacement in FILLER_CUTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


# ── Phase 2d: Deep synonym replacement (fallback for low-change sentences) ──

DEEP_SYNONYMS: list[tuple[str, list[str]]] = [
    (r"\btransformed\b", ["changed", "reshaped", "altered", "shifted"]),
    (r"\bsignificantly\b", ["greatly", "notably", "markedly", "considerably"]),
    (r"\badvancements\b", ["progress", "developments", "improvements", "strides"]),
    # "development" removed — too many academic collocations (economic development, sustainable development)
    (r"\balgorithms\b", ["methods", "processes", "techniques", "approaches"]),
    (r"\bdisciplines?\b", ["fields", "areas", "branches", "domains"]),
    (r"\bintegration\b", ["adoption", "incorporation", "blending", "merging"]),
    (r"\brequires?\b", ["needs", "calls for", "demands", "takes"]),
    (r"\bapproach\b", ["strategy", "method", "plan", "framework"]),
    (r"\bensure\b", ["guarantee", "make sure", "confirm", "verify"]),
    (r"\badoption\b", ["uptake", "acceptance", "embrace", "rollout"]),
    (r"\boutcomes?\b", ["results", "findings", "effects", "impacts"]),
    (r"\bimpact\b", ["effect", "influence"]),
    (r"\bsystems?\b", ["setups", "frameworks", "structures", "platforms"]),
    (r"\btechnolog(?:y|ies)\b", ["digital tools", "modern tools", "current tools"]),
    (r"\btechnological\b", ["digital", "modern", "current", "technical"]),
    (r"\bprovide[sd]?\b", ["offer", "give", "supply", "deliver"]),
    (r"\bproviding\b", ["offering", "giving", "supplying"]),
    (r"\bchallenges?\b", ["problems", "hurdles", "issues", "difficulties"]),
    (r"\beffective(?:ly)?\b", ["useful", "practical", "successful", "working"]),
    (r"\bsubstantial(?:ly)?\b", ["large", "major", "big", "sizable"]),
    (r"\bconsiderable\b", ["major", "large", "notable", "real"]),
    (r"\bimportant\b", ["key", "central", "significant", "vital"]),
    (r"\bessential(?:ly)?\b", ["key", "needed", "critical", "required"]),
    (r"\bvarious\b", ["several", "different", "a number of", "assorted"]),
    (r"\bnumerous\b", ["many", "several", "a lot of", "plenty of"]),
    (r"\bspecifically\b", ["in particular", "namely", "to be precise"]),
    (r"\bimprove[sd]?\b", ["better", "boost", "raise", "lift"]),
    (r"\bimproving\b", ["bettering", "boosting", "raising"]),
    (r"\bbenefits?\b", ["gains", "advantages", "perks", "upsides"]),
    (r"\bfundamental(?:ly)?\b", ["basic", "core", "central", "at heart"]),
    (r"\baddress(?:es|ed)?\b", ["tackle", "handle", "deal with", "confront"]),
    (r"\baddressing\b", ["tackling", "handling", "dealing with", "confronting"]),
    (r"\bmethods?\b", ["ways", "techniques", "means", "strategies"]),
    (r"\banalysi[sz]\b", ["study", "review", "examination", "assessment"]),
    (r"\bresearch\b", ["study", "investigation", "work", "inquiry"]),
    (r"\bconsequences?\b", ["effects", "results", "impacts", "fallout"]),
    (r"\bestablish(?:ed|es)?\b", ["set up", "create", "form", "build"]),
    (r"\bestablishing\b", ["setting up", "creating", "forming", "building"]),
    (r"\bsignificant\b", ["major", "notable", "meaningful", "real"]),
    (r"\bmodern\b", ["current", "present-day", "today's", "recent"]),
    (r"\bacross\b", ["throughout", "over", "spanning", "covering"]),
]


def deep_synonym_replace(text: str, intensity: float = 0.6) -> str:
    """Aggressive word-level synonym replacement for low-change sentences."""
    for pattern, replacements in DEEP_SYNONYMS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m and random.random() < intensity:
            matched = m.group()
            # Skip if inside parenthetical citation
            depth = text[:m.start()].count('(') - text[:m.start()].count(')')
            if depth > 0:
                continue
            # Skip if part of multi-word proper noun (capitalized + adjacent capitalized)
            if matched[0].isupper():
                before = text[:m.start()].rstrip().split()
                after = text[m.end():].lstrip().split()
                prev_cap = before and before[-1][0].isupper() if before else False
                next_cap = after and after[0][0].isupper() if after else False
                if prev_cap or next_cap:
                    continue
            chosen = random.choice(replacements)
            text = re.sub(pattern, chosen, text, count=1, flags=re.IGNORECASE)
    return text


# ── Phase 2e: Sentence restructuring (fallback) ──

def restructure_sentence(sentence: str) -> str:
    """Restructure a sentence by moving clauses around."""
    # Try "X of Y" → "Y's X" or rephrase
    m = re.match(r"^(The\s+\w+)\s+of\s+([\w\s]+?)\s+(has|have|is|are|was|were)\s+(.+)$",
                 sentence, re.IGNORECASE)
    if m and random.random() < 0.5:
        subj, obj, verb, rest = m.groups()
        subj_word = subj.split()[-1]
        return f"{obj.strip().capitalize()} {verb} seen its {subj_word.lower()} {rest}"

    # Try moving adverbial time/place phrases to front
    m = re.match(r"^(.{15,}?)\s+(in recent years|today|currently|nowadays|over time|in practice)\s*[,.]?\s*(.*)$",
                 sentence, re.IGNORECASE)
    if m and random.random() < 0.5:
        main, adv, rest = m.groups()
        combined = f"{main.rstrip('.,;')} {rest}".strip().rstrip(".")
        return f"{adv.capitalize()}, {combined[0].lower()}{combined[1:]}."

    return sentence


# ── Grammar fixes for T5 output ──

T5_GRAMMAR_FIXES: list[tuple[str, str]] = [
    # Fix broken past participles
    (r"\bhave\s+help\b", "have helped"),
    (r"\bhas\s+help\b", "has helped"),
    (r"\bhave\s+show\b", "have shown"),
    (r"\bhas\s+show\b", "has shown"),
    (r"\bhave\s+make\b", "have made"),
    (r"\bhas\s+make\b", "has made"),
    (r"\bhave\s+give\b", "have given"),
    (r"\bhas\s+give\b", "has given"),
    (r"\bhave\s+take\b", "have taken"),
    (r"\bhas\s+take\b", "has taken"),
    (r"\bhave\s+lead\b", "have led"),
    (r"\bhas\s+lead\b", "has led"),
    (r"\bhave\s+become\b", "have become"),
    (r"\bhave\s+drive\b", "have driven"),
    (r"\bhas\s+drive\b", "has driven"),
    (r"\bhave\s+rise\b", "have risen"),
    (r"\bhas\s+rise\b", "has risen"),
    (r"\bhave\s+grow\b", "have grown"),
    (r"\bhas\s+grow\b", "has grown"),
    (r"\bhave\s+begin\b", "have begun"),
    (r"\bhas\s+begin\b", "has begun"),
    (r"\bhave\s+bring\b", "have brought"),
    (r"\bhas\s+bring\b", "has brought"),
    (r"\bhave\s+run\b", "have run"),
    (r"\bhas\s+run\b", "has run"),
    (r"\bhave\s+write\b", "have written"),
    (r"\bhas\s+write\b", "has written"),
    (r"\bhave\s+speak\b", "have spoken"),
    (r"\bhas\s+speak\b", "has spoken"),
    (r"\bhave\s+choose\b", "have chosen"),
    (r"\bhas\s+choose\b", "has chosen"),
    # Fix broken noun phrases from T5
    (r"\btools\s+developments?\b", "tool development"),
    (r"\btools\s+systems?\b", "tool systems"),
    (r"\btools\s+(\w+tion)\b", r"tool \1"),  # "tools creation" → "tool creation"
    (r"\btechnologies\s+developments?\b", "technology developments"),
    (r"\brecent\s+tools\b", "recent tool"),
    # Fix missing articles after transition phrases
    (r"\b(Worth noting|Looking at this|From what we see|Taking stock|Stepping back),\s+([a-z])",
     lambda m: f"{m.group(1)}, the {m.group(2)}"),
    # Fix extra spaces around parentheses
    (r"\(\s+", "("),
    (r"\s+\)", ")"),
    # Fix hyphenation artifacts
    (r"\bmachine-learning\b", "machine learning"),
    (r"\bdeep-learning\b", "deep learning"),
    (r"\bhealth\s+care\b", "healthcare"),
    (r"\bhealth-care\b", "healthcare"),
    # Fix double subjects
    (r"\b(AI|Artificial Intelligence)\s*\(AI\s*\)", "AI"),
    (r"\bArtificial Intelligence \(Artificial Intelligence\)", "Artificial Intelligence"),
    # Fix T5 word repetition
    (r"\b(\w{4,})\s+\1\b", r"\1"),
    # Fix "a" before vowel sounds from T5
    (r"\ba ([aeiou])", r"an \1"),
    # Undo for consonant-sounding vowels (unique, union, university, European, one, once)
    (r"\ban (uni\w+|Euro\w+|one\b|once\b)", r"a \1"),
    # Ensure space before opening parenthesis (T5 sometimes removes it)
    (r"(\w)\(", r"\1 ("),
    # Fix "in deal with" → "in dealing with" (verb form after preposition)
    (r"\bin deal with\b", "in dealing with"),
    (r"\bin tackle\b", "in tackling"),
    (r"\bin handle\b", "in handling"),
    (r"\bfor address\b", "for addressing"),
    (r"\bby create\b", "by creating"),
    (r"\bby build\b", "by building"),
    (r"\bby set up\b", "by setting up"),
]


def fix_t5_grammar(text: str) -> str:
    """Fix common grammar errors in T5 output."""
    for pattern, replacement in T5_GRAMMAR_FIXES:
        if callable(replacement):
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        else:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def diversify_starters(text: str) -> str:
    """Phase 2c: Replace AI-pattern sentence starters."""
    for pattern in AI_STARTERS:
        if re.search(pattern, text, re.IGNORECASE):
            replacement = random.choice(HUMAN_STARTERS)
            text = re.sub(pattern, replacement + " ", text, flags=re.IGNORECASE)
            break
    return text


# ── Phase 3: Structural variance ──

def clause_front(sentence: str) -> str:
    """Move trailing subordinate clauses to front for variety."""
    # "X because Y" → "Because Y, X"
    m = re.match(r"^(.{20,}?)\s+(because|since|although|while|whereas|given that)\s+(.{10,})$",
                 sentence, re.IGNORECASE)
    if m and random.random() < 0.4:
        main, conj, sub = m.group(1), m.group(2), m.group(3)
        # Clean up punctuation
        main = main.rstrip(".,;")
        sub = sub.rstrip(".")
        return f"{conj.capitalize()} {sub}, {main[0].lower()}{main[1:]}."
    return sentence


def split_long_sentence(sentence: str, max_words: int = 35) -> str:
    """Split overly long sentences at natural break points."""
    words = sentence.split()
    if len(words) <= max_words:
        return sentence
    # Try splitting at comma + conjunction
    m = re.search(r',\s+(and|but|yet|so|or)\s+', sentence)
    if m and m.start() > len(sentence) * 0.3:
        first = sentence[:m.start()].rstrip(",. ")
        second = sentence[m.end():].strip()
        if len(second.split()) >= 5:
            return f"{first}. {second[0].upper()}{second[1:]}"
    # Try splitting at semicolon
    if '; ' in sentence:
        parts = sentence.split('; ', 1)
        if len(parts[0].split()) >= 8 and len(parts[1].split()) >= 5:
            return f"{parts[0].rstrip('.')}. {parts[1][0].upper()}{parts[1][1:]}"
    return sentence


def vary_sentence_length(sentences: list[str]) -> list[str]:
    """Merge some short adjacent sentences for burstiness."""
    if len(sentences) < 4:
        return sentences
    result = []
    i = 0
    while i < len(sentences):
        s = sentences[i]
        # Merge two short sentences occasionally
        if (i + 1 < len(sentences)
            and len(s.split()) < 10
            and len(sentences[i + 1].split()) < 10
            and random.random() < 0.3):
            connector = random.choice([", and ", " — ", "; "])
            merged = s.rstrip(".!?") + connector + sentences[i + 1][0].lower() + sentences[i + 1][1:]
            result.append(merged)
            i += 2
        else:
            result.append(s)
            i += 1
    return result


# ── Sentence Splitter ──

def split_sentences(text: str) -> list[str]:
    """Split text into sentences preserving paragraph structure."""
    # Split on sentence-ending punctuation followed by space+uppercase or end
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in parts if s.strip()]


def is_title_line(line: str) -> bool:
    """Detect if a line is a title/heading (short, no ending punctuation, often title case)."""
    line = line.strip()
    if not line or len(line) > 100:
        return False
    # No ending punctuation (.!?)
    if line[-1] in '.!?':
        return False
    # Short (≤ 12 words)
    if len(line.split()) > 12:
        return False
    # Check for title case or all caps
    words = line.split()
    capital_words = sum(1 for w in words if w and w[0].isupper())
    if capital_words >= len(words) * 0.6:  # At least 60% capitalized words
        return True
    return False


def split_paragraphs(text: str) -> list[dict]:
    """Split text into paragraphs, detecting and marking titles.
    Returns list of dicts with 'text', 'is_title', 'original_text' keys.
    """
    raw_paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    result = []
    
    for para in raw_paragraphs:
        # Check if this paragraph is a single-line title
        lines = para.split('\n')
        if len(lines) == 1 and is_title_line(lines[0]):
            result.append({'text': para, 'is_title': True, 'original_text': para})
        else:
            # Check if first line is a title followed by body text
            if len(lines) > 1 and is_title_line(lines[0]):
                # Split: title as one paragraph, rest as another
                result.append({'text': lines[0], 'is_title': True, 'original_text': lines[0]})
                body = ' '.join(lines[1:]).strip()
                if body:
                    result.append({'text': body, 'is_title': False, 'original_text': body})
            else:
                result.append({'text': para, 'is_title': False, 'original_text': para})
    
    return result


# ── Change Measurement ──

def measure_change(original: str, modified: str) -> float:
    """Word-level change ratio (0.0 = identical, 1.0 = completely different)."""
    orig = [w.lower().strip(".,;:!?\"'()[]") for w in original.split() if w.strip()]
    mod = [w.lower().strip(".,;:!?\"'()[]") for w in modified.split() if w.strip()]
    if not orig or not mod:
        return 0.0
    # Use set-based overlap for better semantic comparison
    orig_set = set(orig)
    mod_set = set(mod)
    if not orig_set:
        return 1.0
    overlap = orig_set & mod_set
    # Measure as: 1 - (overlap / max(len_orig, len_mod))
    return 1.0 - (len(overlap) / max(len(orig_set), len(mod_set)))


def measure_meaning_overlap(original: str, modified: str) -> float:
    """Measure what fraction of original content words survive in modified.
    
    Returns 0.0-1.0 where 1.0 means all original content words are present.
    Used to detect T5 hallucinations — if too few original words remain,
    the model has generated unrelated content.
    """
    # Content words only (skip stopwords)
    STOPWORDS = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "during",
        "before", "after", "above", "below", "between", "out", "off", "over",
        "under", "again", "further", "then", "once", "here", "there", "when",
        "where", "why", "how", "all", "each", "every", "both", "few", "more",
        "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "because", "but", "and",
        "or", "if", "while", "that", "this", "these", "those", "it", "its",
        "they", "them", "their", "we", "our", "he", "she", "his", "her",
        "which", "what", "who", "whom", "about", "also",
    }
    
    orig_words = {w.lower().strip(".,;:!?\"'()[]") for w in original.split()
                  if w.strip() and w.lower().strip(".,;:!?\"'()[]") not in STOPWORDS
                  and len(w.strip(".,;:!?\"'()[]")) >= 3}
    mod_words = {w.lower().strip(".,;:!?\"'()[]") for w in modified.split()
                 if w.strip() and w.lower().strip(".,;:!?\"'()[]") not in STOPWORDS
                 and len(w.strip(".,;:!?\"'()[]")) >= 3}
    
    if not orig_words:
        return 1.0  # nothing to check
    
    # How many original content words survived (possibly as synonyms)?
    # Direct overlap
    overlap = orig_words & mod_words
    return len(overlap) / len(orig_words)


# ── Phase 1: T5 Generation ──

@torch.no_grad()
def t5_generate_sentence(sentence: str, num_beams: int = 4,
                         no_repeat_ngram: int = 3,
                         length_penalty: float = 1.0,
                         repetition_penalty: float = 1.2) -> str:
    """Generate a paraphrase of a single sentence using T5 beam search.
    
    CRITICAL: This model ONLY works with greedy/beam search.
    Sampling (do_sample=True) produces garbage at any temperature.
    """
    inputs = tokenizer(
        sentence,
        return_tensors="pt",
        max_length=512,
        truncation=True,
        padding=True,
    ).to(device)
    
    outputs = model.generate(
        **inputs,
        max_new_tokens=min(768, max(len(sentence.split()) * 4, 128)),  # Increased for longer outputs
        num_beams=num_beams,
        do_sample=False,           # NEVER sample with this model
        no_repeat_ngram_size=no_repeat_ngram,
        length_penalty=length_penalty,
        repetition_penalty=repetition_penalty,
        early_stopping=True,
    )
    
    decoded = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    return decoded


# ── Quality mode presets ──
MODE_PRESETS = {
    "quality": {
        "num_beams": 4,
        "no_repeat_ngram": 3,
        "length_penalty": 1.5,       # Penalize short outputs to prevent clause truncation
        "repetition_penalty": 1.2,
        "max_retries": 5,
    },
    "fast": {
        "num_beams": 1,       # greedy = faster
        "no_repeat_ngram": 2,
        "length_penalty": 1.3,
        "repetition_penalty": 1.1,
        "max_retries": 2,
    },
    "aggressive": {
        "num_beams": 6,
        "no_repeat_ngram": 4,
        "length_penalty": 1.5,
        "repetition_penalty": 1.5,
        "max_retries": 8,
    },
}


# ── Main Pipeline ──

def humanize_sentence(original: str, preset: dict, min_change: float,
                      max_retries: int) -> tuple[str, dict]:
    """Full multi-phase humanization of a single sentence.
    
    Phase 1: T5 beam-search paraphrase (1-2 attempts max, CPU is slow)
    Phase 2: AI word kill + filler cuts + starter diversification
    Phase 3: Structural variance (clause fronting, sentence splitting)
    Phase 4: Deep synonym replacement + restructuring (if still below threshold)
    Phase 5: Grammar fixes for T5 artifacts
    Phase 6: Quality gate
    
    Returns (humanized_text, stats_dict)
    """
    if len(original.split()) < 3:
        return original, {"skipped": True, "reason": "too_short"}

    best_result = original
    best_ratio = 0.0
    attempts = 0

    # Limit T5 retries to 2 (beam search on CPU is slow ~20s/sentence)
    t5_retries = min(max_retries, 2)

    for attempt in range(t5_retries):
        attempts = attempt + 1

        # Phase 1: T5 paraphrase
        t5_out = t5_generate_sentence(
            original,
            num_beams=preset["num_beams"],
            no_repeat_ngram=preset["no_repeat_ngram"],
            length_penalty=preset["length_penalty"],
            repetition_penalty=preset["repetition_penalty"],
        )

        # Sanity check 1: if T5 output is too short, reject
        # T5 often cuts trailing clauses — reject if output lost >25% of words
        if len(t5_out.split()) < max(3, len(original.split()) * 0.75):
            t5_out = original

        # Sanity check 2: MEANING GUARD — reject T5 hallucinations
        # If less than 40% of original content words survive, T5 hallucinated
        meaning_overlap = measure_meaning_overlap(original, t5_out)
        if meaning_overlap < 0.40:
            logger.warning(
                f"T5 hallucination detected (overlap={meaning_overlap:.2f}): "
                f"'{original[:60]}...' → '{t5_out[:60]}...'"
            )
            t5_out = original  # Fall back to original for rule-based processing

        # Sanity check 2b: Proper noun hallucination — reject if T5 introduces
        # entity names (countries, orgs) not present in the original
        orig_upper = {w.strip(".,;:!?\"'()[]") for w in original.split() if w[0:1].isupper() and len(w) > 2}
        t5_upper = {w.strip(".,;:!?\"'()[]") for w in t5_out.split() if w[0:1].isupper() and len(w) > 2}
        new_entities = t5_upper - orig_upper - {"The", "This", "That", "These", "Those",
            "Also", "However", "Although", "While", "Since", "After", "Before",
            "Despite", "Because", "Furthermore", "Moreover", "Additionally",
            "Regarding", "Concerning", "Meanwhile", "Still", "Yet", "But"}
        if len(new_entities) >= 2:  # T5 introduced 2+ new capitalized words → likely hallucination
            logger.warning(
                f"T5 entity hallucination detected: new entities {new_entities} "
                f"in '{t5_out[:60]}...'"
            )
            t5_out = original

        # Sanity check 3: if T5 output is too long (>2x input), truncate
        if len(t5_out.split()) > len(original.split()) * 2:
            t5_words = t5_out.split()
            max_words = int(len(original.split()) * 1.5)
            t5_out = " ".join(t5_words[:max_words])
            if not t5_out.rstrip()[-1] in ".!?":
                t5_out = t5_out.rstrip() + "."

        # Sanity check 4: Preserve parenthetical citations from the original
        # T5 often mangles "(Author, Year)" references — replace mangled versions
        citation_pattern = re.compile(r'\([^)]*?\b\d{4}\b[^)]*?\)')
        orig_citations = citation_pattern.findall(original)
        if orig_citations:
            # Remove bracketed references T5 sometimes hallucinates, e.g. [2] or [Author Name]
            t5_out = re.sub(r'\s*\[[^\]]{1,60}\]', '', t5_out)
            for citation in orig_citations:
                if citation in t5_out:
                    continue  # Citation preserved correctly
                # Try to find a mangled T5 citation with the same year and replace it
                years = re.findall(r'\b\d{4}\b', citation)
                replaced = False
                for year in years:
                    mangled = re.search(r'\([^)]*?' + re.escape(year) + r'[^)]*?\)', t5_out)
                    if mangled:
                        t5_out = t5_out.replace(mangled.group(), citation, 1)
                        replaced = True
                        break
                if not replaced:
                    # No mangled version found — append before sentence-ending punctuation
                    t5_out = t5_out.rstrip()
                    if t5_out and t5_out[-1] in '.!?':
                        t5_out = t5_out[:-1] + ' ' + citation + t5_out[-1]
                    else:
                        t5_out = t5_out + ' ' + citation + '.'

        # Phase 2: AI word kill + filler cuts
        processed = apply_ai_word_kill(t5_out)
        processed = apply_filler_cuts(processed)
        processed = diversify_starters(processed)

        # Phase 3: Structural variance
        processed = clause_front(processed)
        processed = split_long_sentence(processed)

        # Phase 5: Grammar fixes
        processed = fix_t5_grammar(processed)

        # Ensure proper sentence ending
        processed = processed.strip()
        if processed and not processed[-1] in '.!?':
            processed += '.'
        if processed and processed[0].islower():
            processed = processed[0].upper() + processed[1:]

        ratio = measure_change(original, processed)
        if ratio > best_ratio:
            best_result = processed
            best_ratio = ratio

        if ratio >= min_change:
            break

        # Slight variation for retry
        preset = {**preset}
        preset["repetition_penalty"] = min(2.0, preset["repetition_penalty"] + 0.2)
        if preset["num_beams"] < 6:
            preset["num_beams"] += 1

    # Phase 4: If still below threshold, apply deep synonym replacement + restructuring
    # (these are fast, no T5 calls, so we can retry more aggressively)
    if best_ratio < min_change:
        fallback = best_result
        for fb_attempt in range(max_retries - t5_retries):
            attempts += 1
            intensity = 0.5 + (fb_attempt * 0.1)  # get more aggressive each retry
            fallback = deep_synonym_replace(best_result, min(intensity, 0.9))
            fallback = restructure_sentence(fallback)
            fallback = fix_t5_grammar(fallback)
            fallback = fallback.strip()
            if fallback and not fallback[-1] in '.!?':
                fallback += '.'
            if fallback and fallback[0].islower():
                fallback = fallback[0].upper() + fallback[1:]
            
            ratio = measure_change(original, fallback)
            if ratio > best_ratio:
                best_result = fallback
                best_ratio = ratio
            if ratio >= min_change:
                break
    
    return best_result, {
        "attempts": attempts,
        "change_ratio": round(best_ratio, 3),
        "met_threshold": best_ratio >= min_change,
    }


def humanize_text(text: str, mode: str = "quality",
                  min_change_ratio: float = 0.40,
                  max_retries: int = 5,
                  sentence_by_sentence: bool = True) -> tuple[str, dict]:
    """Full pipeline: processes text through all phases.
    
    If sentence_by_sentence=True: splits into sentences, processes each independently.
    If sentence_by_sentence=False: processes paragraph chunks through T5, then post-processes.
    
    Returns (humanized_text, stats_dict)
    """
    preset = MODE_PRESETS.get(mode, MODE_PRESETS["quality"])
    preset = {**preset}  # copy

    paragraphs = split_paragraphs(text)
    all_results: list[dict] = []  # Now stores dicts with 'text', 'is_title'
    all_stats: list[dict] = []
    total_sentences = 0
    met_threshold_count = 0

    for para_dict in paragraphs:
        para = para_dict['text']
        is_title = para_dict['is_title']
        
        # Protect titles from processing — preserve them exactly
        if is_title:
            all_results.append({'text': para, 'is_title': True})
            continue
        if sentence_by_sentence:
            sentences = split_sentences(para)
            processed_sentences = []
            
            for sent in sentences:
                total_sentences += 1
                result, stats = humanize_sentence(
                    sent, preset, min_change_ratio, max_retries
                )
                processed_sentences.append(result)
                all_stats.append(stats)
                if stats.get("met_threshold", False) or stats.get("skipped", False):
                    met_threshold_count += 1

            # Phase 3b: Apply cross-sentence variance
            processed_sentences = vary_sentence_length(processed_sentences)
            all_results.append({'text': " ".join(processed_sentences), 'is_title': False})
        else:
            # Bulk mode: process whole paragraph through T5
            total_sentences += 1
            # Chunk if paragraph is very long (>400 tokens)
            para_tokens = len(tokenizer.encode(para, add_special_tokens=False))
            if para_tokens > 400:
                # Split into sentence chunks
                sentences = split_sentences(para)
                chunk_results = []
                for sent in sentences:
                    t5_out = t5_generate_sentence(
                        sent,
                        num_beams=preset["num_beams"],
                        no_repeat_ngram=preset["no_repeat_ngram"],
                        length_penalty=preset["length_penalty"],
                        repetition_penalty=preset["repetition_penalty"],
                    )
                    if len(t5_out.split()) < max(3, len(sent.split()) * 0.3):
                        t5_out = sent
                    # Meaning guard for bulk mode too
                    if measure_meaning_overlap(sent, t5_out) < 0.40:
                        t5_out = sent
                    chunk_results.append(t5_out)
                t5_out = " ".join(chunk_results)
            else:
                t5_out = t5_generate_sentence(
                    para,
                    num_beams=preset["num_beams"],
                    no_repeat_ngram=preset["no_repeat_ngram"],
                    length_penalty=preset["length_penalty"],
                    repetition_penalty=preset["repetition_penalty"],
                )
                if len(t5_out.split()) < max(3, len(para.split()) * 0.3):
                    t5_out = para
                # Meaning guard
                if measure_meaning_overlap(para, t5_out) < 0.40:
                    t5_out = para

            # Apply post-processing to whole paragraph
            processed = apply_ai_word_kill(t5_out)
            processed = apply_filler_cuts(processed)
            processed = fix_t5_grammar(processed)
            
            # Apply per-sentence structural variance
            sents = split_sentences(processed)
            sents = [diversify_starters(s) for s in sents]
            sents = [clause_front(s) for s in sents]
            sents = [split_long_sentence(s) for s in sents]
            sents = vary_sentence_length(sents)
            
            result = " ".join(sents)
            ratio = measure_change(para, result)
            all_stats.append({
                "change_ratio": round(ratio, 3),
                "met_threshold": ratio >= min_change_ratio,
            })
            if ratio >= min_change_ratio:
                met_threshold_count += 1
            all_results.append({'text': result, 'is_title': False})

    # Reassemble paragraphs with proper title handling
    final_paragraphs = []
    for item in all_results:
        para_text = item['text'].strip()
        if not para_text:
            continue
        
        is_title = item.get('is_title', False)
        
        if is_title:
            # Preserve titles exactly, but fix basic capitalization
            # Ensure first letter is capitalized
            if para_text and para_text[0].islower():
                para_text = para_text[0].upper() + para_text[1:]
            final_paragraphs.append(para_text)
        else:
            # Fix capitalization for body paragraphs
            # First letter of paragraph
            if para_text and para_text[0].islower():
                para_text = para_text[0].upper() + para_text[1:]
            # First letter after sentence endings within paragraph
            para_text = re.sub(
                r'([.!?])\s+([a-z])',
                lambda m: f"{m.group(1)} {m.group(2).upper()}",
                para_text
            )
            final_paragraphs.append(para_text)

    humanized = "\n\n".join(final_paragraphs)

    # Final cleanup passes
    # Fix double spaces
    humanized = re.sub(r'  +', ' ', humanized)
    # Fix space before punctuation
    humanized = re.sub(r'\s+([.!?,;:])', r'\1', humanized)
    # Fix multiple periods
    humanized = re.sub(r'\.{2,}', '.', humanized)
    # Fix missing space after punctuation
    humanized = re.sub(r'([.!?,;:])([A-Za-z])', r'\1 \2', humanized)
    # Fix sentence-initial lowercase after period (redundant safety)
    humanized = re.sub(
        r'([.!?])\s+([a-z])',
        lambda m: f"{m.group(1)} {m.group(2).upper()}",
        humanized
    )
    # Fix paragraph-initial lowercase (safety check)
    humanized = re.sub(
        r'(^|\n\n)([a-z])',
        lambda m: m.group(1) + m.group(2).upper(),
        humanized
    )
    # Fix "Before, X is" → "Previously, X was" (T5 artifact)
    humanized = re.sub(r'\bBefore,\s+(\w+)\s+is\b', r'Previously, \1 was', humanized)
    humanized = re.sub(r'\bBefore,\s+(\w+)\s+are\b', r'Previously, \1 were', humanized)
    # Fix "has seen its use Xed" → "has helped X" (T5 artifact)
    humanized = re.sub(r'\bhas seen its (?:use |)(\w+ed)\b', r'has \1', humanized)
    # Run T5 grammar fixes one more time on final text
    humanized = fix_t5_grammar(humanized)

    # Expand contractions (AI detectors flag them as human-written patterns,
    # but academic text should avoid them)
    contractions = {
        "don't": "do not", "doesn't": "does not", "didn't": "did not",
        "won't": "will not", "wouldn't": "would not", "couldn't": "could not",
        "shouldn't": "should not", "can't": "cannot", "isn't": "is not",
        "aren't": "are not", "wasn't": "was not", "weren't": "were not",
        "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
        "it's": "it is", "that's": "that is", "there's": "there is",
        "what's": "what is", "who's": "who is", "let's": "let us",
        "I'm": "I am", "you're": "you are", "they're": "they are",
        "we're": "we are", "he's": "he is", "she's": "she is",
        "I've": "I have", "you've": "you have", "they've": "they have",
        "we've": "we have", "I'll": "I will", "you'll": "you will",
        "they'll": "they will", "we'll": "we will", "he'll": "he will",
        "she'll": "she will", "it'll": "it will",
    }
    for contraction, expansion in contractions.items():
        humanized = humanized.replace(contraction, expansion)
        humanized = humanized.replace(contraction.capitalize(), expansion.capitalize())
    
    # Remove em-dashes (AI detector signal)
    humanized = humanized.replace("—", " -- ")
    humanized = humanized.replace("–", " -- ")
    humanized = re.sub(r'\s*--\s*', ', ', humanized)

    # ── POST-PROCESSING VALIDATION ──
    # Validate output integrity: ensure all sentences present, no truncation
    try:
        validation_result = validate_and_repair_output(
            original_text=text,
            humanized_text=humanized,
            allow_word_change_bound=0.7,
            min_sentence_words=3,
            auto_repair=True
        )
        
        # Use repaired text if repairs were made
        if validation_result['was_repaired']:
            humanized = validation_result['text']
            logger.info(
                f"Output repaired: {len(validation_result['repairs'])} repairs made: "
                f"{', '.join(validation_result['repairs'])}"
            )
        
        # Add validation stats to response
        validation_stats = validation_result['validation']
        validation_info = {
            'validation_passed': validation_stats.is_valid,
            'was_repaired': validation_result['was_repaired'],
            'repairs': validation_result['repairs'],
            'sentence_count': {
                'original': validation_stats.stats.original_sentences,
                'humanized': validation_stats.stats.humanized_sentences,
            },
            'word_count': {
                'original': validation_stats.stats.original_words,
                'humanized': validation_stats.stats.humanized_words,
                'preservation_ratio': round(validation_stats.stats.word_preservation_ratio, 3),
            },
            'issues': validation_stats.issues[:5] if not validation_stats.is_valid else []
        }
        
        # Log validation issues if any
        if not validation_stats.is_valid:
            logger.warning(
                f"Validation issues found: {len(validation_stats.issues)} issues. "
                f"First issue: {validation_stats.issues[0] if validation_stats.issues else 'None'}"
            )
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        validation_info = {'validation_passed': False, 'error': str(e)}

    # Deduplicate near-identical consecutive sentences (T5 artifact)
    # Runs AFTER validation to avoid validation seeing fewer sentences and appending originals
    deduped_paras = []
    for para in humanized.split('\n\n'):
        sents = re.split(r'(?<=[.!?])\s+(?=[A-Z])', para)
        unique = []
        for s in sents:
            s_lower = s.lower().strip()
            if unique:
                prev_lower = unique[-1].lower().strip()
                prev_words = set(prev_lower.split())
                cur_words = set(s_lower.split())
                overlap = len(prev_words & cur_words) / max(len(prev_words | cur_words), 1)
                if overlap > 0.65:
                    continue  # Skip near-duplicate
            unique.append(s)
        deduped_paras.append(' '.join(unique))
    humanized = '\n\n'.join(deduped_paras)

    avg_change = (sum(s.get("change_ratio", 0) for s in all_stats) /
                  max(len(all_stats), 1))

    stats = {
        "mode": mode,
        "total_sentences": total_sentences,
        "met_threshold": met_threshold_count,
        "threshold_ratio": round(met_threshold_count / max(total_sentences, 1), 3),
        "avg_change_ratio": round(avg_change, 3),
        "sentence_stats": all_stats[:20],  # cap to prevent huge responses
        "validation": validation_info,  # Add validation results
    }

    return humanized, stats


# ── API Routes ──

@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok", "model": "oxygen-t5-humanizer-v2", "device": device}


@app.post("/humanize", response_model=HumanizeResponse)
async def humanize_endpoint(req: HumanizeRequest):
    if model is None or tokenizer is None:
        raise HTTPException(503, "Model not loaded")

    try:
        humanized, stats = humanize_text(
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


# ── Startup ──

@app.on_event("startup")
async def startup():
    load_model()


if __name__ == "__main__":
    import uvicorn
    load_model()
    uvicorn.run(app, host="127.0.0.1", port=5001, log_level="info")
