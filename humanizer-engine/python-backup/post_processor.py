"""
Post-Processor — Compulsory final-stage cleanup for ALL humanizer output
========================================================================
This module runs AFTER the humanizer pipeline returns its final text.
It is independent of the humanizer engine and treats incoming text as
opaque — it never calls back into humanizer internals.

Trained on real humanizer output artifacts:
  - Phrase-level repetition ("contributed to the improvement of" ×12)
  - Sentence-level near-duplication (two sentences saying the same thing)
  - Filler / bureaucratic padding ("among others", "can be linked to the fact that")
  - Connector/starter monotony ("In addition… Moreover… Furthermore")
  - Circular conclusions (conclusion ≈ intro)
  - Weak copula chains ("is important", "is essential", "is crucial")

Usage:
    from post_processor import post_process
    cleaned = post_process(humanized_text)
"""

import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

# Max times a content phrase (3+ words) may appear across the full text
_MAX_PHRASE_REPEATS = 3

# Similarity threshold for sentence dedup (0.0-1.0)
_SENTENCE_SIMILARITY_THRESHOLD = 0.78

# Max times the exact same sentence-starter pattern (first 3 words) may repeat
_MAX_STARTER_REPEATS = 2

# ═══════════════════════════════════════════════════════════════════════════
#  FILLER / PADDING PHRASES — always remove or simplify
# ═══════════════════════════════════════════════════════════════════════════

_FILLER_REPLACEMENTS: list[tuple[re.Pattern, str]] = [
    # Verbose hedges that add nothing
    (re.compile(r",?\s*among others\b", re.I), ""),
    (re.compile(r"\bcan be linked to the fact that\b", re.I), "means that"),
    (re.compile(r"\bcan be attributed to the fact that\b", re.I), "is because"),
    (re.compile(r"\bis linked to the fact that\b", re.I), "means that"),
    (re.compile(r"\bIt is important to note that\b", re.I), "Notably,"),
    (re.compile(r"\bIt is worth noting that\b", re.I), "Notably,"),
    (re.compile(r"\bIt should be noted that\b", re.I), "Notably,"),
    (re.compile(r"\bIt is evident that\b", re.I), "Clearly,"),
    (re.compile(r"\bIt is clear that\b", re.I), "Clearly,"),
    (re.compile(r"\bDue to the fact that\b", re.I), "Because"),
    (re.compile(r"\bIn spite of the fact that\b", re.I), "Although"),
    (re.compile(r"\bRegardless of the fact that\b", re.I), "Although"),
    (re.compile(r"\bThere is no doubt that\b", re.I), "Undoubtedly,"),
    (re.compile(r"\bIt goes without saying that\b", re.I), "Clearly,"),
    (re.compile(r"\ba person can\b", re.I), "one can"),
    (re.compile(r"\ba person to\b", re.I), "one to"),
    # Bureaucratic "the [noun] of" patterns — collapse when used as padding
    (re.compile(r"\bthe improvement of\b", re.I), "improving"),
    (re.compile(r"\bthe development of\b", re.I), "developing"),
    (re.compile(r"\bthe establishment of\b", re.I), "establishing"),
    (re.compile(r"\bthe implementation of\b", re.I), "implementing"),
    (re.compile(r"\bthe creation of\b", re.I), "creating"),
    (re.compile(r"\bthe production of\b", re.I), "producing"),
    (re.compile(r"\bthe promotion of\b", re.I), "promoting"),
    (re.compile(r"\bthe utilization of\b", re.I), "using"),
    (re.compile(r"\bthe enhancement of\b", re.I), "enhancing"),
    (re.compile(r"\bthe reduction of\b", re.I), "reducing"),
    # Wordy "whereby" constructions
    (re.compile(r",?\s*whereby\b", re.I), ", where"),
    # "such that" used loosely
    (re.compile(r"\bsuch that individuals can\b", re.I), "so people can"),
    # Redundant "and also" / "but also"
    (re.compile(r"\band also\b", re.I), "and"),
]

# ═══════════════════════════════════════════════════════════════════════════
#  WEAK COPULA CHAIN DETECTOR
# ═══════════════════════════════════════════════════════════════════════════

_WEAK_COPULA_RE = re.compile(
    r"\b(?:is|are|was|were)\s+"
    r"(?:very\s+)?"
    r"(?:important|crucial|essential|vital|critical|significant|key|undeniable|evident)\b",
    re.I,
)

