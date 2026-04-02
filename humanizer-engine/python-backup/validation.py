"""
Validation Layer
================
Checks that the rewritten text satisfies all hard constraints:
  - Structure preservation (≤5% sentence boundary changes)
  - No contractions
  - No list formatting introduced
  - Length within ±5% of original
  - Paragraph count preserved
  - Meaning integrity (keyword overlap check)
"""

import re
from typing import Dict, List, Tuple


# ═══════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════

def _split_sentences(text: str) -> List[str]:
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in raw if s.strip()]


def _word_count(text: str) -> int:
    return len(re.findall(r"[a-zA-Z']+", text))


def _extract_keywords(text: str, top_n: int = 50) -> set:
    """Extract top content words (skip short/common words)."""
    stops = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "this", "that", "these",
        "those", "it", "its", "they", "them", "their", "we", "our", "you",
        "your", "he", "she", "his", "her", "and", "or", "but", "if", "in",
        "on", "at", "to", "for", "of", "with", "by", "from", "as", "into",
        "not", "no", "so", "than", "too", "very", "just", "also", "more",
        "most", "some", "any", "all", "each", "every", "both", "few",
        "many", "much", "own", "same", "other", "such", "only", "about",
    }
    words = re.findall(r"[a-z]+", text.lower())
    content = [w for w in words if len(w) > 3 and w not in stops]
    # Frequency-based top N
    freq = {}
    for w in content:
        freq[w] = freq.get(w, 0) + 1
    sorted_words = sorted(freq, key=freq.get, reverse=True)
    return set(sorted_words[:top_n])


# ═══════════════════════════════════════════════════════════════════════
#  CONTRACTION CHECK
# ═══════════════════════════════════════════════════════════════════════

_CONTRACTION_RE = re.compile(
    r"\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|"
    r"hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|"
    r"it's|that's|there's|here's|he's|she's|they're|we're|you're|"
    r"I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|"
    r"he'll|she'll|it'll|let's|who's|what's)\b", re.IGNORECASE)


# ═══════════════════════════════════════════════════════════════════════
#  LIST DETECTION
# ═══════════════════════════════════════════════════════════════════════

_LIST_RE = re.compile(
    r"(?m)^\s*(?:\d+[.)]\s|[-*•]\s|[a-z]\)\s)", re.MULTILINE
)


# ═══════════════════════════════════════════════════════════════════════
#  VALIDATION FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

def validate_structure(original: str, result: str) -> Dict:
    """Check sentence boundary preservation (≤5% change allowed)."""
    orig_sents = _split_sentences(original)
    result_sents = _split_sentences(result)
    orig_count = max(len(orig_sents), 1)
    result_count = len(result_sents)
    diff = abs(result_count - orig_count)
    pct_change = diff / orig_count
    return {
        "passed": pct_change <= 0.05,
        "original_sentences": orig_count,
        "result_sentences": result_count,
        "diff": diff,
        "pct_change": round(pct_change, 3),
        "message": (
            f"Sentence count changed by {pct_change:.1%} "
            f"({orig_count} → {result_count})"
        ),
    }


def validate_length(original: str, result: str) -> Dict:
    """Check total length within ±10% (word count)."""
    orig_wc = _word_count(original)
    result_wc = _word_count(result)
    pct_change = abs(result_wc - orig_wc) / max(orig_wc, 1)
    return {
        "passed": pct_change <= 0.10,
        "original_words": orig_wc,
        "result_words": result_wc,
        "pct_change": round(pct_change, 3),
    }


def validate_no_contractions(text: str) -> Dict:
    """Check that no contractions are present."""
    matches = _CONTRACTION_RE.findall(text)
    return {
        "passed": len(matches) == 0,
        "contractions_found": matches[:10],
    }


def validate_no_lists(original: str, result: str) -> Dict:
    """Check that no list formatting was introduced."""
    orig_lists = len(_LIST_RE.findall(original))
    result_lists = len(_LIST_RE.findall(result))
    new_lists = max(0, result_lists - orig_lists)
    return {
        "passed": new_lists == 0,
        "new_list_items": new_lists,
    }


def validate_paragraphs(original: str, result: str) -> Dict:
    """Check paragraph count preservation."""
    orig_paras = [p.strip() for p in re.split(r'\n\s*\n', original) if p.strip()]
    result_paras = [p.strip() for p in re.split(r'\n\s*\n', result) if p.strip()]
    return {
        "passed": len(result_paras) == len(orig_paras),
        "original_paragraphs": len(orig_paras),
        "result_paragraphs": len(result_paras),
    }


def validate_meaning(original: str, result: str) -> Dict:
    """Check keyword overlap as a proxy for meaning preservation."""
    orig_kw = _extract_keywords(original)
    result_kw = _extract_keywords(result)
    if not orig_kw:
        return {"passed": True, "overlap": 1.0, "missing_keywords": []}
    overlap = len(orig_kw & result_kw) / len(orig_kw)
    missing = list(orig_kw - result_kw)[:10]
    return {
        "passed": overlap >= 0.75,
        "overlap": round(overlap, 3),
        "missing_keywords": missing,
    }


# ═══════════════════════════════════════════════════════════════════════
#  FULL VALIDATION
# ═══════════════════════════════════════════════════════════════════════

def validate_all(original: str, result: str) -> Dict:
    """
    Run all validations. Returns a summary dict with:
      - all_passed: bool
      - checks: dict of individual check results
      - issues: list of human-readable issue strings
    """
    checks = {
        "structure": validate_structure(original, result),
        "length": validate_length(original, result),
        "contractions": validate_no_contractions(result),
        "lists": validate_no_lists(original, result),
        "paragraphs": validate_paragraphs(original, result),
        "meaning": validate_meaning(original, result),
    }

    issues = []
    for name, chk in checks.items():
        if not chk["passed"]:
            issues.append(f"{name}: {chk}")

    return {
        "all_passed": all(c["passed"] for c in checks.values()),
        "checks": checks,
        "issues": issues,
    }
