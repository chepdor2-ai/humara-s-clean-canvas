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


# ═══════════════════════════════════════════════════════════════════
# Capitalization Fixer — Mid-Sentence Capitals
# ═══════════════════════════════════════════════════════════════════

ABBREVIATIONS_PY = {
    'AI', 'US', 'USA', 'UK', 'EU', 'UN', 'NASA', 'FBI', 'CIA', 'CEO', 'CFO',
    'CTO', 'COO', 'PhD', 'MBA', 'MD', 'JD', 'BS', 'BA', 'MA', 'MS', 'DNA',
    'RNA', 'HIV', 'AIDS', 'GDP', 'GPA', 'SAT', 'ACT', 'GRE', 'STEM', 'NATO',
    'WHO', 'IMF', 'WTO', 'UNICEF', 'UNESCO', 'OECD', 'OPEC', 'IT', 'IoT',
    'FPE', 'FDSE', 'KCPE', 'KCSE', 'NGO', 'NGOs', 'TSC', 'KNEC', 'KICD',
    'ICT', 'SDGs', 'MDGs', 'EFA', 'TVET', 'TVETs',
}

ALWAYS_LOWERCASE_PY = {
    # Articles & determiners
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'some', 'any', 'all',
    'each', 'every', 'both', 'few', 'several', 'such', 'many', 'much', 'more',
    'most', 'other', 'another',
    # Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'over', 'about', 'against', 'among', 'around', 'behind', 'beyond', 'down',
    'near', 'off', 'out', 'past', 'toward', 'towards', 'up', 'upon', 'within',
    'without', 'across', 'along', 'beside', 'besides', 'despite', 'except',
    'like', 'unlike', 'until', 'onto',
    # Conjunctions
    'and', 'or', 'but', 'nor', 'yet', 'so', 'if', 'then', 'than', 'when',
    'while', 'where', 'whether', 'although', 'because', 'since', 'unless',
    'though', 'whereas',
    # Pronouns
    'it', 'its', 'they', 'them', 'their', 'theirs', 'he', 'she', 'him', 'her',
    'his', 'hers', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'my',
    'me', 'mine', 'who', 'whom', 'whose', 'which', 'what',
    # Common verbs
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'must', 'need', 'get', 'got', 'make', 'made', 'take',
    'took', 'taken', 'give', 'gave', 'given', 'come', 'came', 'go', 'went',
    'gone', 'know', 'knew', 'known', 'think', 'thought', 'see', 'saw', 'seen',
    'find', 'found', 'say', 'said', 'tell', 'told', 'keep', 'kept', 'let',
    'put', 'run', 'set', 'show', 'showed', 'shown', 'try', 'tried', 'use',
    'used', 'work', 'worked', 'call', 'called', 'become', 'became', 'leave',
    'left', 'argues', 'argue', 'argued', 'describes', 'describe', 'described',
    'explains', 'explain', 'explained', 'notes', 'noted', 'states', 'stated',
    'suggests', 'claims', 'claimed', 'indicates', 'indicated', 'shows',
    'reveals', 'revealed', 'demonstrates', 'demonstrated', 'highlights',
    'emphasized', 'increased', 'improved', 'reduced', 'expanded', 'promoted',
    'ensured', 'enabled', 'encouraged', 'established', 'maintained',
    'addressed', 'involved', 'compelled', 'motivated', 'invested', 'allocated',
    'subsidizing', 'provided', 'included', 'continued', 'developed',
    'strengthened', 'transformed', 'generated', 'recognizing',
    # Common nouns — education
    'education', 'training', 'teaching', 'instruction', 'learning', 'school',
    'schools', 'university', 'universities', 'college', 'student', 'students',
    'teacher', 'teachers', 'classroom', 'classrooms', 'curriculum', 'enrolment',
    'enrollment', 'tuition', 'graduate', 'graduates', 'pupil', 'pupils',
    'examination', 'certificate', 'qualification', 'qualifications',
    # Common nouns — government
    'government', 'policy', 'policies', 'legislation', 'regulation', 'law',
    'governance', 'administration', 'authority', 'authorities', 'ministry',
    'department', 'agency', 'commission', 'committee', 'council', 'directive',
    'directives', 'initiative', 'initiatives', 'reform', 'reforms', 'sector',
    # Common nouns — society/economy
    'development', 'growth', 'demand', 'population', 'community', 'communities',
    'society', 'economy', 'economic', 'market', 'markets', 'labor', 'labour',
    'employment', 'workforce', 'industry', 'industries', 'commerce', 'trade',
    'investment', 'infrastructure', 'technology', 'innovation', 'progress',
    'poverty', 'wealth', 'income', 'budget', 'assets', 'resources',
    'productivity', 'sustainability', 'equality', 'equity', 'access',
    'opportunity', 'opportunities', 'mobility',
    # Common nouns — general
    'introduction', 'commitment', 'participation', 'responsibility', 'expansion',
    'movement', 'spirit', 'tradition', 'culture', 'practice', 'approach',
    'method', 'strategy', 'system', 'process', 'structure', 'framework',
    'model', 'factor', 'factors', 'element', 'aspect', 'concept', 'principle',
    'role', 'impact', 'effect', 'result', 'outcome', 'consequence', 'benefit',
    'challenge', 'problem', 'issue', 'solution', 'response', 'effort',
    'measure', 'level', 'rate', 'number', 'area', 'region', 'country', 'part',
    'place', 'group', 'member', 'parent', 'parents', 'child', 'children',
    'family', 'families', 'people', 'person', 'individual', 'citizen',
    'leader', 'worker', 'candidate', 'investor', 'planner', 'stakeholder',
    'management', 'accountability', 'ownership', 'performance', 'achievement',
    'success', 'quality', 'standard', 'value', 'values', 'goal', 'objective',
    'purpose', 'target', 'priority', 'basis', 'foundation', 'context',
    'situation', 'condition', 'environment', 'case', 'example', 'evidence',
    'data', 'information', 'knowledge', 'research', 'study', 'studies',
    'analysis', 'findings', 'perception', 'consciousness', 'mindset',
    'land', 'building', 'materials', 'laboratories', 'cost', 'costs',
    'provision', 'spaces',
    # Adjectives
    'secondary', 'primary', 'key', 'main', 'central', 'major', 'critical',
    'essential', 'important', 'significant', 'considerable', 'substantial',
    'fundamental', 'basic', 'general', 'specific', 'particular', 'various',
    'different', 'similar', 'new', 'good', 'better', 'best', 'great', 'large',
    'small', 'long', 'short', 'high', 'low', 'early', 'late', 'next', 'last',
    'first', 'second', 'whole', 'entire', 'full', 'complete', 'total',
    'overall', 'direct', 'indirect', 'rapid', 'steady', 'sharp', 'clear',
    'strong', 'powerful', 'effective', 'active', 'responsible', 'available',
    'limited', 'adequate', 'growing', 'increasing', 'ongoing', 'consistent',
    'radical', 'unique', 'private', 'public', 'national', 'local', 'rural',
    'urban', 'modern', 'current', 'skilled', 'educated', 'financial', 'social',
    'political', 'cultural', 'academic', 'professional', 'technical',
    'industrial', 'demographic', 'successive', 'collective', 'underserved',
    # Adverbs
    'also', 'just', 'only', 'very', 'still', 'again', 'even', 'not', 'no',
    'here', 'there', 'now', 'often', 'always', 'never', 'sometimes', 'usually',
    'perhaps', 'likely', 'probably', 'certainly', 'clearly', 'simply', 'merely',
    'effectively', 'essentially', 'particularly', 'especially', 'specifically',
    'generally', 'typically', 'primarily', 'largely', 'mainly', 'heavily',
    'deeply', 'directly', 'steadily', 'dramatically', 'increasingly',
    'previously', 'further', 'furthermore', 'moreover', 'therefore', 'thus',
    'hence', 'however', 'nevertheless', 'meanwhile', 'consequently',
    'additionally', 'equally', 'besides', 'accordingly', 'overall',
    'answering', 'responding',
}


