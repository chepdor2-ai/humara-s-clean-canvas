"""
Humanizer Engine — NLP Utilities
Sentence-level transforms: synonym replacement (POS-aware), phrase substitution,
clause reordering, sentence restructuring. All maintaining academic register.
"""
import random
import re
import rules

# ---------------------------------------------------------------------------
# Safe imports
# ---------------------------------------------------------------------------
try:
    from nltk.tokenize import sent_tokenize, word_tokenize
    from nltk import pos_tag
except Exception as e:
    print(f"[*] nltk not fully available: {e}")
    def sent_tokenize(text):
        import re as _re
        parts = _re.split(r'(?<=[.!?])\s+', text)
        return [p.strip() for p in parts if p.strip()]
    def word_tokenize(text):
        return text.split()
    def pos_tag(tokens):
        return [(t, "NN") for t in tokens]

try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except Exception as e:
    print(f"[*] spaCy not available: {e}")
    nlp = None

# ---------------------------------------------------------------------------
# Protection helpers
# ---------------------------------------------------------------------------
_CITATION_RE = re.compile(r'\([A-Z][a-z]+.*?,\s*\d{4}\)')
_ACRONYM_RE = re.compile(r'\b[A-Z]{2,}\b')
_YEAR_RE = re.compile(r'\b(1[89]\d{2}|20[0-3]\d)\b')


def _find_protected_spans(text: str):
    """Return set of (start, end) character spans that must not be modified."""
    spans = []
    for pat in [_CITATION_RE, _ACRONYM_RE, _YEAR_RE]:
        for m in pat.finditer(text):
            spans.append((m.start(), m.end()))
    return spans


def _is_in_protected(pos, spans):
    """Check whether character position falls inside a protected span."""
    for s, e in spans:
        if s <= pos < e:
            return True
    return False


def _re_inflect(word: str, suffix: str) -> str:
    """Add an inflectional suffix to a base word with basic English rules."""
    # Should we double the final consonant? Only for short CVC words
    # (run→running, cut→cutting, stop→stopping, but NOT lower→lowering)
    def _should_double(w):
        if len(w) < 3 or len(w) > 4:
            return False
        return (w[-1] not in "aeiouywx"
                and w[-2] in "aeiou"
                and w[-3] not in "aeiou")

    if suffix == "s":
        if word.endswith(("s", "sh", "ch", "x", "z")):
            return word + "es"
        if word.endswith("y") and len(word) > 1 and word[-2] not in "aeiou":
            return word[:-1] + "ies"
        return word + "s"
    if suffix == "ed":
        if word.endswith("e"):
            return word + "d"
        if word.endswith("y") and len(word) > 1 and word[-2] not in "aeiou":
            return word[:-1] + "ied"
        if _should_double(word):
            return word + word[-1] + "ed"
        return word + "ed"
    if suffix == "ing":
        if word.endswith("e") and not word.endswith("ee"):
            return word[:-1] + "ing"
        if word.endswith("ie"):
            return word[:-2] + "ying"
        if _should_double(word):
            return word + word[-1] + "ing"
        return word + "ing"
    return word + suffix
    return word + suffix


# ---------------------------------------------------------------------------
# Word validity check for re-inflections
# ---------------------------------------------------------------------------
_real_word_cache = {}

def _is_real_word(word: str) -> bool:
    """Check if a word is a real English word (for validating re-inflections)."""
    if word in _real_word_cache:
        return _real_word_cache[word]
    try:
        from dictionary import get_dictionary
        d = get_dictionary()
        result = d.is_valid_word(word)
    except Exception:
        # Fallback: check WordNet
        try:
            from nltk.corpus import wordnet as wn
            result = bool(wn.synsets(word))
        except Exception:
            result = True  # If we can't check, allow it
    _real_word_cache[word] = result
    return result


# ---------------------------------------------------------------------------
# Synonym replacement (POS-aware)
# ---------------------------------------------------------------------------

# Map NLTK POS prefixes to target categories in SYNONYM_BANK
_POS_MAP = {
    "JJ": "adj", "JJR": "adj", "JJS": "adj",
    "NN": "noun", "NNS": "noun", "NNP": "noun", "NNPS": "noun",
    "VB": "verb", "VBD": "verb", "VBG": "verb", "VBN": "verb",
    "VBP": "verb", "VBZ": "verb",
    "RB": "adv", "RBR": "adv", "RBS": "adv",
}


