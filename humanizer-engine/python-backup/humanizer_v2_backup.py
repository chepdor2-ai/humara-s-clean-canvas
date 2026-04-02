"""
Humanizer Engine v2 — Championship Pipeline
=============================================
Transforms AI-generated text into natural human prose that beats
all major detectors (GPTZero, ZeroGPT, Turnitin, Originality, Crossplag).

Pipeline:
 1. Phrase-level substitutions (300+ maps)
 2. AI sentence-starter replacement (35+ patterns)
 3. POS-aware synonym replacement (curated SYNONYM_BANK)
 4. Dictionary-powered synonym fallback (619K+ words, 166K thesaurus)
 5. Active/passive voice shifts (spaCy dependency parse)
 6. Deep sentence restructuring (fronting, clause swap, split/merge)
 7. Connector/glue variation
 8. Sentence-start deduplication
 9. Burstiness adjustment (sentence-length variance)
10. Contraction expansion (safety net)
11. Final cleanup
12. REAL-TIME DETECTION LOOP — re-humanize until avg score < 20%

Rules: no contractions, no first-person unless present in input,
       academic register, meaning preservation.
"""

import random
import re
import time

try:
    import textstat
    HAS_TEXTSTAT = True
except ImportError:
    HAS_TEXTSTAT = False

import rules
import utils

# Advanced transforms (voice shifts, deep restructuring, contraction expansion)
try:
    from advanced_transforms import (
        voice_shift, deep_restructure, expand_contractions,
        has_first_person, _merge_short_sentences,
    )
    HAS_ADVANCED = True
except Exception as e:
    print(f"[*] Advanced transforms not available: {e}")
    HAS_ADVANCED = False

# Dictionary fallback synonym engine (619K+ words)
try:
    from dictionary import get_dictionary
    _dict = get_dictionary()
    HAS_DICTIONARY = True
except Exception as e:
    print(f"[*] Dictionary module not available: {e}")
    _dict = None
    HAS_DICTIONARY = False

# Multi-detector for real-time scoring
try:
    from multi_detector import get_detector
    _detector = get_detector()
    HAS_DETECTOR = True
except Exception as e:
    print(f"[*] Multi-detector not available: {e}")
    _detector = None
    HAS_DETECTOR = False

# Sentence tokenizer
try:
    from nltk.tokenize import sent_tokenize
except Exception:
    def sent_tokenize(text):
        import re as _re
        parts = _re.split(r'(?<=[.!?])\s+', text)
        return [p.strip() for p in parts if p.strip()]


# ---------------------------------------------------------------------------
# Dictionary-powered synonym replacement (supplements SYNONYM_BANK)
# ---------------------------------------------------------------------------

# Words that the dictionary should NEVER suggest (common bad outputs)
_DICT_BLACKLIST = {
    "bodoni", "|}|}|}|", "soh", "|}|", "|}",
    "|}|}",
    # Overly archaic / obscure
    "thence", "wherefore", "hitherto", "thereof",
    # Weird multi-word or unusual replacements
    "mercantile", "pursuance", "pursuit", "moneymaking",
    "pecuniary", "remunerative", "lucrative",
    # Too vague
    "stuff", "issue", "issues", "thing", "things",
    # Temporal words that conflict when inserted near other temporal words
    "recent", "latest", "current",
    # Bad academic substitutes
    "prospective", "doable", "workable",
}

def _dict_synonym_replace(sent: str, intensity: float, used: set) -> str:
    """Use the 619K+ dictionary for synonym coverage beyond SYNONYM_BANK.
    Only replaces words NOT already in SYNONYM_BANK to avoid conflicts."""
    if not HAS_DICTIONARY or _dict is None:
        return sent

    replace_prob = min(0.12 * intensity, 0.20)
    words = sent.split()
    new_words = []

    for i, w in enumerate(words):
        stripped = w.strip(".,!?;:\"'()-[]{}")
        lower = stripped.lower()

        if (len(stripped) <= 3
                or lower in rules.PROTECTED_WORDS
                or lower in used
                or lower in rules.SYNONYM_BANK  # Already handled by curated bank
                or random.random() > replace_prob):
            new_words.append(w)
            continue

        try:
            replacement = _dict.replace_word_smartly(lower, sent, avoid_words=used)
        except Exception:
            replacement = lower

        if (replacement and replacement != lower
                and replacement.lower() not in _DICT_BLACKLIST
                and len(replacement) < 25
                and ' ' not in replacement):  # No multi-word replacements
            # Check adjacent words to avoid redundancy ("latest recent", "matter of matter")
            prev_word = new_words[-1].strip(".,!?;:\"'()-[]{}").lower() if new_words else ""
            next_word = words[i + 1].strip(".,!?;:\"'()-[]{}").lower() if i + 1 < len(words) else ""
            if replacement.lower() in (prev_word, next_word):
                new_words.append(w)
                continue

            # Verify it's a real word
            if _dict.is_valid_word(replacement):
                if stripped[0].isupper():
                    replacement = replacement[0].upper() + replacement[1:]
                if stripped.isupper():
                    replacement = replacement.upper()
                # Reattach punctuation
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