def _is_heading_line(line: str) -> bool:
    """Check if a line looks like a heading/title."""
    trimmed = line.strip()
    if not trimmed:
        return False
    if re.match(r'^#{1,6}\s', trimmed):
        return True
    if re.match(r'^[\d]+[.):\s]', trimmed):
        return True
    if re.match(r'^[IVXLCDM]+[.):]\s', trimmed, re.IGNORECASE):
        return True
    words = trimmed.split()
    if len(words) <= 12 and not re.search(r'[.!?:;]$', trimmed):
        return True
    return False


def _is_abbreviation(word: str) -> bool:
    """Check if word is an abbreviation/acronym."""
    stripped = re.sub(r"[^a-zA-Z&.']", '', word)
    if not stripped:
        return False
    if stripped in ABBREVIATIONS_PY:
        return True
    if len(stripped) >= 2 and stripped == stripped.upper() and re.search(r'[A-Z]', stripped):
        return True
    if re.search(r'[a-z][A-Z]', stripped) or re.match(r'^Mc[A-Z]', stripped):
        return True
    if re.match(r'^([A-Za-z]\.){2,}$', word):
        return True
    return False


def _extract_genuine_proper_nouns(original_text: str) -> set:
    """Extract proper nouns from non-heading, mid-sentence positions."""
    proper = set()
    if not original_text:
        return proper
    
    paragraphs = re.split(r'\n\s*\n', original_text)
    for para in paragraphs:
        lines = [l.strip() for l in para.split('\n') if l.strip()]
        for line in lines:
            if _is_heading_line(line):
                continue
            sentences = re.split(r'(?<=[.!?])\s+', line)
            for sent in sentences:
                words = sent.split()
                for i in range(1, len(words)):  # skip first word
                    w = re.sub(r'[^a-zA-Z\'-]', '', words[i])
                    if not w or len(w) < 2:
                        continue
                    if re.match(r'^[A-Z][a-z]', w) and w.lower() not in ALWAYS_LOWERCASE_PY:
                        proper.add(w)
    return proper


