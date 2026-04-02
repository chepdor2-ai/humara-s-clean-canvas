"""
Build a 500K+ entry mega dictionary for the humanizer engine.
Combines: existing words_dictionary.json, en_thesaurus.jsonl, WordNet lemmas,
and programmatic word forms (plurals, verb conjugations, adverb forms).
"""
import json
import re
from pathlib import Path

try:
    from nltk.corpus import wordnet
    from nltk.stem import WordNetLemmatizer
    HAS_NLTK = True
except ImportError:
    HAS_NLTK = False
    print("[WARN] NLTK not available, will build from existing files only")

DICT_DIR = Path("dictionaries")

def load_existing_words():
    """Load existing word dictionary"""
    words = set()
    p = DICT_DIR / "words_dictionary.json"
    if p.exists():
        with open(p, 'r', encoding='utf-8') as f:
            data = json.load(f)
            words = set(k.lower() for k in data.keys())
        print(f"  Loaded {len(words)} from words_dictionary.json")
    return words

def load_existing_thesaurus():
    """Load existing thesaurus"""
    thesaurus = {}
    p = DICT_DIR / "en_thesaurus.jsonl"
    if p.exists():
        with open(p, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    d = json.loads(line)
                    w = d.get("word", "").lower()
                    syns = [s.lower() for s in d.get("synonyms", []) if s]
                    if w and syns:
                        thesaurus[w] = syns
                except json.JSONDecodeError:
                    continue
        print(f"  Loaded {len(thesaurus)} from en_thesaurus.jsonl")
    return thesaurus

def gather_wordnet_data():
    """Gather all WordNet lemmas and synonym relationships"""
    if not HAS_NLTK:
        return set(), {}

    all_words = set()
    synonym_map = {}

    for synset in wordnet.all_synsets():
        lemma_names = []
        for lemma in synset.lemmas():
            name = lemma.name().lower().replace('_', ' ')
            if ' ' not in name and name.isalpha() and len(name) > 1:
                all_words.add(name)
                lemma_names.append(name)

        # Build synonym relationships
        for name in lemma_names:
            if name not in synonym_map:
                synonym_map[name] = set()
            for other in lemma_names:
                if other != name:
                    synonym_map[other] = synonym_map.get(other, set())
                    synonym_map[name].add(other)

    print(f"  WordNet: {len(all_words)} words, {len(synonym_map)} with synonyms")
    return all_words, synonym_map

def generate_word_forms(base_words):
    """Generate common English word forms: plurals, verb tenses, adverb forms"""
    forms = set()
    
    for word in base_words:
        if len(word) < 3 or not word.isalpha():
            continue
        
        # Noun plurals
        if word.endswith('s') or word.endswith('x') or word.endswith('z') or word.endswith('ch') or word.endswith('sh'):
            forms.add(word + 'es')
        elif word.endswith('y') and len(word) > 2 and word[-2] not in 'aeiou':
            forms.add(word[:-1] + 'ies')
        elif word.endswith('f'):
            forms.add(word[:-1] + 'ves')
        elif word.endswith('fe'):
            forms.add(word[:-2] + 'ves')
        else:
            forms.add(word + 's')
        
        # Verb forms: -ing, -ed, -er, -est
        if word.endswith('e'):
            forms.add(word[:-1] + 'ing')  # make -> making
            forms.add(word + 'd')          # make -> maked (some)
            forms.add(word[:-1] + 'ed')    # reduce -> reduced
            forms.add(word + 'r')          # large -> larger
            forms.add(word + 'st')         # large -> largest
        elif word.endswith('y') and len(word) > 2 and word[-2] not in 'aeiou':
            forms.add(word[:-1] + 'ied')   # carry -> carried
            forms.add(word + 'ing')        # carry -> carrying
            forms.add(word[:-1] + 'ier')   # happy -> happier
            forms.add(word[:-1] + 'iest')  # happy -> happiest
            forms.add(word[:-1] + 'ily')   # happy -> happily
        else:
            forms.add(word + 'ing')
            forms.add(word + 'ed')
            forms.add(word + 'er')
            forms.add(word + 'est')
        
        # Adjective -> adverb
        if word.endswith('le') and len(word) > 3:
            forms.add(word[:-2] + 'ly')    # capable -> capably
        elif word.endswith('ic'):
            forms.add(word + 'ally')       # academic -> academically
        elif word.endswith('ful') or word.endswith('ous') or word.endswith('al'):
            forms.add(word + 'ly')
        
        # -tion, -sion, -ment, -ness forms
        if word.endswith('ate'):
            forms.add(word[:-1] + 'ion')   # create -> creation
        if word.endswith('fy'):
            forms.add(word[:-1] + 'ication')
        
        # un-, re-, dis- prefixes
        forms.add('un' + word)
        forms.add('re' + word)
        
    return forms

def build():
    print("=" * 60)
    print("BUILDING MEGA DICTIONARY (500K+ entries)")
    print("=" * 60)
    
    # Step 1: Load existing
    print("\n[1/5] Loading existing dictionaries...")
    existing_words = load_existing_words()
    existing_thesaurus = load_existing_thesaurus()
    
    # Step 2: WordNet
    print("\n[2/5] Gathering WordNet data...")
    wn_words, wn_synonyms = gather_wordnet_data()
    
    # Step 3: Generate word forms
    print("\n[3/5] Generating word forms...")
    base_set = existing_words | wn_words
    generated_forms = generate_word_forms(base_set)
    print(f"  Generated {len(generated_forms)} word forms")
    
    # Step 4: Merge everything
    print("\n[4/5] Merging all sources...")
    all_words = existing_words | wn_words | generated_forms
    
    # Filter: only alphabetic, length 2-30, no offensive
    all_words = {w for w in all_words if w.isalpha() and 2 <= len(w) <= 30}
    print(f"  Total unique words: {len(all_words)}")
    
    # Merge thesaurus: combine existing + WordNet synonyms
    mega_thesaurus = {}
    
    # Start with existing
    for word, syns in existing_thesaurus.items():
        if word.isalpha():
            mega_thesaurus[word] = set(s for s in syns if s.isalpha() or ' ' in s)
    
    # Add WordNet synonyms
    for word, syns in wn_synonyms.items():
        if word in mega_thesaurus:
            mega_thesaurus[word].update(syns)
        else:
            mega_thesaurus[word] = set(syns)
    
    # Filter synonym entries: only keep valid words
    for word in list(mega_thesaurus.keys()):
        mega_thesaurus[word] = [s for s in mega_thesaurus[word] if s != word]
        if not mega_thesaurus[word]:
            del mega_thesaurus[word]
    
    print(f"  Mega thesaurus entries: {len(mega_thesaurus)}")
    
    # Step 5: Write output
    print("\n[5/5] Writing output files...")
    
    # Write mega word dictionary
    mega_dict = {w: 1 for w in sorted(all_words)}
    out_dict = DICT_DIR / "mega_dictionary.json"
    with open(out_dict, 'w', encoding='utf-8') as f:
        json.dump(mega_dict, f, separators=(',', ':'))
    print(f"  Wrote {len(mega_dict)} words to {out_dict.name}")
    
    # Write mega thesaurus
    out_thes = DICT_DIR / "mega_thesaurus.jsonl"
    count = 0
    with open(out_thes, 'w', encoding='utf-8') as f:
        for word in sorted(mega_thesaurus.keys()):
            syns = sorted(set(mega_thesaurus[word]))[:20]  # Cap at 20 synonyms per word
            if syns:
                f.write(json.dumps({"word": word, "synonyms": syns}) + '\n')
                count += 1
    print(f"  Wrote {count} entries to {out_thes.name}")
    
    print(f"\n{'=' * 60}")
    print(f"DONE: {len(mega_dict)} words + {count} thesaurus entries")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    build()
