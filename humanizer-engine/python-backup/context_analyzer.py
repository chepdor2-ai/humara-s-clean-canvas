"""
Context Analyzer — Pre-scan input text to extract:
 - Subject/topic (education, climate, technology, health, etc.)
 - Key domain terms that MUST NOT be synonym-swapped
 - Tone (academic, casual, persuasive, narrative)
 - Named entities / proper nouns
 - Multi-word terms (e.g. "artificial intelligence", "climate change")

This drives intelligent, context-aware humanization.
"""

import re
from collections import Counter

try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
except Exception:
    _nlp = None

try:
    from nltk.tokenize import word_tokenize
    from nltk import pos_tag
except Exception:
    def word_tokenize(t): return t.split()
    def pos_tag(tokens): return [(t, "NN") for t in tokens]


# ── Domain keyword banks ────────────────────────────────────────────────────
# Multi-word terms that must NEVER be broken apart or synonym-swapped
_DOMAIN_TERMS = {
    # Technology
    "artificial intelligence", "machine learning", "deep learning",
    "neural network", "neural networks", "natural language processing",
    "computer science", "data science", "big data", "internet of things",
    "cloud computing", "cyber security", "cybersecurity", "block chain",
    "blockchain", "virtual reality", "augmented reality", "quantum computing",
    "social media", "digital transformation", "information technology",
    # Environment
    "climate change", "global warming", "greenhouse gas", "greenhouse gases",
    "carbon emissions", "carbon dioxide", "carbon footprint", "fossil fuels",
    "renewable energy", "solar energy", "wind energy", "sea level",
    "ozone layer", "biodiversity loss", "natural resources",
    "environmental degradation", "sustainable development",
    "ecosystem services", "water pollution", "air pollution",
    "deforestation", "desertification",
    # Health
    "mental health", "public health", "health care", "healthcare",
    "clinical trials", "clinical trial", "immune system",
    "infectious diseases", "chronic diseases", "cardiovascular disease",
    "life expectancy", "world health organization",
    # Education
    "higher education", "primary education", "secondary education",
    "distance learning", "online learning", "e-learning",
    "academic performance", "critical thinking", "problem solving",
    "student engagement", "learning outcomes", "educational technology",
    # Economics / Politics
    "economic growth", "gross domestic product", "gdp", "free trade",
    "supply chain", "supply chains", "foreign direct investment",
    "monetary policy", "fiscal policy", "human rights",
    "international trade", "developing countries", "developed countries",
    "income inequality", "poverty reduction", "social justice",
    "united nations", "european union", "world bank",
    # Social / General
    "social media", "gender equality", "racial discrimination",
    "cultural diversity", "globalization", "urbanization",
    "population growth", "quality of life", "standard of living",
}

# Single words that are topic-critical and should never be swapped
# (built dynamically per text via NER + frequency analysis)
_ALWAYS_PROTECT = {
    "AI", "GDP", "UN", "EU", "WHO", "UNESCO", "NATO", "IMF",
    "COVID", "HIV", "AIDS", "DNA", "RNA", "IoT", "VR", "AR",
    "USA", "UK", "US",
}

# ── Topic detection keyword sets ────────────────────────────────────────────
_TOPIC_KEYWORDS = {
    "technology": {"technology", "digital", "software", "hardware", "algorithm",
                   "computing", "internet", "AI", "automation", "data", "cyber",
                   "programming", "code", "app", "platform", "innovation"},
    "environment": {"environment", "climate", "pollution", "ecosystem", "carbon",
                    "emissions", "renewable", "sustainability", "biodiversity",
                    "deforestation", "conservation", "ecological", "green"},
    "education": {"education", "student", "teacher", "school", "university",
                  "learning", "curriculum", "academic", "classroom", "pedagogy",
                  "literacy", "enrollment", "scholarship", "examination"},
    "health": {"health", "medical", "disease", "patient", "treatment", "clinical",
               "hospital", "diagnosis", "therapy", "pharmaceutical", "vaccine",
               "mental", "wellness", "nutrition", "epidemic", "pandemic"},
    "economics": {"economy", "economic", "trade", "market", "finance", "fiscal",
                  "monetary", "inflation", "unemployment", "investment", "GDP",
                  "poverty", "wealth", "taxation", "commerce", "industry"},
    "politics": {"government", "political", "democracy", "policy", "legislation",
                 "election", "parliament", "constitution", "sovereignty",
                 "governance", "diplomacy", "regulation", "law", "rights"},
    "society": {"society", "social", "culture", "community", "inequality",
                "discrimination", "diversity", "identity", "migration",
                "urbanization", "population", "gender", "race", "religion"},
    "science": {"science", "research", "experiment", "hypothesis", "theory",
                "observation", "laboratory", "physics", "chemistry", "biology",
                "genetics", "evolution", "molecule", "atom", "quantum"},
}

# ── Tone indicators ─────────────────────────────────────────────────────────
_ACADEMIC_MARKERS = {
    "furthermore", "moreover", "consequently", "nevertheless", "notwithstanding",
    "empirically", "theoretically", "methodology", "hypothesis", "peer-reviewed",
    "scholarly", "corpus", "paradigm", "framework", "discourse", "ontological",
    "epistemological", "heuristic", "axiom", "postulate",
}

