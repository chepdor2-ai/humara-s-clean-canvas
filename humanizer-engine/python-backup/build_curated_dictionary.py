"""
Build a curated synonym dictionary (100K+ entries) for the humanizer engine.

Strategy:
1. WordNet synsets — only keep synonyms from the SAME synset (same meaning)
2. Require lemma-count > 0 in that synset (attested usage in that sense)
3. Filter out archaic, technical, offensive, polysemous words via large blacklist
4. Cross-reference with Brown corpus + mega_dictionary for frequency/validity
5. Thesaurus entries only if they share at least one WordNet synset (verified semantic link)
6. Banned-pair list for known bad substitutions
"""

import json
import re
from pathlib import Path
from collections import defaultdict

from nltk.corpus import wordnet
from nltk.corpus import brown

print("Building curated synonym dictionary...")
print("Loading frequency data from Brown corpus...")

# Build frequency table from Brown corpus
word_freq = defaultdict(int)
for word in brown.words():
    word_freq[word.lower()] += 1

print(f"  Brown corpus unique words: {len(word_freq)}")

# Load safe_words from mega_dictionary for validity checking
safe_words = set()
mega_path = Path("dictionaries/mega_dictionary.json")
if mega_path.exists():
    with open(mega_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        safe_words = set(k.lower() for k in data.keys())
    print(f"  Safe words loaded: {len(safe_words)}")

# --- Blacklisted words: archaic, offensive, technical jargon, misleading ---
BLACKLIST = {
    # Archaic/literary
    "thee", "thou", "thy", "thine", "hath", "doth", "whence", "whilst",
    "thence", "wherefore", "hitherto", "thereof", "forthwith", "henceforward",
    "anent", "betwixt", "forsooth", "nay", "aye", "tis", "twas",
    "ain", "ere", "o'er", "ne'er", "wist", "prithee", "hither",
    "yonder", "herein", "therein", "therefrom", "heretofore", "inasmuch",
    # Offensive/inappropriate
    "homophile", "homosexual", "retard", "retarded", "idiot", "moron",
    "castrate", "prostitute", "whore", "slut", "imbecile", "cretin",
    "dimwit", "dolt", "dunce", "nincompoop", "simpleton",
    # Over-technical / wrong register / archaic synonyms
    "transubstantiate", "transmute", "metamorphose", "pecuniary",
    "remunerative", "mercantile", "pursuance", "thriftiness",
    "bodoni", "gloriole", "aerofoil", "bionomical", "permeant",
    "enounce", "panoptic", "carrefour", "audacious",
    "excogitation", "instauration", "psychoanalysis", "foretell",
    "potency", "potentiality", "transubstantiation", "transmutation",
    "ameliorate", "elucidate", "obfuscate", "perambulate",
    "conflagration", "defenestration", "contretemps", "rapprochement",
    "concatenation", "confabulation", "cogitation", "rumination",
    "machination", "prognostication", "prognosticate", "regurgitation",
    "expostulate", "remonstrate", "confabulate", "peregrinate",
    "tergiversate", "vituperate", "objurgate", "excoriate",
    "execrate", "imprecate", "fulminate", "inveigh",
    "plenipotentiary", "interlocutor", "amanuensis",
    "perspicacious", "magniloquent", "sesquipedalian",
    "recondite", "abstruse", "arcane", "inscrutable",
    # Garbling-prone words
    "bod", "bole", "headroom", "phoner", "drape", "bludgeon",
    "sporting", "gymnastic", "forebode", "demesne", "luff",
    "diagonal", "procession", "commercing", "labourers",
    "rick", "planer", "dodo", "croak", "grizzle", "braw",
    "fogey", "gild", "cosmos", "upwind", "edifice",
    "hatful", "ardor", "appall", "facelift", "tract",
    "canvas", "genesis", "bodied", "lave", "slake",
    "imbibe", "quaff", "sup", "swig", "tipple",
    "verdure", "sward", "turf", "sod", "lea", "mead",
    "dell", "dingle", "glen", "glade", "copse", "thicket",
    "nave", "narthex", "chancel", "apse", "transept",
    # Body parts used as synonyms for abstract things
    "physical body", "material body", "human body", "flesh",
    "body-build", "torso",
    # Medical terms that leak via polysemy
    "menstruation", "menses", "menstruum", "catamenia",
    # Technical physics/chemistry
    "potential drop", "electric potential", "potential difference",
    "voltage", "ampere", "ohm", "coulomb",
    # Too informal/slang
    "stuff", "thing", "things", "dude", "bro", "gonna", "wanna",
    "kinda", "sorta", "ain't", "yep", "nope", "dunno",
    "gotta", "lemme", "outta", "whatcha", "betcha",
    # Words that change meaning depending on context (high polysemy)
    "issue", "issues", "call", "calls", "address", "addresses",
    "minute", "novel", "patient", "present", "subject",
    "figure", "field", "race", "match", "spring", "fall",
    "bank", "bar", "bat", "bear", "bill", "block", "board",
    "bolt", "bow", "box", "break", "bridge", "bug", "cap",
    "case", "cast", "cell", "charge", "check", "chip", "clip",
    "club", "coach", "column", "compact", "company", "compound",
    "content", "contract", "cool", "course", "crane", "crash",
    "cross", "current", "dart", "date", "deck", "degree",
    "die", "draft", "draw", "drill", "drive", "drop", "drum",
    "duck", "dump", "dust", "ear", "express", "face", "fan",
    "file", "fine", "fire", "firm", "flag", "flat", "fly",
    "fold", "foot", "fork", "form", "found", "frame",
    "game", "gear", "glass", "grade", "grant", "grave",
    "ground", "guard", "gum", "gut", "hand", "handle",
    "hatch", "head", "hide", "hit", "hold", "horn", "host",
    "iron", "jam", "jet", "kid", "kind", "lap", "lead",
    "lean", "left", "lie", "lift", "light", "like", "line",
    "litter", "live", "lock", "log", "lot", "mark", "mass",
    "mean", "might", "mine", "miss", "mold", "monitor",
    "mount", "mug", "nail", "net", "note", "nut", "organ",
    "pack", "pad", "palm", "pan", "park", "pass", "patch",
    "pen", "pick", "pile", "pilot", "pipe", "pit", "pitch",
    "plant", "plate", "play", "plot", "plug", "point",
    "pool", "pop", "port", "post", "pot", "pound", "press",
    "project", "pump", "punch", "quarter", "range", "rank",
    "rate", "raw", "rear", "record", "rest", "rich", "ring",
    "rock", "roll", "root", "round", "row", "ruler", "run",
    "rush", "safe", "sail", "saw", "scale", "seal", "season",
    "seat", "set", "shade", "shed", "shell", "shift", "ship",
    "shock", "shoot", "sink", "skip", "slip", "slot", "snap",
    "sole", "sound", "spare", "spoke", "spot", "staff",
    "stage", "stake", "stall", "stamp", "stand", "star",
    "state", "stay", "stem", "step", "stick", "stock",
    "store", "story", "strain", "strike", "strip", "stroke",
    "suit", "swallow", "tank", "tap", "tear", "tender",
    "tie", "tip", "tire", "toast", "toll", "top", "train",
    "trip", "trunk", "tube", "turn", "type", "vessel",
    "volume", "watch", "wave", "well", "wing", "yard",
    # Words that sound wrong in formal academic context
    "valuate", "gainsay", "betoken", "bespeak", "conduce",
    "canvass", "uprise", "bestow", "impart", "wield",
    "alleviate", "designate", "modernize", "modernise",
    "shew", "germinate", "explicate", "enquiry",
    "institution",  # wrong synonym for innovation
    "demo",  # too informal for academic
    "essay",  # wrong meaning as verb synonym for examine
    "postulate",  # too formal/philosophical
    "recrudesce",  # medical/rare
    "instal",  # unusual spelling
    "attest", "certify",  # overly formal/legal
    "exsert",  # archaic/technical for extend
    "soupcon", "corpuscle", "mote", "speck",  # too rare / garbling
    "homo", "mankind", "humankind",  # wrong register for 'human'
    "agnise", "agnize",  # archaic forms of recognize
    "pedagogy", "didactics", "breeding",  # wrong for education
    "queer", "peril",  # wrong sense for expose
    "divulge",  # wrong for detect/identify
    "aboard",  # wrong synonym for alongside in academic context
    "childlike", "childly", "schoolgirlish",  # wrong for simple/basic
    "grab", "snag", "nab", "pinch", "swipe", "yank",
    "chuck", "fling", "hurl", "heave", "lob", "toss",
    "plop", "plunk", "thud", "thump", "whack", "bonk",
    "chomp", "gobble", "scarf", "wolf", "devour",
    "snooze", "doze", "nap", "slumber", "drowse",
    "blab", "babble", "prattle", "jabber", "yammer",
    "gawk", "gape", "goggle", "ogle", "leer",
    # Common words that shouldn't be replaced (too basic)
    "get", "got", "put", "let", "say", "said", "make", "made",
    "take", "took", "come", "came", "give", "gave", "see", "saw",
    "know", "knew", "think", "thought", "look", "find",
    "want", "tell", "ask", "seem", "feel", "try", "use",
    "means",  # "which means" broken by noun-sense synonym "way"
    "further",  # adverb "Taking that further" broken by verb-sense "boost"
    # Pregnancy/medical senses of size words
    "gravid", "expectant", "enceinte",
    # Pompous speech senses of "large"
    "orotund", "tumid", "turgid", "bombastic", "boastfully", "vauntingly",
    "braggart", "braggy", "boastful", "crowing", "bragging",
    # Size words with wrong register
    "brobdingnagian", "lilliputian", "piffling", "piddling",
    "niggling", "fiddling", "footling", "picayune",
    # Personality traits wrongly mapped to size
    "bighearted", "bounteous", "bountiful", "freehanded", "openhanded",
    # Wrong for "piece"
    "opus", "tack", "firearm",
    # Musical/archaic
    "trance", "enchantment",
    # Wrong cross-sense
    "swelled", "grownup",
}

# Specific bad pairs that should never appear together
BANNED_PAIRS = {
    ("significant", "pregnant"),
    ("pregnant", "significant"),
    ("analysis", "psychoanalysis"),
    ("psychoanalysis", "analysis"),
    ("transform", "translate"),
    ("translate", "transform"),
    ("potential", "voltage"),
    ("voltage", "potential"),
    ("economy", "thriftiness"),
    ("thriftiness", "economy"),
    ("bias", "diagonal"),
    ("diagonal", "bias"),
    ("promise", "forebode"),
    ("forebode", "promise"),
    ("innovation", "excogitation"),
    ("innovation", "instauration"),
    ("movement", "bowel"),
    ("bowel", "movement"),
    ("culture", "cultivation"),
    ("cultivation", "culture"),
    ("depression", "slump"),
    ("interest", "sake"),
    ("sake", "interest"),
    ("period", "menstruation"),
    ("flow", "period"), ("flow", "menstruation"), ("flow", "menses"), ("flow", "menstruum"),
    ("while", "period"), ("spell", "period"),
    ("faculty", "staff"),
    ("resolution", "declaration"),
    ("declaration", "resolution"),
    ("sentence", "conviction"),
    ("conviction", "sentence"),
    ("execution", "murder"),
    ("conclusion", "ending"),
    ("approach", "attack"),
    ("passage", "transit"),
    ("significant", "meaning"),
    ("meaning", "significant"),
    ("facilitate", "alleviate"),
    ("alleviate", "facilitate"),
    ("develop", "educate"),
    ("educate", "develop"),
    ("conclude", "reason"),
    ("reason", "conclude"),
    ("innovation", "founding"),
    ("innovation", "foundation"),
    ("contribute", "bestow"),
    ("contribute", "impart"),
    ("innovation", "institution"),
    ("institution", "innovation"),
    ("innovation", "origination"),
    ("origination", "innovation"),
    ("develop", "germinate"),
    ("germinate", "develop"),
    ("economy", "saving"),
    ("saving", "economy"),
    # Wrong-sense synonyms for academic words
    ("society", "guild"), ("guild", "society"),
    ("society", "lodge"), ("lodge", "society"),
    ("society", "companionship"), ("companionship", "society"),
    ("society", "fellowship"), ("fellowship", "society"),
    ("society", "order"), ("order", "society"),
    ("across", "crossways"), ("crossways", "across"),
    ("across", "crosswise"), ("crosswise", "across"),
    ("operational", "useable"), ("useable", "operational"),
    ("operational", "operable"), ("operable", "operational"),
    ("modern", "mod"), ("mod", "modern"),
    ("modern", "modernistic"), ("modernistic", "modern"),
    ("innovation", "design"), ("design", "innovation"),
    ("daily", "casual"), ("casual", "daily"),
    ("system", "organization"), ("organization", "system"),
    ("model", "manikin"), ("model", "mannequin"),
    ("model", "poser"), ("model", "sitter"),
    ("process", "summons"), ("summons", "process"),
    ("pattern", "blueprint"), ("blueprint", "pattern"),
    ("cost", "price"), ("price", "cost"),
    ("individual", "mortal"), ("mortal", "individual"),
    ("area", "orbit"), ("orbit", "area"),
    ("improve", "meliorate"), ("meliorate", "improve"),
    ("result", "resultant"), ("resultant", "result"),
    ("general", "superior"), ("superior", "general"),
    ("produce", "farm"), ("farm", "produce"),
    ("launch", "plunge"), ("plunge", "launch"),
    ("acquire", "larn"), ("larn", "acquire"),
    ("evidence", "grounds"), ("grounds", "evidence"),
    ("base", "alkali"), ("alkali", "base"),
    ("install", "instal"), ("instal", "install"),
}

MIN_WORD_LEN = 3
MAX_WORD_LEN = 15

def is_acceptable(word):
    """Check if a word is acceptable for the curated dictionary."""
    if not word or not word.isalpha():
        return False
    if len(word) < MIN_WORD_LEN or len(word) > MAX_WORD_LEN:
        return False
    if word in BLACKLIST:
        return False
    if " " in word or "_" in word:
        return False
    if safe_words and word not in safe_words:
        return False
    return True


def syllable_count(word):
    """Rough syllable count."""
    word = word.lower()
    if word.endswith("es"):
        word = word[:-2]
    elif word.endswith("ed"):
        word = word[:-2]
    vowels = "aeiouy"
    count = 0
    prev = False
    for ch in word:
        is_v = ch in vowels
        if is_v and not prev:
            count += 1
        prev = is_v
    return max(1, count)


def shares_wordnet_synset(word1, word2):
    """Check if two words share at least one WordNet synset (same meaning)."""
    synsets1 = set(s for s in wordnet.synsets(word1))
    synsets2 = set(s for s in wordnet.synsets(word2))
    return bool(synsets1 & synsets2)


# --- Build word->synsets mapping for fast lookup (TOP 2 senses only) ---
print("\nBuilding WordNet index (dominant senses)...")
_all_word_synsets = defaultdict(list)
for pos in [wordnet.VERB, wordnet.NOUN, wordnet.ADJ, wordnet.ADV]:
    for synset in wordnet.all_synsets(pos):
        total_count = sum(l.count() for l in synset.lemmas())
        for lemma in synset.lemmas():
            name = lemma.name().lower()
            if "_" not in name:
                _all_word_synsets[name].append((synset, total_count))

# Keep only top 2 synsets per word (by usage count)
word_synsets = {}
for word, synset_list in _all_word_synsets.items():
    synset_list.sort(key=lambda x: -x[1])
    word_synsets[word] = set(s for s, _ in synset_list[:2])

print(f"  WordNet index: {len(word_synsets)} words (top-2 senses each)")


# --- Build the dictionary using DOMINANT SENSE only ---
# For polysemous words, only use the top 2 synsets per POS (most common senses).
# This prevents "process → appendage" (anatomical sense #3) and similar garbage.
curated = {}
skipped_multi = 0
skipped_blacklist = 0
skipped_invalid = 0
skipped_unattested = 0
skipped_minor_sense = 0

print("\nProcessing WordNet synsets (dominant sense only)...")

# Group synsets by word+POS for sense ranking
from collections import Counter

# First pass: for each word, figure out which synsets are dominant
word_pos_synsets = defaultdict(list)  # word -> [(synset, total_count)]

for pos in [wordnet.VERB, wordnet.NOUN, wordnet.ADJ, wordnet.ADV]:
    for synset in wordnet.all_synsets(pos):
        total_count = sum(l.count() for l in synset.lemmas())
        for lemma in synset.lemmas():
            name = lemma.name().lower()
            if "_" not in name and " " not in name:
                word_pos_synsets[name].append((synset, total_count))

# Sort each word's synsets by total count (descending)
for word in word_pos_synsets:
    word_pos_synsets[word].sort(key=lambda x: -x[1])

# Second pass: only use top 2 synsets per word
for word, synset_list in word_pos_synsets.items():
    if not is_acceptable(word):
        if word in BLACKLIST:
            skipped_blacklist += 1
        else:
            skipped_invalid += 1
        continue

    # Only use the top 2 most common synsets for this word
    top_synsets = synset_list[:2]
    
    for synset, _ in top_synsets:
        lemmas = []
        for lemma in synset.lemmas():
            name = lemma.name().lower()
            count = lemma.count()
            
            if "_" in name or " " in name:
                skipped_multi += 1
                continue
            if not is_acceptable(name):
                continue
            # Require attestation or commonness
            is_attested = count > 0
            is_common = word_freq.get(name, 0) >= 3
            is_large_synset = len(synset.lemmas()) >= 4
            if not (is_attested or is_common or is_large_synset):
                skipped_unattested += 1
                continue
            lemmas.append((name, count))
        
        if len(lemmas) < 2:
            continue
        
        for w, _ in lemmas:
            synonyms = [s for s, _ in lemmas if s != w and (w, s) not in BANNED_PAIRS]
            if not synonyms:
                continue
            if w in curated:
                existing = set(curated[w])
                existing.update(synonyms)
                curated[w] = list(existing)
            else:
                curated[w] = synonyms

print(f"\nRaw curated entries: {len(curated)}")
print(f"Skipped (multi-word): {skipped_multi}")
print(f"Skipped (blacklisted): {skipped_blacklist}")
print(f"Skipped (invalid): {skipped_invalid}")
print(f"Skipped (unattested sense): {skipped_unattested}")

# --- Second pass: quality filtering with syllable + frequency checks ---
final = {}
total_pairs = 0

for word, synonyms in curated.items():
    word_syl = syllable_count(word)
    word_freq_val = word_freq.get(word, 0)
    
    good_synonyms = []
    for syn in synonyms:
        if syn == word:
            continue
        if (word, syn) in BANNED_PAIRS:
            continue
        syn_syl = syllable_count(syn)
        syn_freq_val = word_freq.get(syn, 0)
        
        # Syllable count shouldn't differ by more than 2
        if abs(word_syl - syn_syl) > 2:
            continue
        
        # BOTH source and synonym must appear in Brown corpus
        # This filters out rare/technical/domain-specific synonyms
        if word_freq.get(syn, 0) < 2:
            continue
        
        good_synonyms.append(syn)
    
    if good_synonyms:
        final[word] = good_synonyms
        total_pairs += len(good_synonyms)

print(f"\nAfter quality filtering: {len(final)} entries, {total_pairs} pairs")

# --- Add high-quality entries from existing thesaurus ---
# Require: (a) both words in mega_dictionary, (b) share a WordNet synset, (c) syllable match
print("\nAdding verified thesaurus entries...")
thesaurus_added = 0
thesaurus_new = 0

for fname in ["dictionaries/mega_thesaurus.jsonl", "dictionaries/en_thesaurus.jsonl"]:
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                data = json.loads(line)
                word = data.get("word", "").lower()
                synonyms = data.get("synonyms", [])
                
                if not is_acceptable(word):
                    continue
                
                word_syl = syllable_count(word)
                src_synsets = word_synsets.get(word, set())
                
                good_syns = []
                for syn in synonyms:
                    syn = syn.lower()
                    if not is_acceptable(syn) or syn == word:
                        continue
                    if (word, syn) in BANNED_PAIRS:
                        continue
                    if abs(word_syl - syllable_count(syn)) > 2:
                        continue
                    # Must be a common word (Brown corpus)
                    if word_freq.get(syn, 0) < 2:
                        continue
                    # Must share at least one top WordNet synset (same meaning)
                    syn_synsets = word_synsets.get(syn, set())
                    if not (src_synsets & syn_synsets):
                        continue
                    
                    good_syns.append(syn)
                
                if good_syns:
                    if word in final:
                        existing = set(final[word])
                        new_count = len(good_syns) - len(existing & set(good_syns))
                        existing.update(good_syns)
                        final[word] = list(existing)
                        thesaurus_new += new_count
                    else:
                        final[word] = good_syns
                        thesaurus_new += len(good_syns)
                    thesaurus_added += 1
    except Exception as e:
        print(f"  Error loading {fname}: {e}")

print(f"Thesaurus entries processed: {thesaurus_added}")
print(f"New synonym pairs from thesaurus: {thesaurus_new}")

# --- Third pass: expand coverage with reverse mappings ---
# If A -> B exists, also add B -> A (bidirectional synonyms)
print("\nExpanding with reverse mappings...")
reverse_added = 0
entries_snapshot = dict(final)  # snapshot to iterate
for word, synonyms in entries_snapshot.items():
    for syn in synonyms:
        if syn not in final:
            final[syn] = [word]
            reverse_added += 1
        elif word not in final[syn]:
            final[syn].append(word)
            reverse_added += 1

print(f"Reverse mappings added: {reverse_added}")

# --- Final cleanup: remove any remaining banned pairs ---
for word in list(final.keys()):
    final[word] = [s for s in final[word] if (word, s) not in BANNED_PAIRS]
    if not final[word]:
        del final[word]

# --- Apply manually curated overrides for top academic words ---
# These override ALL auto-generated synonyms for high-polysemy words
# to guarantee meaning-safe replacements in academic context.
ACADEMIC_OVERRIDES = {
    # Core academic verbs
    "process": ["handle", "manage"],
    "approach": ["method", "strategy", "technique"],
    "support": ["reinforce", "strengthen", "sustain", "uphold", "back"],
    "provide": ["offer", "supply", "deliver", "furnish"],
    "reduce": ["decrease", "lower", "diminish", "lessen", "minimize"],
    "promote": ["encourage", "foster", "advance", "further"],
    "address": ["tackle", "handle", "confront"],
    "produce": ["generate", "create", "yield"],
    "conduct": ["perform", "carry"],
    "maintain": ["preserve", "sustain", "uphold", "keep"],
    "establish": ["create", "build", "found", "set"],
    "demonstrate": ["show", "illustrate", "reveal", "exhibit"],
    "indicate": ["suggest", "signal", "show", "reveal"],
    "implement": ["apply", "execute", "carry"],
    "facilitate": ["enable", "assist", "help"],
    "enhance": ["improve", "strengthen", "boost", "enrich"],
    "evaluate": ["assess", "measure", "judge", "appraise"],
    "examine": ["study", "investigate", "analyze", "inspect"],
    "contribute": ["add", "provide", "supply"],
    "achieve": ["accomplish", "attain", "reach"],
    "require": ["need", "demand", "necessitate"],
    "ensure": ["guarantee", "secure", "confirm"],
    "involve": ["include", "entail", "require"],
    "affect": ["influence", "shape", "alter"],
    "determine": ["establish", "identify", "ascertain"],
    "conclude": ["finish", "end", "determine"],
    "develop": ["create", "build", "design", "evolve", "grow"],
    "identify": ["recognize", "detect", "discover", "determine"],
    "transform": ["reshape", "alter", "modify", "convert"],
    "improve": ["enhance", "strengthen", "advance", "better"],
    "increase": ["raise", "expand", "grow", "boost"],
    "suggest": ["propose", "recommend", "imply"],
    "reveal": ["show", "uncover", "disclose", "expose"],
    "emphasize": ["highlight", "stress", "underscore"],
    "analyze": ["examine", "study", "investigate", "assess"],
    "integrate": ["combine", "merge", "incorporate", "unify"],
    "enable": ["allow", "permit", "empower"],
    # Core academic nouns
    "impact": ["effect", "influence", "consequence"],
    "effect": ["result", "outcome", "consequence", "influence"],
    "factor": ["element", "component", "aspect", "variable"],
    "function": ["role", "purpose", "task"],
    "role": ["function", "part", "position"],
    "resource": ["asset", "tool", "material"],
    "policy": ["guideline", "regulation", "directive"],
    "global": ["worldwide", "international"],
    "general": ["broad", "overall", "widespread"],
    "environment": ["setting", "context", "surroundings"],
    "community": ["group", "population", "network"],
    "outcome": ["result", "consequence", "finding"],
    "challenge": ["obstacle", "difficulty", "barrier"],
    "opportunity": ["prospect", "possibility", "opening"],
    "benefit": ["advantage", "gain", "merit"],
    "context": ["setting", "circumstance", "backdrop"],
    "structure": ["framework", "arrangement", "organization"],
    "pattern": ["trend", "tendency", "theme"],
    "growth": ["expansion", "increase", "development"],
    "change": ["shift", "modification", "adjustment", "transition"],
    "response": ["reaction", "reply", "answer"],
    "perspective": ["viewpoint", "standpoint", "outlook"],
    "approach": ["method", "strategy", "technique"],
    "framework": ["model", "structure", "system"],
    "strategy": ["plan", "approach", "method"],
    "innovation": ["advancement", "breakthrough"],
    "development": ["advancement", "evolution"],
    "research": ["study", "investigation", "inquiry"],
    # Core academic adjectives
    "significant": ["important", "substantial", "notable", "considerable"],
    "important": ["crucial", "vital", "essential", "key"],
    "critical": ["crucial", "vital", "essential", "pivotal"],
    "effective": ["successful", "productive", "efficient"],
    "complex": ["complicated", "intricate", "multifaceted"],
    "comprehensive": ["thorough", "extensive", "complete", "broad"],
    "specific": ["particular", "precise", "exact", "distinct"],
    "fundamental": ["basic", "core", "essential", "primary"],
    "essential": ["crucial", "vital", "necessary", "key"],
    "primary": ["main", "chief", "principal", "leading"],
    "potential": ["possible", "prospective", "likely"],
    "substantial": ["considerable", "significant", "meaningful"],
    "relevant": ["pertinent", "applicable", "related"],
    "diverse": ["varied", "assorted", "wide"],
    "previous": ["prior", "earlier", "former", "preceding"],
    "consistent": ["steady", "uniform", "constant", "stable"],
    "appropriate": ["suitable", "fitting", "proper", "apt"],
    "adequate": ["sufficient", "satisfactory", "enough"],
    "individual": ["personal", "separate", "distinct"],
    "various": ["several", "diverse", "numerous", "multiple"],
    "considerable": ["significant", "substantial", "notable"],
    "numerous": ["many", "several", "various", "multiple"],
    "rapid": ["quick", "swift", "fast", "speedy"],
    "overall": ["general", "total", "broad", "complete"],
    # Academic adverbs
    "significantly": ["notably", "considerably", "substantially"],
    "particularly": ["especially", "notably", "specifically"],
    "effectively": ["successfully", "efficiently", "productively"],
    "increasingly": ["progressively", "steadily", "gradually"],
    "primarily": ["mainly", "chiefly", "principally", "largely"],
    "consequently": ["therefore", "thus", "accordingly"],
    "furthermore": ["moreover", "additionally", "also"],
    "subsequently": ["later", "afterward", "thereafter"],
    "substantially": ["considerably", "significantly", "greatly"],
    # Additional overrides for words with bad auto-synonyms
    "extend": ["expand", "stretch", "broaden", "widen"],
    "detect": ["identify", "discover", "notice", "find"],
    "services": ["offerings", "programs"],
    "mere": ["simple", "basic", "plain"],
    "interact": ["engage", "communicate", "connect"],
    "engage": ["participate", "involve", "take part"],
    "functional": ["practical", "working", "operative"],
    "large": ["big", "sizable", "substantial", "considerable"],
    "big": ["large", "major", "significant", "substantial"],
    "discover": ["find", "uncover", "detect", "reveal"],
    "little": ["small", "minor", "slight"],
    "piece": ["part", "portion", "segment"],
    "spell": ["period", "stretch", "phase"],
    "while": ["period", "time"],
    "cut": ["reduce", "lower", "decrease", "trim"],
    "numerous": ["many", "several", "various", "multiple"],
    "sector": ["field", "domain", "area", "industry"],
    "unprecedented": ["unmatched", "unparalleled", "remarkable"],
    "modern": ["contemporary", "current", "present"],
    "vast": ["large", "extensive", "immense", "enormous"],
    "operational": ["functional", "working"],
    "humans": ["people", "individuals"],
    "human": ["individual", "personal"],
    "worldwide": ["globally", "internationally"],
    "technical": ["technological"],
    "technological": ["technical"],
    "advancement": ["progression", "advance"],
    "taking": [],
    "winning": [],
    "information": ["data", "knowledge"],
    "financial": ["economic", "monetary"],
    "pinpoint": ["identify", "locate", "target"],
    "spot": ["identify", "detect", "notice"],
    "recognize": ["identify", "acknowledge", "distinguish"],
    "education": ["learning", "training", "instruction", "schooling"],
    "uncover": ["reveal", "discover", "find"],
    "expose": ["reveal", "uncover", "disclose"],
    "growth": ["expansion", "increase", "development"],
    "small": ["little", "minor"],
    "create": ["produce", "develop", "build", "generate"],
    "simple": ["basic", "straightforward", "plain", "uncomplicated"],
    "alongside": ["beside"],
}

print(f"\nApplying {len(ACADEMIC_OVERRIDES)} manual academic overrides...")
for word, syns in ACADEMIC_OVERRIDES.items():
    final[word] = syns  # Override completely

total_entries = len(final)
total_pairs = sum(len(v) for v in final.values())
print(f"\nFINAL dictionary: {total_entries} entries, {total_pairs} total pairs")

# --- Save ---
output_path = Path("dictionaries/curated_synonyms.json")
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=0)

