from __future__ import annotations

# ── Engine version ──
ENGINE_VERSION = "1.0.0"

# ── Edit categories ──
EDIT_SPACING = "spacing"
EDIT_PUNCTUATION = "punctuation"
EDIT_CAPITALIZATION = "capitalization"
EDIT_AGREEMENT = "agreement"
EDIT_ARTICLE = "article"
EDIT_TENSE = "tense"
EDIT_PREPOSITION = "preposition"
EDIT_ABBREVIATION = "abbreviation"
EDIT_GRAMMAR = "grammar"

EDIT_CATEGORIES = [
    EDIT_SPACING,
    EDIT_PUNCTUATION,
    EDIT_CAPITALIZATION,
    EDIT_AGREEMENT,
    EDIT_ARTICLE,
    EDIT_TENSE,
    EDIT_PREPOSITION,
    EDIT_ABBREVIATION,
    EDIT_GRAMMAR,
]

# ── Confidence thresholds ──
CONFIDENCE_HIGH = 0.85
CONFIDENCE_MEDIUM = 0.60
CONFIDENCE_LOW = 0.40

# ── Scorer verdicts ──
VERDICT_SAFE = "safe"
VERDICT_REVIEW = "review"
VERDICT_REJECTED = "rejected"

# ── Pipeline stage names (for logging / metrics) ──
STAGE_VALIDATE = "validate"
STAGE_PARSE = "parse"
STAGE_PROTECTED = "protected_spans"
STAGE_NORMALIZE = "normalize"
STAGE_RULES = "rule_engine"
STAGE_ML = "ml_corrector"
STAGE_CONFLICT = "conflict_resolver"
STAGE_DIFF_GUARD = "diff_guard"
STAGE_SCORE = "scorer"
STAGE_FORMAT = "formatter"

PIPELINE_STAGES = [
    STAGE_VALIDATE,
    STAGE_PARSE,
    STAGE_PROTECTED,
    STAGE_NORMALIZE,
    STAGE_RULES,
    STAGE_ML,
    STAGE_CONFLICT,
    STAGE_DIFF_GUARD,
    STAGE_SCORE,
    STAGE_FORMAT,
]

# ── Diff guard defaults ──
MAX_TOKEN_CHANGE_RATIO = 0.15
MAX_CONTENT_WORD_CHANGES = 2
