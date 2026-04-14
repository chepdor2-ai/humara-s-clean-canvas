from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class ProtectedSpan:
    start: int  # char offset in text
    end: int
    text: str
    kind: str  # citation, case_name, quotation, year, url, email, heading, abbreviation, number, reference, statute, code_span, parenthetical
    source: str = "protected_spans"  # which module detected this span
    mutability: str = "immutable"  # "immutable" | "format-only"


# ── Mutability policy per kind (from correction_policy.md) ──
_MUTABILITY: dict[str, str] = {
    "citation": "immutable",
    "case_name": "immutable",
    "quotation": "immutable",
    "url": "immutable",
    "email": "immutable",
    "code_span": "immutable",
    "reference": "immutable",
    "statute": "immutable",
    "year": "format-only",
    "abbreviation": "format-only",
    "heading": "format-only",
    "number": "format-only",
    "parenthetical": "format-only",
}

# ── Compiled patterns ──
# Each entry: (kind, compiled_regex)
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # ── Immutable spans ──

    # Citations: (Author, Year) or (Author et al., Year) or (Author & Author, Year)
    ("citation", re.compile(
        r"\("
        r"[A-Z][a-z]+"
        r"(?:\s+(?:et\s+al\.|&|and)\s*[A-Z][a-z]+)*"
        r",\s*\d{4}(?:[a-z])?"
        r"(?:,\s*pp?\.\s*\d[\d\-–]*)?"  # optional page numbers
        r"\)"
    )),
    # Multi-citation: (Author, 2020; Author, 2021)
    ("citation", re.compile(
        r"\("
        r"[A-Z][a-z]+,\s*\d{4}"
        r"(?:\s*;\s*[A-Z][a-z]+,\s*\d{4})+"
        r"\)"
    )),

    # Legal case names: X v. Y or X vs. Y
    ("case_name", re.compile(
        r"[A-Z][\w.']+(?:\s+[\w.']+)*\s+v(?:s?)\.?\s+[A-Z][\w.']+(?:\s+[\w.']+)*"
    )),

    # Statutory citations: 42 U.S.C. § 1983, 28 C.F.R. § 35.130
    ("statute", re.compile(
        r"\b\d+\s+(?:[A-Z]\.?){1,5}(?:\s+(?:[A-Z]\.?){1,5})*\s*§+\s*[\d.\-–]+(?:\([a-z0-9]+\))*"
    )),

    # Parenthetical legal references: (holding that…), (citing X), (quoting X)
    ("parenthetical", re.compile(
        r"\((?:holding|citing|quoting|noting|explaining|discussing|finding|concluding|observing)\s[^)]{3,}\)",
        re.IGNORECASE
    )),

    # Quoted text — straight double quotes
    ("quotation", re.compile(r'"[^"]{2,}"')),
    # Quoted text — smart double quotes
    ("quotation", re.compile(r"\u201c[^\u201d]{2,}\u201d")),
    # Quoted text — smart single quotes
    ("quotation", re.compile(r"\u2018[^\u2019]{2,}\u2019")),

    # Inline code: `code`
    ("code_span", re.compile(r"`[^`]+`")),

    # URLs
    ("url", re.compile(r"https?://[^\s)>\]]{4,}")),

    # Emails
    ("email", re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")),

    # Reference list entries: Author, I. (Year). Title.
    ("reference", re.compile(
        r"^[A-Z][a-z]+,\s[A-Z]\.(?:\s[A-Z]\.)?\s.*?\(\d{4}\)\.",
        re.MULTILINE
    )),

    # ── Format-only spans ──

    # Years (standalone 4-digit years)
    ("year", re.compile(r"(?<!\d)\b(1[0-9]{3}|20[0-9]{2})\b(?!\d)")),

    # Multi-dot abbreviations: U.S., e.g., i.e., Ph.D., N.A.S.A.
    ("abbreviation", re.compile(r"\b(?:[A-Za-z]\.){2,}")),

    # Section headings (lines starting with a number, roman numeral, or letter marker)
    ("heading", re.compile(
        r"^\s*(?:\d+[\.\)]\s|[IVXLC]+\.\s|[A-Z]\.\s)",
        re.MULTILINE
    )),

    # Numbers with units or currency
    ("number", re.compile(
        r"\$[\d,]+(?:\.\d+)?"
        r"|\b\d[\d,.]+\s*(?:million|billion|thousand|percent|%|kg|lb|lbs|mi|km|cm|mm|ft|in|oz|g|mg|ml|L)\b",
        re.IGNORECASE
    )),
]


class ProtectedSpansDetector:
    def __init__(
        self,
        preserve_citations: bool = True,
        preserve_quotes: bool = True,
    ) -> None:
        self.preserve_citations = preserve_citations
        self.preserve_quotes = preserve_quotes

    def detect(self, text: str) -> list[ProtectedSpan]:
        spans: list[ProtectedSpan] = []
        for kind, pattern in _PATTERNS:
            # Skip disabled kinds
            if kind == "citation" and not self.preserve_citations:
                continue
            if kind == "quotation" and not self.preserve_quotes:
                continue
            for m in pattern.finditer(text):
                spans.append(
                    ProtectedSpan(
                        start=m.start(),
                        end=m.end(),
                        text=m.group(),
                        kind=kind,
                        source="protected_spans",
                        mutability=_MUTABILITY.get(kind, "immutable"),
                    )
                )

        # Sort by start offset and merge overlapping spans
        spans.sort(key=lambda s: (s.start, -s.end))
        merged: list[ProtectedSpan] = []
        for span in spans:
            if merged and span.start < merged[-1].end:
                # Extend the last span if overlapping; immutable wins over format-only
                if span.end > merged[-1].end:
                    winning_mutability = "immutable" if (
                        span.mutability == "immutable" or merged[-1].mutability == "immutable"
                    ) else "format-only"
                    merged[-1] = ProtectedSpan(
                        start=merged[-1].start,
                        end=span.end,
                        text=text[merged[-1].start : span.end],
                        kind=merged[-1].kind,
                        source=merged[-1].source,
                        mutability=winning_mutability,
                    )
            else:
                merged.append(span)
        return merged

    def is_protected(self, offset: int, spans: list[ProtectedSpan]) -> bool:
        return any(s.start <= offset < s.end for s in spans)

    def is_immutable(self, offset: int, spans: list[ProtectedSpan]) -> bool:
        return any(s.start <= offset < s.end and s.mutability == "immutable" for s in spans)

    def overlaps_protected(
        self, start: int, end: int, spans: list[ProtectedSpan]
    ) -> bool:
        return any(s.start < end and start < s.end for s in spans)

    def overlaps_immutable(
        self, start: int, end: int, spans: list[ProtectedSpan]
    ) -> bool:
        return any(
            s.start < end and start < s.end and s.mutability == "immutable"
            for s in spans
        )
