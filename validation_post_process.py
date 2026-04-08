#!/usr/bin/env python3
"""
Post-Processing Validation Module for Python Humanizers
========================================================
Ensures sentence integrity, prevents truncation, and validates content preservation.
"""

import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass


@dataclass
class ValidationStats:
    original_sentences: int
    humanized_sentences: int
    original_words: int
    humanized_words: int
    truncated_sentences: int
    missing_sentences: int
    word_preservation_ratio: float


@dataclass
class ValidationResult:
    is_valid: bool
    issues: List[str]
    stats: ValidationStats


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences with robust handling."""
    if not text or not text.strip():
        return []
    
    # Normalize whitespace
    normalized = re.sub(r'\s+', ' ', text).strip()
    
    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', normalized)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    # If no sentences found, return whole text
    return sentences if sentences else [normalized]


def count_words(text: str) -> int:
    """Count words in text (excluding punctuation)."""
    words = re.sub(r'[^\w\s\'-]', ' ', text).split()
    return len([w for w in words if w])


def is_sentence_truncated(sentence: str) -> bool:
    """Check if a sentence appears truncated."""
    trimmed = sentence.strip()
    if not trimmed:
        return False
    
    # Has sentence-ending punctuation
    if re.search(r'[.!?]$', trimmed):
        return False
    
    # Check if it's a title (acceptable to have no punctuation)
    words = trimmed.split()
    if len(words) <= 12:
        capital_words = sum(1 for w in words if w and w[0].isupper())
        title_ratio = capital_words / max(len(words), 1)
        if title_ratio >= 0.6:
            return False
    
    # Ends mid-word
    if re.search(r'[a-z]$', trimmed) and len(words) > 3:
        last_word = words[-1]
        if len(last_word) <= 3 and count_words(trimmed) >= 5:
            return True
    
    return False


def validate_humanized_output(
    original_text: str,
    humanized_text: str,
    allow_word_change_bound: float = 0.7,
    min_sentence_words: int = 3,
    strict_mode: bool = False
) -> ValidationResult:
    """Main validation function - validates entire humanized output."""
    issues = []
    
    # Split into sentences
    original_sentences = split_into_sentences(original_text)
    humanized_sentences = split_into_sentences(humanized_text)
    
    # Count words
    original_words = count_words(original_text)
    humanized_words = count_words(humanized_text)
    
    # Validate sentence count
    sentence_count_diff = abs(len(original_sentences) - len(humanized_sentences))
    max_diff = max(1, int(len(original_sentences) * 0.2))
    if sentence_count_diff > max_diff:
        issues.append(
            f"Sentence count mismatch: original has {len(original_sentences)}, "
            f"humanized has {len(humanized_sentences)} (diff: {sentence_count_diff})"
        )
    
    # Validate word preservation
    word_preservation_ratio = humanized_words / max(original_words, 1)
    
    if word_preservation_ratio < 0.5 or word_preservation_ratio > 1.8:
        issues.append(
            f"Word count out of bounds: original has {original_words}, "
            f"humanized has {humanized_words} (ratio: {word_preservation_ratio:.2f})"
        )
    
    # Validate each sentence
    truncated_count = 0
    missing_count = 0
    
    max_index = max(len(original_sentences), len(humanized_sentences))
    
    for i in range(max_index):
        orig = original_sentences[i] if i < len(original_sentences) else ''
        hum = humanized_sentences[i] if i < len(humanized_sentences) else ''
        
        if is_sentence_truncated(hum):
            truncated_count += 1
            issues.append(
                f"Sentence {i + 1} appears truncated: \"{hum[:80]}...\""
            )
        
        if not hum.strip() and orig.strip():
            missing_count += 1
            issues.append(
                f"Sentence {i + 1} is missing in humanized output: \"{orig[:80]}...\""
            )
        
        # Check for excessive word count change
        if orig and hum:
            orig_word_count = count_words(orig)
            hum_word_count = count_words(hum)
            if orig_word_count > 0:
                word_change_ratio = abs(orig_word_count - hum_word_count) / orig_word_count
                if word_change_ratio > allow_word_change_bound:
                    issues.append(
                        f"Sentence {i + 1} has excessive word change ({word_change_ratio * 100:.0f}%): "
                        f"\"{orig[:60]}...\" vs \"{hum[:60]}...\""
                    )
        
        # Check for very short humanized sentences
        if hum and orig:
            hum_word_count = count_words(hum)
            orig_word_count = count_words(orig)
            if hum_word_count < min_sentence_words and orig_word_count >= min_sentence_words:
                issues.append(
                    f"Sentence {i + 1} too short ({hum_word_count} words): possibly truncated"
                )
    
    is_valid = (truncated_count == 0 and missing_count == 0) if not strict_mode else len(issues) == 0
    
    stats = ValidationStats(
        original_sentences=len(original_sentences),
        humanized_sentences=len(humanized_sentences),
        original_words=original_words,
        humanized_words=humanized_words,
        truncated_sentences=truncated_count,
        missing_sentences=missing_count,
        word_preservation_ratio=word_preservation_ratio
    )
    
    return ValidationResult(is_valid=is_valid, issues=issues, stats=stats)


def repair_humanized_output(original_text: str, humanized_text: str) -> Tuple[str, List[str]]:
    """Attempt to repair common issues in humanized output."""
    repairs = []
    repaired = humanized_text
    
    original_sentences = split_into_sentences(original_text)
    humanized_sentences = split_into_sentences(repaired)
    
    # If humanized has fewer sentences, append missing originals
    if len(humanized_sentences) < len(original_sentences):
        missing = original_sentences[len(humanized_sentences):]
        if missing:
            repaired = repaired.strip() + ' ' + ' '.join(missing)
            repairs.append(f"Appended {len(missing)} missing sentences from original")
    
    # Fix truncated last sentence
    if humanized_sentences:
        last_humanized = humanized_sentences[-1]
        if is_sentence_truncated(last_humanized) and original_sentences:
            last_original = original_sentences[-1]
            # Replace truncated ending with original ending
            repaired_sentences = humanized_sentences[:-1] + [last_original]
            repaired = ' '.join(repaired_sentences)
            repairs.append('Repaired truncated last sentence')
    
    # Fix missing ending punctuation
    if repaired and not re.search(r'[.!?]$', repaired.strip()):
        last_char = original_text.strip()[-1] if original_text.strip() else '.'
        if re.search(r'[.!?]', last_char):
            repaired = repaired.strip() + last_char
            repairs.append('Added missing ending punctuation')
        else:
            repaired = repaired.strip() + '.'
            repairs.append('Added default ending period')
    
    return repaired, repairs


def validate_and_repair_output(
    original_text: str,
    humanized_text: str,
    allow_word_change_bound: float = 0.7,
    min_sentence_words: int = 3,
    auto_repair: bool = True
) -> Dict:
    """Validate and repair humanized output in one step."""
    final_text = humanized_text
    was_repaired = False
    repairs = []
    
    # First validation
    validation = validate_humanized_output(
        original_text, final_text,
        allow_word_change_bound=allow_word_change_bound,
        min_sentence_words=min_sentence_words
    )
    
    # If invalid and auto-repair enabled, attempt repair
    if not validation.is_valid and auto_repair:
        final_text, repairs = repair_humanized_output(original_text, final_text)
        was_repaired = len(repairs) > 0
        
        # Re-validate after repair
        validation = validate_humanized_output(
            original_text, final_text,
            allow_word_change_bound=allow_word_change_bound,
            min_sentence_words=min_sentence_words
        )
    
    return {
        'text': final_text,
        'validation': validation,
        'was_repaired': was_repaired,
        'repairs': repairs
    }
