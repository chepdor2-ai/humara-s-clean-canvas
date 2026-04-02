"""
Academic & Essay-Optimized Rules
Tuned for formal but human-sounding scholarship
Target: dissertations, academic papers, educational essays, literary analysis
"""
import random

# ============================================================================
# CORE PARAMETERS (Academic-Optimized)
# ============================================================================

# Burstiness: Controls sentence length variance
# Academic sweet spot: 0.65-0.75 (avoid robotic uniformity but stay formal)
BURSTINESS_TARGET = 0.70

# Contraction Rate: How often to use contractions like "it's", "don't"
# Lower for academic (formal tone) - 0.25-0.30 range
CONTRACTION_RATE = 0.28

# Transition Rate: Inject natural discourse markers like "look,", "honestly,"
# Academic: moderate (0.25-0.32) - maintain formality but add humanity
TRANSITION_RATE = 0.30

# Shorten Rate: Probability to break up long sentences into shorter ones
# Academic: 0.40-0.50 (improves readability without sacrificing depth)
SHORTEN_RATE = 0.45

# ============================================================================
# SENTENCE STARTERS (Academic + Natural)
# ============================================================================
# These replace predictable AI starters like "The", "This", "It"

ACADEMIC_TRANSITIONS = [
    # Authentic academic connectors
    "What's critical is", "The key insight here is", "This matters because",
    "In essence,", "The upshot is", "Put simply,", "At its core,",
    
    # Less formal but scholarly
    "The thing is,", "Look,", "Here's the reality:", "Honestly,",
    "In my analysis,", "The evidence suggests", "It turns out",
    
    # Subtle discourse markers
    "Notably,", "Interestingly,", "Crucially,", "Fundamentally,",
    "In other words,", "More precisely,", "That said,", "Still,",
    
    # Transitional but natural
    "What emerges is", "The challenge becomes", "This raises the question",
    "Consider this:", "Bear in mind,", "Keep in mind,", "Don't forget that",
    
    # Academic style maintained
    "One could argue", "From this perspective", "Building on this,"
    "It's worth noting", "The research indicates", "Empirically speaking,"
]

# Alternative to TRANSITIONS (for backward compatibility)
TRANSITIONS = ACADEMIC_TRANSITIONS

# ============================================================================
# AI PATTERN ELIMINATION
# ============================================================================
# Words/patterns that scream AI in academic writing

AI_TRANSITIONS_TO_AVOID = [
    "furthermore,", "moreover,", "additionally,",
    "consequently,", "inevitably,", "accordingly,",
    "in conclusion,", "in summary,", "to summarize,",
    "it is important to note that", "it is crucial that",
    "the author argues", "the scholar maintains",
    "it could be argued", "one may observe",
]

# Avoid these phrases (too formal/robotic for academic essays)
AI_PHRASE_PATTERNS = [
    r"\bin fact,\b",  # too emphatic for academia
    r"\bbroadly speaking,\b",  # vague, AI-like
    r"\bas previously mentioned,\b",  # bureaucratic
    r"\bwithout question,\b",  # too absolute
    r"\bthis cannot be overstated,\b",  # melodramatic
]

# ============================================================================
# CONTRACTIONS (Academic-Adjusted)
# ============================================================================
# Limited set for formal essays

CONTRACTIONS = [
    "it's", "isn't", "don't", "can't", "won't",
    "you're", "they're", "there's", "that's",
    "doesn't", "hasn't", "haven't", "wasn't",
    "weren't", "couldn't", "wouldn't", "shouldn't",
]

# Phrases commonly appearing in academic writing that benefit from contraction
ACADEMIC_CONTRACTIONS = {
    "it is not": "it's not",
    "there is": "there's",
    "that is": "that's",
    "does not": "doesn't",
    "has not": "hasn't",
    "we have": "we've",
    "you have": "you've",
}

# ============================================================================
# SENTENCE STRUCTURE VARIATION
# ============================================================================
# Patterns to add variety to academic prose

SENTENCE_REORDERINGS = [
    # Original: "The thesis examines X and concludes Y."
    # Variant: "X is examined, and Y is the conclusion."
    "active_to_passive",  # Add passive voice strategically
    "subordinate_reorder",  # Reorder clauses
    "split_conjunction",  # Break compound sentences
]

# ============================================================================
# READABILITY TARGETS
# ============================================================================
# Flesch Reading Ease score for academic prose: 40-60 is ideal

TARGET_FLESCH_MIN = 45  # Don't get too easy
TARGET_FLESCH_MAX = 60  # Don't get too hard

# ============================================================================
# VOCABULARY PROTECTION
# ============================================================================
# Terms that should NOT be altered (proper nouns, technical terms)

PROTECTED_PATTERNS = [
    r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b",  # Names (John Smith)
    r"\b[A-Z]{2,}\b",  # Acronyms
    r"\b\d+%\b",  # Percentages
    r"\b\d{4}\b",  # Years
    r"\b[A-Za-z]+\([A-Za-z]+\)\b",  # Technical terms with acronyms
]

# ============================================================================
# REPETITION PREVENTION
# ============================================================================
# Detect and replace repeated bigrams/phrases

MIN_BIGRAM_REPEAT_THRESHOLD = 3  # Flag if bigram appears 3+ times
PHRASE_SUBSTITUTIONS = {
    # Common academic repetitions
    'research shows': ['studies indicate', 'evidence reveals', 'analysis demonstrates'],
    'the study finds': ['the research indicates', 'findings suggest', 'results reveal'],
    'it is clear': ['it becomes apparent', 'it emerges', 'evidence points to'],
    'in the field': ['in academia', 'among scholars', 'in the discipline'],
}

# ============================================================================
# ADVANCED: ENTROPY & RANDOMNESS
# ============================================================================
# Control the randomness injection (prevents overfitting to patterns)

RANDOM_SEED_VARIATION = 0.85  # 0-1: how much variation to inject
USE_DETERMINISTIC_MODE = False  # Set True for consistent results during eval

# ============================================================================
# ACADEMIC DISCIPLINE MARKERS
# ============================================================================
# Different fields have different conventions

DISCIPLINE_KEYWORDS = {
    'humanities': ['argues', 'suggests', 'contends', 'demonstrates', 'problematizes'],
    'social_sciences': ['data shows', 'correlation suggests', 'regression indicates', 'statistically'],
    'stem': ['demonstrates', 'illustrates', 'validates', 'empirically', 'mathematical'],
}

# ============================================================================
# QUALITY CONTROL THRESHOLDS
# ============================================================================

MIN_VOCABULARY_DIVERSITY = 0.50  # Type-token ratio floor
MAX_AI_TRANSITION_RATIO = 1.5  # % of text that can be AI transitions
MAX_REPETITION_DENSITY = 5.0  # % of repeated bigrams acceptable
MIN_SENTENCE_VARIETY = 0.40  # Starting word diversity score

print("✓ Academic essay rules loaded")
print(f"  Burstiness target: {BURSTINESS_TARGET}")
print(f"  Contraction rate: {CONTRACTION_RATE}")
print(f"  Transition rate: {TRANSITION_RATE}")
print(f"  Shorten rate: {SHORTEN_RATE}")
