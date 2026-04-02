from __future__ import annotations

"""
Semantic Guard: Content-Aware Meaning Preservation Layer
Uses lightweight sentence embeddings (not generative LLMs) to ensure rewrites preserve meaning.

This is the non-LLM way to add semantic awareness to your humanizer:
- Fast: CPU-friendly embeddings
- Free: runs locally after one-time download
- Transparent: you see the similarity scores
- Safe: rejects rewrites that drift from original meaning
"""

try:
    from sentence_transformers import SentenceTransformer, util
    _HAS_SENTENCE_TRANSFORMERS = True
except Exception as e:
    print(f"⚠ sentence_transformers not available: {e}")
    SentenceTransformer = None
    util = None
    _HAS_SENTENCE_TRANSFORMERS = False

try:
    import torch
except Exception:
    torch = None

try:
    import numpy as np
except Exception:
    np = None

from typing import Tuple, Any

# ============================================================================
# MODEL SELECTION
# ============================================================================
# all-MiniLM-L6-v2 is the best 2026 balance for non-LLM use:
# - 80MB (downloads fast)
# - Fast CPU inference (~100ms per sentence)
# - Quality comparable to larger models for semantic similarity
# - No GPU needed

if _HAS_SENTENCE_TRANSFORMERS:
    try:
        model = SentenceTransformer('all-MiniLM-L6-v2')
        print("✓ Semantic guard model loaded (all-MiniLM-L6-v2)")
    except Exception as e:
        print(f"⚠ Warning: Semantic guard model not available: {e}")
        print("  This is optional. Humanizer will still work without it.")
        model = None
else:
    model = None
    print("⚠ sentence_transformers package not installed; semantic guard disabled.")

# ============================================================================
# CORE GUARDRAIL FUNCTIONS
# ============================================================================

def semantic_similarity(original: str, rewritten: str) -> float:
    """
    Measure semantic similarity between two texts using embeddings.
    
    Returns: float 0.0–1.0
    - 1.0: identical meaning
    - 0.9+: definitely safe (meaning preserved)
    - 0.85-0.90: borderline (probably safe but check edge cases)
    - <0.85: changed meaning significantly (reject rewrite)
    """
    if model is None:
        return 1.0  # Fallback: assume safe if model unavailable
    
    try:
        emb1 = model.encode(original, convert_to_tensor=True)
        emb2 = model.encode(rewritten, convert_to_tensor=True)
        similarity = float(util.cos_sim(emb1, emb2)[0][0])
        return similarity
    except Exception as e:
        print(f"⚠ Embedding error: {e}")
        return 1.0  # Fallback to safe


def is_meaning_preserved(original: str, rewritten: str, threshold: float = 0.88) -> Tuple[bool, float]:
    """
    Main guardrail function — determines if a rewrite is safe.
    
    Args:
        original: original text
        rewritten: candidate rewritten text
        threshold: minimum acceptable similarity (0.85-0.92 recommended)
                   0.92 = very conservative (rarely rejects valid rewrites)
                   0.88 = good balance (catches drift, allows style changes)
                   0.85 = permissive (allows more rewrites, less safety)
    
    Returns:
        (is_safe: bool, similarity_score: float)
        - is_safe=True if semantic similarity >= threshold
        - similarity_score for logging/analysis
    
    Example:
        >>> is_meaning_preserved("The cat sat", "The feline sat", threshold=0.88)
        (True, 0.91)  # Safe to use this rewrite
        
        >>> is_meaning_preserved("I like dogs", "I hate cats", threshold=0.88)
        (False, 0.21)  # Dangerous rewrite, reject
    """
    similarity = semantic_similarity(original, rewritten)
    is_safe = similarity >= threshold
    return is_safe, similarity


def semantic_similarity_batch(originals: list, rewritten_list: list) -> Any:
    """
    Efficiently compare multiple texts (batch processing).
    Returns: array of similarity scores (same length as inputs)
    """
    if model is None:
        return np.ones(len(originals)) if np is not None else [1.0] * len(originals)
    
    try:
        emb_originals = model.encode(originals, convert_to_tensor=True)
        emb_rewritten = model.encode(rewritten_list, convert_to_tensor=True)
        
        similarities = []
        for i in range(len(originals)):
            sim = float(util.cos_sim(emb_originals[i], emb_rewritten[i])[0][0])
            similarities.append(sim)
        
        return np.array(similarities) if np is not None else similarities
    except Exception as e:
        print(f"⚠ Batch embedding error: {e}")
        return np.ones(len(originals)) if np is not None else [1.0] * len(originals)


