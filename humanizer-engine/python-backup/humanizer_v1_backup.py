"""
Humanizer Engine — Main Pipeline
Transforms AI-generated academic text into natural academic prose via
phrase substitution, POS-aware synonym replacement, sentence restructuring,
AI-starter replacement, and burstiness adjustment.
No contractions. No first-person. No casual language. Academic register only.
"""

import random
import re

try:
    import textstat
    HAS_TEXTSTAT = True
except ImportError:
    HAS_TEXTSTAT = False

import rules
import utils

# Optional dictionary-powered synonym replacement (supplements SYNONYM_BANK)
try:
    from dictionary import get_dictionary
    _dict = get_dictionary()
    HAS_DICTIONARY = True
except Exception as e:
    print(f"[*] Dictionary module not available: {e}")
    _dict = None
    HAS_DICTIONARY = False

# Sentence tokenizer
try:
    from nltk.tokenize import sent_tokenize
except Exception:
    def sent_tokenize(text):
        import re as _re
        parts = _re.split(r'(?<=[.!?])\s+', text)
        return [p.strip() for p in parts if p.strip()]


# ---------------------------------------------------------------------------
# Dictionary fallback — single-word synonyms via WordNet dictionary
# ---------------------------------------------------------------------------

def _dict_synonym_replace(sent: str, intensity: float, used: set) -> str:
    """Use dictionary module for additional synonym coverage beyond SYNONYM_BANK."""
    if not HAS_DICTIONARY or _dict is None:
        return sent

    replace_prob = min(0.05 * intensity, 0.10)
    words = sent.split()
    new_words = []

    for w in words:
        stripped = w.strip(".,!?;:\"'()-[]{}")
        lower = stripped.lower()

        if (len(stripped) <= 3
                or lower in rules.PROTECTED_WORDS
                or lower in used
                or random.random() > replace_prob):
            new_words.append(w)
            continue

        # Only try dictionary if SYNONYM_BANK didn't already cover this word
        if lower in rules.SYNONYM_BANK:
            new_words.append(w)
            continue

        try:
            replacement = _dict.replace_word_smartly(lower, sent, avoid_words=used)
        except Exception:
            replacement = lower

        if replacement and replacement != lower:
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

    return " ".join(new_words)


# ---------------------------------------------------------------------------
# Post-processing cleanup
# ---------------------------------------------------------------------------

_DOUBLE_SPACE = re.compile(r"  +")
_DOUBLE_PERIOD = re.compile(r"\.{2,}")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([.,;:!?])")


def _cleanup(text: str) -> str:
    """Fix artefacts left by chained transformations."""
    text = _DOUBLE_SPACE.sub(" ", text)
    text = _DOUBLE_PERIOD.sub(".", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
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
            # Prepend a varied connector
            connectors = ["In this regard, ", "Along these lines, ",
                          "On a related note, ", "Building on this, ",
                          "At the same time, "]
            connector = random.choice(connectors)
            s = sentences[i]
            # Lowercase original start since connector now leads
            if s[0].isupper():
                s = s[0].lower() + s[1:]
            result.append(connector + s)
        else:
            result.append(sentences[i])

    return result


# ---------------------------------------------------------------------------
# Main humanize function
# ---------------------------------------------------------------------------

def humanize(text: str, strength: str = "medium") -> str:
    """
    Main humanizer pipeline.
    Transforms AI-generated academic text via rule-based + NLP operations.
    strength: 'light', 'medium', 'strong'
    """
    if not text or not text.strip():
        return text

    intensity = {"light": 0.5, "medium": 1.0, "strong": 1.5}.get(strength, 1.0)

    # Global tracking of used synonyms to avoid repetition across sentences
    used_words = set()

    # Preserve paragraph structure — split on double newlines
    paragraphs = re.split(r'\n\s*\n', text)
    processed_paragraphs = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # Split into sentences
        sentences = sent_tokenize(para)
        transformed = []

        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue

            # --- Step 1: Phrase-level substitutions (longest-match, 200+ maps) ---
            sent = utils.phrase_substitute(sent, intensity)

            # --- Step 2: Replace AI sentence starters ---
            sent = utils.replace_ai_starters(sent)

            # --- Step 3: POS-aware synonym replacement (SYNONYM_BANK) ---
            sent = utils.synonym_replace(sent, intensity, used_words)

            # --- Step 4: Dictionary fallback synonyms (disabled — curated bank is safer)
            # sent = _dict_synonym_replace(sent, intensity, used_words)

            # --- Step 5: Connector variation ---
            sent = utils.vary_connectors(sent)

            # --- Step 6: Clause restructuring (probabilistic) ---
            sent = utils.restructure_sentence(sent, intensity)

            # Normalize whitespace
            sent = " ".join(sent.split())
            if sent:
                transformed.append(sent)

        # --- Step 7: Vary repetitive sentence starts ---
        transformed = _vary_sentence_starts(transformed)

        para_result = " ".join(transformed)

        # --- Step 8: Burstiness adjustment ---
        if HAS_TEXTSTAT:
            try:
                current = textstat.flesch_reading_ease(para_result)
                target = 65 + (rules.BURSTINESS_TARGET * 30)
                if current < target:
                    para_result = utils.make_burstier(para_result)
            except Exception:
                pass

        # --- Step 9: Final cleanup ---
        para_result = _cleanup(para_result)

        if para_result:
            processed_paragraphs.append(para_result)

    return "\n\n".join(processed_paragraphs)

