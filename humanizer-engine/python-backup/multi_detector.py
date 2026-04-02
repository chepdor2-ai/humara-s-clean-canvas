"""
Multi-Engine AI Text Detector v2 — Advanced Mathematical Detection
==================================================================
Implements 20+ detection engines with rigorous statistical analysis.
Each engine computes:   P(AI-generated | features)

Mathematical foundations:
────────────────────────
 1.  Word bigram conditional entropy  H(W_n | W_{n-1})
 2.  Per-sentence perplexity variance (coefficient of variation)
 3.  Yule's K characteristic, Honore's R, Guiraud's R
 4.  Zipf's law deviation via OLS on log-log rank-frequency
 5.  Shannon conditional entropy on character bigrams
 6.  Spectral flatness via DFT of sentence-length sequence
 7.  Log-likelihood ratio G² test for n-gram significance
 8.  Cosine similarity of sentence feature vectors (uniformity)
 9.  Word bigram transition probability (token predictability)
10.  Per-sentence mini-classification (GPTZero replication)
11.  Function-word distributional distance from AI profile
12.  Subordination depth proxy via conjunction/relative-clause counting
13.  Logistic scoring with sigmoid calibration per detector
14.  Interaction terms (signal cross-products)
15.  Bayesian-weighted ensemble aggregation with tier priors
"""

import math
import re
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional

try:
    import textstat
    _HAS_TEXTSTAT = True
except ImportError:
    _HAS_TEXTSTAT = False

try:
    from nltk.tokenize import sent_tokenize, word_tokenize
    _HAS_NLTK = True
except Exception:
    _HAS_NLTK = False

    def sent_tokenize(text: str) -> list:
        """Regex sentence tokenizer (fallback)."""
        parts = re.split(r'(?<=[.!?])\s+(?=[A-Z"\'\(])', text)
        return [s.strip() for s in parts if s.strip() and len(s.split()) >= 3]

    def word_tokenize(text: str) -> list:
        return re.findall(r"\b[a-z]+(?:'[a-z]+)?\b", text.lower())


# ============================================================================
# MATH HELPERS
# ============================================================================

def _sigmoid(x: float) -> float:
    """Numerically stable sigmoid  σ(x) = 1 / (1 + e^{-x})."""
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    z = math.exp(x)
    return z / (1.0 + z)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _safe_log2(x: float) -> float:
    return math.log2(x) if x > 0 else 0.0


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def _variance(xs, mu=None):
    if len(xs) < 2:
        return 0.0
    if mu is None:
        mu = _mean(xs)
    return sum((x - mu) ** 2 for x in xs) / len(xs)


def _std(xs, mu=None):
    return math.sqrt(_variance(xs, mu))


def _cv(xs):
    """Coefficient of variation."""
    mu = _mean(xs)
    if abs(mu) < 1e-9:
        return 0.0
    return _std(xs, mu) / abs(mu)


def _cosine_sim(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return dot / (na * nb)


def _kl_divergence(p: list, q: list) -> float:
    """KL divergence D_KL(P || Q) with smoothing."""
    eps = 1e-10
    return sum(pi * math.log((pi + eps) / (qi + eps))
               for pi, qi in zip(p, q) if pi > eps)


def _linear_regression(xs, ys):
    """OLS — returns (slope, intercept, r_squared)."""
    n = len(xs)
    if n < 3:
        return 0.0, 0.0, 0.0
    mx, my = _mean(xs), _mean(ys)
    ss_xy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    ss_xx = sum((x - mx) ** 2 for x in xs)
    ss_yy = sum((y - my) ** 2 for y in ys)
    if ss_xx < 1e-12:
        return 0.0, my, 0.0
    slope = ss_xy / ss_xx
    intercept = my - slope * mx
    r_sq = (ss_xy ** 2) / (ss_xx * ss_yy) if ss_yy > 1e-12 else 0.0
    return slope, intercept, min(r_sq, 1.0)


def _skewness(xs):
    n = len(xs)
    if n < 3:
        return 0.0
    mu = _mean(xs)
    s = _std(xs, mu)
    if s < 1e-12:
        return 0.0
    return sum(((x - mu) / s) ** 3 for x in xs) / n


def _kurtosis(xs):
    n = len(xs)
    if n < 4:
        return 0.0
    mu = _mean(xs)
    s = _std(xs, mu)
    if s < 1e-12:
        return 0.0
    return sum(((x - mu) / s) ** 4 for x in xs) / n - 3.0  # excess kurtosis


def _geometric_mean(xs):
    """Geometric mean via log-sum (avoids overflow)."""
    if not xs or any(x <= 0 for x in xs):
        return 0.0
    return math.exp(sum(math.log(x) for x in xs) / len(xs))


def _sig_norm(value: float, center: float, slope: float) -> float:
    """Sigmoid normalization to 0-100 scale with given center and slope."""
    return _sigmoid((value - center) * slope) * 100.0


def _platt_calibrate(raw_score: float, a: float, b: float) -> float:
    """Apply Platt scaling to a raw detector score (0-100)."""
    return _sigmoid(a * raw_score + b) * 100.0


# ============================================================================
# AI MARKER DATA
# ============================================================================

AI_MARKER_WORDS = frozenset({
    # Formal hedging / boosting
    "utilize", "utilise", "leverage", "facilitate", "comprehensive",
    "multifaceted", "paramount", "furthermore", "moreover", "additionally",
    "consequently", "subsequently", "nevertheless", "notwithstanding",
    "aforementioned", "henceforth", "paradigm", "methodology", "methodologies",
    "framework", "trajectory", "discourse", "dichotomy", "conundrum",
    "juxtaposition", "ramification", "underpinning", "synergy",
    # Over-used AI adjectives
    "robust", "nuanced", "salient", "ubiquitous", "pivotal",
    "intricate", "meticulous", "profound", "inherent", "overarching",
    "substantive", "efficacious", "holistic", "transformative", "innovative",
    "groundbreaking", "cutting-edge", "state-of-the-art", "noteworthy",
    # Over-used AI verbs
    "proliferate", "exacerbate", "ameliorate", "engender", "promulgate",
    "delineate", "elucidate", "illuminate", "necessitate", "perpetuate",
    "culminate", "underscore", "exemplify", "encompass", "bolster",
    "catalyze", "streamline", "optimize", "enhance", "mitigate",
    "navigate", "prioritize", "articulate", "substantiate", "corroborate",
    "disseminate", "cultivate", "ascertain", "endeavor", "underscore",
    "delve", "embark", "foster", "harness", "spearhead",
    "underscore", "unravel", "unveil",
    # Connector words AI overuses
    "notably", "specifically", "crucially", "importantly", "significantly",
    "essentially", "fundamentally", "arguably", "undeniably", "undoubtedly",
    "interestingly", "remarkably", "evidently",
    # Abstract nouns
    "aforementioned", "implication", "implications", "realm", "landscape",
    "tapestry", "cornerstone", "bedrock", "linchpin", "catalyst",
    "nexus", "spectrum", "myriad", "plethora", "multitude",
})

AI_PHRASE_PATTERNS = [
    # "it is X that" constructions
    r"it is (?:important|crucial|essential|worth noting|imperative|vital|noteworthy|evident|clear) (?:to note )?that",
    r"it (?:should|must|can|cannot) be (?:noted|argued|said|emphasized|stressed|acknowledged) that",
    # "in X" prepositional patterns
    r"in (?:order|light of|terms of|the context of|accordance with|the realm of|today's|this)",
    r"in (?:a world|an era|recent years|the modern)",
    # "plays a X role" pattern
    r"plays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|instrumental|central) role",
    # Range/quantity hedging
    r"a (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of",
    r"a (?:plethora|myriad|multitude|wealth|abundance) of",
    # Causal constructions
    r"(?:due to|owing to) the fact that",
    r"as a (?:result|consequence|matter of fact)",
    r"this (?:has led|leads|led) to",
    # Formal connectors
    r"with (?:respect|regard) to",
    r"on the other hand",
    r"first and foremost",
    r"each and every",
    r"needless to say",
    r"there is no doubt that",
    r"at the end of the day",
    # Academic AI patterns
    r"(?:has|have) (?:significantly|greatly|substantially|profoundly|markedly) (?:increased|improved|contributed|reduced|enhanced|impacted|influenced|transformed|shaped)",
    r"this (?:paper|essay|study|research|analysis|article|section|chapter) (?:discusses|examines|explores|investigates|delves into|sheds light on|aims to)",
    r"(?:in|to) (?:sum|summar|conclud)(?:up|ary|e|sion)",
    r"serves? as a (?:testament|reminder|catalyst|cornerstone|foundation|framework)",
    # "the X of Y" over-formal constructions
    r"the (?:importance|significance|impact|implications?|role|potential|landscape|realm|fabric) of",
    # Transition hedges
    r"(?:that being said|having said that|with that in mind|by the same token)",
    r"(?:it goes without saying|one cannot deny|it is worth mentioning)",
    r"(?:taken together|all things considered|on the whole)",
    # AI conclusion patterns
    r"(?:in|to) (?:light of|view of) (?:the above|this|these)",
    r"(?:moving forward|going forward|looking ahead)",
    r"the (?:bottom line|reality|fact of the matter) is",
    # Overly balanced constructions
    r"while .{5,40}, it is (?:also|equally) (?:important|crucial|vital)",
    r"not only .{5,40} but also",
    r"both .{3,20} and .{3,20} (?:play|have|are|contribute)",
    # Hedging patterns
    r"(?:can|could|may|might) (?:potentially|possibly|arguably|conceivably)",
    r"it (?:remains|is) (?:unclear|debatable|open to question|yet to be seen)",
]

AI_SENTENCE_STARTERS = [
    "furthermore,", "moreover,", "additionally,", "consequently,",
    "however,", "nevertheless,", "in conclusion,", "in summary,",
    "therefore,", "subsequently,", "accordingly,", "notably,",
    "specifically,", "thus,", "hence,", "indeed,", "certainly,",
    "undoubtedly,", "interestingly,", "importantly,", "significantly,",
    "crucially,", "ultimately,", "essentially,", "fundamentally,",
    "it is important", "it is crucial", "it is worth noting",
    "it should be noted", "it is evident that", "it can be argued",
    "in today's", "in the modern", "in recent years,", "in an era",
    "this has led", "this demonstrates", "this highlights",
    "one of the most", "one cannot deny",
]

FUNCTION_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "if", "then", "of", "in",
    "to", "for", "with", "on", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "out", "off",
    "up", "down", "about", "is", "am", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "must", "can", "could", "need",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
    "them", "my", "your", "his", "its", "our", "their", "this", "that",
    "these", "those", "who", "whom", "which", "what", "where", "when",
    "how", "why", "not", "no", "nor", "both", "each", "few", "more",
    "most", "other", "some", "such", "than", "too", "very", "so",
    "just", "also", "still", "already", "even", "only", "now",
})

