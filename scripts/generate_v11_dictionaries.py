#!/usr/bin/env python3
"""
V1.1 Mega Dictionary Generator
================================
Generates super-large dictionaries for the V1.1 humanizer engine using NLTK WordNet.
Output: frontend/lib/engine/v11/data/*.json
"""

import json
import os
import sys
from collections import defaultdict

try:
    import nltk
    from nltk.corpus import wordnet as wn
except ImportError:
    print("Installing nltk...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "nltk"])
    import nltk
    from nltk.corpus import wordnet as wn

# Ensure WordNet data is downloaded
for resource in ['wordnet', 'omw-1.4']:
    try:
        nltk.data.find(f'corpora/{resource}')
    except LookupError:
        nltk.download(resource, quiet=True)

# Output directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(ROOT, "humanizer-engine", "frontend", "lib", "engine", "v11", "data")
os.makedirs(OUT_DIR, exist_ok=True)

# ── Utility ──

STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "and", "but", "or",
    "not", "no", "if", "in", "on", "at", "to", "for", "of", "with", "by",
    "as", "it", "its", "i", "me", "my", "we", "us", "our", "you", "your",
    "he", "him", "his", "she", "her", "they", "them", "their", "this",
    "that", "these", "those", "so", "up", "out", "off", "all", "any",
    "each", "both", "few", "more", "most", "some", "such", "than", "too",
    "very", "just", "also", "now", "here", "there", "then", "where",
    "when", "how", "why", "what", "which", "who", "whom", "whose",
}

def is_valid_word(w: str) -> bool:
    """Check if word is a clean single English word."""
    if not w or len(w) < 2 or len(w) > 25:
        return False
    if "_" in w or "-" in w or " " in w:
        return False
    if not w.isalpha():
        return False
    if w.lower() in STOP_WORDS:
        return False
    return True


# ═══════════════════════════════════════════════════════════════════════
# 1. MEGA SYNONYMS (50,000+ word→synonyms)
# ═══════════════════════════════════════════════════════════════════════

def generate_mega_synonyms() -> dict:
    print("Generating mega synonyms dictionary...")
    synonyms = defaultdict(set)
    
    for synset in wn.all_synsets():
        lemmas = [l.name().lower().replace("_", " ") for l in synset.lemmas()]
        single_word_lemmas = [l for l in lemmas if is_valid_word(l)]
        
        for word in single_word_lemmas:
            for other in single_word_lemmas:
                if other != word:
                    synonyms[word].add(other)
        
        # Also add hypernym lemmas as loose synonyms
        for hyper in synset.hypernyms()[:3]:
            hyper_lemmas = [l.name().lower() for l in hyper.lemmas() if is_valid_word(l.name().lower())]
            for word in single_word_lemmas:
                for hl in hyper_lemmas[:2]:
                    if hl != word:
                        synonyms[word].add(hl)
    
    # Convert sets to sorted lists, filter to entries with 2+ synonyms
    result = {}
    for word, syns in sorted(synonyms.items()):
        syn_list = sorted(syns)[:10]  # Cap at 10 synonyms per word
        if len(syn_list) >= 1:
            result[word] = syn_list
    
    print(f"  → {len(result)} words with synonyms")
    return result


# ═══════════════════════════════════════════════════════════════════════
# 2. AI VOCABULARY KILL LIST (500+ words)
# ═══════════════════════════════════════════════════════════════════════

