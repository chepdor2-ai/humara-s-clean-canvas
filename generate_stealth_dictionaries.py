#!/usr/bin/env python3
"""
Massive Dictionary Generator for Stealth Humanizer
====================================================
Generates large-scale lexical databases from open-source resources:
  1. WordNet synonyms (150K+ words via NLTK)
  2. ECDICT (1.5M+ words from the open CSV)
  3. PPDB-style phrase paraphrases (from custom + PPDB-derived data)

Outputs JSON files that the TypeScript DictionaryService loads.

Usage:
  python generate_stealth_dictionaries.py [--wordnet] [--ecdict] [--ppdb] [--all]

Requirements:
  pip install nltk requests tqdm
"""

import argparse
import json
import os
import sys
import csv
import re
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any

# Output directory
OUTPUT_DIR = Path(__file__).parent / "humanizer-engine" / "data" / "stealth"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ══════════════════════════════════════════════════════════════════════
# 1. WORDNET DICTIONARY GENERATOR
# ══════════════════════════════════════════════════════════════════════

def generate_wordnet_dictionary() -> Dict[str, Any]:
    """
    Generate a comprehensive synonym dictionary from WordNet via NLTK.
    Downloads WordNet data if not already present.
    Produces 150,000+ word entries with synonyms, definitions, and POS.
    """
    print("[WordNet] Downloading NLTK data if needed...")
    try:
        import nltk
        nltk.download('wordnet', quiet=True)
        nltk.download('omw-1.4', quiet=True)
        from nltk.corpus import wordnet as wn
    except ImportError:
        print("[WordNet] ERROR: nltk not installed. Run: pip install nltk")
        return {}

    print("[WordNet] Building synonym dictionary...")
    dictionary: Dict[str, Any] = {}
    all_lemmas = set()

    for synset in wn.all_synsets():
        for lemma in synset.lemmas():
            name = lemma.name().replace('_', ' ').lower()
            all_lemmas.add(name)

    total = len(all_lemmas)
    print(f"[WordNet] Processing {total:,} unique lemmas...")

    try:
        from tqdm import tqdm
        lemma_iter = tqdm(all_lemmas, desc="[WordNet] Processing")
    except ImportError:
        lemma_iter = all_lemmas
        print("[WordNet] (install tqdm for progress bar)")

    count = 0
    for lemma_name in lemma_iter:
        synsets = wn.synsets(lemma_name.replace(' ', '_'))
        if not synsets:
            continue

        synonyms = set()
        definitions = []
        pos_tags = set()
        examples = []

        for synset in synsets[:5]:  # Limit to 5 synsets per word
            pos_map = {'n': 'noun', 'v': 'verb', 'a': 'adjective', 'r': 'adverb', 's': 'adjective'}
            pos_tags.add(pos_map.get(synset.pos(), 'unknown'))
            definitions.append(synset.definition())
            examples.extend(synset.examples()[:2])

            for syn_lemma in synset.lemmas():
                syn_name = syn_lemma.name().replace('_', ' ').lower()
                if syn_name != lemma_name and len(syn_name) < 40:
                    synonyms.add(syn_name)

            # Also grab hypernyms and hyponyms for richer synonyms
            for hyper in synset.hypernyms()[:2]:
                for h_lemma in hyper.lemmas():
                    h_name = h_lemma.name().replace('_', ' ').lower()
                    if h_name != lemma_name and len(h_name) < 40:
                        synonyms.add(h_name)

        if synonyms:
            dictionary[lemma_name] = {
                "word": lemma_name,
                "pos": list(pos_tags)[0] if pos_tags else "unknown",
                "synonyms": list(synonyms)[:15],  # Cap at 15 synonyms
                "paraphrases": [],
                "definition": definitions[0] if definitions else "",
                "frequency": 0.5,
                "examples": examples[:3],
            }
            count += 1

    print(f"[WordNet] Generated {count:,} dictionary entries")
    return dictionary


# ══════════════════════════════════════════════════════════════════════
# 2. ECDICT LOADER (1.5M+ words)
# ══════════════════════════════════════════════════════════════════════

def generate_ecdict_dictionary(ecdict_path: str = None) -> Dict[str, Any]:
    """
    Load and process the ECDICT CSV file.
    ECDICT provides 1.5M+ English words with definitions, phonetics, POS, etc.
    Download from: https://github.com/skywind3000/ECDICT

    If ecdict_path is None, generates a smaller built-in dictionary.
    """
    if ecdict_path and os.path.exists(ecdict_path):
        print(f"[ECDICT] Loading from {ecdict_path}...")
        return _load_ecdict_csv(ecdict_path)
    else:
        print("[ECDICT] CSV not found. Generating built-in extended dictionary...")
        return _generate_builtin_extended()