SUBORDINATORS = frozenset({
    "although", "because", "since", "unless", "until", "while", "whereas",
    "whenever", "wherever", "whether", "though", "provided", "assuming",
    "if", "after", "before", "when", "once", "as",
})

RELATIVE_PRONOUNS = frozenset({"who", "whom", "whose", "which", "that"})

# AI's typical function word profile (empirically derived distributional means)
# Each entry: expected proportion in AI-generated text
AI_FUNCTION_PROFILE = {
    "the": 0.072, "of": 0.038, "and": 0.032, "to": 0.030, "in": 0.025,
    "a": 0.022, "is": 0.020, "that": 0.016, "for": 0.013, "it": 0.012,
    "as": 0.011, "with": 0.011, "this": 0.010, "are": 0.010, "by": 0.008,
    "on": 0.008, "has": 0.008, "have": 0.007, "from": 0.006, "be": 0.006,
    "an": 0.005, "or": 0.005, "can": 0.005, "been": 0.004, "their": 0.004,
    "its": 0.004, "which": 0.004, "more": 0.004, "also": 0.004,
}

# Signals where HIGH value = more human-like (will be inverted for AI scoring)
HUMAN_POSITIVE_SIGNALS = frozenset({
    "perplexity", "burstiness", "vocabulary_richness",
    "shannon_entropy", "readability_consistency",
    "stylometric_score", "starter_diversity", "word_length_variance",
    "spectral_flatness", "lexical_density_var", "dependency_depth",
})

# Top-200 common English words (frequency proxy)
COMMON_200 = frozenset({
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their",
    "what", "so", "up", "out", "if", "about", "who", "get", "which", "go",
    "me", "when", "make", "can", "like", "time", "no", "just", "him",
    "know", "take", "people", "into", "year", "your", "good", "some",
    "could", "them", "see", "other", "than", "then", "now", "look",
    "only", "come", "its", "over", "think", "also", "back", "after",
    "use", "two", "how", "our", "work", "first", "well", "way", "even",
    "new", "want", "because", "any", "these", "give", "day", "most", "us",
    "is", "are", "was", "were", "been", "has", "had", "did", "does",
    "being", "having", "doing", "more", "very", "much", "said", "each",
    "many", "before", "between", "under", "never", "same", "another",
    "while", "last", "might", "great", "since", "against", "right",
    "still", "own", "too", "found", "here", "thing", "long", "made",
    "world", "until", "went", "away", "always", "part", "every", "used",
})


# ============================================================================
# TEXT SIGNALS — 20 advanced statistical feature extractors
# ============================================================================