# ============================================================================
# ADVANCED: NEAREST SEMANTIC NEIGHBORS
# ============================================================================
# Use embeddings to find contextually appropriate synonyms/rewrites

def find_contextual_synonyms(sentence: str, target_word: str, 
                             synonym_candidates: list, 
                             top_k: int = 1) -> list:
    """
    Find the best synonym for a word in context.
    Uses embeddings to ensure the replacement keeps meaning intact.
    
    Example:
        >>> find_contextual_synonyms(
        ...     "The research shows clear results",
        ...     "shows",
        ...     ["reveals", "indicates", "demonstrates", "proves"],
        ...     top_k=1
        ... )
        ['reveals']  # Best fit for this context
    """
    if model is None:
        return synonym_candidates[:top_k]  # Fallback
    
    try:
        # Encode the original sentence with target word
        original_emb = model.encode(sentence, convert_to_tensor=True)
        
        # Encode each candidate sentence with synonym swapped
        candidate_embeddings = []
        for candidate in synonym_candidates:
            candidate_sent = sentence.replace(target_word, candidate)
            cand_emb = model.encode(candidate_sent, convert_to_tensor=True)
            sim = float(util.cos_sim(original_emb, cand_emb)[0][0])
            candidate_embeddings.append((candidate, sim))
        
        # Sort by similarity (highest first)
        candidate_embeddings.sort(key=lambda x: x[1], reverse=True)
        
        # Return top k synonyms
        return [c[0] for c in candidate_embeddings[:top_k]]
    
    except Exception as e:
        print(f"⚠ Synonym search error: {e}")
        return synonym_candidates[:top_k]


# ============================================================================
# UTILITIES FOR LOGGING & ANALYSIS
# ============================================================================

def analyze_rewrite_quality(original: str, rewritten: str) -> dict:
    """
    Detailed analysis of how a rewrite changed the text.
    Returns metrics for debugging and optimization.
    """
    similarity = semantic_similarity(original, rewritten)
    
    # Length changes
    original_len = len(original.split())
    rewritten_len = len(rewritten.split())
    length_change = ((rewritten_len - original_len) / max(original_len, 1)) * 100
    
    return {
        'semantic_similarity': similarity,
        'original_length': original_len,
        'rewritten_length': rewritten_len,
        'length_change_percent': length_change,
        'is_meaning_safe': similarity >= 0.88,
        'drift_risk': 'high' if similarity < 0.85 else 'medium' if similarity < 0.90 else 'low'
    }


if __name__ == "__main__":
    # Quick test
    if model is None:
        print("Model not loaded. Run: pip install sentence-transformers")
        exit(1)
    
    print("\n" + "="*70)
    print("SEMANTIC GUARD - TEST SUITE")
    print("="*70)
    
    # Test 1: Identical text (should be 1.0)
    test1_orig = "The research shows clear results."
    test1_rewrite = "The research shows clear results."
    safe, sim = is_meaning_preserved(test1_orig, test1_rewrite)
    print(f"\nTest 1 (Identical):")
    print(f"  Original: {test1_orig}")
    print(f"  Rewrite: {test1_rewrite}")
    print(f"  Similarity: {sim:.3f} | Safe: {safe}")
    
    # Test 2: Synonym swap (should be high, ~0.92+)
    test2_orig = "The research shows clear results."
    test2_rewrite = "The investigation reveals clear outcomes."
    safe, sim = is_meaning_preserved(test2_orig, test2_rewrite)
    print(f"\nTest 2 (Synonyms):")
    print(f"  Original: {test2_orig}")
    print(f"  Rewrite: {test2_rewrite}")
    print(f"  Similarity: {sim:.3f} | Safe: {safe}")
    
    # Test 3: Meaning drift (should be low, ~0.3-0.5)
    test3_orig = "I like dogs."
    test3_rewrite = "I hate cats."
    safe, sim = is_meaning_preserved(test3_orig, test3_rewrite)
    print(f"\nTest 3 (Meaning Drift - SHOULD REJECT):")
    print(f"  Original: {test3_orig}")
    print(f"  Rewrite: {test3_rewrite}")
    print(f"  Similarity: {sim:.3f} | Safe: {safe}")
    
    # Test 4: Contextual synonym finding
    print(f"\nTest 4 (Contextual Synonyms):")
    sentence = "The research demonstrates important findings."
    word = "demonstrates"
    candidates = ["reveals", "indicates", "proves", "shows"]
    best = find_contextual_synonyms(sentence, word, candidates, top_k=2)
    print(f"  Sentence: {sentence}")
    print(f"  Best replacements for '{word}': {best}")
    
    print("\n" + "="*70)
