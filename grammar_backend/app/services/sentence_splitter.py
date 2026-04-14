from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class TokenSpan:
    text: str
    start: int  # char offset in sentence
    end: int


@dataclass
class SentenceSpan:
    text: str
    start: int  # char offset in document
    end: int
    paragraph_index: int = 0
    tokens: list[TokenSpan] = field(default_factory=list)


@dataclass
class ParagraphSpan:
    text: str
    start: int
    end: int
    sentences: list[SentenceSpan] = field(default_factory=list)


# ── Known abbreviations that end with a period ──
_ABBREVS = frozenset(
    "Mr Mrs Ms Dr Prof Jr Sr Inc Ltd Corp Co vs etc al "
    "Jan Feb Mar Apr Jun Jul Aug Sep Oct Nov Dec "
    "Gen Gov Sgt Cpl Pvt Rev Hon Esq "
    "Ave Blvd Dept Div Est Fig Gov Vol "
    "approx dept cont est govt intl natl org "
    "Assn Bros Dept Dist Govt Inst Tech Univ "
    "No no Nos nos nr Nr Fig fig Eq eq Ch ch "
    "Supp Sess Cong Stat Reg Fed "
    "v vs".split()
)

# Multi-letter abbreviations with dots: U.S., e.g., i.e., Ph.D., etc.
_DOTTED_ABBREV = re.compile(r"\b(?:[A-Za-z]\.){2,}$")

# ── Patterns that look like sentence endings but AREN'T ──
# Decimal numbers: 3.14, $1,234.56
_DECIMAL = re.compile(r"\d\.\d")
# Ellipsis: ... or …
_ELLIPSIS = re.compile(r"\.{2,}$|\u2026$")
# Numbered list item prefix: "1. " "2) " "a. " "iv. "
_LIST_PREFIX = re.compile(r"^\s*(?:\d{1,4}[\.\)]\s|[a-z][\.\)]\s|[ivxlc]+[\.\)]\s)", re.IGNORECASE)

# ── Sentence boundary regex ──
# Finds the position *after* sentence-ending punctuation + whitespace before uppercase.
# We use finditer instead of split to preserve whitespace.
_SENTENCE_BOUNDARY = re.compile(
    r"(?<=[.!?])"               # after sentence-ending punctuation
    r'(?:["\')\u201d\u2019]*)'  # optional closing quotes/parens
    r"(\s+)"                    # capture whitespace gap
    r"(?=[A-Z\u201c\u2018\"(\u2014\u2013\[])"  # followed by uppercase / opening quote / paren / dash / bracket
)

_PARA_SPLIT = re.compile(r"\n\s*\n")
_TOKEN_SPLIT = re.compile(r"(\S+)")


class SentenceSplitter:
    def split(self, text: str) -> list[ParagraphSpan]:
        paragraphs: list[ParagraphSpan] = []
        para_offset = 0

        for pi, para_text in enumerate(re.split(_PARA_SPLIT, text)):
            # Find the actual start in original text
            start = text.index(para_text, para_offset) if para_text in text[para_offset:] else para_offset
            para_span = ParagraphSpan(text=para_text, start=start, end=start + len(para_text))
            para_offset = para_span.end

            # Find sentence boundaries, then filter false positives
            sentence_texts = self._split_sentences(para_text)

            sent_offset = 0
            for sent_text in sentence_texts:
                if not sent_text.strip():
                    sent_offset += len(sent_text)
                    continue
                s_start = para_text.index(sent_text, sent_offset) if sent_text in para_text[sent_offset:] else sent_offset
                s_end = s_start + len(sent_text)
                sent_span = SentenceSpan(
                    text=sent_text,
                    start=start + s_start,
                    end=start + s_end,
                    paragraph_index=pi,
                )
                # Tokenize
                for m in _TOKEN_SPLIT.finditer(sent_text):
                    sent_span.tokens.append(
                        TokenSpan(text=m.group(), start=m.start(), end=m.end())
                    )
                para_span.sentences.append(sent_span)
                sent_offset = s_end

            paragraphs.append(para_span)

        return paragraphs

    def _split_sentences(self, para_text: str) -> list[str]:
        """Split paragraph into sentences, preserving all original characters."""
        # Find all potential split positions
        boundaries: list[int] = []
        for m in _SENTENCE_BOUNDARY.finditer(para_text):
            # The split point is at the start of the captured whitespace
            split_pos = m.start(1)
            boundaries.append(split_pos)

        if not boundaries:
            return [para_text]

        # Filter out false-positive boundaries
        valid_boundaries: list[int] = []
        for pos in boundaries:
            left = para_text[:pos]
            right = para_text[pos:].lstrip()
            if not self._should_rejoin(left, right):
                valid_boundaries.append(pos)

        if not valid_boundaries:
            return [para_text]

        # Split at valid boundaries
        parts: list[str] = []
        prev = 0
        for pos in valid_boundaries:
            parts.append(para_text[prev:pos])
            # Skip the whitespace gap — include it at the start of the next sentence
            prev = pos
        parts.append(para_text[prev:])

        # Strip leading whitespace from all but first part (attach to prev as trailing)
        result: list[str] = []
        for i, part in enumerate(parts):
            if i == 0:
                result.append(part)
            else:
                # Keep the sentence text, including its leading space
                result.append(part)

        return [p for p in result if p.strip()]

    def flat_sentences(self, text: str) -> list[SentenceSpan]:
        result: list[SentenceSpan] = []
        for para in self.split(text):
            result.extend(para.sentences)
        return result

    def _should_rejoin(self, left: str, right: str) -> bool:
        """Return True if the split between left and right is a false positive."""
        stripped = left.rstrip()
        if not stripped:
            return True

        # 1. Abbreviation at end of left part
        if self._ends_with_abbreviation(stripped):
            return True

        # 2. Dotted abbreviation at end: U.S. / e.g. / i.e. / Ph.D.
        if _DOTTED_ABBREV.search(stripped):
            return True

        # 3. Single capital letter + period: "J." "A." — likely name initial, not sentence end
        if len(stripped) >= 2 and stripped[-1] == "." and stripped[-2].isupper() and (
            len(stripped) == 2 or not stripped[-3].isalpha()
        ):
            return True

        # 4. Decimal number split: "…3." + "14 degrees…"
        if stripped and stripped[-1] == ".":
            before_dot = stripped[:-1]
            # If the char before the dot is a digit and right starts with a digit
            if before_dot and before_dot[-1].isdigit() and right and right.lstrip()[:1].isdigit():
                return True

        # 5. Ellipsis: "..." or "…"
        if _ELLIPSIS.search(stripped):
            return True

        # 6. Right part starts with a list-item prefix → don't rejoin (allow split)
        if _LIST_PREFIX.match(right):
            return False

        return False

    @staticmethod
    def _ends_with_abbreviation(text: str) -> bool:
        stripped = text.rstrip()
        if not stripped.endswith("."):
            return False
        # Check last word before the period
        word = stripped.rstrip(".").rsplit(None, 1)[-1] if stripped.rstrip(".") else ""
        return word in _ABBREVS