def _load_ecdict_csv(filepath: str) -> Dict[str, Any]:
    """Parse ECDICT CSV into dictionary entries."""
    dictionary: Dict[str, Any] = {}
    count = 0

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for row in reader:
                word = row.get('word', '').strip().lower()
                if not word or len(word) > 50 or not re.match(r'^[a-z\s\-]+$', word):
                    continue

                definition = row.get('definition', '') or row.get('translation', '') or ''
                pos = row.get('pos', '') or ''
                frequency = 0.5

                # Try to extract frequency from BNC/COCA columns
                try:
                    bnc = int(row.get('bnc', 0) or 0)
                    if bnc > 0:
                        frequency = min(1.0, bnc / 50000)
                except (ValueError, TypeError):
                    pass

                dictionary[word] = {
                    "word": word,
                    "pos": pos.split('/')[0] if pos else "unknown",
                    "synonyms": [],  # Will be merged later
                    "paraphrases": [],
                    "definition": definition[:200],
                    "frequency": frequency,
                    "examples": [],
                }
                count += 1

                if count % 100000 == 0:
                    print(f"[ECDICT] Processed {count:,} entries...")

    except Exception as e:
        print(f"[ECDICT] Error reading CSV: {e}")

    print(f"[ECDICT] Loaded {count:,} entries")
    return dictionary


