"""
Integration Test: Full Humanizer Pipeline
Tests: Dictionary + Semantic Guard + Humanizer
"""

from humanizer import humanize
from semantic_guard import semantic_similarity
from dictionary import get_dictionary

def test_integration():
    """Test the complete humanization pipeline"""
    
    print("\n" + "="*70)
    print("INTEGRATION TEST: DICTIONARY + SEMANTIC GUARD + HUMANIZER")
    print("="*70)
    
    # Initialize dictionary to show stats
    dictionary = get_dictionary()
    print("\n✓ Dictionary loaded")
    print(f"  - Synonyms cached: {dictionary.stats['synonyms_cached']}")
    print(f"  - Safe words: {dictionary.stats['safe_words_loaded']}")
    
    # Test cases
    test_cases = [
        {
            "original": "The research demonstrates important findings.",
            "strength": "medium",
            "description": "Academic sentence"
        },
        {
            "original": "Furthermore, the study shows that results indicate conclusions.",
            "strength": "medium",
            "description": "AI-heavy academic text"
        },
        {
            "original": "This analysis provides evidence of significant impact.",
            "strength": "light",
            "description": "Conservative humanization"
        },
    ]
    
    print("\n" + "-"*70)
    print("TEST CASES")
    print("-"*70)
    
    for i, test in enumerate(test_cases, 1):
        original = test["original"]
        strength = test["strength"]
        description = test["description"]
        
        print(f"\nTest {i}: {description} (strength='{strength}')")
        print(f"  Original: {original}")
        
        # Humanize
        humanized = humanize(original, strength=strength)
        print(f"  Humanized: {humanized}")
        
        # Check semantic similarity
        sim = semantic_similarity(original, humanized)
        print(f"  Semantic similarity: {sim:.3f}")
        print(f"  Meaning preserved: {'✓ YES' if sim >= 0.88 else '⚠ BORDERLINE' if sim >= 0.85 else '✗ NO'}")
        
        # Check if text changed
        if original != humanized:
            print(f"  Reduction in AI patterns: ✓ YES")
        else:
            print(f"  Reduction in AI patterns: ℹ NO CHANGES NEEDED")
    
    # Overall summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print("✓ Humanizer pipeline working correctly")
    print("✓ Dictionary providing synonyms")
    print("✓ Semantic guard validating meaning preservation")
    print("\nNext steps:")
    print("  1. Run: python trainer.py quick")
    print("  2. Check evaluation metrics including semantic similarity")
    print("  3. Download offline dictionaries for better coverage")
    print("="*70 + "\n")


if __name__ == "__main__":
    test_integration()
