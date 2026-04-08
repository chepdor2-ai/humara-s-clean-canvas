"""
Humanizer Engine v3 — Aggressive Human-Flow Pipeline
=====================================================
Context-aware, settings-driven humanizer that achieves 75%+ word change
and targets near-zero AI detection in stealth mode.

Pipeline (per paragraph):
  0. Context analysis (topic, protected terms, tone, entities)
  1. Phrase-level substitutions (300+ maps, aggressive)
  2. AI sentence-starter replacement (60+ patterns)
  3. Deep sentence-level rephrasing (clause reorder, fronting, voice shift)
  4. POS-aware synonym replacement (curated SYNONYM_BANK, context-protected)
  5. Dictionary-powered synonym fallback (619K+ words)
  6. Sentence merging (short pairs → combined)
  7. Sentence splitting (long → multiple, min 8 words each)
  8. Vary sentence starts (deduplicate openers)
  9. Connector/transition variation
 10. Burstiness (sentence-length variance)
 11. Enforce min 8-word sentences
 12. Contraction expansion + cleanup
 13. REAL-TIME DETECTION LOOP until target score reached

Settings that shape output:
  - stealth: True → ultra-aggressive (target ≤5%, up to 8 iterations)
  - strength: light/medium/strong → base intensity 0.6/1.2/1.8
  - preserve_sentences: True → no splitting/merging
  - strict_meaning: True → lower synonym aggressiveness
  - tone: neutral/formal/casual → affects word choice register
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
from post_processor import post_process as _post_process

# Context analyzer for intelligent protection
try:
    from context_analyzer import analyze as analyze_context, TextContext
    HAS_CONTEXT = True
except Exception as e:
    print(f"[*] Context analyzer not available: {e}")
    HAS_CONTEXT = False
    TextContext = None

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


def _safe_downcase_first(s: str) -> str:
    """Lowercase the first character of s, but preserve ALL-CAPS acronyms."""
    if not s:
        return s
    first_word = s.split()[0] if s.split() else ""
    if first_word.isupper() and len(first_word) > 1:
        return s  # acronym — keep as-is
    return s[0].lower() + s[1:]


# ═══════════════════════════════════════════════════════════════════════════
#  CONFIGURATION — settings-driven
# ═══════════════════════════════════════════════════════════════════════════

class HumanizeSettings:
    """All settings that control the humanization pipeline."""
    __slots__ = (
        "mode", "stealth", "strength", "preserve_sentences", "strict_meaning",
        "tone", "target_score", "max_iterations", "base_intensity",
        "min_change_ratio", "signal_fix_enabled",
    )

    def __init__(self, stealth=True, strength="medium",
                 preserve_sentences=False, strict_meaning=False,
                 tone="neutral", mode=None):
        self.stealth = stealth
        self.strength = strength
        self.preserve_sentences = preserve_sentences
        self.strict_meaning = strict_meaning
        self.tone = tone
        # mode: 'ghost_mini' | 'ghost_pro' | None (legacy)
        self.mode = mode

        if mode == "ghost_mini":
            # Ghost Mini: Top 5 detectors ALL below 20% AI
            self.target_score = 20.0
            self.max_iterations = {"light": 8, "medium": 14, "strong": 22}.get(strength, 14)
            self.base_intensity = {"light": 1.0, "medium": 1.5, "strong": 2.0}.get(strength, 1.5)
            self.min_change_ratio = 0.60
            self.signal_fix_enabled = True
        elif mode == "ghost_pro":
            # Ghost Pro: MAX score across ALL 22 detectors below 5% AI
            self.target_score = 5.0
            self.max_iterations = {"light": 12, "medium": 20, "strong": 30}.get(strength, 20)
            self.base_intensity = {"light": 1.2, "medium": 1.8, "strong": 2.5}.get(strength, 1.8)
            self.min_change_ratio = 0.70
            self.signal_fix_enabled = True
        elif stealth:
            self.target_score = 5.0
            self.max_iterations = {"light": 8, "medium": 14, "strong": 22}.get(strength, 14)
            self.base_intensity = {"light": 2.0, "medium": 10.0, "strong": 30.0}.get(strength, 10.0)
            self.min_change_ratio = 0.65
            self.signal_fix_enabled = False
        else:
            self.target_score = 20.0
            self.max_iterations = {"light": 4, "medium": 8, "strong": 14}.get(strength, 8)
            self.base_intensity = {"light": 1.8, "medium": 9.0, "strong": 27.0}.get(strength, 9.0)
            self.min_change_ratio = 0.55
            self.signal_fix_enabled = False

        if strict_meaning:
            self.base_intensity *= 0.7
            self.min_change_ratio = max(0.40, self.min_change_ratio - 0.15)


# ═══════════════════════════════════════════════════════════════════════════
#  DICTIONARY SYNONYM REPLACEMENT (context-aware)
# ═══════════════════════════════════════════════════════════════════════════

_DICT_BLACKLIST = {
    "bodoni", "|}|}|}|", "soh", "|}|", "|}",  "|}|}",
    "thence", "wherefore", "hitherto", "thereof",
    "mercantile", "pursuance", "pursuit", "moneymaking",
    "pecuniary", "remunerative", "lucrative",
    "stuff", "issue", "issues", "thing", "things",
    "recent", "latest", "current",
    "prospective", "doable", "workable",
    "ain", "tis", "twas", "nay", "aye", "hath", "doth",
    "thee", "thou", "thy", "thine", "whence", "whilst",
    "atm", "homophile", "homosexual", "dodo", "croak",
    "grizzle", "braw", "bodied", "facelift",
    "gloriole", "upwind", "canvas", "edifice", "tract",
    "genesis", "corporate", "lively", "hatful", "panoptic",
    "ardor", "fogey", "carrefour", "gild", "cosmos",
    "aerofoil", "appall", "bionomical", "planer", "rick",
    "permeant", "enounce", "audacious",
    # Additional blacklist — garbling common replacements
    "bod", "bole", "thriftiness", "commercing", "headroom",
    "phoner", "drape", "castrate", "bludgeon", "sporting",
    "gymnastic", "suzanne", "assure", "labourers", "heightened",
    "procession", "leverage", "tailor", "secures", "demands",
    "openings", "networks", "tackles", "assortment", "locale",
    "heft", "mien", "writ", "brio", "nub", "vim", "cog",
    "jot", "ken", "ilk", "kin", "orb", "pith", "rout",
    "woe", "gist", "boon", "onus", "bane", "crux",
    "forebear", "proffer", "betoken", "bespeak", "parlance",
    "forthwith", "henceforward", "anent", "betwixt",
}

# Simple syllable counter for quality filtering
def _syllable_count(word: str) -> int:
    """Rough syllable count heuristic."""
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


# Build a whitelist of "common" words from thesaurus keys at load time.
# Words that ARE thesaurus keys tend to be common, well-known words.
_COMMON_WORDS = set()
if HAS_DICTIONARY and _dict is not None:
    try:
        _thesaurus = getattr(_dict, 'thesaurus', {})
        for key in _thesaurus:
            k = key.lower().strip()
            if (3 <= len(k) <= 12
                    and k.isalpha()
                    and _syllable_count(k) <= 3
                    and k not in _DICT_BLACKLIST):
                _COMMON_WORDS.add(k)
        print(f"  [OK] Common word whitelist: {len(_COMMON_WORDS)} words")
    except Exception as e:
        print(f"  [*] Could not build common word whitelist: {e}")


def _is_acceptable_replacement(word: str) -> bool:
    """Only accept replacements that are common English words."""
    low = word.lower()
    if low in _DICT_BLACKLIST:
        return False
    if len(low) > 12 or len(low) < 3:
        return False
    if _syllable_count(low) > 3:
        return False
    if not low.isalpha():
        return False
    # Must be in common word whitelist (thesaurus key = known word)
    if _COMMON_WORDS and low not in _COMMON_WORDS:
        return False
    return True


def _dict_synonym_replace(sent: str, intensity: float, used: set,
                           ctx=None) -> str:
    """Dictionary-powered synonym replacement. Context-aware: skips protected terms.
    The `used` set tracks words to avoid as REPLACEMENT outputs, not as inputs."""
    if not HAS_DICTIONARY or _dict is None:
        return sent

    replace_prob = min(0.008 * intensity, 0.80)
    words = sent.split()
    new_words = []

    for i, w in enumerate(words):
        stripped = w.strip(".,!?;:\"'()-[]{}")
        lower = stripped.lower()

        # Skip protected terms from context analysis
        if ctx and ctx.is_protected(lower):
            new_words.append(w)
            continue

        if (len(stripped) <= 3
                or lower in rules.PROTECTED_WORDS
                or lower in used  # prevent chain replacement
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
                and ' ' not in replacement
                and _is_acceptable_replacement(replacement)):
            prev_word = new_words[-1].strip(".,!?;:\"'()-[]{}").lower() if new_words else ""
            next_word = words[i + 1].strip(".,!?;:\"'()-[]{}").lower() if i + 1 < len(words) else ""
            if replacement.lower() in (prev_word, next_word):
                new_words.append(w)
                continue
            if _dict.is_valid_word(replacement):
                if stripped[0].isupper():
                    replacement = replacement[0].upper() + replacement[1:]
                if stripped.isupper():
                    replacement = replacement.upper()
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


def _apply_large_dictionary(sent: str, intensity: float, used: set,
                            ctx=None, mode: str = None) -> str:
    """Apply dictionary-based synonym replacement with safety rails.
    Uses curated dictionary for quality-filtered synonyms."""
    if not HAS_DICTIONARY or _dict is None:
        return sent

    # Scale intensity based on mode
    if mode in ("mini", "ghost_mini"):
        eff_intensity = intensity * 0.5
    else:
        eff_intensity = intensity * 0.7

    return _dict_synonym_replace(sent, eff_intensity, used, ctx=ctx)


# ═══════════════════════════════════════════════════════════════════════════
#  HUMAN TEXTURE — inject natural imperfections and rhythm
# ═══════════════════════════════════════════════════════════════════════════
# AI writes smooth, uniform, predictable text. Humans don't.
# This layer adds: mixed rhythm, casual starts, hedging, asides,
# self-interruptions, rhetorical emphasis, and varied formality.

# Casual sentence starters that real humans use (not AI academic connectors)
_HUMAN_STARTERS = [
    "And ", "But ", "Yet ", "Still, ", "Now, ",
    "Of course, ", "Then again, ", "True, ", "Granted, ",
    "Oddly enough, ", "Interestingly, ", "To be fair, ",
    "In practice, ", "Not surprisingly, ",
    "What matters here is that ", "Put simply, ",
    "It helps to remember that ", "Part of the issue is that ",
    "To put it another way, ",
    "What often goes unnoticed is that ", "In many ways, ",
    # --- Added from Colab training (human indicators: "you", "but", "just", "so", "only") ---
    "So, ", "Just to be clear, ", "Sure, ", "Look, ",
    "The thing is, ", "Here is the catch: ",
    "What you see is ", "At the end of the day, ",
    "For one thing, ", "Honestly, ",
    "Simply put, ", "As it happens, ",
]

# Mid-sentence hedging/aside injections (inserted after a comma or clause)
_HUMAN_HEDGES = [
    ", at least in theory,",
    ", and this matters,",
    ", or so it seems,",
    ", to a point,",
    ", for better or worse,",
    " (arguably)",
    " (at least partly)",
    " (to some degree)",
    " (in most cases)",
    ", to some extent,",
    ", it seems,",
    ", in practice,",
    ", rightly or wrongly,",
    ", admittedly,",
]

# Short punchy interjections to insert between sentences
_PUNCHY_INSERTS = [
    "That matters.",
    "This is not trivial.",
    "The stakes are real.",
    "And it shows.",
    "The numbers speak for themselves.",
    "That distinction matters.",
    "The implications run deep.",
    "Few would dispute this.",
    "The evidence is hard to ignore.",
    "That alone says a lot.",
    "The gap is clear.",
    "And yet the debate continues.",
    "The shift is noticeable.",
    "This deserves attention.",
    "The trend is unmistakable.",
]

# Replace overly formal AI-style connectors with natural ones
_FORMAL_TO_NATURAL = {
    "Furthermore, ": ["Plus, ", "On top of that, ", "And beyond that, ",
                       "Another thing worth noting, ", "What is more, "],
    "Moreover, ": ["Besides, ", "Adding to this, ", "On a related note, ",
                    "And then there is the fact that "],
    "Additionally, ": ["Also, ", "On top of this, ", "Then there is ",
                        "Add to that "],
    "Consequently, ": ["So, ", "As a result, ", "The outcome? ",
                        "What follows from this is "],
    "Nevertheless, ": ["Still, ", "Even so, ", "But then again, ",
                        "That said, "],
    "Nonetheless, ": ["Even still, ", "Yet, ", "All the same, ",
                       "But here is the thing, "],
    "In contrast, ": ["But, ", "On the flip side, ", "Then again, ",
                       "Compare that to "],
    "Conversely, ": ["On the other hand, ", "Flip that around and ",
                      "But look at it differently, "],
    "Subsequently, ": ["After that, ", "Then, ", "What followed was ",
                        "From there, "],
    "In conclusion, ": ["All things considered, ", "When it comes down to it, ",
                         "At the end of the day, ", "Taking everything into account, "],
    "Ultimately, ": ["In the end, ", "When it comes down to it, ",
                      "At the end of the day, ", "The bottom line is "],
    "In this regard, ": ["On that note, ", "Speaking of which, ",
                          "Which brings up ", "Related to this, "],
    "Along these lines, ": ["In a similar vein, ", "Tied to this, ",
                             "Going further, ", "Relatedly, "],
    "On a related note, ": ["Tied into this, ", "Connected to that, ",
                             "Which brings us to ", "There is also "],
    "Worth noting is that ": ["One thing to keep in mind is that ",
                               "A key point here, ",
                               "Something often missed, "],
    "Equally, ": ["Just as much, ", "Similarly, ", "By the same token, "],
    "At the same time, ": ["Meanwhile, ", "But alongside that, ",
                            "In parallel, ", "Simultaneously, "],
    "Building on this, ": ["Taking that further, ", "Extending that idea, ",
                            "Going one step further, "],
    "From a different angle, ": ["Looked at differently, ",
                                   "If we flip the perspective, ",
                                   "Seen another way, "],
    "Expanding on this point, ": ["To elaborate, ", "Digging deeper, ",
                                    "More specifically, "],
    "Following from this, ": ["From there, ", "That then leads to ",
                               "Which naturally brings up "],
}


def _inject_human_starters(sentences: list, intensity: float) -> list:
    """Replace some sentence starts with casual human-sounding ones."""
    if len(sentences) < 3:
        return sentences

    # Don't touch the first sentence, and be selective
    prob = min(0.18 * intensity, 0.30)
    result = [sentences[0]]

    for i in range(1, len(sentences)):
        s = sentences[i]
        if random.random() < prob and len(s.split()) > 6:
            starter = random.choice(_HUMAN_STARTERS)
            # Lowercase the original start
            s = _safe_downcase_first(s)
            result.append(starter + s)
        else:
            result.append(s)

    return result


def _inject_hedges(sentences: list, intensity: float) -> list:
    """Insert hedging/aside phrases into some sentences for natural doubt."""
    prob = min(0.10 * intensity, 0.18)
    result = []

    for s in sentences:
        words = s.split()
        if random.random() < prob and len(words) > 10:
            # Find a comma position to inject after
            comma_positions = [j for j, w in enumerate(words)
                              if w.endswith(',') and 3 < j < len(words) - 4]
            if comma_positions:
                pos = random.choice(comma_positions)
                hedge = random.choice(_HUMAN_HEDGES)
                # Remove trailing comma from word at pos, hedge adds its own punctuation
                words[pos] = words[pos].rstrip(',')
                words.insert(pos + 1, hedge.strip())
                s = " ".join(words)
        result.append(s)

    return result


def _inject_punchy_sentences(sentences: list, intensity: float) -> list:
    """Insert short punchy human-style sentences between longer ones."""
    if len(sentences) < 4:
        return sentences

    prob = min(0.025 * intensity, 0.35)
    result = []

    for i, s in enumerate(sentences):
        result.append(s)
        # After a long sentence, sometimes insert a short punchy one
        if (len(s.split()) > 15 and random.random() < prob
                and i < len(sentences) - 1):
            result.append(random.choice(_PUNCHY_INSERTS))

    return result


def _naturalize_connectors(text: str) -> str:
    """Replace stiff AI-style connectors with natural human alternatives.
    Only replaces at the START of the sentence to avoid mid-sentence garbling."""
    for formal, replacements in _FORMAL_TO_NATURAL.items():
        if text.startswith(formal):
            natural = random.choice(replacements)
            text = natural + text[len(formal):]
            break  # Only replace one connector per sentence
    return text


def _vary_rhythm(sentences: list) -> list:
    """Ensure sentence lengths are genuinely varied — not uniform.
    AI tends to write sentences of similar length (15-20 words).
    Humans mix 5-word punches with 30-word sprawls."""
    if len(sentences) < 4:
        return sentences

    lengths = [len(s.split()) for s in sentences]
    avg = sum(lengths) / len(lengths)

    # If standard deviation is low (too uniform), force variation
    variance = sum((l - avg) ** 2 for l in lengths) / len(lengths)
    if variance > 25:  # Already varied enough
        return sentences

    result = []
    for i, s in enumerate(sentences):
        words = s.split()
        wc = len(words)

        # Occasionally split a long sentence with a dash break
        if wc > 20 and random.random() < 0.25:
            mid = wc // 2
            # Find a natural split point near the middle
            for offset in range(0, min(5, mid)):
                for pos in [mid + offset, mid - offset]:
                    if 0 < pos < wc and words[pos - 1].endswith(','):
                        # Don't split before relative pronouns
                        if words[pos].lower() in ("which", "who", "whom",
                                                    "that", "where", "when",
                                                    "whose"):
                            continue
                        part1 = " ".join(words[:pos])
                        part2 = " ".join(words[pos:])
                        part2 = part2[0].upper() + part2[1:] if part2 else part2
                        result.append(part1.rstrip('.'))
                        result.append(part2)
                        break
                else:
                    continue
                break
            else:
                result.append(s)
        else:
            result.append(s)

    return result


def _apply_human_texture(sentences: list, intensity: float,
                          settings: HumanizeSettings) -> list:
    """Master function: apply all human texture layers.
    RULE: at most ONE texture injection per sentence to avoid stacking."""
    # 1. Rhythm variation disabled — handled by _enforce_sentence_distribution
    # sentences = _vary_rhythm(sentences)

    # 2. Naturalize stiff connectors — track which sentences changed
    new_sentences = []
    connector_changed = set()
    for i, s in enumerate(sentences):
        ns = _naturalize_connectors(s)
        if ns != s:
            connector_changed.add(i)
        new_sentences.append(ns)
    sentences = new_sentences

    # Track which sentence indices have been touched
    touched = set(connector_changed)
    _re_leading_connector = re.compile(r"^\s*[A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*){0,3},\s")

    # 3. Also mark sentences that already start with casual/natural connectors
    _casual_prefixes = ("and ", "but ", "yet ", "still,", "now,", "sure,",
                        "so,", "plus,", "besides,", "also,", "then,",
                        "granted,", "true,", "the real question",
                        "the catch", "the outcome", "point is",
                        "thing is", "fact is", "put simply",
                        "on top of that", "here is the thing",
                        "what matters", "which brings", "look at it",
                        "on the flip side", "compare that",
                        "to put it another way", "in the end",
                        "at the end of the day", "when it comes down",
                        "all things considered", "taking everything",
                        "the bottom line", "one thing to keep",
                        "a key point", "something often missed",
                        "just as much", "meanwhile", "tied to this",
                        "going further", "looked at differently",
                        "digging deeper", "from there",
                        "that then leads", "after that",
                        # Common academic connectors that break if prepended
                        "that said", "even so", "however",
                        "nevertheless", "then again", "by contrast",
                        "in contrast", "conversely", "on the other hand",
                        "as a result", "because of this", "for this reason",
                        "what often goes", "what frequently goes",
                        "toward ", "for future", "finally",
                        "eventually", "in the final", "taken together",
                        "on the whole", "broadly speaking",
                        "beyond this", "beyond that",
                        "alongside this", "alongside that",
                        "part of the issue", "what is more",
                        "it helps to remember")
    for i, s in enumerate(sentences):
        if s.lower().startswith(_casual_prefixes):
            touched.add(i)

    # 4. Inject casual human starters (sparse — pick at most 2, never repeat)
    prob_start = min(0.03 * intensity, 0.30)
    starter_count = 0
    used_starters = set()
    result = [sentences[0]]
    for i in range(1, len(sentences)):
        s = sentences[i]
        _no_connector = (not s.lower().startswith(_casual_prefixes)
                 and not _re_leading_connector.match(s))
        if (random.random() < prob_start and len(s.split()) > 6
            and starter_count < 2 and i not in touched
            and _no_connector):
            available = [st for st in _HUMAN_STARTERS if st not in used_starters]
            if not available:
                result.append(s)
                continue
            starter = random.choice(available)
            used_starters.add(starter)
            s = _safe_downcase_first(s)
            result.append(starter + s)
            touched.add(i)
            starter_count += 1
        else:
            result.append(s)
    sentences = result

    # 4. Inject hedging/asides (disabled — corrupts meaning)
    prob_hedge = 0.0
    hedge_done = False
    result2 = []
    for i, s in enumerate(sentences):
        words = s.split()
        if (not hedge_done and random.random() < prob_hedge
                and len(words) > 12 and i not in touched):
            comma_positions = [j for j, w in enumerate(words)
                              if w.endswith(',') and 4 < j < len(words) - 4
                              and (j + 1 >= len(words)
                                   or words[j + 1].lower() not in
                                   ("which", "who", "whom", "that", "where", "when"))]
            if comma_positions:
                pos = random.choice(comma_positions)
                hedge = random.choice(_HUMAN_HEDGES)
                # Insert the hedge after the comma word
                words.insert(pos + 1, hedge.strip())
                s = " ".join(words)
                touched.add(i)
                hedge_done = True
        result2.append(s)
    sentences = result2

    # 5. Punchy sentence injection disabled — adds unrelated content
    # that destroys meaning and triggers AI detectors

    return sentences


# ═══════════════════════════════════════════════════════════════════════════
#  CLEANUP & POST-PROCESSING
# ═══════════════════════════════════════════════════════════════════════════

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
    text = _DOUBLED_PHRASE.sub(r'\1', text)
    # Fix double/triple punctuation
    text = re.sub(r',{2,}', ',', text)
    text = re.sub(r';{2,}', ';', text)
    text = re.sub(r'—{2,}', '—', text)
    # Replace em-dashes and en-dashes with commas to avoid AI detection patterns
    text = text.replace(" — ", ", ")
    text = text.replace("—", ", ")
    text = text.replace(" – ", ", ")
    text = text.replace("–", ", ")
    text = re.sub(r' - (?=[A-Za-z])', ', ', text)
    # Fix double commas from dash replacement
    text = re.sub(r',\s*,', ',', text)
    # Remove empty parentheses / orphaned punctuation
    text = re.sub(r'\(\s*\)', '', text)
    text = re.sub(r'[^\S\n]+', ' ', text)
    # Fix double connectors from merging
    text = re.sub(r'\band\b[,;]?\s+\band\b', 'and', text, flags=re.IGNORECASE)
    text = re.sub(r'\bbut\b[,;]?\s+\bbut\b', 'but', text, flags=re.IGNORECASE)
    # Fix stray 'and' after fronted clause commas: "Toward X, and the Y" → "Toward X, the Y"
    text = re.sub(r',\s+and\s+the\b', ', the', text)
    # Fix a/an agreement
    text = re.sub(r'\ba ([aeiouAEIOU])', r'an \1', text)
    text = re.sub(r'\bA ([aeiouAEIOU])', r'An \1', text)
    text = re.sub(r'\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])', r'a \1', text)
    # Fix mid-sentence capitalization
    text = re.sub(
        r'(?<=[a-z,;] )([A-Z])([a-z]{2,})',
        lambda m: m.group(1).lower() + m.group(2),
        text
    )
    if HAS_ADVANCED and _CONTRACTION_PAT.search(text):
        text = expand_contractions(text)
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
                cleaned.append(s)
        cleaned_paras.append(" ".join(cleaned))
    return "\n\n".join(cleaned_paras)


# ═══════════════════════════════════════════════════════════════════════════
#  SENTENCE ENFORCEMENT — min 8 words, merge short, split long
# ═══════════════════════════════════════════════════════════════════════════

_MERGE_CONNECTORS = [
    ", and ",  ", though ",
    ", plus, ", ", which also ",
    ", especially since ",
]


def _enforce_min_sentence_length(sentences: list) -> list:
    """Merge any sentence under 4 words with its neighbor.
    Short punchy sentences (4-7 words) are preserved for natural rhythm."""
    if len(sentences) < 2:
        return sentences

    result = []
    i = 0
    while i < len(sentences):
        s = sentences[i]
        words = s.split()
        if len(words) < 4 and i + 1 < len(sentences):
            # Merge with next sentence
            next_s = sentences[i + 1]
            connector = random.choice(_MERGE_CONNECTORS)
            merged = s.rstrip('. ') + connector + _safe_downcase_first(next_s)
            result.append(merged)
            i += 2
        elif len(words) < 4 and result:
            # Merge with previous sentence
            prev = result[-1]
            connector = random.choice([", and ", "; moreover, ", ", which also "])
            merged = prev.rstrip('. ') + connector + _safe_downcase_first(s)
            result[-1] = merged
            i += 1
        else:
            result.append(s)
            i += 1

    return result


def _merge_short_pairs_aggressive(sentences: list) -> list:
    """Aggressively merge pairs of short consecutive sentences for natural flow."""
    if len(sentences) < 2:
        return sentences

    result = []
    i = 0
    while i < len(sentences):
        if i + 1 < len(sentences):
            w1 = len(sentences[i].split())
            w2 = len(sentences[i + 1].split())
            # Merge if both are short-medium (up to 14 words each)
            if w1 <= 14 and w2 <= 14 and w1 >= 4 and w2 >= 4 and random.random() < 0.12:
                s1 = sentences[i].rstrip('. ')
                s2 = sentences[i + 1]
                s2_low = _safe_downcase_first(s2)
                connector = random.choice([
                    ", and ", ", while ", ", though ",
                    ", but at the same time, ",
                ])
                if connector.startswith(". "):
                    merged = s1.rstrip('. ') + connector + s2_low.rstrip('.')  + "."
                else:
                    merged = s1 + connector + s2_low.rstrip('.') + "."
                result.append(merged)
                i += 2
                continue
        result.append(sentences[i])
        i += 1
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  SENTENCE LENGTH DISTRIBUTION ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════
# Based on analysis of human academic writing that scores 0% AI:
#   10-15 words: ~6%    16-25 words: ~13%    26-35 words: ~28%
#   36-45 words: ~31%   46-50 words: ~22%
# Hard constraints: min 10 words, max 50 words, <5% sentences modified.

_MIN_SENT_WORDS = 8
_MAX_SENT_WORDS = 50
_MERGE_SPLIT_BUDGET = 0.05  # Max 5% of sentences may be merged or split


def _enforce_sentence_distribution(sentences: list) -> list:
    """Enforce sentence length constraints with minimal structural changes.

    - Merges sentences shorter than 10 words with their neighbor
    - Splits sentences longer than 50 words at natural break points
    - Total structural changes limited to <5% of sentence count
    - Preserves meaning by only operating at sentence boundaries
    """
    if len(sentences) < 2:
        return sentences

    total = len(sentences)
    budget = max(2, int(total * _MERGE_SPLIT_BUDGET))
    used = 0

    # --- Phase 1: fix too-short sentences (< 10 words) by merging ---
    # This is a HARD constraint — not budget-limited
    result = []
    i = 0
    while i < len(sentences):
        sent = sentences[i]
        wc = len(sent.split())

        if wc < _MIN_SENT_WORDS:
            # Try merging with the next sentence
            if i + 1 < len(sentences):
                next_sent = sentences[i + 1]
                merged_wc = wc + len(next_sent.split())
                if merged_wc <= _MAX_SENT_WORDS:
                    merged = sent.rstrip(". ") + ", " + _safe_downcase_first(next_sent)
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    result.append(merged)
                    used += 1
                    i += 2
                    continue
            # Try merging with the previous sentence
            if result:
                prev_wc = len(result[-1].split())
                if wc + prev_wc <= _MAX_SENT_WORDS:
                    merged = result[-1].rstrip(". ") + ", " + _safe_downcase_first(sent)
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    result[-1] = merged
                    used += 1
                    i += 1
                    continue
        result.append(sent)
        i += 1

    sentences = result

    # --- Phase 2: fix too-long sentences (> 50 words) by splitting ---
    result = []
    for sent in sentences:
        words = sent.split()
        wc = len(words)

        if wc > _MAX_SENT_WORDS:
            mid = wc // 2
            split_done = False
            # Search outward from the middle for a natural break
            for offset in range(0, min(15, mid - _MIN_SENT_WORDS)):
                for pos in [mid + offset, mid - offset]:
                    if pos < _MIN_SENT_WORDS or pos > wc - _MIN_SENT_WORDS:
                        continue
                    w = words[pos - 1]
                    next_w = words[pos].lower().rstrip(".,;:")
                    # Split after comma/semicolon or before conjunction
                    if (w.endswith(",") or w.endswith(";")
                            or next_w in ("and", "but", "while", "though",
                                          "although", "because", "since",
                                          "whereas", "however")):
                        s1 = " ".join(words[:pos]).rstrip(",;") + "."
                        s2_words = words[pos:]
                        if s2_words and s2_words[0]:
                            s2_words[0] = s2_words[0][0].upper() + s2_words[0][1:]
                        s2 = " ".join(s2_words)
                        if not s2.endswith((".", "!", "?")):
                            s2 = s2.rstrip(".,;: ") + "."
                        # Both halves must meet minimum length
                        if (len(s1.split()) >= _MIN_SENT_WORDS
                                and len(s2.split()) >= _MIN_SENT_WORDS):
                            result.append(s1)
                            result.append(s2)
                            used += 1
                            split_done = True
                            break
                if split_done:
                    break
            if not split_done:
                result.append(sent)
        else:
            result.append(sent)

    # --- Phase 3: create length variety if sentences are too uniform ---
    # Human writing has std dev ~12+ in sentence lengths.
    # If sentences are too uniform, merge some adjacent pairs to create
    # longer sentences (30-50 words) for natural burstiness.
    def _bucket(wc):
        if wc <= 15:
            return 0
        if wc <= 25:
            return 1
        if wc <= 35:
            return 2
        if wc <= 45:
            return 3
        return 4

    if len(result) >= 4:
        lengths = [len(s.split()) for s in result]
        avg_len = sum(lengths) / len(lengths) if lengths else 0
        std_dev = (sum((l - avg_len) ** 2 for l in lengths) / len(lengths)) ** 0.5 if lengths else 999

        if std_dev < 8 and used < budget:
            # Sentences are too uniform — merge selected adjacent pairs
            _conjunctions = [", and ", ", while ", ", though ",
                             " because ", " since ", ", which means "]
            merged_result = []
            i = 0
            merge_positions = set()
            # Select every 3rd pair for merging (skip first sentence)
            for idx in range(1, len(result) - 1, 3):
                if used >= budget:
                    break
                len1 = len(result[idx].split())
                len2 = len(result[idx + 1].split())
                if len1 + len2 <= _MAX_SENT_WORDS and len1 + len2 >= 28:
                    merge_positions.add(idx)
                    used += 1

            i = 0
            while i < len(result):
                if i in merge_positions and i + 1 < len(result):
                    s1 = result[i].rstrip(". ")
                    s2 = _safe_downcase_first(result[i + 1])
                    conj = random.choice(_conjunctions)
                    merged = s1 + conj + s2
                    if not merged.rstrip().endswith((".", "!", "?")):
                        merged = merged.rstrip(".,;: ") + "."
                    merged_result.append(merged)
                    i += 2
                else:
                    merged_result.append(result[i])
                    i += 1
            result = merged_result

    # --- Phase 4: swap to break 3+ consecutive same-bucket runs ---
    if len(result) >= 3:
        for i in range(2, len(result)):
            b0 = _bucket(len(result[i - 2].split()))
            b1 = _bucket(len(result[i - 1].split()))
            b2 = _bucket(len(result[i].split()))
            if b0 == b1 == b2:
                if i + 1 < len(result):
                    result[i], result[i + 1] = result[i + 1], result[i]

    return result


# ═══════════════════════════════════════════════════════════════════════════
#  VARY SENTENCE STARTS
# ═══════════════════════════════════════════════════════════════════════════

_OPENER_VARIANTS = [
    "On that note, ", "Tied to this, ", "Related to this, ",
    "And ", "But ", "Meanwhile, ", "At the same time, ",
    "Then again, ", "Put differently, ", "Seen another way, ",
    "Which means ", "In other words, ",
    "Equally worth noting, ", "Just as relevant, ",
    # --- Added from Colab training (boost starter_diversity) ---
    "So ", "Yet ", "Still, ", "Plus, ", "Now, ",
    "Oddly, ", "Granted, ", "Sure, ", "Look, ",
    "Of course, ", "For one thing, ", "To be fair, ",
    "Notably, ", "What stands out is that ",
    "Think of it this way: ", "Here is the thing: ",
]


def _vary_sentence_starts(sentences: list) -> list:
    """Rewrite opener if two+ consecutive sentences start with the same word."""
    if len(sentences) < 2:
        return sentences

    result = [sentences[0]]
    for i in range(1, len(sentences)):
        prev_start = result[-1].split()[0].lower() if result[-1].split() else ""
        curr_start = sentences[i].split()[0].lower() if sentences[i].split() else ""

        if prev_start and curr_start == prev_start and len(sentences[i].split()) > 4:
            connector = random.choice(_OPENER_VARIANTS)
            s = sentences[i]
            s = _safe_downcase_first(s)
            result.append(connector + s)
        else:
            result.append(sentences[i])

    return result


# ═══════════════════════════════════════════════════════════════════════════
#  WORD CHANGE RATIO CALCULATION
# ═══════════════════════════════════════════════════════════════════════════

def _word_change_ratio(original: str, transformed: str) -> float:
    """Calculate the fraction of original content words that were changed.
    Function words (the, a, of, in, etc.) are excluded since they naturally
    survive any transformation."""
    _func_words = {
        "the", "a", "an", "of", "in", "to", "for", "and", "or", "but",
        "is", "are", "was", "were", "be", "been", "being", "has", "have",
        "had", "do", "does", "did", "will", "would", "could", "should",
        "may", "might", "shall", "can", "this", "that", "these", "those",
        "it", "its", "they", "them", "their", "he", "she", "his", "her",
        "we", "our", "you", "your", "not", "no", "by", "at", "on", "with",
        "from", "as", "if", "so", "yet", "also", "all", "each", "both",
        "which", "who", "what", "when", "where", "how", "than", "more",
        "most", "such", "many", "much", "some", "any",
    }

    orig_words = [w.lower().strip(".,;:!?\"'()-[]{}") for w in original.split()
                  if w.strip(".,;:!?\"'()-[]{}")]
    trans_set = {w.lower().strip(".,;:!?\"'()-[]{}") for w in transformed.split()
                 if w.strip(".,;:!?\"'()-[]{}")}

    # Only consider content words
    content_orig = [w for w in orig_words if w not in _func_words and len(w) > 2]

    if not content_orig:
        return 1.0

    survived_count = sum(1 for w in content_orig if w in trans_set)
    changed_ratio = 1.0 - (survived_count / len(content_orig))
    return max(0.0, min(1.0, changed_ratio))


# ═══════════════════════════════════════════════════════════════════════════
#  SINGLE-PASS PARAGRAPH HUMANIZATION
# ═══════════════════════════════════════════════════════════════════════════

def _humanize_paragraph(para: str, intensity: float, used_words: set,
                         ctx, settings: HumanizeSettings,
                         iteration: int = 0) -> str:
    """Humanize a single paragraph through the full aggressive pipeline."""
    sentences = sent_tokenize(para)
    transformed = []

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue

        # Step 1: Phrase-level substitutions (aggressive)
        sent = utils.phrase_substitute(sent, intensity)

        # Step 2: AI sentence-starter replacement
        sent = utils.replace_ai_starters(sent)

        # Step 3: Deep sentence restructuring BEFORE synonym swap
        # Skip short sentences (punchy inserts, etc.)
        _before_restructure = sent
        if HAS_ADVANCED and len(sent.split()) > 8:
            sent = deep_restructure(sent, intensity)
        _deep_changed = sent != _before_restructure

        # Step 4: Active/passive voice shifts (conservative)
        # Skip if deep_restructure already modified the sentence, or if the
        # sentence contains a comma-hedge (passive restructure corrupts them).
        _has_comma_hedge = bool(re.search(
            r',\s+(?:in practice|admittedly|it seems|to some extent|'
            r'rightly or wrongly|at least partly|in most cases|to be fair|'
            r'to a degree|on the whole|broadly speaking|in theory|'
            r'for the most part),', sent, re.IGNORECASE))
        if (HAS_ADVANCED and not _deep_changed and not _has_comma_hedge
                and 10 <= len(sent.split()) <= 22):
            voice_prob = min(0.015 * intensity, 0.45)
            sent = voice_shift(sent, probability=voice_prob)

        # Step 5: POS-aware synonym replacement (curated SYNONYM_BANK)
        # Pass context so protected terms are skipped
        sent = utils.synonym_replace(sent, intensity, used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)

        # Step 5b: Large dictionary intelligence pass (Mini/Pro only)
        if settings.mode in ("ghost_mini", "ghost_pro"):
            sent = _apply_large_dictionary(
                sent, intensity, used_words, ctx=ctx, mode=settings.mode
            )

        # Step 6: Connector variation
        sent = utils.vary_connectors(sent)

        # Step 8: Clause restructuring
        sent = utils.restructure_sentence(sent, intensity)

        sent = " ".join(sent.split())
        if sent:
            transformed.append(sent)

    # Step 9: Merge short sentence pairs — DISABLED (LLM pipeline handles merging)
    # if not settings.preserve_sentences:
    #     transformed = _merge_short_pairs_aggressive(transformed)

    # Step 10: Vary repetitive sentence starts
    transformed = _vary_sentence_starts(transformed)

    # Step 11: HUMAN TEXTURE — inject natural imperfections (first pass only)
    if iteration == 0:
        transformed = _apply_human_texture(transformed, intensity, settings)

    # Step 12: Enforce sentence length distribution — DISABLED (LLM pipeline handles this)
    # if not settings.preserve_sentences:
    #     transformed = _enforce_sentence_distribution(transformed)

    para_result = " ".join(transformed)

    # Step 12: Burstiness
    if HAS_TEXTSTAT:
        try:
            current = textstat.flesch_reading_ease(para_result)
            target = 65 + (rules.BURSTINESS_TARGET * 30)
            if current < target:
                para_result = utils.make_burstier(para_result)
        except Exception:
            pass

    # Step 13: Cleanup
    para_result = _cleanup(para_result)

    return para_result


# ═══════════════════════════════════════════════════════════════════════════
#  DETECTION SCORING — per-detector & signal-aware
# ═══════════════════════════════════════════════════════════════════════════

# Top 5 major detectors (academic tier — highest accuracy)
TOP_5_DETECTOR_GROUPS = {
    "gptzero": {"gptzero"},
    "turnitin": {"turnitin"},
    "originality": {"originality_ai", "originality.ai", "originalityai"},
    "winston": {"winston_ai", "winston.ai", "winstonai"},
    "copyleaks": {"copyleaks", "crossplag"},
}

# Signal names where HIGHER value = MORE human-like
_HUMAN_POSITIVE_SIGNALS = {
    "perplexity", "burstiness", "vocabulary_richness", "shannon_entropy",
    "readability_consistency", "stylometric_score", "starter_diversity",
    "word_length_variance", "spectral_flatness", "lexical_density_var",
    "dependency_depth",
}
# Signal names where HIGHER value = MORE AI-like
_AI_POSITIVE_SIGNALS = {
    "sentence_uniformity", "ai_pattern_score", "ngram_repetition",
    "paragraph_uniformity", "avg_word_commonality", "zipf_deviation",
    "token_predictability", "per_sentence_ai_ratio", "function_word_freq",
}


def _get_full_analysis(text: str) -> dict:
    """Run full multi-detector analysis returning signals + per-detector scores."""
    if not HAS_DETECTOR or _detector is None or not text.strip():
        return {"signals": {}, "detectors": [], "summary": {}}
    try:
        return _detector.analyze(text)
    except Exception:
        return {"signals": {}, "detectors": [], "summary": {}}


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


def _normalize_detector_name(name: str) -> str:
    """Normalize detector names to comparable tokens.

    Example: "Originality.AI" -> "originalityai"
    """
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())
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


def _check_detector_targets(analysis: dict, mode: str) -> tuple:
    """Check if detector scores meet the target for given mode.

    Returns (passed: bool, worst_detector: str, max_ai_score: float,
             detector_scores: dict)
    """
    detector_scores = {}
    for d in analysis.get('detectors', []):
        name = d.get('detector', 'unknown').lower().replace(' ', '_')
        ai_score = round(100.0 - d.get('human_score', 50.0), 1)
        detector_scores[name] = ai_score

    if mode == "ghost_mini":
        # Top 5 must ALL be below 20% AI
        target = 20.0
        norm_scores = {}
        for d in analysis.get('detectors', []):
            raw_name = d.get('detector', 'unknown')
            norm_name = _normalize_detector_name(raw_name)
            norm_scores[norm_name] = round(100.0 - d.get('human_score', 50.0), 1)

        top5_scores = {}
        for group_name, aliases in TOP_5_DETECTOR_GROUPS.items():
            alias_scores = []
            for alias in aliases:
                norm_alias = _normalize_detector_name(alias)
                for seen_name, seen_score in norm_scores.items():
                    if (seen_name == norm_alias
                            or norm_alias in seen_name
                            or seen_name in norm_alias):
                        alias_scores.append(seen_score)
            if alias_scores:
                # Use worst score inside alias family (strict)
                top5_scores[group_name] = max(alias_scores)

        if len(top5_scores) < 5:
            return False, "unknown", 100.0, detector_scores
        worst = max(top5_scores, key=top5_scores.get)
        max_score = top5_scores[worst]
        passed = all(score <= target for score in top5_scores.values())
        return passed, worst, max_score, detector_scores

    elif mode == "ghost_pro":
        # ALL 22 detectors must have AI score below 5%
        target = 5.0
        if not detector_scores:
            return False, "unknown", 100.0, detector_scores
        worst = max(detector_scores, key=detector_scores.get)
        max_score = detector_scores[worst]
        passed = max_score <= target
        return passed, worst, max_score, detector_scores

    else:
        # Legacy mode — use overall average
        overall = 100.0 - analysis.get('summary', {}).get('overall_human_score', 50.0)
        return overall <= 20.0, "overall", overall, detector_scores


def _identify_weak_signals(signals: dict) -> list:
    """Identify signals that are in the AI-like zone and rank by severity.

    Returns list of (signal_name, badness_score) sorted worst-first.
    badness_score: 0 = perfect human, 100 = max AI-like.
    """
    weaknesses = []
    for sig, val in signals.items():
        if sig in _HUMAN_POSITIVE_SIGNALS:
            # Low value = AI-like. Badness = 100 - value
            badness = max(0.0, 100.0 - val)
            if badness > 25.0:  # Catch more weak signals for thorough fixing
                weaknesses.append((sig, badness))
        elif sig in _AI_POSITIVE_SIGNALS:
            # High value = AI-like. Badness = value
            badness = val
            if badness > 25.0:
                weaknesses.append((sig, badness))
    weaknesses.sort(key=lambda x: x[1], reverse=True)
    return weaknesses


# ═══════════════════════════════════════════════════════════════════════════
#  SIGNAL-AWARE TARGETED TRANSFORMS
# ═══════════════════════════════════════════════════════════════════════════
# The key innovation: instead of blindly repeating the same pipeline,
# analyze which detection signals are causing high AI scores and apply
# targeted countermeasures for each weak signal.

def _apply_signal_fixes(text: str, weak_signals: list, intensity: float,
                        used_words: set, ctx, settings: HumanizeSettings) -> str:
    """Apply targeted transforms based on which signals are weak."""
    paragraphs = re.split(r'\n\s*\n', text)
    fixed_paragraphs = []

    # Build a set of fixes to apply based on weak signals
    fixes_to_apply = set()
    for sig_name, badness in weak_signals[:4]:  # Top 4 worst signals only
        fixes_to_apply.add(sig_name)

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        sentences = sent_tokenize(para)

        # ── Fix: LOW PERPLEXITY (text too predictable) ────────────────
        if "perplexity" in fixes_to_apply:
            sentences = _fix_low_perplexity(sentences, intensity, used_words, ctx)

        # ── Fix: LOW BURSTINESS (sentence lengths too uniform) ────────
        if "burstiness" in fixes_to_apply:
            sentences = _fix_low_burstiness(sentences, intensity)

        # ── Fix: HIGH SENTENCE UNIFORMITY (structure too similar) ─────
        if "sentence_uniformity" in fixes_to_apply:
            sentences = _fix_high_uniformity(sentences, intensity)

        # ── Fix: HIGH AI PATTERN SCORE (AI markers present) ──────────
        if "ai_pattern_score" in fixes_to_apply:
            sentences = _fix_ai_patterns(sentences, intensity)

        # ── Fix: LOW VOCABULARY RICHNESS (repetitive words) ──────────
        if "vocabulary_richness" in fixes_to_apply:
            sentences = _fix_low_vocabulary(sentences, intensity, used_words, ctx)

        # ── Fix: LOW STARTER DIVERSITY (repetitive openers) ──────────
        if "starter_diversity" in fixes_to_apply:
            sentences = _fix_starter_diversity(sentences)

        # ── Fix: HIGH NGRAM REPETITION (repeated phrases) ────────────
        if "ngram_repetition" in fixes_to_apply:
            sentences = _fix_ngram_repetition(sentences, intensity, used_words, ctx)

        # ── Fix: HIGH TOKEN PREDICTABILITY (word sequences too expected)
        if "token_predictability" in fixes_to_apply:
            sentences = _fix_token_predictability(sentences, intensity, used_words, ctx)

        # ── Fix: LOW STYLOMETRIC SCORE (flat style) ──────────────────
        if "stylometric_score" in fixes_to_apply:
            sentences = _fix_low_stylometric(sentences, intensity)

        # ── Fix: HIGH PARAGRAPH UNIFORMITY (paragraphs too similar) ──
        if "paragraph_uniformity" in fixes_to_apply:
            # Handled at paragraph level below
            pass

        # ── Fix: HIGH PER-SENTENCE AI RATIO ──────────────────────────
        if "per_sentence_ai_ratio" in fixes_to_apply:
            sentences = _fix_per_sentence_ai(sentences, intensity, used_words, ctx)

        # ── Fix: LOW READABILITY CONSISTENCY (too consistent level) ──
        if "readability_consistency" in fixes_to_apply:
            sentences = _fix_readability_consistency(sentences, intensity)

        # ── Fix: HIGH AVG WORD COMMONALITY (too common words) ────────
        if "avg_word_commonality" in fixes_to_apply:
            sentences = _fix_word_commonality(sentences, intensity, used_words, ctx)

        # ── Fix: HIGH FUNCTION WORD FREQ (AI function word profile) ──
        if "function_word_freq" in fixes_to_apply:
            sentences = _fix_function_word_freq(sentences, intensity)

        # ── Fix: LOW DEPENDENCY DEPTH (too simple structures) ────────
        if "dependency_depth" in fixes_to_apply:
            sentences = _fix_low_dependency_depth(sentences, intensity)

        # ── Fix: LOW SHANNON ENTROPY (character predictability) ──────
        if "shannon_entropy" in fixes_to_apply:
            sentences = _fix_low_shannon_entropy(sentences, intensity, used_words, ctx)

        # Enforce sentence length distribution after all signal fixes
        sentences = _enforce_sentence_distribution(sentences)

        fixed_paragraphs.append(" ".join(sentences))

    # Paragraph-level fix: vary paragraph lengths
    if "paragraph_uniformity" in fixes_to_apply and len(fixed_paragraphs) >= 3:
        fixed_paragraphs = _fix_paragraph_uniformity(fixed_paragraphs)

    return "\n\n".join(fixed_paragraphs)


def _fix_low_perplexity(sentences: list, intensity: float,
                         used_words: set, ctx) -> list:
    """Increase word unpredictability using curated + large dictionary passes."""
    result = []
    for sent in sentences:
        sent = utils.synonym_replace(sent, min(intensity * 0.8, 4.0), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.6, 3.5), used_words,
                                       ctx=ctx, mode="ghost_pro")
        result.append(sent)
    return result


def _fix_low_burstiness(sentences: list, intensity: float) -> list:
    """Vary sentence lengths to increase burstiness — word-level edits only.
    Sentence splitting/merging is handled exclusively by the LLM pipeline."""
    if len(sentences) < 3:
        return sentences

    result = []
    for i, sent in enumerate(sentences):
        words = sent.split()
        wc = len(words)

        # Strategy: remove filler words from long sentences to vary lengths
        if i % 3 == 0 and wc > 20 and random.random() < 0.3 * intensity:
            _fillers = {"very", "really", "quite", "rather", "somewhat",
                       "extremely", "incredibly", "significantly", "essentially",
                       "fundamentally", "particularly", "specifically"}
            new_words = [w for w in words if w.lower().strip(".,;:") not in _fillers]
            if len(new_words) >= 8 and len(new_words) != wc:
                sent = " ".join(new_words)

        result.append(sent)

    return result


def _fix_high_uniformity(sentences: list, intensity: float) -> list:
    """Vary sentence structure to break AI-like uniformity.
    Uses word-level edits only — no sentence splitting/merging (LLM handles that).
    """
    if len(sentences) < 2:
        return sentences

    result = []
    for i, sent in enumerate(sentences):
        words = sent.split()
        wc = len(words)

        # Strategy 1: Deep restructure (clause reorder, fronting)
        if i % 3 == 0 and HAS_ADVANCED and wc > 8:
            restructured = deep_restructure(sent, min(intensity * 1.2, 2.5))
            if restructured != sent:
                result.append(restructured)
                continue

        # Strategy 2: Voice shift (active <-> passive)
        if i % 3 == 1 and HAS_ADVANCED and 8 <= wc <= 22:
            shifted = voice_shift(sent, probability=0.35)
            if shifted != sent:
                result.append(shifted)
                continue

        result.append(sent)

    # Also vary starters to differentiate sentence openings
    result = _fix_starter_diversity(result)
    return result


def _fix_ai_patterns(sentences: list, intensity: float) -> list:
    """Remove AI-specific patterns: formal connectors, hedging, academic starters."""
    result = []
    # AI connector patterns that detectors flag
    _ai_connectors = [
        (r'^Furthermore,?\s+', ["Also, ", "Plus, ", "And "]),
        (r'^Moreover,?\s+', ["Besides, ", "And "]),
        (r'^Additionally,?\s+', ["Also, ", "On top of that, "]),
        (r'^Consequently,?\s+', ["So, ", "As a result, "]),
        (r'^Subsequently,?\s+', ["Then, ", "After that, "]),
        (r'^Nevertheless,?\s+', ["Still, ", "Even so, "]),
        (r'^Nonetheless,?\s+', ["Yet, ", "Even so, "]),
        (r'^In\s+conclusion,?\s+', ["Overall, ", "To sum up, "]),
        (r'^It\s+is\s+(?:important|worth|crucial|essential)\s+to\s+(?:note|recognize|mention)\s+that\s+', [""]),
        (r'^(?:This|These)\s+(?:findings?|results?|analysis|report)\s+(?:suggest|indicate|demonstrate|aims?|will)\s+that\s+', [""]),
        (r'^In\s+(?:today\'?s?|the\s+modern)\s+(?:world|era|age|society),?\s+', [""]),
        (r'^(?:In\s+light\s+of|Given)\s+(?:the\s+above|these\s+findings?|this),?\s+', ["Based on this, ", ""]),
        (r'^The\s+purpose\s+of\s+this\s+(?:analysis|report|paper|study)\s+is\s+to\s+', ["This analysis will ", "I will ", ""]),
    ]
    for sent in sentences:
        modified = sent
        for pattern, replacements in _ai_connectors:
            m = re.match(pattern, modified, re.IGNORECASE)
            if m:
                repl = random.choice(replacements)
                rest = modified[m.end():]
                if not repl:
                    # Empty replacement: capitalize the rest
                    rest = rest[0].upper() + rest[1:] if rest else rest
                modified = repl + rest
                break
        # Also run the standard AI starter replacement
        modified = utils.replace_ai_starters(modified)
        result.append(modified)
    return result


def _fix_low_vocabulary(sentences: list, intensity: float,
                         used_words: set, ctx) -> list:
    """Increase vocabulary richness using curated + large dictionary passes."""
    result = []
    for sent in sentences:
        sent = utils.synonym_replace(sent, min(intensity * 0.8, 4.0), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.6, 3.5), used_words,
                                       ctx=ctx, mode="ghost_mini")
        result.append(sent)
    return result


def _fix_starter_diversity(sentences: list) -> list:
    """Force unique sentence starters across the paragraph."""
    if len(sentences) < 2:
        return sentences

    used_starts = set()
    result = []
    _diverse_starters = [
        "And yet, ", "But then, ", "Still, ", "Now, ",
        "Meanwhile, ", "Of course, ", "In practice, ",
        "That said, ", "To be fair, ", "Put differently, ",
        "Looking closer, ", "Granted, ", "True, ",
        "What matters is ", "The key point is ",
        "Consider that ", "It helps to know that ",
        "Worth noting, ", "On the flip side, ",
        "To put it plainly, ", "As it turns out, ",
        "Interestingly, ", "Crucially, ", "Not surprisingly, ",
        # --- Added from Colab training (top signal: starter_diversity 0.648) ---
        "So, ", "Plus, ", "Sure, ", "Look, ",
        "Here is the thing: ", "One thing to note: ",
        "What stands out is ", "At the same time, ",
        "For what it is worth, ", "To sum it up, ",
        "Think about it: ", "Along those lines, ",
        "Oddly enough, ", "Just as important, ",
        "Perhaps more to the point, ", "In any case, ",
    ]

    for i, sent in enumerate(sentences):
        words = sent.split()
        if not words:
            result.append(sent)
            continue
        start = words[0].lower().rstrip(",;:")
        if start in used_starts and len(words) > 4:
            # Pick a starter we haven't used yet
            available = [s for s in _diverse_starters
                         if s.split()[0].lower().rstrip(",;:") not in used_starts]
            if available:
                starter = random.choice(available)
                rest = _safe_downcase_first(sent)
                result.append(starter + rest)
                used_starts.add(starter.split()[0].lower().rstrip(",;:"))
                continue
        used_starts.add(start)
        result.append(sent)
    return result


def _fix_ngram_repetition(sentences: list, intensity: float,
                           used_words: set, ctx) -> list:
    """Break repeated trigrams by replacing words in repeated sequences."""
    # Count trigrams across all sentences
    from collections import Counter
    all_text = " ".join(sentences).lower()
    words = all_text.split()
    trigrams = Counter()
    for i in range(len(words) - 2):
        tri = (words[i], words[i+1], words[i+2])
        trigrams[tri] += 1

    # Find repeated trigrams (appearing 2+ times)
    repeated = {tri for tri, count in trigrams.items() if count >= 2}
    if not repeated:
        return sentences

    # Replace the middle word of repeated trigrams in sentences
    result = []
    for sent in sentences:
        sent_words = sent.split()
        for i in range(len(sent_words) - 2):
            tri = (sent_words[i].lower().rstrip(".,;:!?"),
                   sent_words[i+1].lower().rstrip(".,;:!?"),
                   sent_words[i+2].lower().rstrip(".,;:!?"))
            if tri in repeated and random.random() < 0.6:
                # Replace the middle word with a synonym
                mid_word = sent_words[i+1]
                stripped = mid_word.strip(".,;:!?\"'()-[]{}")
                lower = stripped.lower()
                candidates = rules.SYNONYM_BANK.get(lower, [])
                candidates = [c for c in candidates if ' ' not in c
                             and c.lower() not in used_words]
                if candidates:
                    repl = random.choice(candidates)
                    if stripped[0].isupper():
                        repl = repl[0].upper() + repl[1:]
                    # Preserve punctuation
                    prefix = mid_word[:len(mid_word) - len(mid_word.lstrip(".,;:!?\"'()-[]{}"))]
                    suffix = mid_word[len(mid_word.rstrip(".,;:!?\"'()-[]{}")):]
                    sent_words[i+1] = prefix + repl + suffix
                    used_words.add(repl.lower())
                    repeated.discard(tri)  # Only fix once
        result.append(" ".join(sent_words))
    return result


def _fix_token_predictability(sentences: list, intensity: float,
                               used_words: set, ctx) -> list:
    """Break predictable word sequences by inserting modifiers or swapping words."""
    result = []
    _modifiers = ["quite", "rather", "somewhat", "fairly", "genuinely",
                  "truly", "notably", "largely", "partly", "mostly"]
    # Adjective-only POS tags (safe for modifier insertion)
    _SAFE_ADJ_TAGS = {"JJ", "JJR", "JJS"}
    for sent in sentences:
        words = sent.split()
        if len(words) < 6:
            result.append(sent)
            continue
        # Insert a modifier before a true adjective (not before determiners/other)
        if random.random() < 0.25 * intensity:
            try:
                from nltk import pos_tag as _pt
                from nltk.tokenize import word_tokenize as _wt
                tokens = _wt(sent)
                tagged = _pt(tokens)
                for j, (word, tag) in enumerate(tagged):
                    # Only insert before genuine adjectives, not quantifiers/determiners
                    if (tag in _SAFE_ADJ_TAGS
                            and j > 0
                            and word.lower() not in ("more", "most", "many", "much",
                                                      "several", "few", "additional",
                                                      "various", "other", "such")
                            and random.random() < 0.25):
                        # Check preceding word isn't already a modifier
                        prev_tag = tagged[j-1][1] if j > 0 else ""
                        if prev_tag not in ("RB", "RBR", "RBS"):
                            mod = random.choice(_modifiers)
                            if mod not in sent.lower():
                                tokens.insert(j, mod)
                                break
                sent = utils._rejoin_tokens(tokens)
            except Exception:
                pass
        # Also run synonym replacement for more unpredictability
        sent = utils.synonym_replace(sent, min(intensity * 0.7, 3.8), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.5, 3.0), used_words,
                                       ctx=ctx, mode="ghost_mini")
        result.append(sent)
    return result


def _fix_low_stylometric(sentences: list, intensity: float) -> list:
    """Improve stylometric score: more punctuation variety, personal touches."""
    result = []
    for i, sent in enumerate(sentences):
        words = sent.split()
        # Semicolon joining disabled — creates over-long sentences
        result.append(sent)
    return result


def _fix_per_sentence_ai(sentences: list, intensity: float,
                          used_words: set, ctx) -> list:
    """Transform sentences that individually score as AI-like."""
    result = []
    for sent in sentences:
        # Apply the full treatment: starters + phrase sub + synonym + restructure
        sent = utils.replace_ai_starters(sent)
        sent = utils.phrase_substitute(sent, min(intensity, 4.0))
        if HAS_ADVANCED and len(sent.split()) > 8:
            sent = deep_restructure(sent, min(intensity * 0.8, 4.5))
        sent = utils.synonym_replace(sent, min(intensity * 0.7, 3.8), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.5, 3.0), used_words,
                                       ctx=ctx, mode="ghost_pro")
        result.append(sent)
    return result


def _fix_readability_consistency(sentences: list, intensity: float) -> list:
    """Vary readability levels across sentences to break AI consistency."""
    result = []
    for i, sent in enumerate(sentences):
        words = sent.split()
        if i % 3 == 0 and len(words) > 12:
            # Simplify: remove filler adverbs
            _fillers = {"very", "extremely", "fundamentally", "inherently",
                        "basically", "essentially", "significantly", "particularly",
                        "substantially", "considerably"}
            words = [w for w in words if w.lower().rstrip(".,;:") not in _fillers]
            sent = " ".join(words)
        elif i % 3 == 2 and len(words) < 12 and len(words) > 5:
            # Add a dependent clause for complexity variation
            _clauses = [", which makes a difference", ", though that depends",
                        ", at least in most cases", ", even if only slightly"]
            if sent.endswith('.') and random.random() < 0.25 * intensity:
                sent = sent[:-1] + random.choice(_clauses) + "."
        result.append(sent)
    return result


def _fix_word_commonality(sentences: list, intensity: float,
                           used_words: set, ctx) -> list:
    """Replace overly common words with curated + large dictionary synonyms."""
    result = []
    for sent in sentences:
        sent = utils.synonym_replace(sent, min(intensity * 0.8, 4.0), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.6, 3.5), used_words,
                                       ctx=ctx, mode="ghost_pro")
        result.append(sent)
    return result


def _fix_paragraph_uniformity(paragraphs: list) -> list:
    """Paragraph structure preserved — no splitting/merging (LLM pipeline handles this)."""
    return paragraphs


def _fix_function_word_freq(sentences: list, intensity: float) -> list:
    """Adjust function word distribution to deviate from AI profile.

    AI text uses function words (the, of, in, to, for, with, that, is, are)
    in predictable ratios. Humans use more varied patterns.
    """
    result = []
    # Common AI function word reductions
    _fw_swaps = {
        "it is important to note that": "",
        "it is worth noting that": "",
        "it is crucial to recognize that": "",
        "it is essential to note that": "",
        "the purpose of this analysis is to": "this analysis will",
        "this analysis aims to": "this analysis will",
        "delve into": "explore",
        "delving into": "exploring",
        "paramount": "key",
        "multifaceted": "complex",
        "foster": "build",
        "underscore": "highlight",
        "crucial role": "key part",
        "utilize": "use", "utilization": "use",
        "in order to": "to", "due to the fact that": "because",
        "for the purpose of": "to", "with regard to": "about",
        "in terms of": "for", "on the basis of": "based on",
        "in the context of": "in", "with respect to": "about",
        "it is important to": "we should",
        "it is necessary to": "we need to",
        "it is evident that": "clearly",
        "it should be noted that": "",
        # --- Added from Colab aggressive training data (top AI indicators) ---
        "it is also": "this is also",
        "it is essential": "this is essential",
        "it is crucial": "this is crucial",
        "such as": "like",
        "a variety of": "a range of",
        "a wide variety of": "all sorts of",
        "including the": "like the",
        "important to consider": "worth considering",
        "can be seen": "shows up",
        "can be observed": "appears",
        "can be achieved": "is possible",
        "it can be": "this could be",
        "helps to": "lets us",
        "it helps": "this lets",
    }
    for sent in sentences:
        for old, new in _fw_swaps.items():
            if old in sent.lower():
                idx = sent.lower().find(old)
                orig = sent[idx:idx + len(old)]
                repl = new
                if orig[0].isupper() and repl:
                    repl = repl[0].upper() + repl[1:]
                rest = sent[idx + len(old):]
                if not repl and rest:
                    rest = rest.lstrip()
                    if rest:
                        rest = rest[0].upper() + rest[1:]
                # ONLY apply if the resulting text is not weirdly joined
                sent = sent[:idx] + repl + ("[SPACE]" if repl and not repl.endswith(" ") else "") + rest
                sent = sent.replace("[SPACE]", " ").replace("  ", " ")
                break
        result.append(sent)
    return result


def _fix_low_dependency_depth(sentences: list, intensity: float) -> list:
    """Increase syntactic complexity by combining simple sentences.

    Uses SAFE operations: merging adjacent short sentences with
    subordinating conjunctions. Avoids inserting random clauses that
    could corrupt grammar.
    """
    if len(sentences) < 3:
        return sentences

    result = []
    _subordinators = [
        " because ", " since ", " although ", " while ", " whereas ",
        " even though ", " given that ",
    ]
    i = 0
    while i < len(sentences):
        sent = sentences[i]
        words = sent.split()
        # Merge two consecutive short-medium sentences with a subordinator
        # Only merge if combined length stays within 50 words
        if (i + 1 < len(sentences) and _MIN_SENT_WORDS <= len(words) <= 20
                and _MIN_SENT_WORDS <= len(sentences[i+1].split()) <= 20
                and len(words) + len(sentences[i+1].split()) <= _MAX_SENT_WORDS
                and random.random() < 0.3 * intensity):
            s1 = sent.rstrip(".")
            s2 = _safe_downcase_first(sentences[i+1])
            if not s2.startswith(("and ", "but ", "yet ", "still ")):
                conj = random.choice(_subordinators)
                merged = s1 + conj + s2
                if not merged.endswith((".", "!", "?")):
                    merged = merged.rstrip(".,;:") + "."
                result.append(merged)
                i += 2
                continue
        result.append(sent)
        i += 1
    return result


def _fix_low_shannon_entropy(sentences: list, intensity: float,
                              used_words: set, ctx) -> list:
    """Increase character-level entropy through synonym + dictionary variation."""
    result = []
    for sent in sentences:
        sent = utils.synonym_replace(sent, min(intensity * 0.8, 4.0), used_words,
                                      protected_extra=ctx.protected_terms if ctx else None)
        sent = _apply_large_dictionary(sent, min(intensity * 0.6, 3.5), used_words,
                                       ctx=ctx, mode="ghost_mini")
        result.append(sent)
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN HUMANIZE FUNCTION — per-detector loop + signal-aware fixes
# ═══════════════════════════════════════════════════════════════════════════

def humanize(text: str, strength: str = "medium",
             target_score: float = None,
             stealth: bool = True,
             preserve_sentences: bool = False,
             strict_meaning: bool = False,
             tone: str = "neutral",
             mode: str = None,
             enable_post_processing: bool = True) -> str:
    """
    Main humanizer pipeline with real-time per-detector scoring loop
    and signal-aware targeted transforms.

    Modes:
      - mode='ghost_mini': Top 5 detectors ALL below 20% AI score
      - mode='ghost_pro': ALL 22 detectors MAX below 5% AI score
      - mode=None: Legacy average-based detection loop

    Settings:
      - strength: 'light', 'medium', 'strong'
      - preserve_sentences: prevent splitting/merging
      - strict_meaning: reduce aggressiveness to preserve meaning
      - tone: 'neutral', 'formal', 'casual'
    """
    if not text or not text.strip():
        return text

    # Build settings
    settings = HumanizeSettings(
        stealth=stealth, strength=strength,
        preserve_sentences=preserve_sentences,
        strict_meaning=strict_meaning, tone=tone,
        mode=mode,
    )
    if target_score is not None:
        settings.target_score = target_score

    # ── Step 0: Context analysis ────────────────────────────────────────
    ctx = None
    if HAS_CONTEXT:
        ctx = analyze_context(text)

    original_text = text
    best_result = text
    best_score = 100.0
    best_max_detector = 100.0
    used_words_global = set()

    # ── Phase 1: Standard humanization pipeline (iterative) ────────────
    # Strategy: every 3 iterations, restart from original text with fresh
    # randomness. This produces DIVERSE rewrite candidates. We keep the best.
    for iteration in range(settings.max_iterations):
        # Escalate intensity each pass
        # Intensity cap scales with strength
        if mode == "ghost_pro":
            _cap = {"light": 3.1, "medium": 5.5, "strong": 8.0}.get(settings.strength, 5.5)
        elif mode == "ghost_mini":
            _cap = {"light": 2.8, "medium": 5.0, "strong": 7.5}.get(settings.strength, 5.0)
        else:
            _cap = 2.5
        intensity = min(settings.base_intensity + (iteration * 0.35), _cap)

        # Every 3 iterations, restart from original with fresh used_words
        # This gives the pipeline different random seeds and fresh words
        if iteration > 0 and iteration % 3 == 0:
            source = original_text
            used_words = set()  # Fresh start
        else:
            source = best_result if iteration > 0 else text
            used_words = set(used_words_global)

        # Preserve paragraph structure
        paragraphs = re.split(r'\n\s*\n', source)
        processed_paragraphs = []

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            para_result = _humanize_paragraph(
                para, intensity, used_words, ctx, settings,
                iteration=iteration
            )
            if para_result:
                processed_paragraphs.append(para_result)

        current_result = "\n\n".join(processed_paragraphs)

        # Expand contractions (safety net)
        if HAS_ADVANCED:
            current_result = expand_contractions(current_result)

        # Score what users actually receive (post-processed output)
        if mode in ("ghost_mini", "ghost_pro") and enable_post_processing:
            current_result = _post_process(current_result)

        used_words_global.update(used_words)

        # Check change ratio
        change_ratio = _word_change_ratio(original_text, current_result)

        # ── Per-detector scoring (new) ──────────────────────────────
        if mode in ("ghost_mini", "ghost_pro"):
            analysis = _get_full_analysis(current_result)
            passed, worst_det, max_ai, det_scores = _check_detector_targets(analysis, mode)
            signals = analysis.get('signals', {})
            current_score = max_ai

            if current_score < best_score or (
                    current_score <= best_score + 2.0 and
                    change_ratio > _word_change_ratio(original_text, best_result)):
                best_result = current_result
                best_score = current_score
                best_max_detector = max_ai

            # Exit if target met and change ratio sufficient
            if passed and change_ratio >= settings.min_change_ratio:
                break

            # ── Signal-aware targeted fixes ─────────────────────────
            # Only apply starting from iteration 2 (let pipeline warm up first)
            if settings.signal_fix_enabled and iteration >= 2:
                weak_signals = _identify_weak_signals(signals)
                if weak_signals:
                    fixed = _apply_signal_fixes(
                        best_result, weak_signals, intensity,
                        used_words_global, ctx, settings
                    )
                    if HAS_ADVANCED:
                        fixed = expand_contractions(fixed)
                    # Run cleanup to catch any artifacts from signal fixes
                    fixed = _cleanup(fixed)
                    if enable_post_processing:
                        fixed = _post_process(fixed)

                    # Re-check after signal fixes
                    fixed_analysis = _get_full_analysis(fixed)
                    fixed_passed, _, fixed_max, _ = _check_detector_targets(fixed_analysis, mode)
                    fixed_ratio = _word_change_ratio(original_text, fixed)

                    # Only adopt signal-fixed version if it's actually better
                    if fixed_max < best_score:
                        best_result = fixed
                        best_score = fixed_max
                        best_max_detector = fixed_max

                    if fixed_passed and fixed_ratio >= settings.min_change_ratio:
                        break

        else:
            # Legacy: average-based scoring
            current_score = _get_avg_score(current_result)

            if current_score < best_score or (
                    current_score <= best_score + 2.0 and
                    change_ratio > _word_change_ratio(original_text, best_result)):
                best_result = current_result
                best_score = current_score

            if best_score <= settings.target_score and change_ratio >= settings.min_change_ratio:
                break

    # ── Phase 2: Extra signal-targeted passes (both modes) ──────────
    if mode in ("ghost_mini", "ghost_pro") and settings.signal_fix_enabled:
        _extra_map = {"light": 4, "medium": 8, "strong": 12}
        _extra_base = _extra_map.get(settings.strength, 8)
        _extra_max = _extra_base + 4 if mode == "ghost_pro" else _extra_base
        _prev_score = best_score
        _stall_count = 0
        for extra_pass in range(_extra_max):
            analysis = _get_full_analysis(best_result)
            passed, worst_det, max_ai, det_scores = _check_detector_targets(analysis, mode)
            if passed:
                break

            signals = analysis.get('signals', {})
            weak_signals = _identify_weak_signals(signals)
            if not weak_signals:
                break

            _p2_cap = {"light": 2.5, "medium": 4.5, "strong": 6.5}.get(settings.strength, 4.5)
            intensity = min(2.0 + (extra_pass * 0.15), _p2_cap)
            fixed = _apply_signal_fixes(
                best_result, weak_signals, intensity,
                used_words_global, ctx, settings
            )
            if HAS_ADVANCED:
                fixed = expand_contractions(fixed)
            fixed = _cleanup(fixed)
            if enable_post_processing:
                fixed = _post_process(fixed)

            fixed_analysis = _get_full_analysis(fixed)
            _, _, fixed_max, _ = _check_detector_targets(fixed_analysis, mode)

            if fixed_max < best_score:
                best_result = fixed
                best_score = fixed_max
                _stall_count = 0
            else:
                _stall_count += 1

            # Plateau detection: stop if no improvement for 3 consecutive passes
            if _stall_count >= 3:
                break

    # ── Optional post-processing (independent of humanizer engine) ──
    if enable_post_processing:
        best_result = _post_process(best_result)

    if mode == "ghost_pro":
        try:
            from aggressive_stealth_post_processor import execute_aggressive_stealth_post_processing
            best_result = execute_aggressive_stealth_post_processing(best_result)
        except ImportError:
            pass

    return best_result
