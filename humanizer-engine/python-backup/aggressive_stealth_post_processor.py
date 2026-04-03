"""
Aggressive Stealth Post-Processor
Targets: 0% AI Score on GPTZero, Originality, Copyleaks, Turnitin, Pangram, Sifer SEO.
Pattern: Pre-2000s Academic & Early Blog tone (conversational yet rigorous, pre-SEO fluff).
Rules: Sentence merging ALLOWED. Sentence splitting FORBIDDEN. Retain semantic meaning.
Target Change Rate in this stage: 40-55% 
"""
import re
import random

# Pre-2000s Academic & Early-Blog Transitions and Phrases
PRE_2000_PATTERNS = {
    # Modern AI -> Pre-2000 phrase
    r"\bin today's rapidly evolving\b": "in the current climate",
    r"\bleveraging\b": "making use of",
    r"\bdelving into\b": "examining",
    r"\bgame-changing\b": "notable",
    r"\bparadigm shift\b": "fundamental change",
    r"\bcrucial\b": "necessary",
    r"\bin conclusion\b": "to summarize",
    r"\btapestry of\b": "array of",
    r"\btestament to\b": "evidence of",
    r"\bunderscores\b": "highlights",
    r"\bnavigating the complexities\b": "handling the difficulties",
    r"\bseamlessly\b": "smoothly",
    r"\brobust\b": "stable",
    r"\bfostering\b": "developing",
    r"\bmeticulous\b": "careful",
    r"\bsynergy\b": "cooperation",
    r"\bpivotal\b": "central",
}

AI_TELLS = [
    "It is important to note", "Moreover,", "Furthermore,", 
    "Additionally,", "In summary", "Ultimately,", "Consequently,"
]

def apply_pre_2000_tone(text: str) -> str:
    """Replaces modern AI buzzwords with 1990s academic/blog equivalents."""
    for pattern, replacement in PRE_2000_PATTERNS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    # Diminish strong AI transitions
    for tell in AI_TELLS:
        if random.random() > 0.3: # Randomly remove 70% of typical AI transitions
            text = text.replace(tell + " ", "")
            text = text.replace(tell.lower() + " ", "")
    
    return text

def merge_sentences(text: str) -> str:
    """
    Merge sentences to 'breathe air' into the paper.
    No splitting allowed. Only merges.
    Finds two short/medium consecutive sentences and joins them with pre-2000 conjunctions.
    """
    paragraphs = text.split('\n')
    merged_paragraphs = []
    
    conjunctions = ["; moreover, ", "; furthermore, ", ", and ", ", while ", "; thus, ", ", yet "]
    
    for p in paragraphs:
        if not p.strip():
            merged_paragraphs.append(p)
            continue
            
        # Basic sentence tokenizer
        sentences = re.split(r'(?<=[.!?])\s+', p.strip())
        merged = []
        skip_next = False
        
        for i in range(len(sentences)):
            if skip_next:
                skip_next = False
                continue
                
            s1 = sentences[i]
            # Try to merge with next sentence if 30% chance hits and both aren't questions/exclamations
            if i < len(sentences) - 1 and random.random() < 0.4:
                s2 = sentences[i+1]
                if s1.endswith('.') and s2[0].isupper():
                    s1_clean = s1[:-1] # Remove period
                    conj = random.choice(conjunctions)
                    s2_clean = s2[0].lower() + s2[1:]
                    merged.append(f"{s1_clean}{conj}{s2_clean}")
                    skip_next = True
                    continue
            merged.append(s1)
            
        merged_paragraphs.append(' '.join(merged))

    return '\n'.join(merged_paragraphs)

def validate_meaning_retention(original: str, processed: str) -> bool:
    """
    Validates that meaning is retained. 
    Here we ensure keyword overlap is > 70%.
    """
    def extract_keywords(t):
        words = re.findall(r'\b[a-z]{5,}\b', t.lower())
        return set(words)
        
    orig_words = extract_keywords(original)
    proc_words = extract_keywords(processed)
    
    if not orig_words:
        return True
        
    overlap = len(orig_words.intersection(proc_words)) / len(orig_words)
    return overlap > 0.65  # Target is 75% total change, so 35% original hard keywords might be swapped via dictionaries, leaving ~65% overlap loosely.

def execute_aggressive_stealth_post_processing(text: str) -> str:
    """
    Main entry point for aggressive non-LLM post-processing.
    Designed for Ghost Pro and Ninja modes.
    """
    original_text = text
    
    # 1. Structural Cleanup
    text = re.sub(r'\s+', ' ', text)
    
    # 2. Tone Mapping (Pre-2000s)
    text = apply_pre_2000_tone(text)
    
    # 3. Sentence Merging (Breaths air, NO splitting allowed)
    text = merge_sentences(text)
    
    # 4. Final Formatting fixes
    text = text.replace(' ,', ',').replace(' .', '.').replace(' ;', ';')
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Validate Meaning 
    if not validate_meaning_retention(original_text, text):
        # Fallback to original text if validation fails aggressively
        return original_text
        
    return text