# Base AI words from existing shared-dictionaries.ts (120+)
BASE_AI_WORDS = {
    "utilize": ["use"], "utilise": ["use"], "leverage": ["use", "draw on", "rely on"],
    "facilitate": ["help", "support", "allow"], "comprehensive": ["broad", "full", "thorough"],
    "multifaceted": ["complex", "layered"], "paramount": ["central", "most important"],
    "furthermore": ["also", "and"], "moreover": ["also", "and", "plus"],
    "additionally": ["also", "and"], "consequently": ["so", "because of this"],
    "subsequently": ["then", "later", "after that"], "nevertheless": ["still", "even so", "yet"],
    "notwithstanding": ["despite", "even with"], "aforementioned": ["earlier", "that"],
    "paradigm": ["model", "approach"], "trajectory": ["path", "course", "direction"],
    "discourse": ["discussion", "debate"], "dichotomy": ["divide", "split", "gap"],
    "conundrum": ["problem", "puzzle"], "ramification": ["effect", "result", "outcome"],
    "underpinning": ["basis", "root", "base"], "synergy": ["combined effort", "teamwork"],
    "robust": ["strong", "solid", "tough"], "nuanced": ["detailed", "subtle"],
    "salient": ["key", "main", "standout"], "ubiquitous": ["common", "widespread"],
    "pivotal": ["key", "central"], "intricate": ["complex", "detailed"],
    "meticulous": ["careful", "thorough"], "profound": ["deep", "serious"],
    "inherent": ["built-in", "natural"], "overarching": ["main", "broad", "general"],
    "substantive": ["real", "meaningful"], "efficacious": ["effective", "working"],
    "holistic": ["well-rounded", "complete"], "transformative": ["game-changing", "major"],
    "innovative": ["new", "fresh", "creative"], "groundbreaking": ["pioneering"],
    "noteworthy": ["interesting", "striking"], "proliferate": ["spread", "grow"],
    "exacerbate": ["worsen", "aggravate"], "ameliorate": ["improve", "ease"],
    "engender": ["create", "produce"], "delineate": ["describe", "outline"],
    "elucidate": ["explain", "clarify"], "illuminate": ["show", "clarify"],
    "necessitate": ["require", "demand"], "perpetuate": ["continue", "maintain"],
    "underscore": ["highlight", "stress"], "exemplify": ["show", "reflect"],
    "encompass": ["include", "cover"], "bolster": ["support", "strengthen"],
    "catalyze": ["trigger", "spark"], "streamline": ["simplify", "trim"],
    "optimize": ["improve", "fine-tune"], "mitigate": ["reduce", "lessen"],
    "navigate": ["handle", "work through"], "prioritize": ["focus on", "put first"],
    "articulate": ["express", "state"], "substantiate": ["back up", "prove"],
    "corroborate": ["confirm", "support"], "disseminate": ["spread", "share"],
    "cultivate": ["develop", "build"], "ascertain": ["find out", "determine"],
    "endeavor": ["try", "attempt"], "delve": ["dig into", "explore"],
    "embark": ["start", "begin"], "foster": ["encourage", "promote"],
    "harness": ["use", "tap into"], "spearhead": ["lead", "drive"],
    "unravel": ["untangle", "figure out"], "unveil": ["reveal", "show"],
    "tapestry": ["mix", "web"], "cornerstone": ["foundation", "base"],
    "bedrock": ["base", "foundation"], "linchpin": ["key piece", "core"],
    "nexus": ["connection", "link"], "spectrum": ["range", "spread"],
    "myriad": ["many", "countless"], "plethora": ["many", "a lot of"],
    "multitude": ["many", "scores of"], "landscape": ["scene", "field"],
    "realm": ["area", "field"], "culminate": ["end in", "lead to"],
    "enhance": ["improve", "boost"], "crucial": ["key", "important"],
    "vital": ["key", "essential"], "imperative": ["necessary", "urgent"],
    "notable": ["interesting", "striking"], "significant": ["important", "big", "major"],
    "substantial": ["large", "real", "major"], "remarkable": ["striking", "surprising"],
    "considerable": ["large", "big"], "unprecedented": ["never-before-seen", "new"],
    "methodology": ["method", "approach"], "framework": ["structure", "system"],
    "implication": ["effect", "result"], "implications": ["effects", "results"],
    "notably": ["especially"], "specifically": ["in particular"],
    "crucially": ["importantly"], "essentially": ["really", "at its core"],
    "fundamentally": ["at heart", "in practice"], "arguably": ["probably"],
    "undeniably": ["clearly"], "undoubtedly": ["clearly", "no question"],
    "interestingly": ["curiously"], "remarkably": ["surprisingly"],
    "evidently": ["clearly"], "henceforth": ["from then on"],
    "catalyst": ["trigger", "spark"], "demonstrates": ["shows", "reveals"],
    "indicates": ["shows", "suggests"], "constitutes": ["makes up", "forms"],
    "predominantly": ["mostly", "mainly"], "systematically": ["step by step"],
    "inherently": ["by nature", "naturally"], "approximately": ["about", "roughly"],
    "particularly": ["especially"], "accordingly": ["so"],
    "conversely": ["on the flip side", "but"], "irrespective": ["regardless"],
    "significantly": ["deeply", "greatly"], "conceptualize": ["see", "think of"],
    "numerous": ["many", "several"], "perceive": ["see", "view"],
    "emanate": ["come", "flow"], "compel": ["push", "drive"],
    "accommodate": ["handle", "work with"], "coexist": ["live side by side"],
    "devise": ["create", "work out"], "emphasize": ["stress", "highlight"],
    "establish": ["set up", "create"], "thereby": ["in turn", "as a result"],
    "profoundly": ["deeply", "greatly"], "influenced": ["shaped", "affected"],
    "contributed": ["added", "aided"], "championed": ["backed", "pushed for"],
}