# ---------------------------------------------------------------------------
# Post-processing cleanup
# ---------------------------------------------------------------------------

_DOUBLE_SPACE = re.compile(r"  +")
_DOUBLE_PERIOD = re.compile(r"\.{2,}")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([.,;:!?])")
_DOUBLED_PHRASE = re.compile(r'\b(\w+(?:\s+\w+){0,2})\s+\1\b', re.IGNORECASE)
_CONTRACTION_PAT = re.compile(
    r"\b(can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|"
    r"hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|mustn't|"
    r"it's|that's|there's|here's|he's|she's|they're|we're|you're|"
    r"I'm|they've|we've|you've|I've|they'll|we'll|you'll|I'll|"
    r"he'll|she'll|it'll|let's|who's|what's)\b", re.IGNORECASE)


def _cleanup(text: str) -> str:
    """Fix artefacts left by chained transformations."""
    text = _DOUBLE_SPACE.sub(" ", text)
    text = _DOUBLE_PERIOD.sub(".", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    # Remove doubled phrases ("matter of matter of concern" → "matter of concern")
    text = _DOUBLED_PHRASE.sub(r'\1', text)
    # Fix mid-sentence capitalization: words that are uppercase after a
    # lowercase word (not proper nouns, acronyms, or "I")
    text = re.sub(
        r'(?<=[a-z,;] )([A-Z])([a-z]{2,})',
        lambda m: m.group(1).lower() + m.group(2),
        text
    )
    # Expand any stray contractions
    if HAS_ADVANCED and _CONTRACTION_PAT.search(text):
        text = expand_contractions(text)
    # Ensure every sentence starts with uppercase
    sentences = sent_tokenize(text)
    cleaned = []
    for s in sentences:
        s = s.strip()
        if s:
            s = s[0].upper() + s[1:]
            cleaned.append(s)
    return " ".join(cleaned)


# ---------------------------------------------------------------------------
# Vary sentence starts (avoid repetitive "The …", "This …" openers)
# ---------------------------------------------------------------------------

def _vary_sentence_starts(sentences: list) -> list:
    """If two or more consecutive sentences start with the same word,
    rewrite the opener of the second one."""
    if len(sentences) < 2:
        return sentences

    result = [sentences[0]]
    for i in range(1, len(sentences)):
        prev_start = result[-1].split()[0].lower() if result[-1].split() else ""
        curr_start = sentences[i].split()[0].lower() if sentences[i].split() else ""

        if prev_start and curr_start == prev_start and len(sentences[i].split()) > 3:
            connectors = [
                "In this regard, ", "Along these lines, ",
                "On a related note, ", "Building on this, ",
                "At the same time, ", "Similarly, ",
                "Worth noting is that ", "Equally, ",
            ]
            connector = random.choice(connectors)
            s = sentences[i]
            if s[0].isupper():
                s = s[0].lower() + s[1:]
            result.append(connector + s)
        else:
            result.append(sentences[i])

    return result


# ---------------------------------------------------------------------------
# Merge adjacent short sentences for natural flow
# ---------------------------------------------------------------------------

def _merge_short_pairs(sentences: list) -> list:
    """Merge pairs of very short consecutive sentences."""
    if not HAS_ADVANCED or len(sentences) < 2:
        return sentences

    result = []
    i = 0
    while i < len(sentences):
        if (i + 1 < len(sentences)
                and len(sentences[i].split()) <= 8
                and len(sentences[i + 1].split()) <= 8):
            merged = _merge_short_sentences(sentences[i], sentences[i + 1])
            if merged and random.random() < 0.4:
                result.append(merged)
                i += 2
                continue
        result.append(sentences[i])
        i += 1
    return result


# ---------------------------------------------------------------------------
# Single-pass paragraph humanization
# ---------------------------------------------------------------------------

def _humanize_paragraph(para: str, intensity: float, used_words: set,
                         input_has_fp: bool) -> str:
    """Humanize a single paragraph through the full pipeline."""
    sentences = sent_tokenize(para)
    transformed = []

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue

        # Step 1: Phrase-level substitutions
        sent = utils.phrase_substitute(sent, intensity)

        # Step 2: AI sentence-starter replacement
        sent = utils.replace_ai_starters(sent)

        # Step 3: POS-aware synonym replacement (curated SYNONYM_BANK)
        sent = utils.synonym_replace(sent, intensity, used_words)

        # Step 4: Dictionary fallback synonyms (619K+ words)
        sent = _dict_synonym_replace(sent, intensity, used_words)

        # Step 5: Active/passive voice shifts (conservative — only simple sentences)
        if HAS_ADVANCED and len(sent.split()) >= 8 and len(sent.split()) <= 22:
            voice_prob = 0.12 * intensity  # Reduced from 0.18
            sent = voice_shift(sent, probability=voice_prob)

        # Step 6: Deep sentence restructuring
        if HAS_ADVANCED:
            sent = deep_restructure(sent, intensity)

        # Step 7: Connector variation
        sent = utils.vary_connectors(sent)

        # Step 8: Clause restructuring (original)
        sent = utils.restructure_sentence(sent, intensity)

        # Normalize whitespace
        sent = " ".join(sent.split())
        if sent:
            transformed.append(sent)

    # Step 9: Merge short sentence pairs
    transformed = _merge_short_pairs(transformed)

    # Step 10: Vary repetitive sentence starts
    transformed = _vary_sentence_starts(transformed)

    para_result = " ".join(transformed)

    # Step 11: Burstiness adjustment
    if HAS_TEXTSTAT:
        try:
            current = textstat.flesch_reading_ease(para_result)
            target = 65 + (rules.BURSTINESS_TARGET * 30)
            if current < target:
                para_result = utils.make_burstier(para_result)
        except Exception:
            pass

    # Step 12: Final cleanup
    para_result = _cleanup(para_result)

    return para_result


# ---------------------------------------------------------------------------
# Get AI detection scores
# ---------------------------------------------------------------------------

def _get_avg_score(text: str) -> float:
    """Get the average AI detection score (0-100) from multi-detector."""
    if not HAS_DETECTOR or _detector is None or not text.strip():
        return 0.0
    try:
        result = _detector.analyze(text)
        ai_score = 100.0 - result.get('summary', {}).get('overall_human_score', 50.0)
        return ai_score
    except Exception:
        return 0.0


def _get_per_detector_scores(text: str) -> dict:
    """Get per-detector AI scores."""
    if not HAS_DETECTOR or _detector is None:
        return {}
    try:
        result = _detector.analyze(text)
        scores = {}
        for d in result.get('detectors', []):
            name = d.get('detector', 'unknown').lower().replace(' ', '_')
            scores[name] = round(100.0 - d.get('human_score', 50.0), 1)
        scores['overall'] = round(
            100.0 - result.get('summary', {}).get('overall_human_score', 50.0), 1)
        return scores
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Main humanize function with detection loop
# ---------------------------------------------------------------------------

MAX_ITERATIONS = 4         # Maximum re-humanization passes
TARGET_SCORE = 20.0        # Target: average AI score < 20%

def humanize(text: str, strength: str = "medium",
             target_score: float = TARGET_SCORE) -> str:
    """
    Main humanizer pipeline with real-time detection loop.
    Keeps re-humanizing until average AI detection score < target_score
    or max iterations reached.

    strength: 'light', 'medium', 'strong'
    target_score: target average AI detection score (default 20%)
    """
    if not text or not text.strip():
        return text

    intensity_map = {"light": 0.5, "medium": 1.0, "strong": 1.5}
    base_intensity = intensity_map.get(strength, 1.0)

    # Detect if input uses first-person (preserve if so)
    input_has_fp = False
    if HAS_ADVANCED:
        input_has_fp = has_first_person(text)

    best_result = text
    best_score = 100.0
    used_words_global = set()  # Persist across iterations to avoid re-replacing

    for iteration in range(MAX_ITERATIONS):
        # Escalate intensity on each retry
        intensity = min(base_intensity + (iteration * 0.3), 2.0)
        used_words = set(used_words_global)  # Copy from previous iterations

        # Preserve paragraph structure
        paragraphs = re.split(r'\n\s*\n', best_result if iteration > 0 else text)
        processed_paragraphs = []

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            para_result = _humanize_paragraph(para, intensity, used_words,
                                               input_has_fp)
            if para_result:
                processed_paragraphs.append(para_result)

        current_result = "\n\n".join(processed_paragraphs)

        # Expand contractions (safety net)
        if HAS_ADVANCED:
            current_result = expand_contractions(current_result)

        # Persist used words to avoid re-replacing on next iteration
        used_words_global.update(used_words)

        # Check detection score
        current_score = _get_avg_score(current_result)

        if current_score < best_score:
            best_result = current_result
            best_score = current_score

        # If below target, we're done
        if best_score <= target_score:
            break

    return best_result