def fix_mid_sentence_capitalization(text: str, original_text: str = None) -> str:
    """Fix mid-sentence capitalization across entire text."""
    if not text or not text.strip():
        return text
    
    proper_nouns = _extract_genuine_proper_nouns(original_text) if original_text else set()
    proper_nouns.add('I')
    
    paragraphs = re.split(r'(\n\s*\n)', text)
    
    result_parts = []
    for segment in paragraphs:
        if re.match(r'^\n\s*\n$', segment) or not segment.strip():
            result_parts.append(segment)
            continue
        
        lines = segment.split('\n')
        fixed_lines = []
        for line in lines:
            if not line.strip():
                fixed_lines.append(line)
                continue
            if _is_heading_line(line):
                fixed_lines.append(line)
                continue
            fixed_lines.append(_fix_line_capitalization(line, proper_nouns))
        result_parts.append('\n'.join(fixed_lines))
    
    return ''.join(result_parts)


def _fix_line_capitalization(line: str, proper_nouns: set) -> str:
    """Fix capitalization within a single body-text line."""
    sentences = re.split(r'(?<=[.!?])\s+', line)
    
    fixed_sentences = []
    for sentence in sentences:
        if not sentence.strip():
            fixed_sentences.append(sentence)
            continue
        
        tokens = re.split(r'(\s+)', sentence)
        is_first_word = True
        
        fixed_tokens = []
        for token in tokens:
            if re.match(r'^\s+$', token) or not token:
                fixed_tokens.append(token)
                continue
            
            # Split punctuation from core
            lead_m = re.match(r'^([^a-zA-Z0-9]*)', token)
            trail_m = re.search(r'([^a-zA-Z0-9]*)$', token)
            lead_punc = lead_m.group(1) if lead_m else ''
            trail_punc = trail_m.group(1) if trail_m else ''
            core = token[len(lead_punc):len(token) - (len(trail_punc) if trail_punc else 0)]
            
            if not core or not re.search(r'[a-zA-Z]', core):
                fixed_tokens.append(token)
                continue
            
            # Preserve abbreviations/acronyms
            if _is_abbreviation(core):
                is_first_word = False
                fixed_tokens.append(token)
                continue
            
            # Preserve proper nouns from original
            proper_match = None
            for pn in proper_nouns:
                if pn.lower() == core.lower():
                    proper_match = pn
                    break
            if proper_match:
                is_first_word = False
                fixed_tokens.append(lead_punc + proper_match + trail_punc)
                continue
            
            # Preserve standalone "I"
            if core == 'I':
                is_first_word = False
                fixed_tokens.append(token)
                continue
            
            # First word of sentence
            if is_first_word:
                is_first_word = False
                if len(core) > 0:
                    fixed = core[0].upper() + core[1:].lower()
                    fixed_tokens.append(lead_punc + fixed + trail_punc)
                else:
                    fixed_tokens.append(token)
                continue
            
            # Mid-sentence
            is_first_word = False
            lower = core.lower()
            
            if lower in ALWAYS_LOWERCASE_PY:
                fixed_tokens.append(lead_punc + lower + trail_punc)
                continue
            
            # Leave unknown capitalized words as-is (may be proper nouns)
            fixed_tokens.append(token)
        
        fixed_sentences.append(''.join(fixed_tokens))
    
    return ' '.join(fixed_sentences)


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
    
    # Step 1: Fix mid-sentence capitalization (always applied)
    before_caps = final_text
    final_text = fix_mid_sentence_capitalization(final_text, original_text)
    if final_text != before_caps:
        was_repaired = True
        repairs.append('Fixed mid-sentence capitalization')
    
    # Step 2: Validate sentence integrity
    validation = validate_humanized_output(
        original_text, final_text,
        allow_word_change_bound=allow_word_change_bound,
        min_sentence_words=min_sentence_words
    )
    
    # Step 3: If invalid and auto-repair enabled, attempt repair
    if not validation.is_valid and auto_repair:
        final_text, repair_list = repair_humanized_output(original_text, final_text)
        repairs.extend(repair_list)
        was_repaired = was_repaired or len(repair_list) > 0
        
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
