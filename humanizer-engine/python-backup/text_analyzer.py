"""
Text Analyzer
=============
Computes a statistical fingerprint of a piece of text so we can
compare it against a target StyleProfile and build a gap-aware
rewriting prompt.

All metrics are computed with pure Python + regex (no heavy NLP deps).
"""

import re
import math
from typing import Dict, List, Tuple

# ── Hedging markers (common academic hedging words / phrases) ────────
_HEDGE_WORDS = {
    "suggests", "indicates", "appears", "seems", "likely", "unlikely",
    "perhaps", "possibly", "probably", "might", "could", "may",
    "arguably", "conceivably", "presumably", "roughly", "approximately",
    "tend", "tends", "tended", "somewhat", "relatively", "generally",
    "largely", "partially", "primarily", "mainly", "mostly",
}
_HEDGE_PHRASES = [
    "to some extent", "in many cases", "it is possible that",
    "it appears that", "it seems that", "it is likely that",
    "one might argue", "it could be argued", "there is evidence",
    "the data suggest", "the results indicate", "in some instances",
    "to a certain degree", "it is worth noting", "it should be noted",
]

# ── Passive voice pattern (simple heuristic) ────────────────────────
_PASSIVE_RE = re.compile(
    r"\b(is|are|was|were|been|being|be)\s+"
    r"(\w+ly\s+)?(\w+ed|written|shown|seen|known|given|taken|made|done|found|said|told|thought|built|sent)\b",
    re.IGNORECASE,
)

# ── Clause boundary markers ─────────────────────────────────────────
_CLAUSE_MARKERS = re.compile(
    r"\b(which|that|because|although|while|whereas|since|unless|"
    r"however|moreover|furthermore|nevertheless|consequently|therefore|"
    r"if|when|where|after|before|until|though)\b",
    re.IGNORECASE,
)


def _split_sentences(text: str) -> List[str]:
    """Simple sentence splitter on . ? !"""
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in raw if s.strip()]


def _tokenize_words(text: str) -> List[str]:
    """Extract lowercase word tokens."""
    return re.findall(r"[a-zA-Z']+", text.lower())


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC ANALYSIS FUNCTION
# ═══════════════════════════════════════════════════════════════════════

def analyze_text(text: str) -> Dict:
    """
    Compute a statistical profile of the given text.

    Returns a dict with:
      - sentence_count
      - word_count
      - avg_sentence_length
      - sentence_length_std
      - hedging_rate
      - clause_density
      - passive_voice_rate
      - lexical_diversity   (type-token ratio, capped at first 500 words)
      - avg_paragraph_length (sentences per paragraph)
      - punctuation_rates   (semicolons, colons, dashes per 1000 words)
      - sentence_lengths    (list of individual lengths)
    """
    if not text or not text.strip():
        return _empty_profile()

    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    sentences = _split_sentences(text)
    words = _tokenize_words(text)
    word_count = len(words)
    sent_count = max(len(sentences), 1)

    # Sentence lengths
    sent_lengths = [len(_tokenize_words(s)) for s in sentences]
    avg_sl = sum(sent_lengths) / max(len(sent_lengths), 1)
    std_sl = math.sqrt(
        sum((l - avg_sl) ** 2 for l in sent_lengths) / max(len(sent_lengths), 1)
    ) if sent_lengths else 0.0

    # Hedging rate
    hedge_count = 0
    for sent in sentences:
        sent_lower = sent.lower()
        has_hedge = any(w in _tokenize_words(sent_lower) for w in _HEDGE_WORDS)
        if not has_hedge:
            has_hedge = any(p in sent_lower for p in _HEDGE_PHRASES)
        if has_hedge:
            hedge_count += 1
    hedging_rate = hedge_count / sent_count

    # Clause density
    total_clauses = sum(len(_CLAUSE_MARKERS.findall(s)) for s in sentences)
    clause_density = 1.0 + (total_clauses / sent_count)  # base=1 (main clause)

    # Passive voice rate
    passive_count = sum(1 for s in sentences if _PASSIVE_RE.search(s))
    passive_rate = passive_count / sent_count

    # Lexical diversity (TTR on first 500 words)
    sample = words[:500]
    lexical_diversity = len(set(sample)) / max(len(sample), 1)

    # Paragraph length (sentences per paragraph)
    para_sent_counts = [len(_split_sentences(p)) for p in paragraphs]
    avg_para_len = (
        sum(para_sent_counts) / max(len(para_sent_counts), 1)
        if para_sent_counts else 4.0
    )

    # Punctuation rates per 1000 words
    k = max(word_count, 1) / 1000.0
    semicolons = text.count(";") / k if k else 0
    colons = text.count(":") / k if k else 0
    dashes = (text.count("—") + text.count(" - ")) / k if k else 0

    return {
        "sentence_count": sent_count,
        "word_count": word_count,
        "paragraph_count": len(paragraphs),
        "avg_sentence_length": round(avg_sl, 1),
        "sentence_length_std": round(std_sl, 1),
        "hedging_rate": round(hedging_rate, 3),
        "clause_density": round(clause_density, 2),
        "passive_voice_rate": round(passive_rate, 3),
        "lexical_diversity": round(lexical_diversity, 3),
        "avg_paragraph_length": round(avg_para_len, 1),
        "punctuation_rates": {
            "semicolons_per_1k": round(semicolons, 1),
            "colons_per_1k": round(colons, 1),
            "dashes_per_1k": round(dashes, 1),
        },
        "sentence_lengths": sent_lengths,
    }