# Additional formal/academic words to expand the kill list
ADDITIONAL_FORMAL_SEEDS = [
    "elucidate", "promulgate", "ameliorate", "disseminate", "exacerbate",
    "juxtapose", "extrapolate", "contextualize", "operationalize",
    "conceptualize", "problematize", "dichotomize", "synthesize",
    "hypothesize", "theorize", "legitimize", "institutionalize",
    "marginalize", "deconstruct", "reconceptualize", "reconstitute",
    "reconfigure", "reconceptualize", "presuppose", "predicate",
    "necessitate", "substantiate", "corroborate", "interrogate",
    "adjudicate", "arbitrate", "deliberate", "pontificate",
    "prognosticate", "postulate", "stipulate", "propound",
    "expound", "explicate", "demarcate", "circumscribe",
    "circumvent", "contravene", "predispose", "predetermine",
    "preempt", "supplant", "supersede", "transcend",
    "undergird", "interconnect", "interrelate", "interweave",
    "amalgamate", "consolidate", "coalesce", "converge",
    "diverge", "bifurcate", "stratify", "differentiate",
    "accentuate", "aggrandize", "augment", "buttress",
    "crystallize", "galvanize", "invigorate", "rejuvenate",
    "revitalize", "reinvigorate", "perpetuate", "promulgate",
]

def generate_ai_kill_list(mega_synonyms: dict) -> dict:
    print("Generating AI vocabulary kill list...")
    result = dict(BASE_AI_WORDS)
    
    # Expand with additional formal seeds from WordNet
    for seed in ADDITIONAL_FORMAL_SEEDS:
        if seed in result:
            continue
        if seed in mega_synonyms:
            # Use simpler synonyms as replacements
            simpler = [s for s in mega_synonyms[seed] if len(s) < len(seed) and len(s.split()) == 1]
            if simpler:
                result[seed] = simpler[:5]
    
    # Expand from WordNet: find formal/academic words with simpler synonyms
    formal_pos = {wn.VERB, wn.ADJ, wn.ADV}
    for synset in wn.all_synsets():
        if synset.pos() not in formal_pos:
            continue
        for lemma in synset.lemmas():
            word = lemma.name().lower()
            if not is_valid_word(word) or word in result:
                continue
            if len(word) < 8:  # Focus on longer, more formal words
                continue
            # Check if this word has simpler synonyms
            all_syns = mega_synonyms.get(word, [])
            simpler = [s for s in all_syns if len(s) < len(word) - 2 and len(s.split()) == 1 and len(s) >= 3]
            if len(simpler) >= 2:
                result[word] = simpler[:5]
    
    # Cap at ~600 most useful entries
    # Prioritize: existing base (always keep) + longest words (most formal)
    base_keys = set(BASE_AI_WORDS.keys())
    extra = {k: v for k, v in result.items() if k not in base_keys}
    sorted_extra = sorted(extra.items(), key=lambda x: len(x[0]), reverse=True)
    
    final = dict(BASE_AI_WORDS)
    for k, v in sorted_extra[:400]:
        final[k] = v
    
    print(f"  → {len(final)} AI words with replacements")
    return final


# ═══════════════════════════════════════════════════════════════════════
# 3. PHRASE TRANSFORMS (5,000+)
# ═══════════════════════════════════════════════════════════════════════