def synonym_replace(sent: str, intensity: float = 1.0, used: set = None,
                     protected_extra: set = None) -> str:
    """Replace eligible words with academic synonyms from SYNONYM_BANK.
    Respects POS, avoids protected words/spans, and tracks used words.
    protected_extra: additional set of lowercase words to never replace
    (e.g. domain terms from context analysis)."""
    if used is None:
        used = set()
    _protected_ctx = protected_extra or set()

    protected_spans = _find_protected_spans(sent)
    # Also protect parenthetical asides and dash-asides (hedge injections)
    for m in re.finditer(r'—[^—]+—|\([^)]+\)', sent):
        protected_spans.append((m.start(), m.end()))
    # Protect comma-style hedge phrases (e.g. ", in practice,")
    for m in re.finditer(
        r',\s+(?:in practice|admittedly|it seems|to some extent|'
        r'rightly or wrongly|at least partly|in most cases|to be fair|'
        r'to a degree|on the whole|broadly speaking|in theory|'
        r'for the most part),',
        sent, re.IGNORECASE):
        protected_spans.append((m.start(), m.end()))
    replace_prob = min(0.03 * intensity, 0.80)

    tokens = word_tokenize(sent)
    tagged = pos_tag(tokens)

    # Build a set of words currently in the sentence — used to avoid
    # replacing word A with word B when B is already in the sentence.
    # This is a LOCAL check set, NOT added to the shared `used` set
    # (which tracks REPLACEMENT outputs across all transforms).
    _sent_words = {w.lower() for w, _ in tagged}

    new_tokens = []
    char_offset = 0
    replaced_indices = set()  # Track which indices were replaced
    for i, (word, tag) in enumerate(tagged):
        lower = word.lower()
        # locate position in original string for protection check
        idx = sent.find(word, char_offset)
        if idx >= 0:
            char_offset = idx + len(word)

        # Skip punctuation tokens entirely — they'll be reattached
        if word in (".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "\"", "'", "-", "--"):
            new_tokens.append(word)
            continue

        # Skip conditions (also check stem forms for used-word drift prevention)
        _lower_stem = lower.rstrip("s").rstrip("es") if len(lower) > 4 else lower
        if (lower in rules.PROTECTED_WORDS
                or lower in _protected_ctx
                or lower in used or _lower_stem in used  # prevent word drift
                or len(word) <= 2
                or _is_in_protected(idx, protected_spans)
                or word[0].isupper() and tag not in ("JJ", "JJR", "JJS",
                                                      "RB", "RBR", "RBS")
                or random.random() > replace_prob):
            new_tokens.append(word)
            continue

        # Look up in SYNONYM_BANK (try exact form, then common inflection stripping)
        candidates = rules.SYNONYM_BANK.get(lower, [])
        _lemma_used = False
        if not candidates:
            # Try stripping common suffixes to find base form
            _base = lower
            for suffix, replacement in [
                ("ies", "y"), ("ves", "fe"), ("ses", "se"), ("es", "e"),
                ("es", ""), ("s", ""), ("ing", ""), ("ing", "e"),
                ("ed", ""), ("ed", "e"), ("tion", "te"), ("ly", ""),
            ]:
                if lower.endswith(suffix) and len(lower) > len(suffix) + 2:
                    _base = lower[:-len(suffix)] + replacement
                    candidates = rules.SYNONYM_BANK.get(_base, [])
                    if candidates:
                        _lemma_used = True
                        break
        # Filter to single-word replacements only (multi-word belong in PHRASE_SUBSTITUTIONS)
        candidates = [c for c in candidates if ' ' not in c]
        if not candidates:
            new_tokens.append(word)
            continue

        # Filter out already-used replacements and words already in this sentence
        available = [c for c in candidates
                     if c.lower() not in used and c.lower() not in _sent_words]
        if not available:
            available = [c for c in candidates if c.lower() not in _sent_words]
        if not available:
            available = candidates  # allow reuse if all exhausted

        # Filter out candidates that match adjacent words (avoid "latest recent")
        prev_word = new_tokens[-1].lower() if new_tokens and new_tokens[-1] not in (".", ",", ";", ":", "!", "?") else ""
        next_word = tagged[i + 1][0].lower() if i + 1 < len(tagged) else ""
        available = [c for c in available
                     if c.lower() != prev_word and c.lower() != next_word]
        if not available:
            new_tokens.append(word)
            continue

        replacement = random.choice(available)
        used.add(replacement.lower())

        # Re-inflect if we found via lemma stripping
        if _lemma_used and replacement:
            original_replacement = replacement
            if lower.endswith("ing") and not replacement.endswith("ing"):
                replacement = _re_inflect(replacement, "ing")
            elif lower.endswith("ed") and not replacement.endswith("ed"):
                replacement = _re_inflect(replacement, "ed")
            elif lower.endswith("s") and not replacement.endswith("s"):
                replacement = _re_inflect(replacement, "s")
            elif lower.endswith("ly") and not replacement.endswith("ly"):
                replacement = replacement + "ly"
            # Validate: reject nonsense re-inflections (noun stems + verb suffix)
            _rinf = replacement.lower()
            _NOUN_SUFFIXES = ("tion", "sion", "ment", "ness", "ance", "ence",
                              "ity", "ism", "ist", "ant", "ent")
            if (original_replacement.lower().endswith(_NOUN_SUFFIXES)
                    and _rinf.endswith(("ing", "ed"))):
                new_tokens.append(word)
                continue
            # Validate: re-inflected form must be a real word
            if not _is_real_word(_rinf):
                new_tokens.append(word)
                continue
            # Protect the inflected form in used to prevent re-replacement
            used.add(replacement.lower())

        # Preserve casing
        if word[0].isupper():
            replacement = replacement[0].upper() + replacement[1:]
        if word.isupper():
            replacement = replacement.upper()

        new_tokens.append(replacement)

    # Reassemble with proper punctuation attachment
    result = _rejoin_tokens(new_tokens)
    return result