class TextSignals:
    """
    Extract 20 statistical detection signals from a text sample.
    Each signal returns 0-100.
    Direction varies: see HUMAN_POSITIVE_SIGNALS set.
    """

    def __init__(self, text: str):
        self.text = text
        self.text_lower = text.lower()
        self.sentences = sent_tokenize(text) if text.strip() else []
        self.words = word_tokenize(text.lower()) if text.strip() else []
        self.word_count = len(self.words)
        self.sentence_count = len(self.sentences)
        self.paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
        if len(self.paragraphs) < 2:
            self.paragraphs = self.sentences

        # Pre-compute word frequency distribution
        self.word_freq = Counter(self.words)
        self.vocab_size = len(self.word_freq)

        # Per-sentence word lists
        self.sent_words = [
            word_tokenize(s.lower()) for s in self.sentences
        ]

    # ------------------------------------------------------------------
    # 1. PERPLEXITY — word-level entropy + conditional bigram entropy
    # ------------------------------------------------------------------
    def perplexity(self) -> float:
        """
        Combined perplexity proxy:
          (a) H₁ = -Σ P(w) log₂ P(w)                  [unigram entropy]
          (b) H₂ = -Σ P(w₁,w₂) log₂ P(w₂|w₁)         [bigram conditional]
          (c) ratio = H₂ / H₁                          [contextual predictability]

        For short text (< 80 words), bigram conditional entropy is unreliable
        (most bigrams are unique → degenerate model), so we fall back to
        unigram entropy blended with character-level entropy.

        Returns 0-100: 0 = very predictable (AI), 100 = unpredictable (human).
        """
        if self.word_count < 15:
            return 42.0

        N = self.word_count

        # (a) Unigram entropy H₁
        H1 = -sum((c / N) * _safe_log2(c / N) for c in self.word_freq.values())

        # Length-adjusted center (entropy grows with ~log of text length)
        h1_center = 5.5 + 0.8 * math.log10(max(N, 30) / 50)
        h1_score = _sig_norm(H1, h1_center, 0.8)

        # (b) Check if bigram model is reliable
        bigrams = [(self.words[i], self.words[i + 1]) for i in range(N - 1)]
        bi_freq = Counter(bigrams)
        hapax_bi = sum(1 for c in bi_freq.values() if c == 1)
        hapax_bi_ratio = hapax_bi / len(bi_freq) if bi_freq else 1.0

        if hapax_bi_ratio > 0.75 or N < 80:
            # Conditional entropy is degenerate — most bigrams unique.
            # Fall back: blend unigram word entropy + character unigram entropy.
            char_freq = Counter(self.text_lower)
            char_total = len(self.text_lower)
            char_h = (-sum((c / char_total) * _safe_log2(c / char_total)
                          for c in char_freq.values()) if char_total > 0 else 3.5)
            # char_h: AI formal ≈ 4.0-4.3, Human informal ≈ 3.8-4.2, center ≈ 4.15
            char_score = _sig_norm(char_h, 4.15, 3.0)
            return _clamp(h1_score * 0.55 + char_score * 0.45)

        # (c) Full conditional entropy for texts with enough data
        N_bi = len(bigrams)
        H2_cond = 0.0
        for (w1, w2), count in bi_freq.items():
            p_joint = count / N_bi
            p_cond = count / self.word_freq[w1]
            H2_cond -= p_joint * _safe_log2(p_cond)

        ratio = H2_cond / H1 if H1 > 0.01 else 0.5

        h2_center = 4.0 + 0.6 * math.log10(max(N, 50) / 80)
        h2_score = _sig_norm(H2_cond, h2_center, 0.7)
        ratio_score = _sig_norm(ratio, 0.70, 6.0)

        return _clamp(h1_score * 0.25 + h2_score * 0.45 + ratio_score * 0.30)

    # ------------------------------------------------------------------
    # 2. BURSTINESS — per-sentence feature variance
    # ------------------------------------------------------------------
    def burstiness(self) -> float:
        """
        Measures variance across sentences in:
          - sentence length (word count)
          - average word length per sentence
          - function word ratio per sentence

        AI produces uniform sentences → low CV.
        Humans produce bursty text → high CV.
        Returns 0-100: 0 = uniform (AI), 100 = bursty (human).
        """
        if self.sentence_count < 4:
            return 40.0

        sent_lengths = [len(ws) for ws in self.sent_words if ws]
        sent_avg_wl = [_mean([len(w) for w in ws]) for ws in self.sent_words if ws]
        sent_fw_ratio = [
            sum(1 for w in ws if w in FUNCTION_WORDS) / max(len(ws), 1)
            for ws in self.sent_words if ws
        ]

        if not sent_lengths:
            return 40.0

        cv_len = _cv(sent_lengths)
        cv_wl = _cv(sent_avg_wl) if sent_avg_wl else 0.0
        cv_fw = _cv(sent_fw_ratio) if sent_fw_ratio else 0.0

        # Combine CVs — sentence length CV is most important
        # AI CV_len: 0.12-0.30, Human: 0.30-0.80, center: 0.28
        len_score = _sig_norm(cv_len, 0.28, 5.0)
        wl_score = _sig_norm(cv_wl, 0.12, 8.0)
        fw_score = _sig_norm(cv_fw, 0.10, 8.0)

        return _clamp(len_score * 0.55 + wl_score * 0.25 + fw_score * 0.20)

    # ------------------------------------------------------------------
    # 3. VOCABULARY RICHNESS — TTR + Yule's K + Honore's R + Guiraud
    # ------------------------------------------------------------------
    def vocabulary_richness(self) -> float:
        """
        Composite vocabulary diversity:
          (a) Guiraud's R = V / √N  (length-corrected TTR)
          (b) Yule's K = 10⁴(M₂ - N) / N²   (repeat concentration)
          (c) Hapax legomena ratio = V₁ / V    (single-occurrence words)
          (d) Honore's R = 100 log(N) / (1 - V₁/V)

        AI recycles vocabulary → lower R, higher K.
        Returns 0-100: 0 = repetitive (AI), 100 = rich (human).
        """
        if self.word_count < 15:
            return 45.0

        N = self.word_count
        V = self.vocab_size
        V1 = sum(1 for c in self.word_freq.values() if c == 1)  # hapax

        # (a) Guiraud's R = V / √N
        guiraud = V / math.sqrt(N)
        # AI: 5.5-7.5, Human: 7.5-12, center: 7.0
        guiraud_score = _sig_norm(guiraud, 7.0, 0.6)

        # (b) Yule's K = 10⁴(M₂ - N) / N²
        M2 = sum(f * f for f in self.word_freq.values())
        yule_k = 10000.0 * (M2 - N) / (N * N) if N > 1 else 0
        # Lower K = richer vocabulary = more human
        # AI: K ≈ 80-200, Human: K ≈ 20-100, center: 100
        yule_score = _sig_norm(yule_k, 100.0, -0.015)  # inverted: lower is better

        # (c) Hapax ratio
        hapax_ratio = V1 / V if V > 0 else 0
        # AI: 0.45-0.60, Human: 0.60-0.85, center: 0.58
        hapax_score = _sig_norm(hapax_ratio, 0.58, 5.0)

        # (d) Honore's R = 100 * log(N) / (1 - V1/V)
        v1_over_v = V1 / V if V > 0 else 0.5
        if v1_over_v >= 0.9999:
            honore = 100 * math.log(N)  # all unique
        else:
            honore = 100 * math.log(N) / (1  - v1_over_v)
        # Higher R = richer = more human
        # AI: 500-1100, Human: 1000-2500, center: 1000
        honore_score = _sig_norm(honore, 1000.0, 0.002)

        return _clamp(
            guiraud_score * 0.30 + yule_score * 0.25 +
            hapax_score * 0.25 + honore_score * 0.20
        )

    # ------------------------------------------------------------------
    # 4. SENTENCE UNIFORMITY — cosine similarity of sentence vectors
    # ------------------------------------------------------------------
    def sentence_uniformity(self) -> float:
        """
        Build mini feature vector per sentence:
          [length, avg_word_len, func_word_ratio, punct_density]
        Compute mean pairwise cosine similarity.

        AI sentences are structurally similar → high score.
        Returns 0-100: 0 = varied (human), 100 = uniform (AI).
        """
        if self.sentence_count < 4:
            return 55.0

        vectors = []
        for i, ws in enumerate(self.sent_words):
            if len(ws) < 3:
                continue
            s_text = self.sentences[i] if i < len(self.sentences) else ""
            length = len(ws)
            avg_wl = _mean([len(w) for w in ws])
            fw_ratio = sum(1 for w in ws if w in FUNCTION_WORDS) / length
            punct = sum(1 for c in s_text if c in '.,;:!?-()') / max(length, 1)
            vectors.append([length, avg_wl, fw_ratio, punct])

        if len(vectors) < 3:
            return 55.0

        # Mean pairwise cosine similarity
        total_sim = 0.0
        pair_count = 0
        for i in range(len(vectors)):
            for j in range(i + 1, len(vectors)):
                total_sim += _cosine_sim(vectors[i], vectors[j])
                pair_count += 1

        mean_sim = total_sim / pair_count if pair_count > 0 else 0.5

        # AI: mean_sim ≈ 0.92-0.99, Human: 0.80-0.94, center: 0.93
        uniformity = _sig_norm(mean_sim, 0.93, 25.0)
        return _clamp(uniformity)

    # ------------------------------------------------------------------
    # 5. AI PATTERN DETECTION — weighted cliche & phrase scoring
    # ------------------------------------------------------------------
    def ai_pattern_score(self) -> float:
        """
        Detect AI-characteristic phrases, words, and sentence starters.
        Each pattern is weighted by specificity.
        Returns 0-100: 0 = no AI patterns, 100 = saturated.
        """
        if self.word_count < 10:
            return 0.0

        # A — Marker words (weighted by word_count)
        marker_count = sum(1 for w in self.words if w in AI_MARKER_WORDS)
        marker_density = marker_count / self.word_count

        # B — Phrase patterns (weighted by sentence_count)
        phrase_hits = 0
        for pattern in AI_PHRASE_PATTERNS:
            phrase_hits += len(re.findall(pattern, self.text_lower))
        phrase_density = phrase_hits / max(self.sentence_count, 1)

        # C — AI sentence starters
        starter_hits = 0
        for sent in self.sentences:
            sl = sent.strip().lower()
            if any(sl.startswith(s) for s in AI_SENTENCE_STARTERS):
                starter_hits += 1
        starter_ratio = starter_hits / max(self.sentence_count, 1)

        # D — Consecutive formal connectors (2+ in a row is very AI)
        consecutive_bonus = 0
        for i in range(len(self.sentences) - 1):
            sl_a = self.sentences[i].strip().lower()
            sl_b = self.sentences[i + 1].strip().lower()
            a_starts = any(sl_a.startswith(s) for s in AI_SENTENCE_STARTERS)
            b_starts = any(sl_b.startswith(s) for s in AI_SENTENCE_STARTERS)
            if a_starts and b_starts:
                consecutive_bonus += 1

        # Sigmoid-based component scoring:
        # marker_density: AI ≈ 0.02-0.06, Human ≈ 0.00-0.01, center: 0.012
        marker_s = _sig_norm(marker_density, 0.012, 120.0)
        # phrase_density: AI ≈ 0.3-1.5, Human ≈ 0.0-0.2, center: 0.15
        phrase_s = _sig_norm(phrase_density, 0.15, 5.0)
        # starter_ratio: AI ≈ 0.15-0.60, Human ≈ 0.0-0.10, center: 0.10
        starter_s = _sig_norm(starter_ratio, 0.10, 10.0)
        # consecutive bonus
        consec_s = min(consecutive_bonus * 15, 30)

        score = marker_s * 0.30 + phrase_s * 0.30 + starter_s * 0.25 + consec_s
        return _clamp(score)

    # ------------------------------------------------------------------
    # 6. SHANNON ENTROPY — character bigram conditional entropy
    # ------------------------------------------------------------------
    def shannon_entropy(self) -> float:
        """
        Conditional entropy of character bigrams:
          H(C₂|C₁) = -Σ P(c₁,c₂) log₂ P(c₂|c₁)

        AI text has more predictable character transitions.
        Returns 0-100: 0 = low entropy (AI), 100 = high entropy (human).
        """
        text = self.text_lower
        if len(text) < 50:
            return 45.0

        # Character bigram and unigram counts
        bi_counts = Counter()
        uni_counts = Counter()
        for i in range(len(text) - 1):
            bi_counts[text[i:i + 2]] += 1
            uni_counts[text[i]] += 1
        uni_counts[text[-1]] = uni_counts.get(text[-1], 0) + 1

        N_bi = sum(bi_counts.values())

        # Conditional entropy H(C₂|C₁)
        H_cond = 0.0
        for (c1c2), count in bi_counts.items():
            c1 = c1c2[0]
            p_joint = count / N_bi
            p_cond = count / uni_counts[c1] if uni_counts[c1] > 0 else 0.001
            H_cond -= p_joint * _safe_log2(p_cond)

        # AI: H ≈ 2.8-3.5, Human: H ≈ 3.4-4.5, center: 3.4
        return _clamp(_sig_norm(H_cond, 3.4, 2.5))

    # ------------------------------------------------------------------
    # 7. READABILITY CONSISTENCY — multi-metric cross-chunk variance
    # ------------------------------------------------------------------
    def readability_consistency(self) -> float:
        """
        Compute readability scores per chunk (3-sentence windows).
        Measure variance across chunks.
        AI maintains unnaturally consistent readability.

        Returns 0-100: 0 = consistent (AI), 100 = varied (human).
        """
        if not _HAS_TEXTSTAT or self.sentence_count < 6:
            # Fallback: use average sentence length variance as proxy
            if self.sentence_count < 4:
                return 45.0
            lengths = [len(ws) for ws in self.sent_words if ws]
            cv_l = _cv(lengths)
            return _clamp(_sig_norm(cv_l, 0.25, 5.0))

        # Build chunks of ~3 sentences
        chunk_size = 3
        chunks = []
        for i in range(0, self.sentence_count, chunk_size):
            chunk = " ".join(self.sentences[i:i + chunk_size])
            if len(chunk.split()) >= 10:
                chunks.append(chunk)

        if len(chunks) < 3:
            return 45.0

        # Multiple readability metrics per chunk
        fre_scores = []
        ari_scores = []
        for c in chunks:
            try:
                fre_scores.append(textstat.flesch_reading_ease(c))
            except Exception:
                pass
            try:
                ari_scores.append(textstat.automated_readability_index(c))
            except Exception:
                pass

        cvs = []
        if len(fre_scores) >= 3 and min(fre_scores) > 0:
            cvs.append(_cv(fre_scores))
        if len(ari_scores) >= 3 and min(ari_scores) > 0:
            cvs.append(_cv(ari_scores))

        if not cvs:
            return 45.0

        avg_cv = _mean(cvs)
        # AI: CV ≈ 0.03-0.12, Human: CV ≈ 0.10-0.40, center: 0.10
        return _clamp(_sig_norm(avg_cv, 0.10, 8.0))

    # ------------------------------------------------------------------
    # 8. STYLOMETRIC FEATURES — function words + punctuation + clauses
    # ------------------------------------------------------------------
    def stylometric_score(self) -> float:
        """
        Deep stylometric analysis:
          (a) Punctuation diversity and density
          (b) Comma-to-period ratio
          (c) Question/exclamation usage
          (d) Parenthetical & dash usage
          (e) Contraction usage (AI avoids contractions)
          (f) Personal pronoun density

        Returns 0-100: 0 = flat style (AI), 100 = rich style (human).
        """
        if self.word_count < 15:
            return 45.0

        # (a) Punctuation diversity
        punct_chars = [c for c in self.text if c in '.,;:!?-—()[]"\'/']
        punct_types = len(set(punct_chars))
        punct_density = len(punct_chars) / max(self.word_count, 1)

        # (b) Comma-to-period ratio
        commas = self.text.count(',')
        periods = self.text.count('.')
        comma_ratio = commas / max(periods, 1)

        # (c) Question/exclamation marks
        qe = self.text.count('?') + self.text.count('!')
        qe_ratio = qe / max(self.sentence_count, 1)

        # (d) Parenthetical / dash usage
        parens = self.text.count('(') + self.text.count('[')
        dashes = self.text.count('—') + self.text.count(' - ')
        pd_ratio = (parens + dashes) / max(self.sentence_count, 1)

        # (e) Contractions (n't, 're, 'll, 've, 's, 'd)
        contraction_count = len(re.findall(
            r"\b\w+(?:n't|'re|'ll|'ve|'s|'d|'m)\b", self.text_lower
        ))
        contraction_ratio = contraction_count / max(self.word_count, 1)

        # (f) Personal pronouns (AI avoids them)
        personal = frozenset({"i", "me", "my", "mine", "we", "us", "our", "ours",
                              "you", "your", "yours"})
        pronoun_count = sum(1 for w in self.words if w in personal)
        pronoun_ratio = pronoun_count / max(self.word_count, 1)

        # Scoring components
        # punct_types: AI ≈ 3-4, Human ≈ 5-8, center: 4.5
        pt_s = _sig_norm(punct_types, 4.5, 0.8)
        # comma_ratio: AI ≈ 1.0-2.0, Human ≈ 0.5-3.5 (more varied)
        cr_s = _sig_norm(abs(comma_ratio - 1.5), 0.8, -2.0)  # distance from AI mean
        # qe_ratio: AI ≈ 0, Human ≈ 0.05-0.20
        qe_s = _sig_norm(qe_ratio, 0.03, 15.0)
        # pd_ratio: AI ≈ 0.0-0.02, Human ≈ 0.02-0.15
        pd_s = _sig_norm(pd_ratio, 0.02, 20.0)
        # contractions: AI ≈ 0, Human varied
        ct_s = _sig_norm(contraction_ratio, 0.005, 200.0)
        # pronouns: AI ≈ 0.00-0.01, Human ≈ 0.02-0.08
        pr_s = _sig_norm(pronoun_ratio, 0.015, 60.0)

        return _clamp(
            pt_s * 0.15 + cr_s * 0.10 + qe_s * 0.15 +
            pd_s * 0.15 + ct_s * 0.20 + pr_s * 0.25
        )

    # ------------------------------------------------------------------
    # 9. N-GRAM REPETITION — G² log-likelihood ratio test
    # ------------------------------------------------------------------
    def ngram_repetition(self) -> float:
        """
        Measure n-gram repetition using G² log-likelihood ratio:
          G² = 2 Σ O_i ln(O_i / E_i)

        Tests whether observed repetition exceeds expected by chance.
        High repetition → AI-like.
        Returns 0-100: 0 = unique phrases (human), 100 = heavy repetition (AI).
        """
        if self.word_count < 25:
            return 10.0

        # Trigram analysis
        trigrams = [
            tuple(self.words[i:i + 3]) for i in range(self.word_count - 2)
        ]
        tri_freq = Counter(trigrams)
        N = len(trigrams)
        V = len(tri_freq)  # unique trigrams

        if V < 5:
            return 10.0

        # Expected frequency under uniform distribution: N / V
        E_uniform = N / V

        # G² statistic: sum over repeated trigrams only
        g_squared = 0.0
        repeated_count = 0
        for tri, observed in tri_freq.items():
            if observed >= 2:
                repeated_count += 1
                g_squared += 2 * observed * math.log(observed / E_uniform)

        # Normalize by N to make comparable across text lengths
        g_norm = g_squared / N if N > 0 else 0

        # Also compute simple repetition ratio
        repeat_ratio = repeated_count / V if V > 0 else 0

        # G_norm: AI ≈ 2-6, Human ≈ 0.5-2.5, center: 2.0
        g_score = _sig_norm(g_norm, 2.0, 0.8)
        # repeat_ratio: AI ≈ 0.10-0.30, Human ≈ 0.02-0.12, center: 0.08
        rr_score = _sig_norm(repeat_ratio, 0.08, 10.0)

        return _clamp(g_score * 0.55 + rr_score * 0.45)

    # ------------------------------------------------------------------
    # 10. SENTENCE STARTER DIVERSITY — entropy of first-word distribution
    # ------------------------------------------------------------------
    def starter_diversity(self) -> float:
        """
        Entropy of sentence-initial word distribution.
          H(starters) = -Σ P(s) log₂ P(s)

        AI: low entropy (reuses starters). Human: high entropy.
        Returns 0-100: 0 = repetitive (AI), 100 = diverse (human).
        """
        if self.sentence_count < 4:
            return 45.0

        starters = []
        for s in self.sentences:
            words = s.strip().split()
            if words:
                starters.append(words[0].lower())

        if not starters:
            return 45.0

        freq = Counter(starters)
        N = len(starters)
        entropy = -sum((c / N) * _safe_log2(c / N) for c in freq.values())

        # Maximum entropy = log₂(N)
        max_entropy = _safe_log2(N) if N > 0 else 1
        normalized_entropy = entropy / max_entropy if max_entropy > 0 else 0

        # Also: unique ratio
        unique_ratio = len(set(starters)) / N

        # normalized_entropy: AI ≈ 0.55-0.80, Human ≈ 0.80-1.0, center: 0.78
        ent_score = _sig_norm(normalized_entropy, 0.78, 8.0)
        # unique_ratio: AI ≈ 0.35-0.60, Human ≈ 0.60-0.95, center: 0.58
        uniq_score = _sig_norm(unique_ratio, 0.58, 5.0)

        return _clamp(ent_score * 0.55 + uniq_score * 0.45)

    # ------------------------------------------------------------------
    # 11. WORD LENGTH DISTRIBUTION — variance + kurtosis
    # ------------------------------------------------------------------
    def word_length_variance(self) -> float:
        """
        Full distribution analysis of word lengths:
          - variance (AI: low)
          - kurtosis (AI: platykurtic / normal; Human: more leptokurtic)

        Returns 0-100: 0 = uniform lengths (AI), 100 = varied (human).
        """
        if self.word_count < 15:
            return 45.0

        lengths = [len(w) for w in self.words]
        var = _variance(lengths)
        kurt = _kurtosis(lengths)
        skew = _skewness(lengths)

        # variance: AI ≈ 4-6.5, Human ≈ 6-10, center: 6.0
        var_score = _sig_norm(var, 6.0, 0.5)
        # kurtosis (excess): AI ≈ -0.5 to 0.5, Human: 0.5 to 3.0, center: 0.5
        kurt_score = _sig_norm(kurt, 0.5, 1.5)
        # skewness: AI ≈ 0.3-0.6, Human ≈ 0.5-1.2, center: 0.55
        skew_score = _sig_norm(skew, 0.55, 2.5)

        return _clamp(var_score * 0.45 + kurt_score * 0.30 + skew_score * 0.25)

    # ------------------------------------------------------------------
    # 12. PARAGRAPH UNIFORMITY — CV + topical overlap
    # ------------------------------------------------------------------
    def paragraph_uniformity(self) -> float:
        """
        Cross-paragraph length CV + vocabulary overlap.
        AI: uniform paragraphs with high overlap.
        Returns 0-100: 0 = varied (human), 100 = uniform (AI).
        """
        paras = self.paragraphs
        if len(paras) < 3:
            if self.sentence_count < 5:
                return 50.0
            # Use sentences as pseudo-paragraphs (groups of 3)
            paras = []
            for i in range(0, self.sentence_count, 3):
                chunk = " ".join(self.sentences[i:i + 3])
                if chunk.strip():
                    paras.append(chunk)

        if len(paras) < 3:
            return 50.0

        # Length CV
        lengths = [len(p.split()) for p in paras]
        cv_len = _cv(lengths)

        # Vocabulary overlap between adjacent paragraphs (Jaccard)
        para_words = [set(word_tokenize(p.lower())) - FUNCTION_WORDS for p in paras]
        overlaps = []
        for i in range(len(para_words) - 1):
            a, b = para_words[i], para_words[i + 1]
            if a or b:
                jaccard = len(a & b) / max(len(a | b), 1)
                overlaps.append(jaccard)

        mean_overlap = _mean(overlaps) if overlaps else 0.3

        # Low CV = uniform = AI-like → invert: 100 - sig_norm(cv)
        cv_score = _sig_norm(cv_len, 0.30, 4.0)
        # High overlap = repetitive vocabulary across paragraphs = AI
        overlap_score = _sig_norm(mean_overlap, 0.18, 8.0)

        uniformity = (100 - cv_score) * 0.55 + overlap_score * 0.45
        return _clamp(uniformity)

    # ------------------------------------------------------------------
    # 13. WORD COMMONALITY — frequency rank proxy
    # ------------------------------------------------------------------
    def avg_word_commonality(self) -> float:
        """
        Fraction of words from the top-200 common English words.
        AI uses 'safe' high-frequency vocabulary.
        Returns 0-100: 0 = rare words (human), 100 = common words (AI).
        """
        if self.word_count < 10:
            return 50.0

        common_count = sum(1 for w in self.words if w in COMMON_200)
        common_ratio = common_count / self.word_count

        # AI: ratio ≈ 0.50-0.65, Human: 0.35-0.55, center: 0.48
        return _clamp(_sig_norm(common_ratio, 0.48, 8.0))

    # ------------------------------------------------------------------
    # 14. ZIPF DEVIATION — R² of log-rank vs log-frequency OLS
    # ------------------------------------------------------------------
    def zipf_deviation(self) -> float:
        """
        Fit log(frequency) = α + β·log(rank) via OLS.
        Measure R² (goodness of fit).

        AI text follows Zipf's law almost perfectly (high R²).
        Human text deviates more (lower R²).

        For short texts (<100 words), Zipf fit is unreliable due to
        most words appearing only once, so we dampen toward 50.

        Returns 0-100: 0 = deviates from Zipf (human), 100 = perfect Zipf (AI).
        """
        if self.vocab_size < 15:
            return 50.0

        # Rank-frequency pairs
        sorted_freq = sorted(self.word_freq.values(), reverse=True)
        log_ranks = [math.log(i + 1) for i in range(len(sorted_freq))]
        log_freqs = [math.log(f) if f > 0 else 0 for f in sorted_freq]

        _, _, r_sq = _linear_regression(log_ranks, log_freqs)

        # R²: AI ≈ 0.90-0.98, Human ≈ 0.78-0.92, center: 0.90
        raw_score = _sig_norm(r_sq, 0.90, 25.0)

        # Length correction: for short text, dampen toward 50
        if self.word_count < 150:
            factor = max(0, (self.word_count - 40)) / 110.0
            return _clamp(raw_score * factor + 50.0 * (1 - factor))

        return _clamp(raw_score)

    # ------------------------------------------------------------------
    # 15. TOKEN PREDICTABILITY — bigram transition probability
    # ------------------------------------------------------------------
    def token_predictability(self) -> float:
        """
        Robust token-sequence predictability via:
          (a) Bigram type-token ratio (lower = more repeated = AI)
          (b) Repeated bigram density (excess occurrences / total)
          (c) Conditional probability for frequent-enough words only

        Avoids the degenerate case where short text has all-unique bigrams.
        Returns 0-100: 0 = unpredictable (human), 100 = predictable (AI).
        """
        if self.word_count < 30:
            return 50.0

        bigrams = [(self.words[i], self.words[i + 1]) for i in range(self.word_count - 1)]
        bi_freq = Counter(bigrams)
        N_bi = len(bigrams)
        unique_bi = len(bi_freq)

        if unique_bi < 5:
            return 50.0

        # (a) Bigram TTR: lower = more repeated patterns = AI
        bi_ttr = unique_bi / N_bi
        # AI: 0.80-0.92, Human: 0.90-0.99, center: 0.92
        ttr_score = 100.0 - _sig_norm(bi_ttr, 0.92, 20.0)

        # (b) Repeated bigram density
        repeated = sum(c - 1 for c in bi_freq.values() if c >= 2)
        repeat_density = repeated / N_bi
        # AI: 0.04-0.15, Human: 0.00-0.06, center: 0.04
        rd_score = _sig_norm(repeat_density, 0.04, 25.0)

        # (c) Conditional probability (only for words appearing 2+ times)
        freq_thr = 2 if self.word_count < 150 else 3
        valid_bi = [(w1, c) for (w1, _), c in bi_freq.items()
                    if self.word_freq[w1] >= freq_thr]
        if valid_bi:
            avg_p = _mean([c / self.word_freq[w1] for w1, c in valid_bi])
            p_score = _sig_norm(avg_p, 0.40, 4.0)
        else:
            p_score = 50.0

        # Length correction: dampen toward 50 for short text
        raw = ttr_score * 0.35 + rd_score * 0.35 + p_score * 0.30
        if self.word_count < 100:
            factor = (self.word_count - 30) / 70.0
            return _clamp(raw * factor + 50.0 * (1 - factor))

        return _clamp(raw)

    # ------------------------------------------------------------------
    # 16. PER-SENTENCE AI RATIO — mini classifier (GPTZero style)
    # ------------------------------------------------------------------
    def per_sentence_ai_ratio(self) -> float:
        """
        Classify each sentence as AI-like or human-like using a
        multi-feature mini-classifier, then return the ratio.

        Per-sentence features:
          - AI starter present?
          - AI marker word density
          - Word length uniformity (CV)
          - Sentence length in AI-typical range (15-25 words)
          - Function word ratio near AI mean (~0.42-0.48)

        Returns 0-100: 0 = all human (human), 100 = all AI (AI).
        """
        if self.sentence_count < 3:
            return 50.0

        ai_count = 0
        scored_count = 0

        for i, ws in enumerate(self.sent_words):
            if len(ws) < 4:
                continue
            scored_count += 1
            mini_score = 0.0

            # Feature 1: AI starter
            sent_text = self.sentences[i].strip().lower() if i < len(self.sentences) else ""
            if any(sent_text.startswith(s) for s in AI_SENTENCE_STARTERS):
                mini_score += 0.20

            # Feature 2: AI marker word density
            marker_d = sum(1 for w in ws if w in AI_MARKER_WORDS) / len(ws)
            mini_score += min(marker_d * 5.0, 0.20)

            # Feature 3: Word length CV (low = AI — uniform word lengths)
            wl_cv = _cv([len(w) for w in ws])
            if wl_cv < 0.35:
                mini_score += 0.12

            # Feature 4: Sentence length in AI sweet spot (15-30 words)
            if 13 <= len(ws) <= 30:
                mini_score += 0.10

            # Feature 5: Function word ratio near AI mean
            fw_r = sum(1 for w in ws if w in FUNCTION_WORDS) / len(ws)
            if 0.35 <= fw_r <= 0.55:
                mini_score += 0.10

            # Feature 6: AI phrase pattern match in this sentence
            for pattern in AI_PHRASE_PATTERNS[:15]:  # check top patterns
                if re.search(pattern, sent_text):
                    mini_score += 0.12
                    break

            # Feature 7: No contractions (AI avoids contractions)
            if not any("'" in w for w in ws):
                mini_score += 0.08

            # Feature 8: Formal linking words
            formal_links = {'however', 'therefore', 'furthermore', 'moreover',
                          'consequently', 'additionally', 'conversely', 'similarly',
                          'specifically', 'particularly', 'notably', 'indeed',
                          'essentially', 'fundamentally', 'accordingly', 'thus'}
            if any(w in formal_links for w in ws):
                mini_score += 0.10

            # Feature 9: Third-person impersonal (no I/we/you)
            personal = {'i', 'we', 'you', 'my', 'me', 'your', 'our', 'us'}
            if not any(w in personal for w in ws):
                mini_score += 0.06

            if mini_score >= 0.28:
                ai_count += 1

        if scored_count == 0:
            return 50.0

        ratio = ai_count / scored_count
        return _clamp(ratio * 100)

    # ------------------------------------------------------------------
    # 17. SPECTRAL FLATNESS — DFT of sentence lengths
    # ------------------------------------------------------------------
    def spectral_flatness(self) -> float:
        """
        Compute DFT of sentence-length sequence.
        Spectral flatness = geometric_mean(|X(k)|²) / arithmetic_mean(|X(k)|²)

        AI: periodic/regular sentence lengths → peaked spectrum → low flatness
        Human: irregularsignal → flat spectrum → high flatness

        Returns 0-100: 0 = periodic (AI), 100 = aperiodic (human).
        """
        if self.sentence_count < 6:
            return 45.0

        signal = [len(ws) for ws in self.sent_words if ws]
        N = len(signal)
        if N < 6:
            return 45.0

        # Remove DC component (center at zero)
        mu = _mean(signal)
        signal = [s - mu for s in signal]

        # DFT magnitudes (skip DC bin k=0)
        power = []
        for k in range(1, N // 2 + 1):
            re_part = sum(signal[n] * math.cos(2 * math.pi * k * n / N) for n in range(N))
            im_part = -sum(signal[n] * math.sin(2 * math.pi * k * n / N) for n in range(N))
            p = re_part ** 2 + im_part ** 2
            power.append(max(p, 1e-12))

        if not power:
            return 45.0

        geo = _geometric_mean(power)
        arith = _mean(power)
        flatness = geo / arith if arith > 1e-12 else 0.0

        # flatness: AI ≈ 0.1-0.4, Human ≈ 0.3-0.8, center: 0.35
        return _clamp(_sig_norm(flatness, 0.35, 5.0))

    # ------------------------------------------------------------------
    # 18. LEXICAL DENSITY VARIANCE — content word ratio per sentence
    # ------------------------------------------------------------------
    def lexical_density_var(self) -> float:
        """
        Content-word ratio per sentence, then compute its variance.
        AI maintains consistent lexical density across sentences.

        Returns 0-100: 0 = constant density (AI), 100 = varied (human).
        """
        if self.sentence_count < 4:
            return 45.0

        densities = []
        for ws in self.sent_words:
            if len(ws) < 4:
                continue
            content = sum(1 for w in ws if w not in FUNCTION_WORDS)
            densities.append(content / len(ws))

        if len(densities) < 3:
            return 45.0

        cv_d = _cv(densities)

        # AI: CV ≈ 0.04-0.12, Human ≈ 0.10-0.30, center: 0.10
        return _clamp(_sig_norm(cv_d, 0.10, 12.0))

    # ------------------------------------------------------------------
    # 19. FUNCTION WORD FREQUENCY PROFILE — distance from AI profile
    # ------------------------------------------------------------------
    def function_word_freq(self) -> float:
        """
        Jensen-Shannon divergence between text's function-word distribution
        and the known AI function-word profile.

        JSD is bounded [0, ln2] and handles zero probabilities via
        additive (Laplace) smoothing.

        Closer to AI profile → higher score.
        Returns 0-100: 0 = different profile (human), 100 = matches AI profile.
        """
        if self.word_count < 30:
            return 50.0

        fw_keys = list(AI_FUNCTION_PROFILE.keys())
        total_fw = sum(self.word_freq.get(w, 0) for w in fw_keys)

        if total_fw < 5:
            return 50.0

        # Additive (Laplace) smoothing — BOTH distributions normalized to sum=1.0
        alpha = 0.01
        n_fw = len(fw_keys)
        text_raw = [self.word_freq.get(w, 0) + alpha for w in fw_keys]
        text_sum = sum(text_raw)
        text_dist = [x / text_sum for x in text_raw]

        ai_raw = [AI_FUNCTION_PROFILE[w] + alpha for w in fw_keys]
        ai_sum = sum(ai_raw)
        ai_dist = [x / ai_sum for x in ai_raw]

        # Jensen-Shannon divergence: JSD(P, Q) = (KL(P||M) + KL(Q||M)) / 2
        m_dist = [(p + q) / 2.0 for p, q in zip(text_dist, ai_dist)]
        jsd = (_kl_divergence(text_dist, m_dist) +
               _kl_divergence(ai_dist, m_dist)) / 2.0

        # JSD: AI ≈ 0.10-0.20, Human ≈ 0.20-0.35, center: 0.20
        # Lower JSD = closer to AI → higher AI score → negative slope
        return _clamp(_sig_norm(jsd, 0.20, -15.0))

    # ------------------------------------------------------------------
    # 20. DEPENDENCY DEPTH — subordination complexity proxy
    # ------------------------------------------------------------------
    def dependency_depth(self) -> float:
        """
        Estimate syntactic complexity via:
          - subordinating conjunction density
          - relative pronoun density
          - average clause count per sentence (heuristic)

        AI uses simpler, more linear syntax.
        Returns 0-100: 0 = simple syntax (AI), 100 = complex (human).
        """
        if self.word_count < 15:
            return 45.0

        sub_count = sum(1 for w in self.words if w in SUBORDINATORS)
        rel_count = sum(1 for w in self.words if w in RELATIVE_PRONOUNS)

        # Clause markers per sentence
        clause_density = (sub_count + rel_count) / max(self.sentence_count, 1)

        # Semicolons and colons indicate complex clause structures
        semicolons = self.text.count(';') + self.text.count(':')
        sc_density = semicolons / max(self.sentence_count, 1)

        # clause_density: AI ≈ 0.3-0.8, Human ≈ 0.7-2.0, center: 0.75
        clause_score = _sig_norm(clause_density, 0.75, 2.0)
        # sc_density: AI ≈ 0-0.05, Human ≈ 0.05-0.25, center: 0.05
        sc_score = _sig_norm(sc_density, 0.05, 12.0)

        return _clamp(clause_score * 0.70 + sc_score * 0.30)

    # ------------------------------------------------------------------
    # AGGREGATE: Get all 20 signals
    # ------------------------------------------------------------------
    def get_all_signals(self) -> Dict[str, float]:
        return {
            "perplexity": self.perplexity(),
            "burstiness": self.burstiness(),
            "vocabulary_richness": self.vocabulary_richness(),
            "sentence_uniformity": self.sentence_uniformity(),
            "ai_pattern_score": self.ai_pattern_score(),
            "shannon_entropy": self.shannon_entropy(),
            "readability_consistency": self.readability_consistency(),
            "stylometric_score": self.stylometric_score(),
            "ngram_repetition": self.ngram_repetition(),
            "starter_diversity": self.starter_diversity(),
            "word_length_variance": self.word_length_variance(),
            "paragraph_uniformity": self.paragraph_uniformity(),
            "avg_word_commonality": self.avg_word_commonality(),
            "zipf_deviation": self.zipf_deviation(),
            "token_predictability": self.token_predictability(),
            "per_sentence_ai_ratio": self.per_sentence_ai_ratio(),
            "spectral_flatness": self.spectral_flatness(),
            "lexical_density_var": self.lexical_density_var(),
            "function_word_freq": self.function_word_freq(),
            "dependency_depth": self.dependency_depth(),
        }


# ============================================================================
# DETECTOR PROFILE — logistic scoring with interaction terms
# ============================================================================

class DetectorProfile:
    """
    Each detector uses logistic regression-style scoring:

        z = bias + Σ wᵢ·xᵢ + Σ w_int·xₐ·x_b   (interaction terms)
        P(AI) = σ(z · temperature) × 100

    where xᵢ are signals normalized to [-1, 1] (centered at 50).
    Human-positive signals are negated so positive always means AI-like.
    """

    def __init__(self, name: str, display_name: str, weights: Dict[str, float],
                 bias: float = 0.0, temperature: float = 1.0,
                 interactions: List[Tuple[str, str, float]] = None,
                 category: str = "general", description: str = ""):
        self.name = name
        self.display_name = display_name
        self.weights = weights
        self.bias = bias
        self.temperature = temperature
        self.interactions = interactions or []
        self.category = category
        self.description = description

    def score(self, signals: Dict[str, float], calibration: Optional[Dict] = None) -> Dict:
        """Compute AI probability from signals using logistic scoring."""

        # Global aggressiveness boost — makes ALL detectors more suspicious
        GLOBAL_BIAS = 0.10

        # Global temperature multiplier — amplifies score separation
        GLOBAL_TEMP_MULT = 2.0

        # Normalize signals to [-1, 1], and invert human-positive ones
        normalized = {}
        for sig_name, sig_val in signals.items():
            x = (sig_val - 50.0) / 50.0  # → [-1, 1]
            if sig_name in HUMAN_POSITIVE_SIGNALS:
                x = -x  # negate so positive = AI-like
            normalized[sig_name] = x

        # Linear combination
        z = self.bias + GLOBAL_BIAS
        for sig_name, weight in self.weights.items():
            if sig_name in normalized:
                z += weight * normalized[sig_name]

        # Interaction terms (cross-products)
        for sig_a, sig_b, w_int in self.interactions:
            if sig_a in normalized and sig_b in normalized:
                z += w_int * normalized[sig_a] * normalized[sig_b]

        # Temperature-scaled sigmoid with global multiplier
        raw_ai_prob = _sigmoid(z * self.temperature * GLOBAL_TEMP_MULT) * 100.0

        # Optional detector-specific calibration (Platt scaling)
        if calibration and self.name in calibration:
            c = calibration[self.name]
            ai_prob = _platt_calibrate(raw_ai_prob, c["a"], c["b"])
        else:
            ai_prob = raw_ai_prob

        ai_score = round(_clamp(ai_prob), 1)
        human_score = round(100.0 - ai_score, 1)

        # Verdict thresholds
        if ai_score >= 80:
            verdict = "AI-Generated"
            confidence = "High"
        elif ai_score >= 58:
            verdict = "Likely AI"
            confidence = "Medium"
        elif ai_score >= 35:
            verdict = "Mixed / Uncertain"
            confidence = "Low"
        else:
            verdict = "Human-Written"
            confidence = "High"

        return {
            "detector": self.display_name,
            "ai_score": ai_score,
            "human_score": human_score,
            "verdict": verdict,
            "confidence": confidence,
            "category": self.category,
        }


# ============================================================================
# 22 DETECTOR PROFILES   — calibrated with bias, temperature, interactions
# ============================================================================

DETECTOR_PROFILES: List[DetectorProfile] = [

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # TIER 1: HIGH-ACCURACY / ACADEMIC
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    DetectorProfile(
        name="gptzero",
        display_name="GPTZero",
        category="academic",
        description="Multi-layer: perplexity + burstiness + per-sentence classification",
        bias=0.15,
        temperature=1.25,
        weights={
            "perplexity": 1.1,
            "burstiness": 0.9,
            "per_sentence_ai_ratio": 0.8,
            "sentence_uniformity": 0.5,
            "ai_pattern_score": 0.4,
            "starter_diversity": 0.3,
            "vocabulary_richness": 0.3,
            "token_predictability": 0.3,
        },
        interactions=[
            ("perplexity", "burstiness", 0.3),
            ("per_sentence_ai_ratio", "ai_pattern_score", 0.2),
        ],
    ),

    DetectorProfile(
        name="turnitin",
        display_name="Turnitin",
        category="academic",
        description="Transformer classifier on academic text features",
        bias=0.05,
        temperature=1.15,
        weights={
            "perplexity": 0.7,
            "sentence_uniformity": 0.8,
            "ai_pattern_score": 0.6,
            "vocabulary_richness": 0.6,
            "readability_consistency": 0.5,
            "ngram_repetition": 0.4,
            "stylometric_score": 0.4,
            "per_sentence_ai_ratio": 0.4,
            "paragraph_uniformity": 0.3,
        },
        interactions=[
            ("sentence_uniformity", "readability_consistency", 0.25),
        ],
    ),

    DetectorProfile(
        name="originality_ai",
        display_name="Originality.ai",
        category="academic",
        description="Dual ensemble: LLM probability + pattern classifier",
        bias=0.30,  # aggressive
        temperature=1.40,
        weights={
            "perplexity": 0.9,
            "burstiness": 0.6,
            "ai_pattern_score": 0.8,
            "sentence_uniformity": 0.6,
            "per_sentence_ai_ratio": 0.7,
            "token_predictability": 0.5,
            "vocabulary_richness": 0.4,
            "ngram_repetition": 0.3,
            "zipf_deviation": 0.3,
            "function_word_freq": 0.2,
        },
        interactions=[
            ("perplexity", "ai_pattern_score", 0.4),
            ("sentence_uniformity", "burstiness", 0.3),
            ("token_predictability", "zipf_deviation", 0.2),
        ],
    ),

    DetectorProfile(
        name="winston_ai",
        display_name="Winston AI",
        category="academic",
        description="NLP + document structure + coherence analysis",
        bias=0.10,
        temperature=1.20,
        weights={
            "sentence_uniformity": 0.9,
            "paragraph_uniformity": 0.8,
            "readability_consistency": 0.6,
            "ai_pattern_score": 0.5,
            "perplexity": 0.5,
            "stylometric_score": 0.4,
            "lexical_density_var": 0.3,
            "spectral_flatness": 0.3,
        },
        interactions=[
            ("paragraph_uniformity", "sentence_uniformity", 0.3),
        ],
    ),

    DetectorProfile(
        name="copyleaks",
        display_name="Copyleaks",
        category="academic",
        description="Semantic embeddings + cross-language pattern analysis",
        bias=0.12,
        temperature=1.22,
        weights={
            "perplexity": 0.7,
            "ai_pattern_score": 0.7,
            "vocabulary_richness": 0.6,
            "shannon_entropy": 0.5,
            "sentence_uniformity": 0.5,
            "burstiness": 0.5,
            "function_word_freq": 0.3,
            "token_predictability": 0.3,
        },
        interactions=[
            ("perplexity", "shannon_entropy", 0.2),
        ],
    ),

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # TIER 2: MID-TIER
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    DetectorProfile(
        name="sapling",
        display_name="Sapling AI",
        category="mid-tier",
        description="Direct token probability scoring",
        bias=0.08,
        temperature=1.15,
        weights={
            "perplexity": 1.2,
            "token_predictability": 0.7,
            "vocabulary_richness": 0.5,
            "burstiness": 0.4,
            "ai_pattern_score": 0.4,
            "shannon_entropy": 0.3,
        },
        interactions=[
            ("perplexity", "token_predictability", 0.3),
        ],
    ),

    DetectorProfile(
        name="content_at_scale",
        display_name="Content at Scale",
        category="mid-tier",
        description="NLP + SEO readability pattern analysis",
        bias=0.0,
        temperature=1.10,
        weights={
            "readability_consistency": 0.8,
            "perplexity": 0.6,
            "ai_pattern_score": 0.5,
            "sentence_uniformity": 0.5,
            "avg_word_commonality": 0.4,
            "ngram_repetition": 0.3,
            "lexical_density_var": 0.3,
        },
    ),

    DetectorProfile(
        name="crossplag",
        display_name="Crossplag",
        category="mid-tier",
        description="Hybrid: plagiarism similarity + AI classifier",
        bias=0.05,
        temperature=1.08,
        weights={
            "perplexity": 0.8,
            "ai_pattern_score": 0.7,
            "sentence_uniformity": 0.6,
            "vocabulary_richness": 0.5,
            "ngram_repetition": 0.4,
            "paragraph_uniformity": 0.3,
        },
    ),

    DetectorProfile(
        name="writer_ai",
        display_name="Writer.com",
        category="mid-tier",
        description="Enterprise proprietary language model",
        bias=0.05,
        temperature=1.10,
        weights={
            "perplexity": 0.9,
            "burstiness": 0.6,
            "vocabulary_richness": 0.5,
            "stylometric_score": 0.5,
            "shannon_entropy": 0.4,
            "function_word_freq": 0.3,
        },
    ),

    DetectorProfile(
        name="smodin",
        display_name="Smodin AI",
        category="mid-tier",
        description="Multilingual AI classification",
        bias=0.10,
        temperature=1.15,
        weights={
            "perplexity": 0.8,
            "ai_pattern_score": 0.7,
            "burstiness": 0.6,
            "sentence_uniformity": 0.5,
            "vocabulary_richness": 0.4,
            "ngram_repetition": 0.3,
            "per_sentence_ai_ratio": 0.3,
        },
    ),

    DetectorProfile(
        name="hive_ai",
        display_name="Hive AI",
        category="mid-tier",
        description="Deep learning multi-modal classifier",
        bias=0.08,
        temperature=1.20,
        weights={
            "perplexity": 0.7,
            "burstiness": 0.5,
            "sentence_uniformity": 0.6,
            "ai_pattern_score": 0.5,
            "vocabulary_richness": 0.4,
            "readability_consistency": 0.4,
            "word_length_variance": 0.3,
            "spectral_flatness": 0.2,
        },
        interactions=[
            ("perplexity", "sentence_uniformity", 0.2),
        ],
    ),

    DetectorProfile(
        name="surfer_seo",
        display_name="Surfer SEO",
        category="mid-tier",
        description="SEO content AI detection with readability and structure analysis",
        bias=0.10,
        temperature=1.18,
        weights={
            "perplexity": 0.8,
            "readability_consistency": 0.7,
            "sentence_uniformity": 0.6,
            "ai_pattern_score": 0.6,
            "vocabulary_richness": 0.5,
            "paragraph_uniformity": 0.4,
            "avg_word_commonality": 0.3,
            "word_length_variance": 0.3,
            "function_word_freq": 0.2,
        },
        interactions=[
            ("readability_consistency", "sentence_uniformity", 0.25),
        ],
    ),

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # TIER 3: LOWER-ACCURACY
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    DetectorProfile(
        name="zerogpt",
        display_name="ZeroGPT",
        category="lower-tier",
        description="Basic perplexity + repetition thresholds",
        bias=-0.10,
        temperature=0.95,
        weights={
            "perplexity": 1.3,
            "ai_pattern_score": 0.6,
            "burstiness": 0.4,
            "ngram_repetition": 0.4,
        },
    ),

    DetectorProfile(
        name="quillbot",
        display_name="QuillBot AI",
        category="lower-tier",
        description="Paraphrasing awareness + style signals",
        bias=-0.15,
        temperature=0.92,
        weights={
            "vocabulary_richness": 0.8,
            "perplexity": 0.7,
            "stylometric_score": 0.5,
            "ai_pattern_score": 0.4,
            "starter_diversity": 0.3,
        },
    ),

    DetectorProfile(
        name="grammarly",
        display_name="Grammarly AI",
        category="lower-tier",
        description="Grammar + consistency heuristics",
        bias=-0.25,
        temperature=0.85,
        weights={
            "readability_consistency": 0.8,
            "stylometric_score": 0.7,
            "sentence_uniformity": 0.5,
            "vocabulary_richness": 0.4,
            "perplexity": 0.3,
        },
    ),

    DetectorProfile(
        name="scribbr",
        display_name="Scribbr AI",
        category="lower-tier",
        description="Academic style pattern heuristics",
        bias=-0.12,
        temperature=0.90,
        weights={
            "ai_pattern_score": 0.8,
            "sentence_uniformity": 0.6,
            "readability_consistency": 0.5,
            "vocabulary_richness": 0.4,
            "perplexity": 0.4,
            "per_sentence_ai_ratio": 0.3,
        },
    ),

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # TIER 4: RESEARCH / EXPERIMENTAL
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    DetectorProfile(
        name="pangram",
        display_name="Pangram",
        category="research",
        description="Adversarial robustness + deep statistical fingerprinting",
        bias=0.20,
        temperature=1.35,
        weights={
            "perplexity": 0.6,
            "burstiness": 0.5,
            "vocabulary_richness": 0.4,
            "sentence_uniformity": 0.4,
            "ai_pattern_score": 0.4,
            "shannon_entropy": 0.4,
            "readability_consistency": 0.3,
            "ngram_repetition": 0.3,
            "zipf_deviation": 0.3,
            "token_predictability": 0.3,
            "spectral_flatness": 0.3,
            "function_word_freq": 0.2,
            "dependency_depth": 0.2,
            "lexical_density_var": 0.2,
        },
        interactions=[
            ("perplexity", "zipf_deviation", 0.3),
            ("burstiness", "spectral_flatness", 0.2),
            ("sentence_uniformity", "paragraph_uniformity", 0.2),
        ],
    ),

    DetectorProfile(
        name="roberta",
        display_name="RoBERTa Detector",
        category="research",
        description="Fine-tuned RoBERTa classifier (token embeddings)",
        bias=0.0,
        temperature=1.05,
        weights={
            "perplexity": 1.0,
            "vocabulary_richness": 0.7,
            "burstiness": 0.5,
            "ai_pattern_score": 0.4,
            "shannon_entropy": 0.3,
            "token_predictability": 0.3,
        },
    ),

    DetectorProfile(
        name="openai_classifier",
        display_name="OpenAI Classifier",
        category="research",
        description="GPT-based classification (deprecated — low accuracy)",
        bias=-0.30,
        temperature=0.80,
        weights={
            "perplexity": 1.2,
            "burstiness": 0.6,
            "vocabulary_richness": 0.4,
            "shannon_entropy": 0.3,
        },
    ),

    DetectorProfile(
        name="content_detector_ai",
        display_name="Content Detector AI",
        category="research",
        description="General LLM scoring pipeline",
        bias=-0.05,
        temperature=1.00,
        weights={
            "perplexity": 0.8,
            "ai_pattern_score": 0.7,
            "sentence_uniformity": 0.5,
            "vocabulary_richness": 0.4,
            "ngram_repetition": 0.3,
            "per_sentence_ai_ratio": 0.3,
        },
    ),

    DetectorProfile(
        name="gpt2_detector",
        display_name="GPT-2 Output Detector",
        category="research",
        description="Early GPT-2 detection model (outdated)",
        bias=-0.35,
        temperature=0.75,
        weights={
            "perplexity": 1.3,
            "burstiness": 0.6,
            "vocabulary_richness": 0.4,
            "shannon_entropy": 0.3,
        },
    ),

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # CUSTOM: STEALTH DETECTOR (ours — maximum aggression)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    DetectorProfile(
        name="stealth_detector",
        display_name="StealthDetector (Ours)",
        category="custom",
        description="Ultra-aggressive: all 20 signals + interactions, max temperature",
        bias=0.35,
        temperature=1.50,
        weights={
            "perplexity": 0.7,
            "burstiness": 0.6,
            "vocabulary_richness": 0.5,
            "sentence_uniformity": 0.5,
            "ai_pattern_score": 0.6,
            "shannon_entropy": 0.4,
            "readability_consistency": 0.4,
            "stylometric_score": 0.3,
            "ngram_repetition": 0.3,
            "starter_diversity": 0.3,
            "word_length_variance": 0.2,
            "paragraph_uniformity": 0.3,
            "avg_word_commonality": 0.2,
            "zipf_deviation": 0.3,
            "token_predictability": 0.4,
            "per_sentence_ai_ratio": 0.5,
            "spectral_flatness": 0.3,
            "lexical_density_var": 0.2,
            "function_word_freq": 0.2,
            "dependency_depth": 0.2,
        },
        interactions=[
            ("perplexity", "burstiness", 0.35),
            ("perplexity", "ai_pattern_score", 0.30),
            ("sentence_uniformity", "paragraph_uniformity", 0.25),
            ("token_predictability", "zipf_deviation", 0.25),
            ("per_sentence_ai_ratio", "ai_pattern_score", 0.20),
            ("burstiness", "spectral_flatness", 0.15),
        ],
    ),
]