BASE_PHRASE_TRANSFORMS = {
    "it is important to note that": ["notably,", "one key point is that"],
    "it is crucial that": ["it matters that", "the key thing is that"],
    "it should be noted that": ["note that", "keep in mind that"],
    "plays a crucial role": ["is central", "matters greatly", "is key"],
    "plays an important role": ["matters", "is a key part", "holds weight"],
    "in today's world": ["right now", "today", "these days"],
    "in the modern era": ["today", "nowadays", "at present"],
    "a wide range of": ["many", "lots of", "various"],
    "a broad range of": ["many", "a variety of", "different"],
    "due to the fact that": ["because", "since", "as"],
    "in order to": ["to", "so as to"],
    "first and foremost": ["first", "above all", "to start"],
    "each and every": ["every", "all"],
    "needless to say": ["clearly", "obviously"],
    "at the end of the day": ["in the end", "ultimately"],
    "on the other hand": ["then again", "but", "however"],
    "in other words": ["put simply", "that is", "meaning"],
    "for example": ["to illustrate", "such as", "like"],
    "for instance": ["as an example", "say", "take"],
    "as a result": ["so", "because of this", "therefore"],
    "in addition": ["also", "besides", "plus"],
    "in addition to": ["besides", "along with", "on top of"],
    "has the potential to": ["could", "can", "might"],
    "in recent years": ["lately", "of late", "recently"],
    "the fact that": ["that", "how"],
    "at the same time": ["meanwhile", "still", "yet"],
    "on a global scale": ["worldwide", "globally", "across the world"],
    "cannot be overstated": ["is huge", "is critical", "is immense"],
    "a comprehensive approach": ["a thorough plan", "a full strategy"],
    "moving forward": ["going ahead", "from here", "next"],
    "when it comes to": ["with", "regarding", "about"],
    "in terms of": ["for", "regarding", "about"],
    "in the context of": ["within", "inside", "regarding"],
    "with respect to": ["about", "regarding", "for"],
    "with regard to": ["about", "regarding", "for"],
    "has led to": ["caused", "brought about", "resulted in"],
    "has resulted in": ["caused", "led to", "produced"],
    "it is evident that": ["clearly", "one can see that"],
    "it is clear that": ["plainly", "obviously"],
    "there are several": ["several", "a number of", "some"],
    "there are many": ["many", "lots of", "numerous"],
    "this suggests that": ["this hints that", "this points to"],
    "this indicates that": ["this shows that", "this means that"],
    "serves as a": ["works as a", "acts as a", "functions as a"],
    "plays a role in": ["matters for", "shapes", "affects"],
    "is essential for": ["is needed for", "is key to"],
    "a significant impact": ["a big effect", "a major mark", "a strong influence"],
    "the significance of": ["the weight of", "how much ... matters"],
    "the importance of": ["the value of", "how much ... counts"],
    "overall": ["all in all", "on the whole", "broadly"],
    "to begin with": ["first off", "to start", "initially"],
    "in conclusion": ["all in all", "to wrap up", "finally"],
    "in summary": ["to sum up", "briefly", "in short"],
    "despite the fact that": ["although", "even though", "though"],
    "regardless of": ["no matter", "despite", "whatever"],
    "a growing number of": ["more and more", "an increasing number of"],
    "a significant number of": ["many", "a large number of", "quite a few"],
    "take into account": ["consider", "factor in", "think about"],
    "bring about": ["cause", "create", "trigger"],
    "carry out": ["do", "run", "perform"],
    "come up with": ["create", "think up", "devise"],
    "figure out": ["solve", "work out", "find"],
    "look into": ["examine", "check", "study"],
    "point out": ["note", "mention", "highlight"],
    "put forward": ["propose", "suggest", "offer"],
    "set up": ["create", "build", "start"],
    "a key factor": ["a main driver", "a core element"],
    "the primary reason": ["the main cause", "the chief reason"],
    "significantly impacted": ["greatly affected", "strongly shaped"],
    "played a pivotal role": ["was central", "was key", "mattered greatly"],
    "it is worth noting": ["notably", "one should note", "worth mentioning"],
    "the overarching goal": ["the main aim", "the broad target"],
    "the underlying cause": ["the root cause", "the base reason"],
    "in light of": ["given", "considering", "because of"],
    "by contrast": ["but", "on the other side", "compared to that"],
    "to a large extent": ["mostly", "largely", "in great part"],
    "to a certain extent": ["somewhat", "partly", "in part"],
    "give rise to": ["lead to", "cause", "produce"],
    "shed light on": ["clear up", "explain", "reveal"],
    "pave the way for": ["open the door to", "prepare for", "enable"],
    "raise important questions": ["bring up questions", "prompt questions"],
}