file_size = output_path.stat().st_size / (1024 * 1024)
print(f"\nSaved to {output_path}")
print(f"File size: {file_size:.1f} MB")

# --- Sample entries to verify quality ---
print("\n--- Sample entries (academic words) ---")
test_words = ['important', 'analysis', 'demonstrate', 'significant', 'challenge',
              'framework', 'strategy', 'research', 'develop', 'establish',
              'economy', 'bias', 'promise', 'transform', 'potential',
              'comprehensive', 'collaborate', 'equitable', 'innovation', 'enhance',
              'evaluate', 'conclude', 'indicate', 'maintain', 'require',
              'contribute', 'examine', 'facilitate', 'identify', 'implement']

for w in test_words:
    syns = final.get(w, [])
    if syns:
        print(f"  {w}: {syns[:8]}")
    else:
        print(f"  {w}: [NO ENTRY]")

# --- Quick quality stats ---
print("\n--- Quality stats ---")
lens = [len(v) for v in final.values()]
print(f"  Avg synonyms per entry: {sum(lens)/len(lens):.1f}")
print(f"  Entries with 1 synonym:  {sum(1 for l in lens if l == 1)}")
print(f"  Entries with 2-5 synonyms: {sum(1 for l in lens if 2 <= l <= 5)}")
print(f"  Entries with 6+ synonyms: {sum(1 for l in lens if l >= 6)}")
