import re
import random

def phase_1_structural_cleanup(text: str) -> str:
    """Fix sentence boundaries, double spaces, hanging punctuation."""
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'([.?!])\s*([a-z])', lambda m: f"{m.group(1)} {m.group(2).upper()}", text)
    text = re.sub(r'\s+([,.:;?!])', r'\1', text)
    text = text.replace('.. ', '. ')
    text = text.replace('..', '.')
    return text.strip()

def phase_2_academic_style(text: str) -> str:
    """Balance transition words, remove cliches."""
    fluff_words = ['game-changing', 'crucial', 'leveraging', 'in conclusion', 'to summarize']
    for word in fluff_words:
        text = re.sub(rf'\b{word}\b', '', text, flags=re.IGNORECASE)
    
    # Simple transition replacements
    text = text.replace('Furthermore,', 'In addition,').replace('Moreover,', 'Additionally,')
    return re.sub(r'\s+', ' ', text).strip()

def phase_3_clarity_compression(text: str) -> str:
    """Trim repetitive phrases locally."""
    text = text.replace('due to the fact that', 'because')
    text = text.replace('in order to', 'to')
    text = text.replace('a large number of', 'many')
    return text

def phase_4_fact_and_format(text: str) -> str:
    """Ensure grammatical consistency and no orphaned bullets."""
    text = re.sub(r'^- ', '', text, flags=re.MULTILINE)  # clear basic bullets if any snuck in
    text = text.replace(' ,', ',').replace(' .', '.')
    return text

def execute_ninja_non_llm_phases(text: str) -> str:
    """Run all 4 non-LLM post-processing phases."""
    text = phase_1_structural_cleanup(text)
    text = phase_2_academic_style(text)
    text = phase_3_clarity_compression(text)
    text = phase_4_fact_and_format(text)
    return text