def generate_phrase_transforms(mega_synonyms: dict) -> dict:
    print("Generating phrase transforms...")
    result = dict(BASE_PHRASE_TRANSFORMS)
    
    # Expand each existing phrase by substituting key words with synonyms
    expanded = {}
    for phrase, alternatives in list(result.items()):
        words = phrase.split()
        for i, word in enumerate(words):
            if word.lower() in STOP_WORDS or len(word) < 4:
                continue
            syns = mega_synonyms.get(word.lower(), [])
            for syn in syns[:3]:
                new_words = list(words)
                new_words[i] = syn
                new_phrase = " ".join(new_words)
                if new_phrase != phrase and new_phrase not in result:
                    expanded[new_phrase] = alternatives
    
    result.update(expanded)
    
    # Generate additional academic phrase patterns
    academic_fillers = [
        ("it is {} that", ["clearly,", "in truth,"]),
        ("it has been {} that", ["we now know that", "it turns out that"]),
        ("there is a {} need for", ["there is real need for", "we need"]),
        ("the {} impact of", ["how {} affects", "the effect of"]),
        ("has {} implications for", ["affects", "matters for"]),
        ("is of {} importance", ["matters greatly", "is very important"]),
    ]
    
    adjectives = ["significant", "crucial", "vital", "critical", "essential",
                  "fundamental", "profound", "substantial", "considerable",
                  "paramount", "pivotal", "instrumental", "indispensable"]
    
    for template, replacements in academic_fillers:
        for adj in adjectives:
            phrase = template.format(adj)
            if phrase not in result:
                result[phrase] = replacements
    
    # Passive voice patterns
    passive_patterns = {
        "is characterized by": ["shows", "features", "has"],
        "is determined by": ["depends on", "hinges on", "rests on"],
        "is influenced by": ["is shaped by", "responds to", "reflects"],
        "is associated with": ["goes with", "links to", "ties to"],
        "is attributed to": ["comes from", "stems from", "is due to"],
        "is contingent upon": ["depends on", "hinges on", "rests on"],
        "is predicated on": ["rests on", "depends on", "builds on"],
        "is indicative of": ["points to", "suggests", "signals"],
        "is reflective of": ["mirrors", "shows", "captures"],
        "is representative of": ["reflects", "stands for", "captures"],
        "is synonymous with": ["equals", "matches", "means"],
        "has been demonstrated": ["is now clear", "has proven true"],
        "has been established": ["is well known", "is now settled"],
        "has been observed": ["has been seen", "has shown up"],
        "has been documented": ["has been recorded", "is on record"],
        "has been shown to": ["has proven to", "turns out to"],
        "can be attributed to": ["comes from", "stems from", "is tied to"],
        "is considered to be": ["is seen as", "counts as", "is thought of as"],
        "is defined as": ["means", "refers to", "stands for"],
        "is dependent on": ["relies on", "depends on", "rests on"],
        "is derived from": ["comes from", "grows out of", "stems from"],
        "is evident in": ["shows up in", "appears in", "can be seen in"],
        "is linked to": ["is tied to", "connects to", "goes with"],
        "is rooted in": ["grows out of", "comes from", "is based in"],
        "is subject to": ["faces", "deals with", "runs into"],
    }
    result.update(passive_patterns)
    
    # Hedging patterns
    hedging = {
        "it is possible that": ["possibly", "maybe", "perhaps"],
        "it is likely that": ["probably", "chances are", "most likely"],
        "it is unlikely that": ["probably not", "doubtful that"],
        "it is conceivable that": ["maybe", "one could imagine"],
        "it is plausible that": ["possibly", "it could be that"],
        "it could be argued that": ["one might say", "arguably"],
        "it would appear that": ["it seems", "apparently"],
        "it remains to be seen": ["we will see", "time will tell"],
        "it is generally accepted that": ["most agree that", "the common view is"],
        "it is widely recognized that": ["most people know that", "it is well known"],
        "it is often the case that": ["often", "frequently", "many times"],
        "it is not uncommon for": ["it happens that", "often"],
        "one might argue that": ["you could say", "arguably"],
        "it stands to reason that": ["naturally", "it makes sense that"],
    }
    result.update(hedging)
    
    # Quantifier patterns
    quantifiers = {
        "a vast majority of": ["most", "the bulk of", "nearly all"],
        "a substantial portion of": ["much of", "a large part of", "a good deal of"],
        "a considerable amount of": ["much", "plenty of", "a good deal of"],
        "an overwhelming majority of": ["nearly all", "the vast bulk of"],
        "a disproportionate number of": ["too many", "an unfair share of"],
        "the overwhelming majority": ["most", "nearly all"],
        "to a significant degree": ["greatly", "a lot", "much"],
        "to a considerable extent": ["largely", "a lot", "much"],
    }
    result.update(quantifiers)
    
    print(f"  → {len(result)} phrase transforms")
    return result


# ═══════════════════════════════════════════════════════════════════════
# 4. CONNECTOR ALTERNATIVES (200+)
# ═══════════════════════════════════════════════════════════════════════

