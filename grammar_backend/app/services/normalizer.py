from __future__ import annotations

import re
from typing import Callable

from app.schemas.edit import Edit
from app.core.constants import EDIT_SPACING, EDIT_PUNCTUATION, EDIT_CAPITALIZATION
from app.services.protected_spans import ProtectedSpan


# ── Pre-compiled normalizer rules ──
# Each tuple: (pattern, replacement_or_callable, edit_type, rule_id, description)
# Callables receive the Match object and return the replacement string.

def _cap_sentence_start(m: re.Match) -> str:
    """Capitalize the captured letter after sentence-start context."""
    return m.group(0)[:-1] + m.group(1).upper()


_RULES: list[tuple[re.Pattern[str], str | Callable, str, str, str]] = [
    # ── Spacing rules ──

    # Double/triple spaces → single space (not across newlines)
    (re.compile(r"(?<!\n) {2,}(?!\n)"),
     " ", EDIT_SPACING, "norm-sp-001", "collapse multiple spaces"),

    # Space before comma
    (re.compile(r" +,"),
     ",", EDIT_SPACING, "norm-sp-002", "space before comma"),

    # Space before period (not ellipsis, not decimal like "3 .14")
    (re.compile(r"(?<!\.) +\.(?!\.)(?!\d)"),
     ".", EDIT_SPACING, "norm-sp-003", "space before period"),

    # Space before semicolon
    (re.compile(r" +;"),
     ";", EDIT_SPACING, "norm-sp-004", "space before semicolon"),

    # Space before colon
    (re.compile(r" +:"),
     ":", EDIT_SPACING, "norm-sp-005", "space before colon"),

    # Space before question mark
    (re.compile(r" +\?"),
     "?", EDIT_SPACING, "norm-sp-006", "space before question mark"),

    # Space before exclamation mark
    (re.compile(r" +!"),
     "!", EDIT_SPACING, "norm-sp-007", "space before exclamation mark"),

    # Fix detached apostrophes: word ' s → word's, word ' t → word't, etc.
    (re.compile(r"(\w) ' (s|t|d|ll|re|ve|m)\b"),
     r"\1'\2", EDIT_SPACING, "norm-sp-008", "detached apostrophe"),

    # Fix space inside opening paren/bracket
    (re.compile(r"\(\s+"),
     "(", EDIT_SPACING, "norm-sp-009", "space after opening paren"),
    (re.compile(r"\[\s+"),
     "[", EDIT_SPACING, "norm-sp-010", "space after opening bracket"),

    # Fix space inside closing paren/bracket
    (re.compile(r"\s+\)"),
     ")", EDIT_SPACING, "norm-sp-011", "space before closing paren"),
    (re.compile(r"\s+\]"),
     "]", EDIT_SPACING, "norm-sp-012", "space before closing bracket"),

    # Line-break artifacts: word-\n word → word-word (hyphenated wraparound)
    (re.compile(r"(\w)-\n\s*(\w)"),
     r"\1-\2", EDIT_SPACING, "norm-sp-013", "hyphen line-break artifact"),

    # Trailing whitespace before newline
    (re.compile(r" +\n"),
     "\n", EDIT_SPACING, "norm-sp-014", "trailing whitespace"),

    # No space before opening quote after a word: word"text → word "text
    # (skip — too context-dependent for a deterministic normalizer)

    # ── Punctuation rules ──

    # Repeated commas: ,, → ,
    (re.compile(r",{2,}"),
     ",", EDIT_PUNCTUATION, "norm-pn-001", "repeated commas"),

    # Repeated periods (not ellipsis of exactly 3): .... → ...  and .. → .
    (re.compile(r"\.{4,}"),
     "...", EDIT_PUNCTUATION, "norm-pn-002", "excess periods to ellipsis"),
    (re.compile(r"\.{2}(?!\.)"),
     ".", EDIT_PUNCTUATION, "norm-pn-003", "double period to single"),

    # Repeated semicolons
    (re.compile(r";{2,}"),
     ";", EDIT_PUNCTUATION, "norm-pn-004", "repeated semicolons"),

    # Repeated colons
    (re.compile(r":{2,}"),
     ":", EDIT_PUNCTUATION, "norm-pn-005", "repeated colons"),

    # Repeated question marks
    (re.compile(r"\?{2,}"),
     "?", EDIT_PUNCTUATION, "norm-pn-006", "repeated question marks"),

    # Repeated exclamation marks
    (re.compile(r"!{2,}"),
     "!", EDIT_PUNCTUATION, "norm-pn-007", "repeated exclamation marks"),

    # Comma immediately before period: ,. → .
    (re.compile(r",\."),
     ".", EDIT_PUNCTUATION, "norm-pn-008", "comma before period"),

    # Semicolon immediately before comma: ;, → ;
    (re.compile(r";,"),
     ";", EDIT_PUNCTUATION, "norm-pn-009", "semicolon before comma"),

    # Normalize curly quotes to straight
    (re.compile(r"[\u2018\u2019]"),
     "'", EDIT_PUNCTUATION, "norm-pn-010", "curly single quote"),
    (re.compile(r"[\u201c\u201d]"),
     '"', EDIT_PUNCTUATION, "norm-pn-011", "curly double quote"),

    # ── Capitalization rules (deterministic, unambiguous) ──

    # Capitalize first letter of text (start of document/sentence)
    (re.compile(r"^([a-z])"),
     _cap_sentence_start, EDIT_CAPITALIZATION, "norm-cap-001", "capitalize document start"),

    # Capitalize after period + space
    (re.compile(r"(?<=\. )([a-z])"),
     _cap_sentence_start, EDIT_CAPITALIZATION, "norm-cap-002", "capitalize after period"),

    # Capitalize after question mark + space
    (re.compile(r"(?<=\? )([a-z])"),
     _cap_sentence_start, EDIT_CAPITALIZATION, "norm-cap-003", "capitalize after question mark"),

    # Capitalize after exclamation mark + space
    (re.compile(r"(?<=! )([a-z])"),
     _cap_sentence_start, EDIT_CAPITALIZATION, "norm-cap-004", "capitalize after exclamation mark"),

    # Capitalize after newline
    (re.compile(r"(?<=\n)([a-z])"),
     _cap_sentence_start, EDIT_CAPITALIZATION, "norm-cap-005", "capitalize after newline"),
]