# Varied replacements — keyed by singular (is/was) vs plural (are/were)
_COPULA_ALTERNATIVES_SINGULAR = [
    "matters greatly",
    "carries real weight",
    "stands out",
    "holds real value",
    "proves indispensable",
    "remains central",
    "plays a key part",
]
_COPULA_ALTERNATIVES_PLURAL = [
    "matter greatly",
    "carry real weight",
    "stand out",
    "hold real value",
    "prove indispensable",
    "remain central",
    "play a key part",
]

# ═══════════════════════════════════════════════════════════════════════════
#  REPETITIVE CONNECTOR/STARTER PATTERNS
# ═══════════════════════════════════════════════════════════════════════════

_CONNECTOR_STARTERS = {
    "in addition": ["Beyond this", "On top of that", "Also", "Plus"],
    "moreover": ["What is more", "Further", "Besides", "Adding to this"],
    "furthermore": ["In addition", "Also", "On top of this", "Beyond this"],
    "additionally": ["Also", "Besides", "On top of this", "Plus"],
    "however": ["That said", "Still", "Even so", "Yet"],
    "therefore": ["As a result", "For this reason", "Hence", "So"],
    "consequently": ["As a result", "This means", "Because of this", "So"],
    "in conclusion": ["To sum up", "Overall", "All in all", "Taken together"],
    "this is seen in": ["This shows in", "Evidence appears in", "Consider"],
    "these have greatly contributed": [
        "These helped shape", "These strengthened", "These advanced",
    ],
    "another contribution": [
        "A further role", "An added effect", "Another impact",
    ],
}

# ═══════════════════════════════════════════════════════════════════════════
#  UTILITY HELPERS
# ═══════════════════════════════════════════════════════════════════════════

_SENT_SPLIT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences respecting abbreviations."""
    parts = _SENT_SPLIT_RE.split(text)
    return [p.strip() for p in parts if p.strip()]


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation — for comparison only."""
    return re.sub(r'[^\w\s]', '', text.lower()).strip()


def _ngrams(words: list[str], n: int) -> list[str]:
    """Extract n-grams from word list."""
    return [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)]