# Fitted on benchmark corpus via sklearn LogisticRegression over raw detector score.
# Formula: calibrated = sigmoid(a * raw_score + b) * 100
DETECTOR_CALIBRATION = {
    "gptzero": {"a": 0.05906, "b": -1.18861, "auc": 0.9689},
    "turnitin": {"a": 0.05541, "b": -1.28797, "auc": 0.9956},
    "originality_ai": {"a": 0.07509, "b": -1.15330, "auc": 0.9689},
    "winston_ai": {"a": 0.03678, "b": -1.36134, "auc": 1.0000},
    "copyleaks": {"a": 0.02940, "b": -1.16593, "auc": 0.9778},
    "sapling": {"a": 0.04632, "b": -1.11145, "auc": 0.9644},
    "content_at_scale": {"a": 0.02707, "b": -0.82579, "auc": 0.8622},
    "crossplag": {"a": 0.04373, "b": -1.19365, "auc": 0.9733},
    "writer_ai": {"a": 0.03502, "b": -1.19645, "auc": 1.0000},
    "smodin": {"a": 0.04998, "b": -1.23648, "auc": 0.9600},
    "hive_ai": {"a": 0.03224, "b": -1.19164, "auc": 0.9733},
    "surfer_seo": {"a": 0.03128, "b": -1.03867, "auc": 0.9289},
    "zerogpt": {"a": 0.05848, "b": -1.12507, "auc": 0.9689},
    "quillbot": {"a": 0.08918, "b": -1.32742, "auc": 1.0000},
    "grammarly": {"a": 0.03479, "b": -1.14614, "auc": 0.9956},
    "scribbr": {"a": 0.03938, "b": -1.16957, "auc": 0.9467},
    "pangram": {"a": 0.04367, "b": -1.33418, "auc": 0.9867},
    "roberta": {"a": 0.04624, "b": -1.09860, "auc": 0.9689},
    "openai_classifier": {"a": 0.02006, "b": -0.51888, "auc": 0.9111},
    "content_detector_ai": {"a": 0.04889, "b": -1.19108, "auc": 0.9778},
    "gpt2_detector": {"a": 0.02016, "b": -0.50459, "auc": 0.9089},
    "stealth_detector": {"a": 0.08647, "b": -1.16601, "auc": 1.0000},
}


