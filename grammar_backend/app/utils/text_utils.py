from __future__ import annotations


def char_count(text: str) -> int:
    return len(text)


def word_count(text: str) -> int:
    return len(text.split())


def sentence_count(text: str) -> int:
    import re
    return len(re.split(r"[.!?]+", text.strip())) - 1 or 1


def truncate(text: str, max_len: int = 200, suffix: str = "...") -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - len(suffix)] + suffix