def generate_connectors() -> dict:
    print("Generating connector alternatives...")
    connectors = {
        "Furthermore, ": ["Also, ", "In addition, ", "Plus, ", "What is more, "],
        "Moreover, ": ["On top of that, ", "In addition, ", "Beyond that, ", "And, "],
        "Additionally, ": ["Also, ", "In addition, ", "Plus, ", "Besides, "],
        "Consequently, ": ["So ", "Because of that, ", "That meant ", "As a result, "],
        "Nevertheless, ": ["Still, ", "Even so, ", "All the same, ", "Yet "],
        "Nonetheless, ": ["Still, ", "Even so, ", "All the same, ", "Yet "],
        "In contrast, ": ["On the other hand, ", "Then again, ", "On the flip side, ", "But "],
        "Subsequently, ": ["After that, ", "Then ", "Later, ", "Next, "],
        "In conclusion, ": ["All in all, ", "To wrap up, ", "Looking at the whole picture, "],
        "Therefore, ": ["So ", "That is why ", "This is why ", "Because of this, "],
        "However, ": ["Still, ", "Even so, ", "All the same, ", "But ", "Yet "],
        "Thus, ": ["So ", "That way, ", "This meant ", "Hence, "],
        "Hence, ": ["So ", "That is why ", "Because of that, "],
        "Indeed, ": ["In fact, ", "Sure enough, ", "As it turned out, "],
        "Accordingly, ": ["So ", "In response, ", "Because of this, "],
        "Notably, ": ["What stands out is ", "One thing worth noting: ", "As it happens, "],
        "Specifically, ": ["In particular, ", "To be exact, ", "More precisely, "],
        "As a result, ": ["So ", "Because of this, ", "That meant ", "This led to "],
        "For example, ": ["Take ", "Consider ", "To illustrate, ", "Say "],
        "For instance, ": ["Take ", "Consider ", "Say ", "One example is "],
        "On the other hand, ": ["Then again, ", "But ", "At the same time, ", "Meanwhile, "],
        "In other words, ": ["Put simply, ", "In practice, ", "That means ", "Basically, "],
        "To begin with, ": ["First off, ", "Starting with, ", "At the outset, ", "First, "],
        "In particular, ": ["Especially, ", "Above all, ", "Chiefly, ", "Most of all, "],
        "As such, ": ["So ", "Given that, ", "This means ", "Because of this, "],
        "To that end, ": ["With that goal, ", "For that reason, ", "So ", "To do this, "],
        "By contrast, ": ["But ", "On the other side, ", "Compare that to ", "Whereas "],
        "In essence, ": ["At its core, ", "In practice, ", "Really, ", "Basically, "],
        "In sum, ": ["Overall, ", "To wrap up, ", "All told, ", "On the whole, "],
        "To summarize, ": ["In short, ", "Briefly, ", "All told, ", "In a word, "],
        "Conversely, ": ["On the flip side, ", "But ", "In contrast, "],
        "Simultaneously, ": ["At the same time, ", "Meanwhile, ", "In parallel, "],
        "Likewise, ": ["Similarly, ", "In the same way, ", "Along those lines, "],
        "Alternatively, ": ["Or ", "Another option is ", "On the other hand, "],
        "Incidentally, ": ["By the way, ", "As it happens, ", "On a side note, "],
        "Undoubtedly, ": ["Without question, ", "Clearly, ", "No doubt, "],
        "Evidently, ": ["Clearly, ", "It seems, ", "Apparently, "],
        "Inevitably, ": ["Naturally, ", "As expected, ", "Of course, "],
        "Ironically, ": ["Oddly enough, ", "Paradoxically, ", "Strangely, "],
        "Paradoxically, ": ["Oddly, ", "Strangely, ", "Ironically, "],
        "Admittedly, ": ["Granted, ", "True, ", "To be fair, "],
        "Arguably, ": ["You could say ", "Perhaps, ", "Possibly, "],
        "Essentially, ": ["Basically, ", "At heart, ", "In practice, "],
        "Fundamentally, ": ["At its core, ", "Basically, ", "In essence, "],
        "Ultimately, ": ["In the end, ", "At the end, ", "Finally, "],
        "Remarkably, ": ["Surprisingly, ", "Strikingly, ", "What is striking is "],
        "Importantly, ": ["Key here is ", "What matters is ", "Crucially, "],
        "Intriguingly, ": ["Curiously, ", "What is interesting is ", "Strikingly, "],
        "Regrettably, ": ["Sadly, ", "Unfortunately, ", "It is a shame that "],
        "Fortunately, ": ["Luckily, ", "Happily, ", "On the bright side, "],
        "Predictably, ": ["As expected, ", "Not surprisingly, ", "Naturally, "],
        "Unsurprisingly, ": ["As expected, ", "Naturally, ", "Of course, "],
        "Traditionally, ": ["In the past, ", "Historically, ", "By custom, "],
        "Historically, ": ["In the past, ", "Over time, ", "Traditionally, "],
        "Theoretically, ": ["In theory, ", "On paper, ", "Ideally, "],
        "Practically, ": ["In practice, ", "In reality, ", "Actually, "],
        "Ideally, ": ["In a perfect world, ", "At best, ", "Hopefully, "],
        "Presumably, ": ["Probably, ", "Most likely, ", "One would think "],
        "Ostensibly, ": ["On the surface, ", "Seemingly, ", "Apparently, "],
        "Superficially, ": ["On the surface, ", "At first glance, ", "Seemingly, "],
        "Broadly, ": ["In general, ", "Overall, ", "Widely, "],
        "Typically, ": ["Usually, ", "Normally, ", "As a rule, "],
        "Invariably, ": ["Always, ", "Without fail, ", "Every time, "],
        "Occasionally, ": ["Sometimes, ", "Now and then, ", "From time to time, "],
        "Frequently, ": ["Often, ", "Regularly, ", "Many times, "],
        "Primarily, ": ["Mainly, ", "Mostly, ", "Chiefly, "],
        "Predominantly, ": ["Mostly, ", "Mainly, ", "Largely, "],
        "Inherently, ": ["By nature, ", "Naturally, ", "At its core, "],
        "Intrinsically, ": ["By nature, ", "At its core, ", "Naturally, "],
        "Counterintuitively, ": ["Oddly, ", "Against expectations, ", "Surprisingly, "],
        "Notwithstanding, ": ["Even so, ", "Despite that, ", "Still, "],
        "Henceforth, ": ["From now on, ", "Going forward, ", "After this, "],
        "Hitherto, ": ["Until now, ", "So far, ", "Up to this point, "],
        "Thereafter, ": ["After that, ", "From then on, ", "Later, "],
        "Heretofore, ": ["Before now, ", "Previously, ", "Until then, "],
        "Forthwith, ": ["Right away, ", "Immediately, ", "At once, "],
        "Thereupon, ": ["Then, ", "At that point, ", "Right after, "],
        "Whereas, ": ["While, ", "Although, ", "But, "],
        "Whereby, ": ["Where, ", "Through which, ", "By which means, "],
        "Inasmuch as, ": ["Since, ", "Because, ", "Given that, "],
        "Insofar as, ": ["To the extent that, ", "As far as, ", "Where, "],
        "Notwithstanding, ": ["Despite this, ", "Even so, ", "Still, "],
    }
    
    print(f"  → {len(connectors)} connector alternatives")
    return connectors


