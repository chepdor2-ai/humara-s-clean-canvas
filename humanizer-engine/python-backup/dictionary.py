"""
Humanizer Dictionary Layer
Provides massive, smart synonym lookup using:
- NLTK WordNet (built-in, high quality)
- Offline thesaurus files (zaibacu JSONL format)
- English word list for validity checking
- Caching for speed
"""

import json
import random
from pathlib import Path
from typing import List, Dict, Set, Tuple, Optional

# NLTK is optional in this repo (some environments may be missing `regex`)
try:
    from nltk.corpus import wordnet
    from nltk import pos_tag, word_tokenize, PorterStemmer
    _HAS_NLTK = True
except Exception as e:
    print(f"[WARN] NLTK not available (dictionary will be limited): {e}")
    wordnet = None
    pos_tag = None
    word_tokenize = None
    PorterStemmer = None
    _HAS_NLTK = False

class HumanizerDictionary:
    """Smart semantic dictionary for context-aware synonym lookup"""
    
    def __init__(self, dictionary_path: str = "dictionaries"):
        self.dict_path = Path(dictionary_path)
        self.synonyms_cache: Dict[str, List[str]] = {}
        self.word_validity_cache: Dict[str, bool] = {}
        self.safe_words: Set[str] = self._load_safe_words()
        self.curated: Dict[str, List[str]] = self._load_curated()
        self.thesaurus: Dict[str, List[str]] = self._load_thesaurus()
        self.stemmer = PorterStemmer() if PorterStemmer is not None else None
        
        # Statistics
        self.stats = {
            'safe_words_loaded': len(self.safe_words),
            'curated_entries': len(self.curated),
            'thesaurus_entries': len(self.thesaurus),
            'cache_hits': 0,
            'cache_size': 0,
            # Back-compat: some callers expect this key
            'synonyms_cached': 0
        }
        
        print(f"[OK] Dictionary initialized")
        print(f"  - Safe words loaded: {self.stats['safe_words_loaded']}")
        print(f"  - Curated entries: {self.stats['curated_entries']}")
        print(f"  - Thesaurus entries: {self.stats['thesaurus_entries']}")

    def _load_safe_words(self) -> Set[str]:
        """Load massive word list from offline dictionary (prioritise mega)"""
        safe_words = set()
        
        # Try mega dictionary first (619K+ words)
        mega_path = self.dict_path / "mega_dictionary.json"
        if mega_path.exists():
            try:
                with open(mega_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    safe_words = set(k.lower() for k in data.keys())
                    print(f"  [OK] Loaded {len(safe_words)} words from {mega_path.name}")
                    return safe_words
            except Exception as e:
                print(f"  [WARN] Error loading {mega_path.name}: {e}")
        
        # Fallback: Try JSON format
        json_path = self.dict_path / "words_dictionary.json"
        if json_path.exists():
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    safe_words = set(k.lower() for k in data.keys())
                    print(f"  [OK] Loaded {len(safe_words)} words from {json_path.name}")
                    return safe_words
            except Exception as e:
                print(f"  [WARN] Error loading {json_path.name}: {e}")
        
        # Try text format (slower but still works)
        txt_path = self.dict_path / "words_alpha.txt"
        if txt_path.exists():
            try:
                with open(txt_path, 'r', encoding='utf-8') as f:
                    safe_words = set(word.strip().lower() for word in f if word.strip())
                    print(f"  [OK] Loaded {len(safe_words)} words from {txt_path.name}")
                    return safe_words
            except Exception as e:
                print(f"  [WARN] Error loading {txt_path.name}: {e}")
        
        # Fallback: use WordNet
        print(f"  [INFO] Using WordNet as fallback word source")
        return safe_words

    def _load_curated(self) -> Dict[str, List[str]]:
        """Load curated synonym dictionary (quality-filtered, meaning-safe)"""
        curated_path = self.dict_path / "curated_synonyms.json"
        if curated_path.exists():
            try:
                with open(curated_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    curated = {k.lower(): v for k, v in data.items()}
                    print(f"  [OK] Loaded {len(curated)} curated synonym entries")
                    return curated
            except Exception as e:
                print(f"  [WARN] Error loading curated_synonyms.json: {e}")
        else:
            print(f"  [INFO] No curated_synonyms.json found, using raw thesaurus only")
        return {}

    def _load_thesaurus(self) -> Dict[str, List[str]]:
        """Load thesaurus files (mega + original, merged)"""
        thesaurus = {}
        
        loaded = 0
        for fname in ["mega_thesaurus.jsonl", "en_thesaurus.jsonl"]:
            jsonl_path = self.dict_path / fname
            if not jsonl_path.exists():
                continue
            try:
                with open(jsonl_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                            word = data.get("word")
                            synonyms = data.get("synonyms", [])
                            if word and synonyms:
                                key = word.lower()
                                syns = [s.lower() for s in synonyms]
                                if key in thesaurus:
                                    # Merge, deduplicate
                                    existing = set(thesaurus[key])
                                    existing.update(syns)
                                    thesaurus[key] = list(existing)
                                else:
                                    thesaurus[key] = syns
                                loaded += 1
                        except json.JSONDecodeError:
                            continue
                print(f"  [OK] Loaded entries from {fname}")
            except Exception as e:
                print(f"  [WARN] Error loading {fname}: {e}")
        
        print(f"  [OK] Total thesaurus entries: {len(thesaurus)}")
        return thesaurus

    def get_synonyms(self, word: str, pos: Optional[str] = None, 
                     max_return: int = 8, quality_filter: bool = True) -> List[str]:
        """
        Get synonyms for a word using multiple sources.
        
        Args:
            word: target word
            pos: POS tag for WordNet (None = auto-detect or try all)
            max_return: max number of synonyms to return
            quality_filter: only return words in safe_words dictionary
        
        Returns:
            List of synonyms, ordered by confidence
        """
        word_lower = word.lower()
        
        # Check cache first
        cache_key = f"{word_lower}_{pos}_{quality_filter}"
        if cache_key in self.synonyms_cache:
            self.stats['cache_hits'] += 1
            return self.synonyms_cache[cache_key]
        
        synonyms = set()
        
        # Source 1: Curated dictionary (highest priority — quality-filtered)
        if word_lower in self.curated:
            synonyms.update(self.curated[word_lower])
        
        # Source 2: Offline thesaurus (ONLY if no curated dict loaded)
        if not synonyms and not self.curated and word_lower in self.thesaurus:
            synonyms.update(self.thesaurus[word_lower])
        
        # Source 3: NLTK WordNet (only if no curated dict AND thesaurus missed)
        if not synonyms and not self.curated and wordnet is not None:
            try:
                # Map POS tags if provided
                wordnet_pos = self._map_pos_to_wordnet(pos) if pos else None
                
                for synset in wordnet.synsets(word_lower, pos=wordnet_pos):
                    for lemma in synset.lemmas():
                        lem_name = lemma.name().lower().replace("_", " ")
                        synonyms.add(lem_name)
            except Exception:
                pass  # WordNet lookup failed, continue
        
        # Filter: Only keep valid words if quality filter enabled
        if quality_filter and self.safe_words:
            filtered = [s for s in synonyms 
                       if s != word_lower and self._is_valid_word(s)]
            synonyms = set(filtered)
        else:
            synonyms.discard(word_lower)  # Never return the word itself
        
        # Convert to list and limit
        result = list(synonyms)[:max_return]
        
        # Cache result
        self.synonyms_cache[cache_key] = result
        self.stats['cache_size'] = len(self.synonyms_cache)
        self.stats['synonyms_cached'] = len(self.synonyms_cache)
        
        return result

    def get_contextual_synonyms(self, word: str, sentence: str,
                                max_return: int = 5) -> List[str]:
        """
        Get synonyms for a word in a specific context.
        May filter/prioritize based on sentence context.
        """
        # For now, simple approach: get all synonyms, could enhance with embeddings
        synonyms = self.get_synonyms(word, max_return=max_return * 2)
        
        # TODO: Filter by embedding similarity to the sentence
        # For now, return all sorted alphabetically (consistent results)
        return sorted(synonyms)[:max_return]

    def is_valid_word(self, word: str) -> bool:
        """Check if word is in the dictionary"""
        return self._is_valid_word(word)

    def _is_valid_word(self, word: str) -> bool:
        """Check if word is in dictionary (with caching)"""
        word_lower = word.lower()
        
        if word_lower in self.word_validity_cache:
            return self.word_validity_cache[word_lower]
        
        # Check against safe words
        is_valid = word_lower in self.safe_words or len(self.safe_words) == 0
        
        # If no safe words loaded, check WordNet (if available)
        if not is_valid and not self.safe_words and wordnet is not None:
            is_valid = bool(wordnet.synsets(word_lower))

        # Final fallback: accept basic alphabetic tokens
        if not is_valid and wordnet is None and not self.safe_words:
            is_valid = any(ch.isalpha() for ch in word_lower)
        
        self.word_validity_cache[word_lower] = is_valid
        return is_valid

    def _map_pos_to_wordnet(self, pos_tag: str) -> Optional[str]:
        """Map NLTK POS tag to WordNet POS tag"""
        if wordnet is None:
            return None
        pos_map = {
            'NN': wordnet.NOUN,
            'NNS': wordnet.NOUN,
            'NNP': wordnet.NOUN,
            'NNPS': wordnet.NOUN,
            'VB': wordnet.VERB,
            'VBD': wordnet.VERB,
            'VBG': wordnet.VERB,
            'VBN': wordnet.VERB,
            'VBP': wordnet.VERB,
            'VBZ': wordnet.VERB,
            'JJ': wordnet.ADJ,
            'JJR': wordnet.ADJ,
            'JJS': wordnet.ADJ,
            'RB': wordnet.ADV,
            'RBR': wordnet.ADV,
            'RBS': wordnet.ADV,
        }
        return pos_map.get(pos_tag)

    def replace_word_smartly(self, word: str, sentence: str = "", 
                            avoid_words: Set[str] = None) -> str:
        """
        Replace a word with a synonym intelligently.
        
        Args:
            word: word to replace
            sentence: full sentence (for context)
            avoid_words: words to never use as replacements
        
        Returns:
            Best synonym for this context, or original word if no good options
        """
        if avoid_words is None:
            avoid_words = set()
        
        synonyms = self.get_contextual_synonyms(word, sentence, max_return=5)
        
        # Filter out words to avoid and invalid words
        candidates = [s for s in synonyms 
                     if s != word and s not in avoid_words 
                     and self._is_valid_word(s)]
        
        if not candidates:
            return word
        
        # Prefer shorter synonyms for conciseness (configurable)
        # Sort by length, then pick randomly from top candidates
        candidates_sorted = sorted(candidates, key=len)[:3]
        return random.choice(candidates_sorted)

    def get_stats(self) -> Dict:
        """Get dictionary statistics"""
        return {**self.stats, 'synonyms_cached': len(self.synonyms_cache)}

    def print_stats(self):
        """Print formatted statistics"""
        stats = self.get_stats()
        print("\n" + "="*50)
        print("DICTIONARY STATISTICS")
        print("="*50)
        print(f"Safe words loaded: {stats['safe_words_loaded']:,}")
        print(f"Curated entries: {stats.get('curated_entries', 0):,}")
        print(f"Thesaurus entries: {stats['thesaurus_entries']:,}")
        print(f"Synonyms cached: {stats['synonyms_cached']:,}")
        print(f"Cache hits: {stats['cache_hits']:,}")
        print("="*50)


# Global instance (load once at module import)
_dictionary_instance = None

def get_dictionary() -> HumanizerDictionary:
    """Get or create the global dictionary instance"""
    global _dictionary_instance
    if _dictionary_instance is None:
        _dictionary_instance = HumanizerDictionary()
    return _dictionary_instance


if __name__ == "__main__":
    # Test the dictionary
    print("\n" + "="*70)
    print("HUMANIZER DICTIONARY - TEST SUITE")
    print("="*70 + "\n")
    
    dictionary = HumanizerDictionary()
    
    # Test 1: Get synonyms
    test_words = ["research", "shows", "important", "challenge", "analyze"]
    print("Test 1: Synonym Lookups")
    for word in test_words:
        syns = dictionary.get_synonyms(word, max_return=5)
        print(f"  {word:15} → {', '.join(syns[:3])}")
    
    # Test 2: Check word validity
    print("\nTest 2: Word Validity")
    test_validity = ["research", "xyzabc", "important"]
    for word in test_validity:
        valid = dictionary.is_valid_word(word)
        print(f"  {word:15} → {'✓ Valid' if valid else '✗ Invalid'}")
    
    # Test 3: Smart replacement
    print("\nTest 3: Context-Aware Replacement")
    test_cases = [
        ("The research shows positive results.", "research"),
        ("This is an important discovery.", "important"),
        ("We analyze the data carefully.", "analyze"),
    ]
    for sentence, word in test_cases:
        replacement = dictionary.replace_word_smartly(word, sentence)
        print(f"  '{word}' in sentence")
        print(f"    → Replace with: '{replacement}'")
    
    # Print stats
    dictionary.print_stats()
    print()
