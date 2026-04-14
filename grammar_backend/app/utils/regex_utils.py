from __future__ import annotations

import re

# Pre-compiled patterns for reuse
WHITESPACE_RUN = re.compile(r"\s+")
WORD_BOUNDARY = re.compile(r"\b\w+\b")
SENTENCE_END = re.compile(r"[.!?]+")
OPENING_QUOTE = re.compile(r'["\u201c\u2018]')
CLOSING_QUOTE = re.compile(r'["\u201d\u2019]')


def clean_whitespace(text: str) -> str:
    return WHITESPACE_RUN.sub(" ", text).strip()


def extract_words(text: str) -> list[str]:
    return WORD_BOUNDARY.findall(text)


def is_sentence_ending(char: str) -> bool:
    return char in ".!?"