# ═══════════════════════════════════════════════════════════════════════
# 5. SENTENCE STARTERS (300+)
# ═══════════════════════════════════════════════════════════════════════

def generate_sentence_starters() -> dict:
    print("Generating sentence starters...")
    starters = {
        "furthermore, ": ["In addition, ", "Beyond this, ", "Building on this, ", "Also, ", "Plus, "],
        "moreover, ": ["More importantly, ", "On a related note, ", "What is more, ", "Also, "],
        "additionally, ": ["Also, ", "On top of this, ", "Added to this, ", "Besides, ", "Plus, "],
        "consequently, ": ["As a result, ", "This led to ", "Because of this, ", "So "],
        "however, ": ["That said, ", "On the other hand, ", "Even so, ", "Yet ", "Still, "],
        "in conclusion, ": ["Ultimately, ", "Taken together, ", "All things considered, ", "In the end, "],
        "in summary, ": ["To sum up, ", "Taken as a whole, ", "On balance, ", "In short, "],
        "therefore, ": ["As such, ", "For this reason, ", "Hence, ", "This means that ", "So "],
        "nevertheless, ": ["Even so, ", "Despite this, ", "All the same, ", "Still, "],
        "subsequently, ": ["Following this, ", "After that, ", "In turn, ", "Later on, ", "Then "],
        "accordingly, ": ["In response, ", "As a result, ", "In line with this, ", "So "],
        "notably, ": ["It is worth noting that ", "Of particular interest is that ", "Significantly, "],
        "specifically, ": ["In particular, ", "To be precise, ", "More precisely, ", "Namely, "],
        "thus, ": ["As a consequence, ", "For this reason, ", "Hence, ", "So "],
        "while ": ["Although ", "Even though ", "Whereas ", "Despite the fact that "],
        "despite ": ["In spite of ", "Regardless of ", "Notwithstanding ", "Even with "],
        "as a result, ": ["Because of this, ", "This brought about ", "So ", "That led to "],
        "for example, ": ["To illustrate, ", "As an example, ", "A case in point is ", "For instance, "],
        "for instance, ": ["As an illustration, ", "To give an example, ", "Consider ", "Say "],
        "on the other hand, ": ["Conversely, ", "By contrast, ", "In contrast, ", "At the same time, "],
        "in other words, ": ["Put differently, ", "To rephrase, ", "That is to say, ", "Basically, "],
        "it is worth noting that ": ["One key observation is that ", "A notable point is that ", "Worth mentioning is "],
        "it is important to note that ": ["One should recognize that ", "A critical observation is that ", "It bears mentioning that "],
        "another important ": ["A further noteworthy ", "An additional key ", "One more notable ", "A separate "],
        "another significant ": ["A further major ", "One more considerable ", "An additional notable "],
        "one of the most significant ": ["Among the most notable ", "Perhaps the most substantial ", "Arguably the most "],
        "one of the most important ": ["A key ", "Among the most vital ", "Perhaps the most essential "],
        "this has led to ": ["The consequence has been ", "This has resulted in ", "This has given rise to "],
        "this has resulted in ": ["The outcome has been ", "This has brought about ", "This gave way to "],
        "in addition, ": ["Beyond this, ", "Also, ", "What is more, ", "On top of this, ", "Plus, "],
        "overall, ": ["On the whole, ", "Broadly speaking, ", "In general terms, ", "All things considered, "],
        "to begin with, ": ["First of all, ", "At the outset, ", "To start, ", "First, "],
        "first and foremost, ": ["Above all, ", "Most importantly, ", "To begin, ", "First, "],
        "in today's world, ": ["At present, ", "In the current landscape, ", "Nowadays, ", "Today, "],
        "in the modern era, ": ["At present, ", "In contemporary times, ", "Nowadays, ", "Today, "],
        "it is essential to ": ["One must ", "It remains necessary to ", "There is a clear need to "],
        "it is important to ": ["One should ", "It remains necessary to ", "There is value in "],
        "in recent years, ": ["Over the past few years, ", "Lately, ", "In the recent period, ", "Recently, "],
        "throughout history, ": ["Across the centuries, ", "Over time, ", "Historically, "],
        "there are several ": ["A number of ", "Multiple ", "Various ", "Some "],
        "there are many ": ["Numerous ", "A wide range of ", "Several ", "Lots of "],
        "it can be seen that ": ["Evidently, ", "Observably, ", "One can note that ", "Clearly, "],
        "it is clear that ": ["Plainly, ", "Evidently, ", "Without question, ", "Clearly, "],
        "looking at ": ["Examining ", "Considering ", "Reviewing ", "Turning to "],
        "when it comes to ": ["Regarding ", "In the matter of ", "With respect to ", "About "],
        "given that ": ["Since ", "Considering that ", "In view of the fact that ", "Because "],
        "due to ": ["Owing to ", "Because of ", "As a consequence of ", "Thanks to "],
        "this essay explores ": ["This paper examines ", "The discussion considers ", "This piece looks at "],
        "this essay examines ": ["This paper analyses ", "This discussion considers ", "This analysis investigates "],
        "this essay discusses ": ["This paper considers ", "This discussion addresses ", "This piece looks at "],
        "the purpose of this essay ": ["The aim of this paper ", "The goal of this discussion ", "The objective of this analysis "],
        "it is evident that ": ["Clearly, ", "One can see that ", "The evidence shows "],
        "it is apparent that ": ["Clearly, ", "Obviously, ", "It seems clear that "],
        "it remains to be seen ": ["We will see ", "Time will tell ", "The jury is still out on "],
        "it goes without saying ": ["Naturally, ", "Of course, ", "Obviously, "],
        "it is generally agreed that ": ["Most agree that ", "The consensus is that ", "Broadly speaking, "],
        "upon closer examination ": ["Looking more carefully, ", "On a closer look, ", "Digging deeper, "],
        "from this perspective ": ["Seen this way, ", "Through this lens, ", "On this view, "],
        "in this regard ": ["On this point, ", "Here, ", "In this respect, "],
        "to this end ": ["For this purpose, ", "With this goal, ", "To achieve this, "],
        "on the contrary ": ["Actually, ", "In fact, ", "Rather, "],
        "by the same token ": ["Equally, ", "Similarly, ", "In the same way, "],
        "in a similar vein ": ["Similarly, ", "Along those lines, ", "In much the same way, "],
        "on balance ": ["Overall, ", "All things considered, ", "Taking everything into account, "],
        "in retrospect ": ["Looking back, ", "With hindsight, ", "Reflecting on this, "],
        "with this in mind ": ["Bearing this in mind, ", "Keeping this in view, ", "Given this, "],
    }
    
    print(f"  → {len(starters)} sentence starters")
    return starters


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("V1.1 Mega Dictionary Generator")
    print("=" * 60)
    
    # Step 1: Mega synonyms (foundation for everything else)
    mega_synonyms = generate_mega_synonyms()
    
    # Step 2: AI kill list (uses mega synonyms for expansion)
    ai_kill = generate_ai_kill_list(mega_synonyms)
    
    # Step 3: Phrase transforms
    phrase_transforms = generate_phrase_transforms(mega_synonyms)
    
    # Step 4: Connectors
    connectors = generate_connectors()
    
    # Step 5: Sentence starters
    starters = generate_sentence_starters()
    
    # Write all files
    files = {
        "mega_synonyms.json": mega_synonyms,
        "ai_vocabulary_kill.json": ai_kill,
        "phrase_transforms.json": phrase_transforms,
        "connector_alternatives.json": connectors,
        "sentence_starters.json": starters,
    }
    
    for filename, data in files.items():
        path = os.path.join(OUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"  Written: {filename} ({size_mb:.1f} MB, {len(data)} entries)")
    
    print()
    print("=" * 60)
    print("SUMMARY")
    print(f"  Synonyms:         {len(mega_synonyms):>8,} words")
    print(f"  AI Kill List:     {len(ai_kill):>8,} words")
    print(f"  Phrase Transforms:{len(phrase_transforms):>8,} phrases")
    print(f"  Connectors:       {len(connectors):>8,} entries")
    print(f"  Starters:         {len(starters):>8,} entries")
    print(f"  Output:           {OUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