# ═══════════════════════════════════════════════════════════════════════
#  GAP ANALYSIS
# ═══════════════════════════════════════════════════════════════════════

def compute_gap(current: Dict, target_profile) -> Dict:
    """
    Compare the current text profile against a target StyleProfile.
    Returns a dict of dimension → (current_value, target_value, delta, action).

    `target_profile` can be a StyleProfile object or a dict.
    """
    if hasattr(target_profile, "to_dict"):
        target = target_profile.to_dict()
    else:
        target = dict(target_profile)

    dimensions = [
        "avg_sentence_length", "sentence_length_std", "hedging_rate",
        "clause_density", "passive_voice_rate", "lexical_diversity",
        "avg_paragraph_length",
    ]

    gap = {}
    for dim in dimensions:
        cur = current.get(dim, 0)
        tgt = target.get(dim, 0)
        delta = tgt - cur
        # Determine action string
        if abs(delta) < 0.05 * max(abs(tgt), 1):
            action = "keep"
        elif delta > 0:
            action = "increase"
        else:
            action = "decrease"
        gap[dim] = {
            "current": round(cur, 3),
            "target": round(tgt, 3),
            "delta": round(delta, 3),
            "action": action,
        }

    # Punctuation sub-dimensions
    cur_punct = current.get("punctuation_rates", {})
    tgt_punct = target.get("punctuation_rates", {})
    for key in ["semicolons_per_1k", "colons_per_1k", "dashes_per_1k"]:
        cur_val = cur_punct.get(key, 0)
        tgt_val = tgt_punct.get(key, 0)
        delta = tgt_val - cur_val
        action = "keep" if abs(delta) < 0.3 else ("increase" if delta > 0 else "decrease")
        gap[f"punct_{key}"] = {
            "current": round(cur_val, 1),
            "target": round(tgt_val, 1),
            "delta": round(delta, 1),
            "action": action,
        }

    return gap


def gap_to_instructions(gap: Dict) -> str:
    """
    Convert a gap analysis dict into plain-English rewriting instructions
    that can be injected into an LLM prompt.
    """
    lines = []
    _dim_labels = {
        "avg_sentence_length": "average sentence length (words)",
        "sentence_length_std": "sentence-length variation",
        "hedging_rate": "hedging language frequency",
        "clause_density": "subordinate clause density",
        "passive_voice_rate": "passive voice usage",
        "lexical_diversity": "vocabulary diversity (TTR)",
        "avg_paragraph_length": "paragraph length (sentences)",
        "punct_semicolons_per_1k": "semicolon usage",
        "punct_colons_per_1k": "colon usage",
        "punct_dashes_per_1k": "dash usage",
    }

    for dim, info in gap.items():
        if info["action"] == "keep":
            continue
        label = _dim_labels.get(dim, dim)
        cur = info["current"]
        tgt = info["target"]
        if info["action"] == "increase":
            lines.append(f"- INCREASE {label}: currently ~{cur}, target ~{tgt}")
        else:
            lines.append(f"- DECREASE {label}: currently ~{cur}, target ~{tgt}")

    if not lines:
        return "The text already closely matches the target style. Make only minimal adjustments."

    return "Specific statistical adjustments needed:\n" + "\n".join(lines)


def _empty_profile() -> Dict:
    return {
        "sentence_count": 0,
        "word_count": 0,
        "paragraph_count": 0,
        "avg_sentence_length": 0,
        "sentence_length_std": 0,
        "hedging_rate": 0,
        "clause_density": 0,
        "passive_voice_rate": 0,
        "lexical_diversity": 0,
        "avg_paragraph_length": 0,
        "punctuation_rates": {
            "semicolons_per_1k": 0,
            "colons_per_1k": 0,
            "dashes_per_1k": 0,
        },
        "sentence_lengths": [],
    }
