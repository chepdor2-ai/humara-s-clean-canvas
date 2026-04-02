#!/usr/bin/env python3
"""
Core functionality test - tests humanizer, rules, utils, and dictionary
"""

import sys
print(f"Python: {sys.version}")

# Test 1: Rules module
print("\n" + "="*70)
print("TEST 1: RULES MODULE")
print("="*70)

try:
    import rules
    print("✓ Rules module imported successfully")
    print(f"  - CONTRACTIONS: {len(rules.CONTRACTIONS)} items")
    print(f"  - TRANSITIONS: {len(rules.TRANSITIONS)} items")
    print(f"  - AI_TRANSITIONS_TO_AVOID: {len(rules.AI_TRANSITIONS_TO_AVOID)} items")
    print(f"  - PHRASE_SUBSTITUTIONS: {len(rules.PHRASE_SUBSTITUTIONS)} groups")
    print(f"  - BURSTINESS_TARGET: {rules.BURSTINESS_TARGET}")
except Exception as e:
    print(f"✗ Rules failed: {e}")
    import traceback
    traceback.print_exc()

# Test 2: Utils module
print("\n" + "="*70)
print("TEST 2: UTILS MODULE")
print("="*70)

try:
    from utils import shorten_sentence, add_natural_variation, insert_transition, make_burstier
    print("✓ Utils imported successfully")

    test_sent = "It is important to note that the results are very extremely significant."
    shortened = shorten_sentence(test_sent)
    print(f"  shorten_sentence: '{test_sent[:50]}...' → '{shortened[:50]}...'")

    varied = add_natural_variation("It is important to note that something happened.")
    print(f"  add_natural_variation: '{varied[:60]}...'")
except Exception as e:
    print(f"✗ Utils failed: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Humanizer module
print("\n" + "="*70)
print("TEST 3: HUMANIZER MODULE")
print("="*70)

try:
    from humanizer import humanize
    print("✓ Humanizer imported successfully")

    test_text = "The research shows that artificial intelligence is important. Furthermore, it is very important. Additionally, we cannot ignore this."
    print(f"\n  Input:  {test_text}")

    for strength in ["light", "medium", "strong"]:
        result = humanize(test_text, strength=strength)
        print(f"  [{strength:6s}]: {result}")
except Exception as e:
    print(f"✗ Humanizer failed: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Dictionary module
print("\n" + "="*70)
print("TEST 4: DICTIONARY MODULE")
print("="*70)

try:
    from dictionary import get_dictionary
    dictionary = get_dictionary()
    print("✓ Dictionary loaded successfully")
    print(f"  - Safe words: {dictionary.stats['safe_words_loaded']}")
    print(f"  - Thesaurus entries: {dictionary.stats['thesaurus_entries']}")

    test_words = ["research", "important", "analyze"]
    for word in test_words:
        syns = dictionary.get_synonyms(word, max_return=3)
        print(f"  {word:15} → {', '.join(syns) if syns else '(none)'}")
except Exception as e:
    print(f"✗ Dictionary failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*70)
print("CORE TEST COMPLETE")
print("="*70)