_CASUAL_MARKERS = {
    "gonna", "wanna", "kinda", "pretty much", "basically", "like",
    "awesome", "cool", "stuff", "things", "guys", "okay", "ok",
    "lot of", "tons of", "super", "really", "honestly",
}

_PERSUASIVE_MARKERS = {
    "must", "should", "need to", "crucial", "essential", "imperative",
    "vital", "urgent", "demand", "require", "advocate", "compel",
    "undeniable", "indisputable", "unquestionable",
}


class TextContext:
    """Holds analysis results for a piece of text."""
    __slots__ = (
        "topics", "primary_topic", "tone", "protected_terms",
        "named_entities", "domain_bigrams", "word_freq",
        "avg_sentence_length", "total_words", "has_first_person",
    )

    def __init__(self):
        self.topics = {}             # topic -> score
        self.primary_topic = "general"
        self.tone = "academic"       # academic / casual / persuasive / narrative
        self.protected_terms = set() # words/phrases that must not change
        self.named_entities = set()  # proper nouns from NER
        self.domain_bigrams = set()  # multi-word protected terms found
        self.word_freq = Counter()
        self.avg_sentence_length = 0.0
        self.total_words = 0
        self.has_first_person = False

    def is_protected(self, word: str) -> bool:
        """Check if a single word should NOT be synonym-swapped."""
        return word.lower() in self.protected_terms

    def span_overlaps_compound(self, text: str, word: str, pos: int) -> bool:
        """Check if word at position pos is part of a protected compound term."""
        window = text[max(0, pos - 40):pos + len(word) + 40].lower()
        for term in self.domain_bigrams:
            if term in window:
                wl = word.lower()
                if wl in term.split():
                    return True
        return False


def analyze(text: str) -> TextContext:
    """Full context analysis of input text. Returns a TextContext object."""
    ctx = TextContext()
    if not text or not text.strip():
        return ctx

    lower_text = text.lower()
    words = word_tokenize(text)
    lower_words = [w.lower() for w in words if w.isalpha()]
    ctx.total_words = len(lower_words)
    ctx.word_freq = Counter(lower_words)

    # ── 1. Detect domain multi-word terms ────────────────────────────────
    for term in _DOMAIN_TERMS:
        if term.lower() in lower_text:
            ctx.domain_bigrams.add(term.lower())
            # Protect each word in the multi-word term
            for w in term.split():
                ctx.protected_terms.add(w.lower())

    # ── 2. Named Entity Recognition (spaCy) ──────────────────────────────
    if _nlp is not None:
        doc = _nlp(text[:10000])  # cap at 10K chars for performance
        for ent in doc.ents:
            if ent.label_ in ("PERSON", "ORG", "GPE", "LOC", "FAC",
                               "NORP", "EVENT", "WORK_OF_ART", "LAW",
                               "PRODUCT", "LANGUAGE"):
                ctx.named_entities.add(ent.text)
                for w in ent.text.split():
                    if len(w) > 1:
                        ctx.protected_terms.add(w.lower())
        # Also protect nouns that are capitalised mid-sentence (proper nouns)
        for token in doc:
            if (token.pos_ == "PROPN" and token.text[0].isupper()
                    and token.i > 0):
                ctx.protected_terms.add(token.text.lower())

    # ── 3. Always-protect acronyms ───────────────────────────────────────
    for acro in _ALWAYS_PROTECT:
        if acro in text or acro.lower() in lower_text:
            ctx.protected_terms.add(acro.lower())

    # ── 4. Topic detection ───────────────────────────────────────────────
    for topic, keywords in _TOPIC_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in lower_text)
        if score > 0:
            ctx.topics[topic] = score
    if ctx.topics:
        ctx.primary_topic = max(ctx.topics, key=ctx.topics.get)

    # ── 5. Protect high-frequency content words (topic-critical) ─────────
    # Words appearing 3+ times are likely topic-central
    tagged = pos_tag(words)
    content_tags = {"NN", "NNS", "NNP", "NNPS", "JJ"}
    for (word, tag) in tagged:
        wl = word.lower()
        if tag in content_tags and len(wl) > 3 and ctx.word_freq.get(wl, 0) >= 3:
            ctx.protected_terms.add(wl)

    # ── 6. Tone detection ────────────────────────────────────────────────
    acad_count = sum(1 for m in _ACADEMIC_MARKERS if m in lower_text)
    casual_count = sum(1 for m in _CASUAL_MARKERS if m in lower_text)
    persuasive_count = sum(1 for m in _PERSUASIVE_MARKERS if m in lower_text)

    if casual_count > acad_count and casual_count > persuasive_count:
        ctx.tone = "casual"
    elif persuasive_count > acad_count:
        ctx.tone = "persuasive"
    else:
        ctx.tone = "academic"

    # ── 7. Average sentence length ───────────────────────────────────────
    sentences = re.split(r'[.!?]+', text)
    sent_lengths = [len(s.split()) for s in sentences if s.strip()]
    ctx.avg_sentence_length = (
        sum(sent_lengths) / len(sent_lengths) if sent_lengths else 15.0
    )

    # ── 8. First-person detection ────────────────────────────────────────
    _FP = re.compile(r'\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b')
    ctx.has_first_person = bool(_FP.search(text))

    return ctx