# ============================================================================
# MULTI-DETECTOR ORCHESTRATOR
# ============================================================================

class MultiDetector:
    """Run text through all detector profiles with Bayesian aggregation."""

    # Bayesian priors: how much we trust each tier
    TIER_WEIGHTS = {
        "academic": 2.5,
        "mid-tier": 1.6,
        "lower-tier": 0.7,
        "research": 1.2,
        "custom": 3.0,
    }

    def __init__(self, profiles: List[DetectorProfile] = None,
                 calibration: Optional[Dict[str, Dict[str, float]]] = None):
        self.profiles = profiles or DETECTOR_PROFILES
        self.calibration = DETECTOR_CALIBRATION if calibration is None else calibration

    def analyze(self, text: str) -> Dict:
        """Full analysis: extract signals → score all detectors → aggregate."""
        if not text or not text.strip():
            return {"error": "Empty text", "signals": {}, "detectors": [], "summary": {}}

        # ── Step 1: extract all 20 signals ──
        sig_obj = TextSignals(text)
        signals = sig_obj.get_all_signals()

        # ── Step 2: score each detector ──
        detector_results = [
            p.score(signals, calibration=self.calibration)
            for p in self.profiles
        ]

        # ── Step 2b: length-reliability damping ──
        # Very short texts are unstable for AI detection. Dampen scores toward 50.
        length_factor = max(0.05, min(1.0, (sig_obj.word_count - 20) / 120.0))
        if length_factor < 1.0:
            for d in detector_results:
                damped_ai = d["ai_score"] * length_factor + 50.0 * (1.0 - length_factor)
                d["ai_score"] = round(_clamp(damped_ai), 1)
                d["human_score"] = round(100.0 - d["ai_score"], 1)

                # Re-derive verdicts after damping
                if d["ai_score"] >= 80:
                    d["verdict"] = "AI-Generated"
                    d["confidence"] = "High"
                elif d["ai_score"] >= 58:
                    d["verdict"] = "Likely AI"
                    d["confidence"] = "Medium"
                elif d["ai_score"] >= 35:
                    d["verdict"] = "Mixed / Uncertain"
                    d["confidence"] = "Low"
                else:
                    d["verdict"] = "Human-Written"
                    d["confidence"] = "High"

        # ── Step 3: Bayesian weighted aggregation ──
        ai_scores = [d["ai_score"] for d in detector_results]
        simple_avg = _mean(ai_scores)

        weighted_sum = 0.0
        weight_total = 0.0
        for d in detector_results:
            w = self.TIER_WEIGHTS.get(d["category"], 1.0)
            weighted_sum += d["ai_score"] * w
            weight_total += w
        weighted_avg = weighted_sum / weight_total if weight_total > 0 else 50.0

        # Count verdicts
        ai_count = sum(
            1 for d in detector_results
            if d["verdict"] in ("AI-Generated", "Likely AI")
        )
        human_count = sum(
            1 for d in detector_results
            if d["verdict"] == "Human-Written"
        )
        mixed_count = len(detector_results) - ai_count - human_count

        # ── Step 4: Contrast amplification ──
        # Push scores away from 50% center to increase discrimination
        _p = weighted_avg / 100.0
        weighted_avg = _sigmoid((_p - 0.5) * 6.0) * 100.0

        # Overall verdict (length-adaptive thresholds)
        ai_generated_threshold = 75 + (1.0 - length_factor) * 10.0
        likely_ai_threshold = 50 + (1.0 - length_factor) * 10.0
        mixed_threshold = 30 + (1.0 - length_factor) * 5.0

        if weighted_avg >= ai_generated_threshold:
            overall = "AI-Generated"
        elif weighted_avg >= likely_ai_threshold:
            overall = "Likely AI"
        elif weighted_avg >= mixed_threshold:
            overall = "Mixed / Uncertain"
        else:
            overall = "Human-Written"

        summary = {
            "overall_ai_score": round(weighted_avg, 1),
            "overall_human_score": round(100 - weighted_avg, 1),
            "overall_verdict": overall,
            "simple_avg_ai": round(simple_avg, 1),
            "length_reliability": round(length_factor, 2),
            "thresholds": {
                "ai_generated": round(ai_generated_threshold, 1),
                "likely_ai": round(likely_ai_threshold, 1),
                "mixed": round(mixed_threshold, 1),
            },
            "detectors_flagged_ai": ai_count,
            "detectors_flagged_human": human_count,
            "detectors_uncertain": mixed_count,
            "total_detectors": len(detector_results),
            "word_count": sig_obj.word_count,
            "sentence_count": sig_obj.sentence_count,
        }

        return {
            "signals": {k: round(v, 1) for k, v in signals.items()},
            "detectors": detector_results,
            "summary": summary,
        }