class Normalizer:
    """Deterministic, safe cleanup — never rewrites sentences.

    Produces edit objects for every change so the pipeline can inspect them.
    Protected-span-aware: skips changes inside immutable spans.
    """

    def normalize(
        self,
        text: str,
        protected_spans: list[ProtectedSpan] | None = None,
    ) -> tuple[str, list[Edit]]:
        edits: list[Edit] = []
        result = text
        protected = protected_spans or []

        for pattern, replacement, edit_type, rule_id, desc in _RULES:
            new_edits: list[Edit] = []

            for m in pattern.finditer(result):
                # Skip if match overlaps any immutable protected span
                if self._overlaps_immutable(m.start(), m.end(), protected):
                    continue

                if callable(replacement):
                    replaced = replacement(m)
                else:
                    replaced = m.expand(replacement)

                if replaced != m.group():
                    new_edits.append(
                        Edit(
                            type=edit_type,
                            original=m.group(),
                            corrected=replaced,
                            char_offset_start=m.start(),
                            char_offset_end=m.end(),
                            confidence=0.99,
                            applied=True,
                            source="normalizer",
                            rule_id=rule_id,
                        )
                    )

            edits.extend(new_edits)

            # Apply the pattern, but only for non-protected regions
            if protected:
                result = self._sub_outside_protected(pattern, replacement, result, protected)
            else:
                if callable(replacement):
                    result = pattern.sub(replacement, result)
                else:
                    result = pattern.sub(replacement, result)

        return result, edits

    @staticmethod
    def _overlaps_immutable(start: int, end: int, spans: list[ProtectedSpan]) -> bool:
        return any(
            s.start < end and start < s.end and s.mutability == "immutable"
            for s in spans
        )

    @staticmethod
    def _sub_outside_protected(
        pattern: re.Pattern[str],
        replacement: str | Callable,
        text: str,
        protected: list[ProtectedSpan],
    ) -> str:
        """Apply regex substitution only outside immutable protected spans."""
        # Build list of immutable ranges
        immutable_ranges = [(s.start, s.end) for s in protected if s.mutability == "immutable"]
        if not immutable_ranges:
            if callable(replacement):
                return pattern.sub(replacement, text)
            return pattern.sub(replacement, text)

        # Collect all matches, filter out those in immutable ranges, apply in reverse
        matches = list(pattern.finditer(text))
        result = text
        for m in reversed(matches):
            in_protected = any(
                r[0] < m.end() and m.start() < r[1] for r in immutable_ranges
            )
            if in_protected:
                continue
            if callable(replacement):
                rep = replacement(m)
            else:
                rep = m.expand(replacement)
            result = result[:m.start()] + rep + result[m.end():]
        return result