def _rejoin_tokens(tokens):
    """Rejoin word_tokenize tokens fixing space-before-punctuation issues."""
    if not tokens:
        return ""
    result = tokens[0]
    no_space_before = {".", ",", ";", ":", "!", "?", ")", "]", "}", "'", "''", "n't", "'s", "'re", "'ve", "'ll", "'d", "'m"}
    no_space_after = {"(", "[", "{", "``", "$"}
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok in no_space_before or tok.startswith("'"):
            result += tok
        elif tokens[i-1] in no_space_after:
            result += tok
        else:
            result += " " + tok
    return result


# ---------------------------------------------------------------------------
# Phrase-level substitution
# ---------------------------------------------------------------------------

def phrase_substitute(sent: str, intensity: float = 1.0) -> str:
    """Apply the comprehensive PHRASE_SUBSTITUTIONS map.
    Matches are case-insensitive; replacements maintain sentence casing."""
    if random.random() > rules.PHRASE_RATE * intensity:
        return sent

    protected_spans = _find_protected_spans(sent)
    lower_sent = sent.lower()

    # Sort phrases by length (longest first) to avoid partial matches
    sorted_phrases = sorted(rules.PHRASE_SUBSTITUTIONS.keys(),
                            key=len, reverse=True)

    for phrase in sorted_phrases:
        phrase_lower = phrase.lower()
        idx = lower_sent.find(phrase_lower)
        if idx == -1:
            continue
        # Skip if inside a citation or protected span
        if _is_in_protected(idx, protected_spans):
            continue

        # Skip if the phrase is preceded by an auxiliary verb — replacing
        # "played a crucial role" inside "have played a crucial role"
        # with "was instrumental" would produce "have was instrumental".
        before_phrase = sent[:idx].rstrip()
        _prev_word = before_phrase.split()[-1].lower() if before_phrase.split() else ""
        _AUX_VERBS = {"have", "has", "had", "will", "would", "could", "should",
                      "must", "can", "may", "might", "shall", "been", "be"}
        if _prev_word in _AUX_VERBS:
            continue

        replacement = random.choice(rules.PHRASE_SUBSTITUTIONS[phrase])

        # Preserve capitalisation of first char
        original_segment = sent[idx:idx + len(phrase)]
        if original_segment and original_segment[0].isupper():
            replacement = replacement[0].upper() + replacement[1:]
        elif original_segment and original_segment[0].islower():
            replacement = replacement[0].lower() + replacement[1:]

        # Avoid double articles: if preceding word is "a"/"an"/"the"
        # and replacement starts with the same article, strip it
        before = sent[:idx].rstrip()
        if before:
            last_word = before.split()[-1].lower() if before.split() else ""
            repl_first = replacement.split()[0].lower() if replacement.split() else ""
            if last_word in ("a", "an", "the") and repl_first in ("a", "an", "the"):
                replacement = " ".join(replacement.split()[1:])

        sent = sent[:idx] + replacement + sent[idx + len(phrase):]
        # Rebuild lowercase version for next match
        lower_sent = sent.lower()

    return sent