def _sentence_similarity(a: str, b: str) -> float:
    """Quick similarity ratio between two normalized sentences."""
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _word_overlap(a: str, b: str) -> float:
    """Jaccard word overlap between two sentences."""
    wa = set(_normalize(a).split())
    wb = set(_normalize(b).split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 1: FILLER / PADDING CLEANUP
# ═══════════════════════════════════════════════════════════════════════════

def _clean_fillers(text: str) -> str:
    """Remove or simplify known filler/padding phrases."""
    for pattern, replacement in _FILLER_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    # Collapse multiple spaces
    text = re.sub(r'  +', ' ', text)
    return text


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 2: PHRASE-LEVEL REPETITION REDUCTION
# ═══════════════════════════════════════════════════════════════════════════

def _reduce_phrase_repetition(text: str) -> str:
    """Detect and reduce content phrases that repeat excessively.
    
    Strategy: for each 3/4/5-gram that appears >_MAX_PHRASE_REPEATS times,
    remove entire sentences that contain excess occurrences (removing just
    the phrase mid-sentence would leave broken grammar).
    """
    sentences = _split_sentences(text)
    if len(sentences) < 8:
        return text

    # Count all 3-5 word phrases across the text
    words_lower = _normalize(text).split()
    phrase_counts: Counter = Counter()
    func_words = {"the", "of", "in", "and", "to", "a", "is", "are",
                  "for", "on", "it", "that", "this", "with", "as",
                  "by", "an", "or", "be", "was", "were", "has", "have",
                  "been", "not", "but", "its", "they", "their", "these"}
    for n in (5, 4, 3):
        for gram in _ngrams(words_lower, n):
            gram_words = gram.split()
            content_count = sum(1 for w in gram_words if w not in func_words)
            if content_count >= 2:
                phrase_counts[gram] += 1

    # Find over-repeated phrases
    over_repeated = {
        phrase for phrase, count in phrase_counts.items()
        if count > _MAX_PHRASE_REPEATS
    }

    if not over_repeated:
        return text

    # For each over-repeated phrase, mark excess sentence indices for removal
    sentences_to_remove: set[int] = set()

    for phrase in sorted(over_repeated, key=len, reverse=True):
        escaped = re.escape(phrase)
        flexible = re.sub(r'\\ ', r'\\s+', escaped)
        pat = re.compile(flexible, re.I)

        seen_count = 0
        for i, sent in enumerate(sentences):
            if i in sentences_to_remove:
                continue
            if pat.search(sent):
                seen_count += 1
                if seen_count > _MAX_PHRASE_REPEATS:
                    sentences_to_remove.add(i)

    # Never remove more than 40% of sentences — safety cap
    max_removable = max(1, len(sentences) * 2 // 5)
    if len(sentences_to_remove) > max_removable:
        # Keep the earliest excess, remove later ones
        sentences_to_remove = set(sorted(sentences_to_remove)[-max_removable:])

    kept = [s for i, s in enumerate(sentences) if i not in sentences_to_remove]
    # Preserve paragraph breaks: rebuild from original text structure
    paragraphs = re.split(r'\n\s*\n', text)
    result_paras = []
    sent_idx = 0
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        para_sents = _split_sentences(para)
        para_kept = []
        for _ in para_sents:
            if sent_idx < len(sentences):
                if sent_idx not in sentences_to_remove:
                    para_kept.append(sentences[sent_idx])
                sent_idx += 1
        if para_kept:
            result_paras.append(" ".join(para_kept))
    return "\n\n".join(result_paras)


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 3: SENTENCE-LEVEL NEAR-DUPLICATION REMOVAL
# ═══════════════════════════════════════════════════════════════════════════

def _remove_near_duplicate_sentences(text: str) -> str:
    """Remove sentences that are near-duplicates of earlier sentences.
    
    Two thresholds:
      - SequenceMatcher ratio >= 0.65 -> probable duplicate
      - Jaccard word overlap >= 0.70 -> high content overlap
    Either triggers removal of the later sentence.
    
    Cross-paragraph comparison ensures global dedup.
    Never removes more than 30% of sentences in a paragraph.
    """
    paragraphs = text.split('\n')
    result_paragraphs = []

    # Collect ALL sentences across paragraphs for global comparison
    all_kept_normalized: list[str] = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            result_paragraphs.append("")
            continue

        sentences = _split_sentences(para)
        kept = []
        removed_count = 0
        max_removable = max(1, len(sentences) // 3)

        for sent in sentences:
            norm = _normalize(sent)
            if len(norm.split()) < 5:
                kept.append(sent)
                all_kept_normalized.append(norm)
                continue

            if removed_count >= max_removable:
                kept.append(sent)
                all_kept_normalized.append(norm)
                continue

            is_dup = False
            for prev_norm in all_kept_normalized:
                if len(prev_norm.split()) < 5:
                    continue
                sim = _sentence_similarity(sent, prev_norm)
                overlap = _word_overlap(sent, prev_norm)
                if sim >= _SENTENCE_SIMILARITY_THRESHOLD or overlap >= 0.80:
                    is_dup = True
                    break

            if not is_dup:
                kept.append(sent)
                all_kept_normalized.append(norm)
            else:
                removed_count += 1

        # Always keep at least one sentence per paragraph —
        # UNLESS this is a single-sentence paragraph that is a pure dup
        if not kept and sentences:
            if len(sentences) == 1 and removed_count == 1:
                # Single-sentence paragraph entirely duplicated — drop it
                result_paragraphs.append("")
            else:
                kept = [sentences[0]]
                result_paragraphs.append(" ".join(kept))
        else:
            result_paragraphs.append(" ".join(kept))

    return "\n".join(result_paragraphs)


# Patterns for anaphoric sentences that lost their antecedent
_ORPHAN_ANAPHORA_RE = re.compile(
    r'^(?:This is seen in|This is evident in|These have greatly|'
    r'These have also|This has also|This has led to the|'
    r'This is because|This shows that)\b', re.I
)

# Sentences that are pure anaphoric padding even WITH an antecedent
_PURE_PADDING_RE = re.compile(
    r'^(?:This is seen in (?:the |improving |developing ))',
    re.I
)


def _remove_orphan_anaphora(text: str) -> str:
    """Remove sentences starting with anaphoric references ('This is seen in...')
    when the preceding sentence doesn't provide a clear antecedent, or
    when the sentence is pure padding that repeats the antecedent."""
    paragraphs = text.split('\n')
    result = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            result.append('')
            continue
        sents = _split_sentences(para)
        kept: list[str] = []
        for i, s in enumerate(sents):
            stripped = s.strip()
            # Pure padding regardless of context
            if _PURE_PADDING_RE.match(stripped):
                continue
            if _ORPHAN_ANAPHORA_RE.match(stripped):
                if not kept:
                    continue
                prev_words = kept[-1].split()
                if len(prev_words) < 5:
                    continue
            kept.append(s)
        if not kept and sents:
            kept = [sents[0]]
        result.append(' '.join(kept))
    return '\n'.join(result)


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 4: CONNECTOR / STARTER DE-MONOTONY
# ═══════════════════════════════════════════════════════════════════════════

def _dedup_connectors(text: str) -> str:
    """If the same connector/starter appears more than _MAX_STARTER_REPEATS
    times across the text, replace excess occurrences with alternatives."""
    paragraphs = text.split('\n')
    all_sentences: list[tuple[int, int, str]] = []  # (para_idx, sent_idx, text)

    for pi, para in enumerate(paragraphs):
        para = para.strip()
        if not para:
            continue
        for si, sent in enumerate(_split_sentences(para)):
            all_sentences.append((pi, si, sent))

    if not all_sentences:
        return text

    # Count how many times each connector pattern starts a sentence
    starter_usage: dict[str, list[int]] = defaultdict(list)
    sent_lower_starts = []
    for idx, (pi, si, sent) in enumerate(all_sentences):
        low = sent.lower().strip()
        sent_lower_starts.append(low)
        for connector in _CONNECTOR_STARTERS:
            if low.startswith(connector):
                starter_usage[connector].append(idx)
                break

    # Also track first-3-word starters for general dedup
    three_word_starts: dict[str, list[int]] = defaultdict(list)
    for idx, (pi, si, sent) in enumerate(all_sentences):
        words = sent.split()
        if len(words) >= 3:
            key = " ".join(words[:3]).lower().rstrip(",;:")
            three_word_starts[key].append(idx)

    # Replace excess connector starters
    replacements: dict[int, str] = {}
    used_alts: set[str] = set()

    for connector, indices in starter_usage.items():
        if len(indices) <= _MAX_STARTER_REPEATS:
            continue
        alts = _CONNECTOR_STARTERS.get(connector, [])
        for excess_idx in indices[_MAX_STARTER_REPEATS:]:
            pi, si, sent = all_sentences[excess_idx]
            # Pick an alternative not yet used
            available = [a for a in alts if a.lower() not in used_alts]
            if not available:
                available = alts
            if not available:
                continue
            alt = available[0]
            used_alts.add(alt.lower())
            # Replace the connector at sentence start
            pat = re.compile(re.escape(connector), re.I)
            new_sent = pat.sub(alt, sent, count=1)
            # Fix capitalization
            if new_sent and new_sent[0].islower():
                new_sent = new_sent[0].upper() + new_sent[1:]
            replacements[excess_idx] = new_sent

    # Replace excess 3-word starters (same literal opening ≥3 times)
    for key, indices in three_word_starts.items():
        if len(indices) <= _MAX_STARTER_REPEATS:
            continue
        # For generic starters, we just note — connector-specific handling above
        # already covers the worst offenders

    # Rebuild
    if replacements:
        for idx, new_sent in replacements.items():
            pi, si, _ = all_sentences[idx]
            all_sentences[idx] = (pi, si, new_sent)

        # Reassemble paragraphs
        para_sents: dict[int, list[str]] = defaultdict(list)
        for pi, si, sent in all_sentences:
            para_sents[pi].append(sent)

        result_paras = []
        for pi, para in enumerate(paragraphs):
            if pi in para_sents:
                result_paras.append(" ".join(para_sents[pi]))
            else:
                result_paras.append(para.strip())
        return "\n".join(result_paras)

    return text


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 5: WEAK COPULA CHAIN BREAKER
# ═══════════════════════════════════════════════════════════════════════════

def _break_copula_chains(text: str) -> str:
    """If weak copula phrases (is important, is crucial, etc.) appear
    more than 2x in the text, vary them to reduce monotony.
    Preserves subject-verb agreement (singular vs plural)."""
    matches = list(_WEAK_COPULA_RE.finditer(text))
    if len(matches) <= 2:
        return text

    alt_idx_s = 0
    alt_idx_p = 0
    count = 0
    for m in matches:
        count += 1
        if count <= 2:
            continue
        matched = m.group()
        is_plural = matched.lower().startswith(("are ", "were "))
        if is_plural:
            alt = _COPULA_ALTERNATIVES_PLURAL[alt_idx_p % len(_COPULA_ALTERNATIVES_PLURAL)]
            alt_idx_p += 1
        else:
            alt = _COPULA_ALTERNATIVES_SINGULAR[alt_idx_s % len(_COPULA_ALTERNATIVES_SINGULAR)]
            alt_idx_s += 1
        text = text.replace(matched, alt, 1)

    return text


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 6: FINAL SURFACE CLEANUP
# ═══════════════════════════════════════════════════════════════════════════

def _final_surface_cleanup(text: str) -> str:
    """Fix artifacts introduced by earlier phases."""
    # Double spaces
    text = re.sub(r'  +', ' ', text)
    # Space before punctuation
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)
    # Double punctuation
    text = re.sub(r'([.,;:])\s*([.,;:])', r'\1', text)
    # Orphaned commas at sentence start
    text = re.sub(r'(?<=[.!?]\s),\s*', '', text)
    # Empty parentheses
    text = re.sub(r'\(\s*\)', '', text)
    # Sentences starting lowercase after period
    text = re.sub(
        r'(?<=[.!?]\s)([a-z])',
        lambda m: m.group(1).upper(),
        text,
    )
    # Repeated words across word boundary
    text = re.sub(r'\b(\w+)\s+\1\b', r'\1', text, flags=re.I)
    # Trim whitespace around newlines
    text = re.sub(r' *\n *', '\n', text)
    # Collapse 3+ newlines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)

    # Fix sentences that became too short (< 3 words) after dedup removal
    lines = text.split('\n')
    result_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            result_lines.append('')
            continue
        sents = _split_sentences(line)
        kept = []
        for s in sents:
            s = s.strip()
            if not s:
                continue
            # Drop fragment sentences under 3 words
            if len(s.split()) < 3 and not s.endswith('?'):
                continue
            # Ensure proper ending
            if s and s[-1] not in '.!?':
                s += '.'
            kept.append(s)
        result_lines.append(' '.join(kept))

    return '\n'.join(result_lines)


# ═══════════════════════════════════════════════════════════════════════════
#  PHASE 7: CIRCULAR CONCLUSION DETECTOR
# ═══════════════════════════════════════════════════════════════════════════

def _flag_circular_conclusion(text: str) -> str:
    """If the last paragraph is >65% similar to the first,
    trim redundant sentences from the conclusion.
    Always keeps at least one conclusion sentence."""
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    if len(paragraphs) < 3:
        return text

    first_para = paragraphs[0]
    last_para = paragraphs[-1]

    sim = _sentence_similarity(first_para, last_para)
    if sim < 0.50:
        return text

    # The conclusion is too similar to the intro — trim duplicate sentences
    intro_sents = _split_sentences(first_para)
    concl_sents = _split_sentences(last_para)

    kept_concl = []
    for cs in concl_sents:
        is_dup = False
        for isent in intro_sents:
            if _sentence_similarity(cs, isent) >= 0.60:
                is_dup = True
                break
        if not is_dup:
            kept_concl.append(cs)

    # Always keep at least one sentence in the conclusion
    if kept_concl:
        paragraphs[-1] = " ".join(kept_concl)
    # If ALL conclusion sentences duplicated the intro, keep original
    # to avoid empty paragraph

    return '\n'.join(paragraphs)


# ═══════════════════════════════════════════════════════════════════════════
#  MASTER POST-PROCESS ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

def post_process(text: str) -> str:
    """Run all post-processing phases on humanized text.
    
    This is the single entry point — call it on ANY humanizer output
    before returning to the user.
    
    Phase order:
      1. Filler/padding cleanup (deterministic)
      2. Phrase-level repetition reduction
      3. Sentence-level near-duplicate removal
      4. Connector/starter de-monotony
      5. Weak copula chain breaking
      6. Circular conclusion trimming
      7. Final surface cleanup
    """
    if not text or not text.strip():
        return text

    text = _clean_fillers(text)
    text = _reduce_phrase_repetition(text)
    text = _remove_near_duplicate_sentences(text)
    text = _remove_orphan_anaphora(text)
    text = _dedup_connectors(text)
    text = _break_copula_chains(text)
    text = _flag_circular_conclusion(text)
    text = _final_surface_cleanup(text)

    return text.strip()