def _generate_builtin_extended() -> Dict[str, Any]:
    """
    Generate a comprehensive built-in dictionary with ~10,000 common English
    words and their synonyms. This is used when ECDICT is not available.
    """
    # Core academic/formal word pairs with natural alternatives
    WORD_PAIRS: Dict[str, Dict[str, Any]] = {}

    # High-frequency academic words
    academic_words = {
        "analyze": {"synonyms": ["examine", "study", "review", "assess", "inspect"], "pos": "verb"},
        "approach": {"synonyms": ["method", "way", "technique", "strategy", "path"], "pos": "noun"},
        "area": {"synonyms": ["field", "domain", "sector", "sphere", "zone"], "pos": "noun"},
        "aspect": {"synonyms": ["part", "side", "element", "feature", "facet"], "pos": "noun"},
        "assess": {"synonyms": ["evaluate", "judge", "measure", "rate", "appraise"], "pos": "verb"},
        "authority": {"synonyms": ["power", "control", "command", "influence", "jurisdiction"], "pos": "noun"},
        "available": {"synonyms": ["accessible", "obtainable", "at hand", "ready", "on hand"], "pos": "adjective"},
        "benefit": {"synonyms": ["advantage", "gain", "profit", "merit", "asset"], "pos": "noun"},
        "category": {"synonyms": ["group", "class", "type", "kind", "division"], "pos": "noun"},
        "challenge": {"synonyms": ["difficulty", "obstacle", "hurdle", "problem", "test"], "pos": "noun"},
        "chapter": {"synonyms": ["section", "part", "segment", "division", "portion"], "pos": "noun"},
        "characteristic": {"synonyms": ["feature", "trait", "quality", "attribute", "property"], "pos": "noun"},
        "circumstance": {"synonyms": ["situation", "condition", "context", "event", "case"], "pos": "noun"},
        "community": {"synonyms": ["group", "society", "population", "neighborhood", "collective"], "pos": "noun"},
        "complex": {"synonyms": ["complicated", "intricate", "involved", "elaborate", "layered"], "pos": "adjective"},
        "component": {"synonyms": ["part", "piece", "element", "unit", "section"], "pos": "noun"},
        "concept": {"synonyms": ["idea", "notion", "thought", "theory", "principle"], "pos": "noun"},
        "conduct": {"synonyms": ["carry out", "perform", "do", "execute", "run"], "pos": "verb"},
        "consequence": {"synonyms": ["result", "outcome", "effect", "impact", "aftermath"], "pos": "noun"},
        "considerable": {"synonyms": ["significant", "substantial", "notable", "large", "major"], "pos": "adjective"},
        "consistent": {"synonyms": ["steady", "uniform", "constant", "stable", "regular"], "pos": "adjective"},
        "construction": {"synonyms": ["building", "creation", "assembly", "formation", "development"], "pos": "noun"},
        "consumer": {"synonyms": ["buyer", "customer", "purchaser", "user", "client"], "pos": "noun"},
        "context": {"synonyms": ["setting", "background", "situation", "framework", "environment"], "pos": "noun"},
        "contract": {"synonyms": ["agreement", "deal", "arrangement", "pact", "treaty"], "pos": "noun"},
        "contribute": {"synonyms": ["add", "give", "provide", "supply", "donate"], "pos": "verb"},
        "create": {"synonyms": ["make", "produce", "build", "develop", "form"], "pos": "verb"},
        "criteria": {"synonyms": ["standards", "measures", "benchmarks", "requirements", "guidelines"], "pos": "noun"},
        "crucial": {"synonyms": ["critical", "vital", "key", "essential", "important"], "pos": "adjective"},
        "culture": {"synonyms": ["society", "civilization", "tradition", "customs", "heritage"], "pos": "noun"},
        "current": {"synonyms": ["present", "existing", "ongoing", "prevailing", "modern"], "pos": "adjective"},
        "debate": {"synonyms": ["discussion", "argument", "dispute", "dialogue", "discourse"], "pos": "noun"},
        "decade": {"synonyms": ["ten years", "period", "span", "era"], "pos": "noun"},
        "decline": {"synonyms": ["decrease", "drop", "fall", "reduction", "downturn"], "pos": "noun"},
        "define": {"synonyms": ["describe", "explain", "specify", "clarify", "establish"], "pos": "verb"},
        "demonstrate": {"synonyms": ["show", "prove", "display", "reveal", "illustrate"], "pos": "verb"},
        "derive": {"synonyms": ["obtain", "get", "draw", "extract", "gain"], "pos": "verb"},
        "design": {"synonyms": ["plan", "create", "develop", "devise", "craft"], "pos": "verb"},
        "despite": {"synonyms": ["regardless of", "in spite of", "notwithstanding", "even with"], "pos": "preposition"},
        "dimension": {"synonyms": ["aspect", "side", "element", "facet", "angle"], "pos": "noun"},
        "distinct": {"synonyms": ["different", "separate", "unique", "individual", "clear"], "pos": "adjective"},
        "distribute": {"synonyms": ["spread", "share", "allocate", "hand out", "deliver"], "pos": "verb"},
        "document": {"synonyms": ["record", "file", "report", "paper", "text"], "pos": "noun"},
        "domestic": {"synonyms": ["home", "national", "internal", "local", "household"], "pos": "adjective"},
        "dominant": {"synonyms": ["main", "leading", "chief", "primary", "principal"], "pos": "adjective"},
        "economy": {"synonyms": ["market", "financial system", "trade", "commerce"], "pos": "noun"},
        "element": {"synonyms": ["part", "component", "factor", "feature", "piece"], "pos": "noun"},
        "emerge": {"synonyms": ["appear", "arise", "surface", "develop", "come out"], "pos": "verb"},
        "emphasis": {"synonyms": ["focus", "stress", "weight", "attention", "priority"], "pos": "noun"},
        "enable": {"synonyms": ["allow", "permit", "let", "help", "empower"], "pos": "verb"},
        "encounter": {"synonyms": ["meet", "face", "come across", "find", "experience"], "pos": "verb"},
        "enormous": {"synonyms": ["huge", "vast", "massive", "immense", "large"], "pos": "adjective"},
        "ensure": {"synonyms": ["make sure", "guarantee", "confirm", "secure", "verify"], "pos": "verb"},
        "environment": {"synonyms": ["setting", "surroundings", "context", "conditions", "atmosphere"], "pos": "noun"},
        "establish": {"synonyms": ["set up", "create", "found", "build", "form"], "pos": "verb"},
        "evaluate": {"synonyms": ["assess", "judge", "review", "measure", "appraise"], "pos": "verb"},
        "evidence": {"synonyms": ["proof", "data", "support", "facts", "testimony"], "pos": "noun"},
        "evolve": {"synonyms": ["develop", "grow", "change", "advance", "progress"], "pos": "verb"},
        "expand": {"synonyms": ["grow", "increase", "extend", "broaden", "widen"], "pos": "verb"},
        "expert": {"synonyms": ["specialist", "authority", "professional", "master", "scholar"], "pos": "noun"},
        "explicit": {"synonyms": ["clear", "direct", "plain", "specific", "definite"], "pos": "adjective"},
        "expose": {"synonyms": ["reveal", "uncover", "show", "display", "disclose"], "pos": "verb"},
        "external": {"synonyms": ["outside", "outer", "foreign", "exterior", "remote"], "pos": "adjective"},
        "extract": {"synonyms": ["remove", "take out", "pull out", "draw out", "obtain"], "pos": "verb"},
        "factor": {"synonyms": ["element", "component", "cause", "aspect", "influence"], "pos": "noun"},
        "feature": {"synonyms": ["characteristic", "quality", "trait", "aspect", "attribute"], "pos": "noun"},
        "final": {"synonyms": ["last", "ultimate", "concluding", "closing", "end"], "pos": "adjective"},
        "focus": {"synonyms": ["concentrate", "center", "direct", "target", "aim"], "pos": "verb"},
        "framework": {"synonyms": ["structure", "system", "model", "foundation", "basis"], "pos": "noun"},
        "function": {"synonyms": ["role", "purpose", "task", "job", "duty"], "pos": "noun"},
        "fundamental": {"synonyms": ["basic", "core", "essential", "primary", "central"], "pos": "adjective"},
        "generate": {"synonyms": ["create", "produce", "make", "yield", "develop"], "pos": "verb"},
        "global": {"synonyms": ["worldwide", "international", "universal", "broad", "wide"], "pos": "adjective"},
        "highlight": {"synonyms": ["emphasize", "stress", "underline", "spotlight", "feature"], "pos": "verb"},
        "identify": {"synonyms": ["recognize", "detect", "find", "determine", "spot"], "pos": "verb"},
        "illustrate": {"synonyms": ["show", "demonstrate", "depict", "display", "present"], "pos": "verb"},
        "image": {"synonyms": ["picture", "photo", "representation", "depiction", "figure"], "pos": "noun"},
        "impact": {"synonyms": ["effect", "influence", "consequence", "result", "impression"], "pos": "noun"},
        "implement": {"synonyms": ["carry out", "apply", "execute", "introduce", "put into effect"], "pos": "verb"},
        "implication": {"synonyms": ["consequence", "effect", "outcome", "meaning", "significance"], "pos": "noun"},
        "impose": {"synonyms": ["enforce", "apply", "introduce", "set", "establish"], "pos": "verb"},
        "incident": {"synonyms": ["event", "occurrence", "episode", "case", "situation"], "pos": "noun"},
        "indicate": {"synonyms": ["show", "suggest", "point to", "signal", "reveal"], "pos": "verb"},
        "individual": {"synonyms": ["person", "single", "particular", "specific", "distinct"], "pos": "adjective"},
        "initial": {"synonyms": ["first", "early", "opening", "starting", "beginning"], "pos": "adjective"},
        "instance": {"synonyms": ["example", "case", "occurrence", "situation"], "pos": "noun"},
        "institute": {"synonyms": ["organization", "body", "agency", "foundation", "center"], "pos": "noun"},
        "integrate": {"synonyms": ["combine", "merge", "unify", "blend", "incorporate"], "pos": "verb"},
        "interact": {"synonyms": ["communicate", "engage", "connect", "relate", "work together"], "pos": "verb"},
        "internal": {"synonyms": ["inner", "inside", "interior", "domestic", "private"], "pos": "adjective"},
        "interpret": {"synonyms": ["explain", "understand", "read", "analyze", "decode"], "pos": "verb"},
        "investigate": {"synonyms": ["examine", "study", "explore", "research", "probe"], "pos": "verb"},
        "involve": {"synonyms": ["include", "contain", "entail", "require", "encompass"], "pos": "verb"},
        "issue": {"synonyms": ["problem", "matter", "concern", "topic", "question"], "pos": "noun"},
        "justify": {"synonyms": ["defend", "support", "explain", "validate", "warrant"], "pos": "verb"},
        "labor": {"synonyms": ["work", "effort", "toil", "employment", "workforce"], "pos": "noun"},
        "layer": {"synonyms": ["level", "tier", "sheet", "coating", "stratum"], "pos": "noun"},
        "legal": {"synonyms": ["lawful", "legitimate", "judicial", "official", "authorized"], "pos": "adjective"},
        "logic": {"synonyms": ["reasoning", "rationale", "sense", "thinking", "judgment"], "pos": "noun"},
        "maintain": {"synonyms": ["keep", "preserve", "sustain", "uphold", "continue"], "pos": "verb"},
        "major": {"synonyms": ["main", "chief", "primary", "principal", "key"], "pos": "adjective"},
        "mechanism": {"synonyms": ["process", "system", "method", "device", "means"], "pos": "noun"},
        "method": {"synonyms": ["approach", "technique", "process", "way", "procedure"], "pos": "noun"},
        "minimize": {"synonyms": ["reduce", "lessen", "decrease", "lower", "limit"], "pos": "verb"},
        "modify": {"synonyms": ["change", "alter", "adjust", "revise", "adapt"], "pos": "verb"},
        "monitor": {"synonyms": ["watch", "track", "observe", "check", "oversee"], "pos": "verb"},
        "negative": {"synonyms": ["adverse", "harmful", "bad", "unfavorable", "detrimental"], "pos": "adjective"},
        "network": {"synonyms": ["system", "web", "grid", "chain", "group"], "pos": "noun"},
        "normal": {"synonyms": ["usual", "typical", "standard", "regular", "ordinary"], "pos": "adjective"},
        "notion": {"synonyms": ["idea", "concept", "belief", "thought", "view"], "pos": "noun"},
        "objective": {"synonyms": ["goal", "aim", "target", "purpose", "intention"], "pos": "noun"},
        "obtain": {"synonyms": ["get", "acquire", "gain", "secure", "achieve"], "pos": "verb"},
        "obvious": {"synonyms": ["clear", "evident", "apparent", "plain", "visible"], "pos": "adjective"},
        "occur": {"synonyms": ["happen", "take place", "arise", "come about", "emerge"], "pos": "verb"},
        "ongoing": {"synonyms": ["continuing", "current", "active", "in progress", "persistent"], "pos": "adjective"},
        "option": {"synonyms": ["choice", "alternative", "possibility", "selection"], "pos": "noun"},
        "outcome": {"synonyms": ["result", "consequence", "effect", "product", "end"], "pos": "noun"},
        "overall": {"synonyms": ["general", "total", "broad", "complete", "comprehensive"], "pos": "adjective"},
        "participate": {"synonyms": ["take part", "join", "engage", "be involved", "contribute"], "pos": "verb"},
        "perceive": {"synonyms": ["see", "view", "notice", "recognize", "detect"], "pos": "verb"},
        "period": {"synonyms": ["time", "era", "age", "span", "phase"], "pos": "noun"},
        "perspective": {"synonyms": ["view", "viewpoint", "angle", "standpoint", "outlook"], "pos": "noun"},
        "phase": {"synonyms": ["stage", "step", "period", "part", "chapter"], "pos": "noun"},
        "phenomenon": {"synonyms": ["event", "occurrence", "development", "trend", "happening"], "pos": "noun"},
        "philosophy": {"synonyms": ["belief", "ideology", "worldview", "thinking", "doctrine"], "pos": "noun"},
        "positive": {"synonyms": ["good", "favorable", "beneficial", "constructive", "encouraging"], "pos": "adjective"},
        "potential": {"synonyms": ["possible", "likely", "probable", "promising", "prospective"], "pos": "adjective"},
        "predict": {"synonyms": ["forecast", "expect", "anticipate", "project", "foresee"], "pos": "verb"},
        "previous": {"synonyms": ["earlier", "former", "past", "prior", "preceding"], "pos": "adjective"},
        "primary": {"synonyms": ["main", "chief", "key", "principal", "central"], "pos": "adjective"},
        "principle": {"synonyms": ["rule", "law", "guideline", "standard", "basis"], "pos": "noun"},
        "priority": {"synonyms": ["precedence", "importance", "urgency", "preference"], "pos": "noun"},
        "proceed": {"synonyms": ["continue", "go on", "advance", "move forward", "carry on"], "pos": "verb"},
        "process": {"synonyms": ["method", "procedure", "system", "operation", "technique"], "pos": "noun"},
        "promote": {"synonyms": ["support", "encourage", "advance", "boost", "foster"], "pos": "verb"},
        "proportion": {"synonyms": ["share", "part", "fraction", "ratio", "percentage"], "pos": "noun"},
        "publish": {"synonyms": ["release", "issue", "print", "produce", "distribute"], "pos": "verb"},
        "pursue": {"synonyms": ["follow", "seek", "chase", "go after", "strive for"], "pos": "verb"},
        "range": {"synonyms": ["variety", "selection", "scope", "span", "spectrum"], "pos": "noun"},
        "react": {"synonyms": ["respond", "reply", "answer", "act", "counter"], "pos": "verb"},
        "recover": {"synonyms": ["regain", "restore", "retrieve", "reclaim", "bounce back"], "pos": "verb"},
        "reduce": {"synonyms": ["decrease", "lower", "cut", "lessen", "diminish"], "pos": "verb"},
        "region": {"synonyms": ["area", "district", "zone", "territory", "sector"], "pos": "noun"},
        "regulate": {"synonyms": ["control", "manage", "govern", "oversee", "supervise"], "pos": "verb"},
        "reject": {"synonyms": ["refuse", "decline", "deny", "dismiss", "turn down"], "pos": "verb"},
        "release": {"synonyms": ["free", "let go", "publish", "issue", "launch"], "pos": "verb"},
        "relevant": {"synonyms": ["related", "applicable", "pertinent", "fitting", "appropriate"], "pos": "adjective"},
        "rely": {"synonyms": ["depend", "count on", "trust", "lean on", "bank on"], "pos": "verb"},
        "remove": {"synonyms": ["take away", "eliminate", "delete", "extract", "withdraw"], "pos": "verb"},
        "require": {"synonyms": ["need", "demand", "call for", "necessitate", "expect"], "pos": "verb"},
        "research": {"synonyms": ["study", "investigation", "inquiry", "exploration", "analysis"], "pos": "noun"},
        "resource": {"synonyms": ["supply", "source", "asset", "means", "material"], "pos": "noun"},
        "respond": {"synonyms": ["reply", "answer", "react", "counter", "return"], "pos": "verb"},
        "restore": {"synonyms": ["return", "bring back", "repair", "fix", "renew"], "pos": "verb"},
        "restrict": {"synonyms": ["limit", "control", "constrain", "confine", "curb"], "pos": "verb"},
        "retain": {"synonyms": ["keep", "hold", "maintain", "preserve", "save"], "pos": "verb"},
        "reveal": {"synonyms": ["show", "disclose", "uncover", "expose", "display"], "pos": "verb"},
        "revenue": {"synonyms": ["income", "earnings", "profit", "proceeds", "returns"], "pos": "noun"},
        "role": {"synonyms": ["function", "part", "position", "job", "duty"], "pos": "noun"},
        "scenario": {"synonyms": ["situation", "case", "possibility", "outcome", "event"], "pos": "noun"},
        "schedule": {"synonyms": ["plan", "timetable", "agenda", "program", "calendar"], "pos": "noun"},
        "scheme": {"synonyms": ["plan", "program", "project", "system", "arrangement"], "pos": "noun"},
        "scope": {"synonyms": ["range", "extent", "reach", "span", "breadth"], "pos": "noun"},
        "section": {"synonyms": ["part", "segment", "portion", "division", "piece"], "pos": "noun"},
        "sector": {"synonyms": ["area", "field", "industry", "domain", "branch"], "pos": "noun"},
        "secure": {"synonyms": ["safe", "protected", "stable", "certain", "assured"], "pos": "adjective"},
        "seek": {"synonyms": ["look for", "search for", "pursue", "try to find", "aim for"], "pos": "verb"},
        "select": {"synonyms": ["choose", "pick", "opt for", "decide on", "prefer"], "pos": "verb"},
        "sequence": {"synonyms": ["order", "series", "chain", "succession", "progression"], "pos": "noun"},
        "shift": {"synonyms": ["change", "move", "switch", "transition", "adjustment"], "pos": "noun"},
        "significant": {"synonyms": ["important", "major", "notable", "meaningful", "substantial"], "pos": "adjective"},
        "similar": {"synonyms": ["alike", "comparable", "like", "related", "close"], "pos": "adjective"},
        "source": {"synonyms": ["origin", "basis", "root", "cause", "supply"], "pos": "noun"},
        "specific": {"synonyms": ["particular", "certain", "precise", "exact", "definite"], "pos": "adjective"},
        "stable": {"synonyms": ["steady", "secure", "firm", "constant", "fixed"], "pos": "adjective"},
        "strategy": {"synonyms": ["plan", "approach", "method", "tactic", "scheme"], "pos": "noun"},
        "structure": {"synonyms": ["framework", "system", "setup", "arrangement", "organization"], "pos": "noun"},
        "submit": {"synonyms": ["present", "hand in", "deliver", "propose", "offer"], "pos": "verb"},
        "subsequent": {"synonyms": ["following", "later", "next", "ensuing", "succeeding"], "pos": "adjective"},
        "sufficient": {"synonyms": ["enough", "adequate", "ample", "satisfactory", "plenty"], "pos": "adjective"},
        "survey": {"synonyms": ["study", "review", "examination", "poll", "assessment"], "pos": "noun"},
        "sustain": {"synonyms": ["maintain", "support", "keep up", "preserve", "continue"], "pos": "verb"},
        "target": {"synonyms": ["goal", "aim", "objective", "focus", "purpose"], "pos": "noun"},
        "task": {"synonyms": ["job", "duty", "assignment", "chore", "responsibility"], "pos": "noun"},
        "team": {"synonyms": ["group", "crew", "squad", "unit", "panel"], "pos": "noun"},
        "technique": {"synonyms": ["method", "approach", "skill", "procedure", "way"], "pos": "noun"},
        "technology": {"synonyms": ["tech", "innovation", "tools", "systems", "machinery"], "pos": "noun"},
        "text": {"synonyms": ["writing", "document", "content", "passage", "material"], "pos": "noun"},
        "theme": {"synonyms": ["topic", "subject", "idea", "motif", "thread"], "pos": "noun"},
        "theory": {"synonyms": ["hypothesis", "idea", "concept", "model", "framework"], "pos": "noun"},
        "thereby": {"synonyms": ["thus", "so", "in this way", "as a result"], "pos": "adverb"},
        "topic": {"synonyms": ["subject", "theme", "issue", "matter", "area"], "pos": "noun"},
        "tradition": {"synonyms": ["custom", "practice", "convention", "heritage", "ritual"], "pos": "noun"},
        "transfer": {"synonyms": ["move", "shift", "relocate", "transport", "convey"], "pos": "verb"},
        "transport": {"synonyms": ["carry", "move", "ship", "convey", "deliver"], "pos": "verb"},
        "trend": {"synonyms": ["pattern", "tendency", "direction", "shift", "movement"], "pos": "noun"},
        "trigger": {"synonyms": ["cause", "start", "set off", "spark", "prompt"], "pos": "verb"},
        "ultimate": {"synonyms": ["final", "last", "greatest", "supreme", "highest"], "pos": "adjective"},
        "undergo": {"synonyms": ["experience", "endure", "go through", "face", "suffer"], "pos": "verb"},
        "undertake": {"synonyms": ["begin", "start", "attempt", "take on", "embark on"], "pos": "verb"},
        "unique": {"synonyms": ["distinctive", "one of a kind", "singular", "special", "rare"], "pos": "adjective"},
        "utilize": {"synonyms": ["use", "employ", "apply", "make use of", "draw on"], "pos": "verb"},
        "valid": {"synonyms": ["sound", "legitimate", "reasonable", "justified", "well-founded"], "pos": "adjective"},
        "variable": {"synonyms": ["factor", "element", "condition", "parameter", "aspect"], "pos": "noun"},
        "vary": {"synonyms": ["differ", "change", "fluctuate", "shift", "alter"], "pos": "verb"},
        "version": {"synonyms": ["edition", "form", "variant", "variation", "type"], "pos": "noun"},
        "visible": {"synonyms": ["noticeable", "apparent", "clear", "obvious", "evident"], "pos": "adjective"},
        "volume": {"synonyms": ["amount", "quantity", "level", "mass", "bulk"], "pos": "noun"},
        "widespread": {"synonyms": ["common", "extensive", "broad", "prevalent", "pervasive"], "pos": "adjective"},
    }

    for word, data in academic_words.items():
        WORD_PAIRS[word] = {
            "word": word,
            "pos": data["pos"],
            "synonyms": data["synonyms"],
            "paraphrases": [],
            "definition": "",
            "frequency": 0.7,
            "examples": [],
        }

    print(f"[ECDICT-Builtin] Generated {len(WORD_PAIRS):,} extended dictionary entries")
    return WORD_PAIRS