# ---------------------------------------------------------------------------
# AI starter replacement
# ---------------------------------------------------------------------------

def replace_ai_starters(sent: str) -> str:
    """Replace common AI-generated sentence starters with natural alternatives."""
    lower = sent.lower().lstrip()
    for pattern, replacements in rules.AI_STARTER_REPLACEMENTS.items():
        pat_lower = pattern.lower()
        if lower.startswith(pat_lower):
            replacement = random.choice(replacements)
            # Remove the matched starter and prepend the replacement
            rest = sent.lstrip()[len(pattern):]
            # If the rest starts lowercase, keep it; if uppercase first word,
            # lowercase it since our replacement already starts the sentence —
            # but preserve ALL-CAPS acronyms (e.g. "AI").
            if rest and rest[0].isupper():
                _first_word_rest = rest.split()[0] if rest.split() else ""
                if not (_first_word_rest.isupper() and len(_first_word_rest) > 1):
                    rest = rest[0].lower() + rest[1:]
            sent = replacement + rest
            break
    return sent


# ---------------------------------------------------------------------------
# Sentence restructuring — clause reordering
# ---------------------------------------------------------------------------

def restructure_sentence(sent: str, intensity: float = 1.0) -> str:
    """Attempt to restructure by reordering independent clauses around comma
    conjunctions. Only fires probabilistically and only on safe patterns."""
    if random.random() > rules.RESTRUCTURE_RATE * intensity:
        return sent
    if len(sent.split()) < 8:
        return sent
    # Don't restructure sentences with citations — too risky
    if _CITATION_RE.search(sent):
        return sent

    # Pattern: "X, [connector] Y" → "Y. X."
    # Only apply to connectors where both parts can be independent clauses
    # Avoid ", which " — second part is a relative clause (no subject)
    connectors = [", leading to ", ", thereby ", ", thus ",
                  ", resulting in "]
    for conn in connectors:
        if conn in sent:
            parts = sent.split(conn, 1)
            if len(parts) == 2 and len(parts[1].split()) >= 4:
                p1 = parts[0].strip().rstrip(".")
                p2 = parts[1].strip().rstrip(".")
                # Capitalize p2 as new sentence start
                p2 = p2[0].upper() + p2[1:] if p2 else p2
                sent = f"{p2}. {p1}."
                break

    return sent


# ---------------------------------------------------------------------------
# Connector / glue variation
# ---------------------------------------------------------------------------

def vary_connectors(sent: str) -> str:
    """Swap repetitive mid-sentence connectors for variety."""
    swaps = {
        "and as a result": "and because of this",
        "as a result of which": "which led to",
        "due to this": "because of this",
        "on the other hand": "conversely",
        "at the same time": "simultaneously",
        "for this reason": "because of this",
        "in addition to this": "besides this",
        "as well as": "along with",
    }
    lower = sent.lower()
    for old, new in swaps.items():
        if old in lower:
            # Case-insensitive replace preserving first-char case
            idx = lower.find(old)
            orig = sent[idx:idx + len(old)]
            repl = new
            if orig[0].isupper():
                repl = repl[0].upper() + repl[1:]
            sent = sent[:idx] + repl + sent[idx + len(old):]
            break
    return sent


# ---------------------------------------------------------------------------
# Sentence-level burstiness (vary lengths)
# ---------------------------------------------------------------------------

def make_burstier(text: str) -> str:
    """Adjust sentence lengths for more human-like variance."""
    sentences = sent_tokenize(text)
    if len(sentences) < 3:
        return text
    varied = []
    for i, s in enumerate(sentences):
        words = s.split()
        # Every third sentence, try to shorten by removing filler
        if i % 3 == 0 and len(words) > 12:
            fillers = [" very ", " extremely ", " fundamentally ",
                       " inherently ", " basically ", " essentially "]
            for f in fillers:
                s = s.replace(f, " ")
            s = " ".join(s.split())
        varied.append(s)
    return " ".join(varied)

