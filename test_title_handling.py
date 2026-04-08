#!/usr/bin/env python3
"""Test title detection and handling in oxygen_server."""

import sys
import re

def is_title_line(line: str) -> bool:
    """Detect if a line is a title/heading (short, no ending punctuation, often title case)."""
    line = line.strip()
    if not line or len(line) > 100:
        return False
    # No ending punctuation (.!?)
    if line[-1] in '.!?':
        return False
    # Short (≤ 12 words)
    if len(line.split()) > 12:
        return False
    # Check for title case or all caps
    words = line.split()
    capital_words = sum(1 for w in words if w and w[0].isupper())
    if capital_words >= len(words) * 0.6:  # At least 60% capitalized words
        return True
    return False


def split_paragraphs(text: str) -> list[dict]:
    """Split text into paragraphs, detecting and marking titles.
    Returns list of dicts with 'text', 'is_title', 'original_text' keys.
    """
    raw_paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    result = []
    
    for para in raw_paragraphs:
        # Check if this paragraph is a single-line title
        lines = para.split('\n')
        if len(lines) == 1 and is_title_line(lines[0]):
            result.append({'text': para, 'is_title': True, 'original_text': para})
        else:
            # Check if first line is a title followed by body text
            if len(lines) > 1 and is_title_line(lines[0]):
                # Split: title as one paragraph, rest as another
                result.append({'text': lines[0], 'is_title': True, 'original_text': lines[0]})
                body = ' '.join(lines[1:]).strip()
                if body:
                    result.append({'text': body, 'is_title': False, 'original_text': body})
            else:
                result.append({'text': para, 'is_title': False, 'original_text': para})
    
    return result

# Test
test_text = """Government Overreach and Responsible Government

The role of government in society has long been debated. This paper discusses government overreach versus responsible government.

Key Differences

The key difference between these concepts lies in balance and accountability."""

print("=" * 80)
print("INPUT TEXT:")
print("=" * 80)
print(test_text)
print("\n" + "=" * 80)
print("PARSED PARAGRAPHS:")
print("=" * 80)

paragraphs = split_paragraphs(test_text)
for i, para in enumerate(paragraphs):
    print(f"\nParagraph {i+1}:")
    print(f"  Is Title: {para['is_title']}")
    print(f"  Text: {para['text'][:100]}...")
