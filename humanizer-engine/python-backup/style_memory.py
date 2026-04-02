"""
Style Memory Module
===================
Stores and retrieves statistical writing fingerprints (style profiles)
that describe how authentic human academic writing looks.

Each profile captures measurable features:
  - avg_sentence_length, sentence_length_std  (word count)
  - hedging_rate           (fraction of sentences with hedging language)
  - clause_density         (avg subordinate clauses per sentence)
  - passive_voice_rate     (fraction of sentences with passive constructions)
  - lexical_diversity      (type-token ratio on first 500 words)
  - avg_paragraph_length   (sentences per paragraph)
  - punctuation_rates      (semicolons, colons, dashes per 1000 words)

Profiles are loaded from  dictionaries/style_profiles.json  at startup.
"""

import json
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

_PROFILES_PATH = os.path.join(
    os.path.dirname(__file__), "dictionaries", "style_profiles.json"
)


@dataclass
class StyleProfile:
    name: str
    description: str = ""
    avg_sentence_length: float = 22.0
    sentence_length_std: float = 8.0
    hedging_rate: float = 0.18
    clause_density: float = 1.4
    passive_voice_rate: float = 0.20
    lexical_diversity: float = 0.62
    avg_paragraph_length: float = 4.5
    punctuation_rates: Dict[str, float] = field(default_factory=lambda: {
        "semicolons_per_1k": 2.5,
        "colons_per_1k": 1.8,
        "dashes_per_1k": 1.2,
    })

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "StyleProfile":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    def summary_text(self) -> str:
        """Return a compact text summary for injection into LLM prompts."""
        return (
            f"Target style profile ({self.name}):\n"
            f"- Average sentence length: ~{self.avg_sentence_length:.0f} words "
            f"(std ≈ {self.sentence_length_std:.0f})\n"
            f"- Hedging rate: ~{self.hedging_rate:.0%} of sentences\n"
            f"- Clause density: ~{self.clause_density:.1f} clauses/sentence\n"
            f"- Passive voice: ~{self.passive_voice_rate:.0%} of sentences\n"
            f"- Lexical diversity (TTR): ~{self.lexical_diversity:.2f}\n"
            f"- Paragraph length: ~{self.avg_paragraph_length:.1f} sentences\n"
            f"- Semicolons: ~{self.punctuation_rates.get('semicolons_per_1k', 0):.1f}/1k words\n"
            f"- Colons: ~{self.punctuation_rates.get('colons_per_1k', 0):.1f}/1k words\n"
            f"- Dashes: ~{self.punctuation_rates.get('dashes_per_1k', 0):.1f}/1k words"
        )


# ═══════════════════════════════════════════════════════════════════════
#  BUILT-IN DEFAULTS (used if JSON file is missing)
# ═══════════════════════════════════════════════════════════════════════

_BUILTIN_PROFILES: List[dict] = [
    {
        "name": "academic_2005",
        "description": "Pre-2010 journal article style: long sentences, heavy hedging, formal",
        "avg_sentence_length": 28.0,
        "sentence_length_std": 10.0,
        "hedging_rate": 0.25,
        "clause_density": 1.8,
        "passive_voice_rate": 0.30,
        "lexical_diversity": 0.65,
        "avg_paragraph_length": 5.0,
        "punctuation_rates": {
            "semicolons_per_1k": 3.2,
            "colons_per_1k": 2.0,
            "dashes_per_1k": 0.8,
        },
    },
    {
        "name": "academic_2010",
        "description": "2010-era journal: moderate length, balanced hedging, some variation",
        "avg_sentence_length": 24.0,
        "sentence_length_std": 9.0,
        "hedging_rate": 0.20,
        "clause_density": 1.5,
        "passive_voice_rate": 0.22,
        "lexical_diversity": 0.63,
        "avg_paragraph_length": 4.5,
        "punctuation_rates": {
            "semicolons_per_1k": 2.5,
            "colons_per_1k": 1.8,
            "dashes_per_1k": 1.2,
        },
    },
    {
        "name": "journal_natural",
        "description": "Natural social-science journal prose: varied rhythm, moderate formality",
        "avg_sentence_length": 22.0,
        "sentence_length_std": 8.5,
        "hedging_rate": 0.18,
        "clause_density": 1.3,
        "passive_voice_rate": 0.18,
        "lexical_diversity": 0.60,
        "avg_paragraph_length": 4.0,
        "punctuation_rates": {
            "semicolons_per_1k": 2.0,
            "colons_per_1k": 1.5,
            "dashes_per_1k": 1.5,
        },
    },
    {
        "name": "thesis_formal",
        "description": "Formal thesis/dissertation style: longer paragraphs, high formality",
        "avg_sentence_length": 26.0,
        "sentence_length_std": 11.0,
        "hedging_rate": 0.22,
        "clause_density": 1.6,
        "passive_voice_rate": 0.28,
        "lexical_diversity": 0.64,
        "avg_paragraph_length": 6.0,
        "punctuation_rates": {
            "semicolons_per_1k": 2.8,
            "colons_per_1k": 2.2,
            "dashes_per_1k": 0.6,
        },
    },
    {
        "name": "accessible_academic",
        "description": "Readable academic style: shorter sentences, less hedging, clearer",
        "avg_sentence_length": 18.0,
        "sentence_length_std": 6.0,
        "hedging_rate": 0.12,
        "clause_density": 1.1,
        "passive_voice_rate": 0.12,
        "lexical_diversity": 0.58,
        "avg_paragraph_length": 3.5,
        "punctuation_rates": {
            "semicolons_per_1k": 1.0,
            "colons_per_1k": 1.2,
            "dashes_per_1k": 2.0,
        },
    },
]


# ═══════════════════════════════════════════════════════════════════════
#  STYLE MEMORY CLASS
# ═══════════════════════════════════════════════════════════════════════

class StyleMemory:
    """Load, store, and retrieve style profiles."""

    def __init__(self):
        self.profiles: Dict[str, StyleProfile] = {}
        self._load()

    def _load(self):
        """Load profiles from JSON file, falling back to built-in defaults."""
        loaded = False
        if os.path.exists(_PROFILES_PATH):
            try:
                with open(_PROFILES_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for item in data:
                    p = StyleProfile.from_dict(item)
                    self.profiles[p.name] = p
                loaded = True
            except Exception:
                pass

        if not loaded:
            for item in _BUILTIN_PROFILES:
                p = StyleProfile.from_dict(item)
                self.profiles[p.name] = p

    def save(self):
        """Persist current profiles to JSON."""
        os.makedirs(os.path.dirname(_PROFILES_PATH), exist_ok=True)
        data = [p.to_dict() for p in self.profiles.values()]
        with open(_PROFILES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get(self, name: str) -> Optional[StyleProfile]:
        return self.profiles.get(name)

    def get_default(self) -> StyleProfile:
        return self.profiles.get("academic_2010") or next(iter(self.profiles.values()))

    def list_names(self) -> List[str]:
        return list(self.profiles.keys())

    def select_for_tone(self, tone: str) -> StyleProfile:
        """Pick the best profile for a given tone setting."""
        tone_map = {
            "academic": "academic_2005",
            "professional": "academic_2010",
            "neutral": "journal_natural",
            "simple": "accessible_academic",
        }
        name = tone_map.get(tone, "journal_natural")
        return self.profiles.get(name, self.get_default())


# Singleton
_memory = StyleMemory()


def get_style_memory() -> StyleMemory:
    return _memory