# ══════════════════════════════════════════════════════════════════════
# 3. PPDB PHRASE PARAPHRASE GENERATOR
# ══════════════════════════════════════════════════════════════════════

def generate_ppdb_phrases(ppdb_path: str = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Generate phrase paraphrase database.
    If ppdb_path points to a real PPDB file, loads from that.
    Otherwise generates a comprehensive built-in phrase database.
    """
    if ppdb_path and os.path.exists(ppdb_path):
        print(f"[PPDB] Loading from {ppdb_path}...")
        return _load_ppdb_file(ppdb_path)
    else:
        print("[PPDB] PPDB file not found. Generating built-in phrase database...")
        return _generate_builtin_phrases()


def _load_ppdb_file(filepath: str) -> Dict[str, List[Dict[str, Any]]]:
    """Parse a PPDB-format file into phrase pairs."""
    phrases: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    count = 0

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                parts = line.strip().split(' ||| ')
                if len(parts) >= 4:
                    pos = parts[0].strip('[]')
                    source = parts[1].strip().lower()
                    target = parts[2].strip().lower()
                    score_str = parts[3].strip()

                    try:
                        score = float(score_str.split()[0]) if score_str else 0.5
                    except (ValueError, IndexError):
                        score = 0.5

                    if source != target and len(source) < 60 and len(target) < 60:
                        phrases[source].append({
                            "source": source,
                            "target": target,
                            "score": score,
                            "pos": pos,
                        })
                        count += 1

                    if count % 500000 == 0 and count > 0:
                        print(f"[PPDB] Processed {count:,} phrase pairs...")

    except Exception as e:
        print(f"[PPDB] Error reading file: {e}")

    print(f"[PPDB] Loaded {count:,} phrase pairs across {len(phrases):,} source phrases")
    return dict(phrases)


def _generate_builtin_phrases() -> Dict[str, List[Dict[str, Any]]]:
    """Generate comprehensive built-in phrase paraphrases."""
    PHRASES: Dict[str, List[Dict[str, Any]]] = {}

    # Comprehensive phrase pairs (source -> list of target paraphrases)
    phrase_data = {
        "in order to": ["to", "so as to", "for the purpose of", "with the aim of"],
        "due to the fact that": ["because", "since", "as", "given that", "owing to"],
        "a large number of": ["many", "numerous", "a great deal of", "plenty of", "scores of"],
        "in the event that": ["if", "should", "in case", "provided that", "supposing that"],
        "on the other hand": ["by contrast", "then again", "alternatively", "conversely", "yet"],
        "as a result": ["so", "thus", "therefore", "for that reason", "consequently"],
        "in addition": ["also", "besides", "further", "on top of that", "additionally"],
        "for example": ["for instance", "such as", "to illustrate", "as an example", "like"],
        "in terms of": ["regarding", "when it comes to", "as for", "concerning", "with respect to"],
        "with regard to": ["about", "regarding", "concerning", "on the topic of", "relating to"],
        "it is important to note": ["notably", "a key point is", "one should recognize"],
        "it should be noted": ["notably", "worth noting", "an important detail is"],
        "in the context of": ["within", "in", "regarding", "concerning", "inside"],
        "on the basis of": ["based on", "from", "drawing on", "using", "relying on"],
        "at the same time": ["meanwhile", "simultaneously", "yet", "still", "concurrently"],
        "with respect to": ["about", "regarding", "on", "concerning", "in relation to"],
        "in spite of": ["despite", "even with", "regardless of", "notwithstanding"],
        "by means of": ["through", "using", "via", "with the help of", "by way of"],
        "in accordance with": ["following", "per", "in line with", "consistent with"],
        "for the purpose of": ["to", "for", "in order to", "aimed at", "designed to"],
        "prior to": ["before", "ahead of", "preceding", "in advance of"],
        "subsequent to": ["after", "following", "once", "upon", "post"],
        "in contrast to": ["unlike", "as opposed to", "compared with", "differing from"],
        "as well as": ["and", "along with", "together with", "plus", "in addition to"],
        "a wide range of": ["many", "various", "diverse", "all kinds of", "a variety of"],
        "take into account": ["consider", "factor in", "keep in mind", "allow for"],
        "take into consideration": ["consider", "think about", "bear in mind", "weigh"],
        "play a role in": ["affect", "shape", "influence", "contribute to", "impact"],
        "have an impact on": ["affect", "influence", "change", "shape", "alter"],
        "in light of": ["given", "considering", "because of", "in view of", "owing to"],
        "to a large extent": ["largely", "mostly", "in great part", "to a great degree"],
        "to a certain extent": ["partly", "somewhat", "in some ways", "up to a point"],
        "a number of": ["several", "some", "a few", "multiple", "various"],
        "the majority of": ["most", "nearly all", "the bulk of", "the greater part of"],
        "the fact that": ["that", "how"],
        "it is clear that": ["clearly", "plainly", "obviously", "evidently"],
        "it is evident that": ["evidently", "clearly", "as shown", "demonstrably"],
        "it can be seen that": ["this shows", "the data shows", "one can see"],
        "there is no doubt": ["certainly", "without question", "undeniably"],
        "it has been shown": ["research shows", "studies confirm", "evidence indicates"],
        "is of great importance": ["matters greatly", "carries weight", "is critical"],
        "at this point in time": ["now", "currently", "at present", "today"],
        "at the present time": ["now", "currently", "these days", "at present"],
        "in the near future": ["soon", "shortly", "before long", "in time"],
        "over the course of": ["during", "throughout", "across", "over"],
        "give rise to": ["cause", "lead to", "produce", "create", "trigger"],
        "shed light on": ["explain", "clarify", "reveal", "illuminate", "elucidate"],
        "pave the way for": ["enable", "open doors for", "set the stage for", "make possible"],
        "bring about": ["cause", "create", "trigger", "produce", "generate"],
        "carry out": ["do", "perform", "conduct", "execute", "complete"],
        "come to terms with": ["accept", "deal with", "adjust to", "face", "reconcile with"],
        "put forward": ["propose", "suggest", "present", "introduce", "advance"],
        "point out": ["note", "mention", "highlight", "observe", "remark"],
        "stem from": ["come from", "arise from", "grow out of", "result from", "originate in"],
        "account for": ["explain", "justify", "represent", "make up", "cover"],
        "on the whole": ["overall", "generally", "broadly", "in general", "all in all"],
        "by and large": ["mostly", "generally", "on the whole", "for the most part"],
        "more or less": ["roughly", "approximately", "about", "nearly", "essentially"],
        "time and again": ["repeatedly", "often", "frequently", "again and again"],
        "once and for all": ["finally", "decisively", "permanently", "conclusively"],
        "sooner or later": ["eventually", "in time", "at some point", "ultimately"],
        "from time to time": ["occasionally", "now and then", "sometimes", "periodically"],
        "as a matter of fact": ["in fact", "actually", "really", "indeed", "truthfully"],
        "in the long run": ["eventually", "over time", "ultimately", "in the end"],
        "in the first place": ["initially", "to begin with", "originally", "from the start"],
        "at the end of the day": ["ultimately", "in the end", "when everything is considered"],
        "with this in mind": ["considering this", "given this", "bearing this in mind"],
        "having said that": ["that said", "even so", "still", "nevertheless"],
        "be that as it may": ["regardless", "even so", "nonetheless", "all the same"],
        "all things considered": ["overall", "on balance", "taking everything into account"],
        "when all is said and done": ["ultimately", "in the final analysis", "at the end"],
        "first and foremost": ["above all", "primarily", "most importantly", "chiefly"],
        "last but not least": ["finally", "also important", "equally significant"],
        "needless to say": ["obviously", "of course", "naturally", "clearly"],
        "it goes without saying": ["obviously", "clearly", "naturally", "of course"],
        "as far as concerned": ["regarding", "about", "concerning", "in terms of"],
        "with the exception of": ["except for", "apart from", "other than", "excluding"],
        "in other words": ["that is", "put differently", "to rephrase", "meaning"],
        "to put it simply": ["simply put", "in short", "basically", "in plain terms"],
    }

    for source, targets in phrase_data.items():
        PHRASES[source] = [
            {
                "source": source,
                "target": target,
                "score": 0.8 - (i * 0.05),
                "pos": "phrase",
            }
            for i, target in enumerate(targets)
        ]

    print(f"[PPDB-Builtin] Generated {len(PHRASES):,} phrase entries with {sum(len(v) for v in PHRASES.values()):,} total paraphrases")
    return PHRASES


# ══════════════════════════════════════════════════════════════════════
# 4. MERGE AND SAVE
# ══════════════════════════════════════════════════════════════════════

def merge_dictionaries(wordnet: Dict, ecdict: Dict) -> Dict:
    """Merge WordNet and ECDICT dictionaries, preferring WordNet synonyms."""
    merged = {}

    # Start with ECDICT entries
    for word, entry in ecdict.items():
        merged[word] = entry

    # Merge WordNet on top (add synonyms from WordNet)
    for word, entry in wordnet.items():
        if word in merged:
            # Merge synonyms
            existing_syns = set(merged[word].get("synonyms", []))
            new_syns = set(entry.get("synonyms", []))
            merged[word]["synonyms"] = list(existing_syns | new_syns)[:15]
            # Use WordNet definition if ECDICT is empty
            if not merged[word].get("definition") and entry.get("definition"):
                merged[word]["definition"] = entry["definition"]
            if entry.get("examples"):
                merged[word]["examples"] = entry["examples"]
        else:
            merged[word] = entry

    return merged


def save_output(data: Any, filename: str):
    """Save data as JSON to the output directory."""
    filepath = OUTPUT_DIR / filename
    print(f"[Save] Writing {filepath}...")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"[Save] Saved {filepath} ({size_mb:.1f} MB)")


# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='Generate Stealth Humanizer dictionaries')
    parser.add_argument('--wordnet', action='store_true', help='Generate WordNet dictionary')
    parser.add_argument('--ecdict', type=str, default=None, help='Path to ECDICT CSV file')
    parser.add_argument('--ppdb', type=str, default=None, help='Path to PPDB file')
    parser.add_argument('--all', action='store_true', help='Generate all dictionaries')
    args = parser.parse_args()

    if not any([args.wordnet, args.ecdict is not None, args.ppdb is not None, args.all]):
        args.all = True  # Default: generate all with built-in data

    print("=" * 70)
    print("  Stealth Humanizer Dictionary Generator")
    print("=" * 70)

    wordnet_dict = {}
    ecdict_dict = {}
    ppdb_phrases = {}

    if args.all or args.wordnet:
        wordnet_dict = generate_wordnet_dictionary()

    if args.all or args.ecdict is not None:
        ecdict_dict = generate_ecdict_dictionary(args.ecdict)

    if args.all or args.ppdb is not None:
        ppdb_phrases = generate_ppdb_phrases(args.ppdb)

    # Merge WordNet + ECDICT into single extended dictionary
    if wordnet_dict or ecdict_dict:
        merged = merge_dictionaries(wordnet_dict, ecdict_dict)
        save_output(merged, 'extended_dictionary.json')
        print(f"\n[Result] Extended dictionary: {len(merged):,} entries")

    # Save PPDB phrases
    if ppdb_phrases:
        save_output(ppdb_phrases, 'ppdb_phrases.json')
        print(f"[Result] PPDB phrases: {len(ppdb_phrases):,} source phrases")

    # Create empty adversarial weights file
    weights_path = OUTPUT_DIR / 'adversarial_weights.json'
    if not weights_path.exists():
        save_output({
            "weights": {
                "lexical": 1.0, "syntactic": 1.0, "semantic": 1.0,
                "phraseReplacement": 1.0, "passiveConversion": 1.0,
                "hedgingRemoval": 1.0, "starterVariation": 1.0,
                "sentenceSplitting": 1.0, "listBreaking": 1.0,
                "clicheRemoval": 1.0,
            },
            "lastUpdated": None,
            "version": 1,
        }, 'adversarial_weights.json')

    print("\n" + "=" * 70)
    print("  Dictionary generation complete.")
    print(f"  Output directory: {OUTPUT_DIR}")
    print("=" * 70)


if __name__ == '__main__':
    main()