# ============================================================================
# MODULE API
# ============================================================================

_multi_detector = None


def get_detector() -> MultiDetector:
    global _multi_detector
    if _multi_detector is None:
        _multi_detector = MultiDetector()
    return _multi_detector


# ============================================================================
# SELF-TEST
# ============================================================================

if __name__ == "__main__":
    print("=" * 72)
    print("  MULTI-ENGINE AI DETECTOR v2 — Advanced Mathematical Test")
    print("=" * 72)

    detector = MultiDetector()

    ai_text = (
        "Furthermore, it is important to note that the comprehensive implementation "
        "of robust frameworks can significantly enhance the efficacy of multifaceted "
        "approaches. Moreover, the utilization of innovative methodologies necessitates "
        "a fundamental understanding of inherent limitations. Additionally, the trajectory "
        "of this discourse demonstrates the profound impact of leveraging paradigmatic shifts. "
        "Consequently, stakeholders must prioritize the optimization of strategic initiatives. "
        "The significance of these developments cannot be overstated. In light of the "
        "aforementioned considerations, it is crucial that organizations cultivate a "
        "nuanced understanding of the implications. Subsequently, the implementation "
        "of evidence-based practices serves as a catalyst for substantive change."
    )

    human_text = (
        "I was walking to the store yesterday and bumped into an old friend. "
        "We hadn't talked in years - probably since high school? Anyway, she told me "
        "about her new job at some tech startup. Sounds cool but also kinda stressful. "
        "I grabbed some milk and headed home. The weather was nice, at least. "
        "My dog went crazy when I opened the door, like he always does. "
        "Made myself a sandwich and watched some TV. Nothing great was on though."
    )

    academic_ai = (
        "The growth of secondary education in Kenya has undergone significant "
        "transformation over the decades. Various policy frameworks, community "
        "initiatives, and international support have contributed to a steady and "
        "rapid expansion of the education sector. Enrolment rates increased significantly, "
        "and more schools were established across the country. One of the most influential "
        "factors has been the deliberate government policies that have prioritized "
        "education as a key component of national development strategies. This commitment "
        "is reflected in policy frameworks aimed at improving access and quality of "
        "education. Furthermore, communities and private investors also stepped in to "
        "support the expansion process, particularly in rural and underserved areas. "
        "This reflects a strong tradition of community participation and collective "
        "responsibility in education. International organizations and development "
        "partners have also played a vital role by providing financial and technical "
        "assistance. However, challenges such as overcrowding, limited resources, and "
        "teacher shortages persist. Continued investment and effective policy "
        "implementation are therefore necessary to sustain progress and improve "
        "the quality of secondary education in Kenya."
    )

    for label, text in [
        ("OBVIOUS AI", ai_text),
        ("OBVIOUS HUMAN", human_text),
        ("FORMAL AI ESSAY", academic_ai),
    ]:
        print(f"\n{'='*60}")
        print(f"  {label}")
        print(f"{'='*60}")
        result = detector.analyze(text)

        print(f"\n  Signals (20):")
        for k, v in result["signals"].items():
            direction = "human+" if k in HUMAN_POSITIVE_SIGNALS else "AI+"
            print(f"    {k:28s} = {v:6.1f}  [{direction}]")

        print(f"\n  Detector Results:")
        sorted_d = sorted(result["detectors"], key=lambda x: -x["ai_score"])
        for d in sorted_d:
            flag = "!!" if d["ai_score"] >= 55 else ".." if d["ai_score"] >= 40 else "OK"
            print(f"    [{flag}] {d['detector']:25s}  AI: {d['ai_score']:5.1f}%  |  {d['verdict']}")

        s = result["summary"]
        print(f"\n  >>> OVERALL: {s['overall_verdict']} ({s['overall_ai_score']}% AI)")
        print(f"  >>> Flagged: {s['detectors_flagged_ai']}/{s['total_detectors']} detectors")
        print(f"  >>> Words: {s['word_count']} | Sentences: {s['sentence_count']}")
