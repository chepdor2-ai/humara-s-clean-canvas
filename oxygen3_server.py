#!/usr/bin/env python3
"""
Oxygen 3.0 Model Server — Full Multi-Phase Hybrid Humanizer
=============================================================

This is NOT a bare T5 paraphraser. It uses the fine-tuned T5 model as Phase 1,
then runs 5 additional rule-based humanization phases to ensure the output
reads like genuinely human-written text — not just "clean AI."

Architecture (6 phases per sentence):
  Phase 1: T5 beam-search paraphrase (sentence-by-sentence, greedy/beam only)
  Phase 2: AI word kill + filler cuts + starter diversification
  Phase 3: Structural variance (clause fronting, sentence splitting)
  Phase 4: Deep synonym replacement + heavy rewriting (if below threshold)
  Phase 5: Grammar fixes for T5 artifacts
  Phase 6: Quality gate — enforce min change ratio with retry loop

Key findings from model testing:
  - Greedy (no prefix): produces coherent paraphrases
  - Beam=4: higher change and coherent
  - Sampling at ANY temperature: produces garbage/hallucinated text
  => NEVER use sampling (do_sample=True) with this model.
  => ALWAYS use greedy or beam search.
"""
import logging
import os
import re
import random
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import torch

# Use all available CPU cores for inference
torch.set_num_threads(os.cpu_count() or 4)
torch.set_num_interop_threads(1)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, T5ForConditionalGeneration

# Import validation module
from validation_post_process import validate_and_repair_output

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Model Config ──
MODEL_DIR = os.environ.get("OXYGEN3_MODEL_DIR", "oxygen3-model")
HF_MODEL_REPO = os.environ.get("HF_MODEL_REPO", "maguna956/oxygen3-humanizer")
device = "cuda" if torch.cuda.is_available() else "cpu"
model: T5ForConditionalGeneration | None = None
tokenizer: AutoTokenizer | None = None

# Thread pool for parallel sentence processing
_sentence_pool = ThreadPoolExecutor(max_workers=2)


def load_model():
    """Load the fine-tuned Oxygen 3.0 model."""
    global model, tokenizer
    if os.path.exists(MODEL_DIR) and os.path.exists(os.path.join(MODEL_DIR, "model.safetensors")):
        source = MODEL_DIR
        logger.info(f"Loading Oxygen 3.0 from local {MODEL_DIR}...")
        tokenizer = AutoTokenizer.from_pretrained(source, local_files_only=True)
        model = T5ForConditionalGeneration.from_pretrained(
            source, local_files_only=True, torch_dtype=torch.float32,
        ).to(device)
    else:
        source = HF_MODEL_REPO
        logger.info(f"Local model not found — downloading from HF Hub: {source}...")
        tokenizer = AutoTokenizer.from_pretrained(source)
        model = T5ForConditionalGeneration.from_pretrained(
            source, torch_dtype=torch.float32,
        ).to(device)
    model.eval()
    n = sum(p.numel() for p in model.parameters())
    logger.info(f"Oxygen 3.0 loaded: {n:,} params on {device} from {source}")


# ══════════════════════════════════════════════════════════════════
# Tense-aware replacement helpers
# ══════════════════════════════════════════════════════════════════

_IRREGULAR_PAST = {
    "give": "gave", "make": "made", "deal": "dealt", "build": "built",
    "set": "set", "take": "took", "go": "went", "see": "saw",
    "run": "ran", "get": "got", "put": "put", "let": "let",
    "keep": "kept", "hold": "held", "tell": "told", "find": "found",
    "have": "had", "do": "did", "say": "said", "come": "came",
    "show": "showed", "prove": "proved", "drive": "drove",
}


def _inflect_verb(word: str, form: str) -> str:
    if form == "base":
        return word
    w = word.lower()
    if form == "past":
        if w in _IRREGULAR_PAST:
            return _IRREGULAR_PAST[w]
        if w.endswith("e"):
            return w + "d"
        if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
            return w[:-1] + "ied"
        return w + "ed"
    if form == "3sg":
        if w.endswith(("sh", "ch", "x", "z", "ss")):
            return w + "es"
        if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
            return w[:-1] + "ies"
        return w + "s"
    if form == "gerund":
        if w.endswith("ie"):
            return w[:-2] + "ying"
        if w.endswith("e") and not w.endswith("ee"):
            return w[:-1] + "ing"
        return w + "ing"
    return word


def _detect_verb_form(word: str) -> str:
    w = word.lower().rstrip()
    if w.endswith("ing"):
        return "gerund"
    if w.endswith("ly") and len(w) > 4:
        return "adverb"
    if w.endswith("ied") or w.endswith("ed"):
        return "past"
    if w.endswith("d") and len(w) > 3 and w[-2] == "e":
        return "past"
    if w.endswith("es") and not w.endswith(("ness", "less")):
        return "3sg"
    if w.endswith("s") and not w.endswith(("ss", "us", "is", "ous", "ness")):
        return "3sg"
    return "base"


def _match_form(matched: str, replacement: str) -> str:
    form = _detect_verb_form(matched)
    if form == "base":
        return replacement
    rep_form = _detect_verb_form(replacement.split(" ", 1)[0])
    if rep_form == form:
        return replacement
    if form == "adverb" and not replacement.endswith("ly"):
        return replacement + "ly"
    if form in ("past", "3sg", "gerund"):
        parts = replacement.split(" ", 1)
        inflected = _inflect_verb(parts[0], form)
        return inflected + (" " + parts[1] if len(parts) > 1 else "")
    return replacement


# ══════════════════════════════════════════════════════════════════
# Phase 2: AI Word Kill + Filler Cuts + Starter Diversification
# ══════════════════════════════════════════════════════════════════

AI_WORD_KILLS: list[tuple[str, str]] = [
    # Multi-word phrases first
    (r"\bit is important to note that\b", "worth noting,"),
    (r"\bit is worth noting that\b", "notably,"),
    (r"\bin today'?s rapidly evolving\b", "in the current"),
    (r"\bin the realm of\b", "in"),
    (r"\bin the context of\b", "regarding"),
    (r"\bplays a (?:crucial|vital|pivotal) role\b", "matters greatly"),
    (r"\bserves as a\b", "acts as a"),
    (r"\bit should be noted that\b", "note that"),
    (r"\bthis suggests that\b", "this means"),
    (r"\bthe fact that\b", "that"),
    (r"\bin order to\b", "to"),
    (r"\ba wide range of\b", "many"),
    (r"\ba growing body of\b", "increasing"),
    (r"\bas a result of\b", "because of"),
    (r"\bin light of\b", "given"),
    (r"\bwith respect to\b", "about"),
    (r"\bon the other hand\b", "yet"),
    (r"\bin addition to\b", "besides"),
    (r"\bin terms of\b", "regarding"),
    (r"\bdue to the fact that\b", "because"),
    (r"\bfor the purpose of\b", "to"),
    (r"\bdespite the fact that\b", "even though"),
    # Single-word AI markers
    (r"\butilize[sd]?\b", "use"),
    (r"\butilizing\b", "using"),
    (r"\bleverage[sd]?\b", "use"),
    (r"\bleveraging\b", "using"),
    (r"\bfacilitate[sd]?\b", "help"),
    (r"\bfacilitating\b", "helping"),
    (r"\bmoreover\b", "also"),
    (r"\bfurthermore\b", "also"),
    (r"\bnevertheless\b", "still"),
    (r"\bnonetheless\b", "still"),
    (r"\bconsequently\b", "so"),
    (r"\bsubsequently\b", "then"),
    (r"\badditionally\b", "also"),
    (r"\bpivotal\b", "key"),
    (r"\bcrucial\b", "important"),
    (r"\bunderscores?\b", "highlight"),
    (r"\bunderscoring\b", "highlighting"),
    (r"\bdelve[sd]?\b", "explore"),
    (r"\bdelving\b", "exploring"),
    (r"\bcommence[sd]?\b", "start"),
    (r"\bcommencing\b", "starting"),
    (r"\bdemonstrate[sd]?\b", "show"),
    (r"\bdemonstrating\b", "showing"),
    (r"\benchance[sd]?\b", "improve"),
    (r"\benchancing\b", "improving"),
    (r"\benhancement\b", "improvement"),
    (r"\bimplementation\b", "use"),
    (r"\btransformative\b", "major"),
    (r"\bholistic\b", "complete"),
    (r"\bparadigm\b", "model"),
    (r"\bsynergy\b", "cooperation"),
    (r"\brobust\b", "strong"),
    (r"\bseamless(?:ly)?\b", "smooth"),
    (r"\binnovative\b", "new"),
    (r"\bcutting-edge\b", "modern"),
    (r"\bgroundbreaking\b", "new"),
    (r"\bcomprehensive\b", "thorough"),
    (r"\bmultifaceted\b", "complex"),
    (r"\bintricate\b", "complex"),
    (r"\bplethora\b", "many"),
    (r"\bmyriad\b", "many"),
    (r"\bundeniably\b", "clearly"),
    (r"\bindeed\b", "in fact"),
    (r"\bexemplif(?:y|ies|ied)\b", "show"),
    (r"\bexemplifying\b", "showing"),
    (r"\bmeticulous(?:ly)?\b", "careful"),
    (r"\bprofound(?:ly)?\b", "deep"),
    (r"\bencompass(?:es|ed|ing)?\b", "include"),
    (r"\boverarch(?:ing)?\b", "broad"),
    (r"\bdramatically\b", "greatly"),
    (r"\bnotably\b", "especially"),
    (r"\bremarkab(?:le|ly)\b", "striking"),
    (r"\bexponential(?:ly)?\b", "rapid"),
    (r"\blandscape\b", "scene"),
    (r"\becosystem\b", "network"),
    (r"\bframework\b", "structure"),
    (r"\btrajectory\b", "path"),
    (r"\bparadigm shift\b", "major change"),
]

AI_STARTERS = [
    r"^(In conclusion,?)\s",
    r"^(Overall,?)\s",
    r"^(To summarize,?)\s",
    r"^(In summary,?)\s",
    r"^(As (?:we|one) can see,?)\s",
    r"^(It is (?:clear|evident|apparent) that)\s",
    r"^(This (?:essay|paper|analysis) (?:has|will))\s",
]

HUMAN_STARTERS = [
    "Looking at this,", "From what we see,", "Putting it together,",
    "The picture here is that", "Taking stock,", "All things considered,",
    "Stepping back,", "At the end of the day,", "When we add it all up,",
]

FILLER_CUTS = [
    (r"\s*,\s*however\s*,\s*", " but "),
    (r"\s*,\s*therefore\s*,\s*", ", so "),
    (r"\s*,\s*thus\s*,\s*", ", so "),
    (r"\bregardless of the fact that\b", "even though"),
    (r"\bthe notion that\b", "the idea that"),
    (r"\bthe concept of\b", "the idea of"),
]


def apply_ai_word_kill(text: str) -> str:
    for pattern, replacement in AI_WORD_KILLS:
        text = re.sub(pattern, lambda m: _match_form(m.group(), replacement), text, flags=re.IGNORECASE)
    return text


def apply_filler_cuts(text: str) -> str:
    for pattern, replacement in FILLER_CUTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def diversify_starters(text: str) -> str:
    for pattern in AI_STARTERS:
        if re.search(pattern, text, re.IGNORECASE):
            replacement = random.choice(HUMAN_STARTERS)
            text = re.sub(pattern, replacement + " ", text, flags=re.IGNORECASE)
            break
    return text


# ══════════════════════════════════════════════════════════════════
# Phase 4: Deep Synonym Replacement
# ══════════════════════════════════════════════════════════════════

DEEP_SYNONYMS: list[tuple[str, list[str]]] = [
    (r"\btransformed\b", ["changed", "reshaped", "altered", "shifted"]),
    (r"\bsignificantly\b", ["greatly", "notably", "markedly", "considerably"]),
    (r"\badvancements\b", ["progress", "developments", "improvements", "strides"]),
    (r"\balgorithms\b", ["methods", "processes", "techniques", "approaches"]),
    (r"\bdisciplines?\b", ["fields", "areas", "branches", "domains"]),
    (r"\bintegration\b", ["adoption", "incorporation", "blending", "merging"]),
    (r"\brequires?\b", ["need", "call for", "demand", "take"]),
    (r"\brequired\b", ["needed", "called for", "demanded", "took"]),
    (r"\bapproach\b", ["strategy", "method", "plan"]),
    (r"\bensure\b", ["guarantee", "make sure", "confirm", "verify"]),
    (r"\badoption\b", ["uptake", "acceptance", "embrace", "rollout"]),
    (r"\boutcomes?\b", ["results", "findings", "effects", "impacts"]),
    (r"\bimpact\b", ["effect", "influence"]),
    (r"\bsystems?\b", ["setups", "structures", "platforms"]),
    (r"\btechnology\b", ["tech", "digital tooling", "modern solution"]),
    (r"\btechnologies\b", ["digital tools", "modern tools", "current tools"]),
    (r"\btechnological\b", ["digital", "modern", "current", "technical"]),
    (r"\bprovides?\b", ["offer", "give", "supply", "deliver"]),
    (r"\bprovided\b", ["offered", "gave", "supplied", "delivered"]),
    (r"\bproviding\b", ["offering", "giving", "supplying"]),
    (r"\bchallenges?\b", ["problems", "hurdles", "issues", "difficulties"]),
    (r"\beffectively\b", ["usefully", "in practice", "successfully", "well"]),
    (r"\beffective\b", ["useful", "practical", "successful", "working"]),
    (r"\bsubstantially\b", ["largely", "to a great extent", "considerably"]),
    (r"\bsubstantial\b", ["large", "major", "big", "sizable"]),
    (r"\bconsiderable\b", ["major", "large", "notable", "real"]),
    (r"\bimportant\b", ["key", "central", "significant", "vital"]),
    (r"\bessentially\b", ["at its core", "in essence", "basically", "really"]),
    (r"\bessential\b", ["key", "needed", "critical", "required"]),
    (r"\bvarious\b", ["several", "different", "a number of", "assorted"]),
    (r"\bnumerous\b", ["many", "several", "a lot of", "plenty of"]),
    (r"\bspecifically\b", ["in particular", "namely", "to be precise"]),
    (r"\bimproves?\b", ["betters", "boosts", "raises", "lifts"]),
    (r"\bimproved\b", ["bettered", "boosted", "raised", "lifted"]),
    (r"\bimproving\b", ["bettering", "boosting", "raising"]),
    (r"\bbenefits?\b", ["gains", "advantages", "perks", "upsides"]),
    (r"\bfundamentally\b", ["basically", "at its core", "at a deep level"]),
    (r"\bfundamental\b", ["basic", "core", "central"]),
    (r"\baddress(?:es)?\b", ["tackle", "handle", "deal with", "confront"]),
    (r"\baddressed\b", ["tackled", "handled", "dealt with", "confronted"]),
    (r"\baddressing\b", ["tackling", "handling", "dealing with", "confronting"]),
    (r"\bmethods?\b", ["ways", "techniques", "means", "strategies"]),
    (r"\banalysi[sz]\b", ["study", "review", "examination", "assessment"]),
    (r"\bresearch\b", ["study", "investigation", "work", "inquiry"]),
    (r"\bconsequences?\b", ["effects", "results", "impacts", "fallout"]),
    (r"\bestablish(?:es)?\b", ["set up", "create", "form", "build"]),
    (r"\bestablished\b", ["set up", "created", "formed", "built"]),
    (r"\bestablishing\b", ["setting up", "creating", "forming", "building"]),
    (r"\bsignificant\b", ["major", "notable", "meaningful", "real"]),
    (r"\bmodern\b", ["current", "present-day", "recent"]),
    (r"\bacross\b", ["throughout", "over", "spanning", "covering"]),
    (r"\bfocuses\b", ["centers on", "concentrates on", "zeroes in on"]),
    (r"\bfocused\b", ["centered", "concentrated", "zeroed in"]),
    (r"\bfocusing\b", ["centering", "concentrating", "zeroing in"]),
    (r"\bdemonstrates?\b", ["show", "reveal", "prove", "make clear"]),
    (r"\bdemonstrated\b", ["showed", "revealed", "proved", "made clear"]),
    (r"\bdemonstrating\b", ["showing", "revealing", "proving", "making clear"]),
    (r"\bcapabilit(?:y|ies)\b", ["ability", "skill", "power", "capacity"]),
    (r"\bprocesses\b", ["handles", "manages", "works through", "deals with"]),
    (r"\bprocessed\b", ["handled", "managed", "worked through", "dealt with"]),
    (r"\bprocessing\b", ["handling", "managing", "working through", "running"]),
    (r"\bgenerates?\b", ["create", "produce", "make", "yield"]),
    (r"\bgenerated\b", ["created", "produced", "made", "yielded"]),
    (r"\bgenerating\b", ["creating", "producing", "making", "yielding"]),
    (r"\boptimizes?\b", ["improve", "refine", "fine-tune", "streamline"]),
    (r"\boptimized\b", ["improved", "refined", "fine-tuned", "streamlined"]),
    (r"\boptimization\b", ["improvement", "refinement", "fine-tuning"]),
    (r"\baccuracy\b", ["precision", "correctness", "exactness", "reliability"]),
    (r"\befficiency\b", ["productivity", "speed", "performance", "throughput"]),
    (r"\binteraction(?:s)?\b", ["exchange", "engagement", "communication"]),
    (r"\bimplements?\b", ["put in place", "roll out", "set up", "apply"]),
    (r"\bimplemented\b", ["put in place", "rolled out", "set up", "applied"]),
    (r"\bimplementing\b", ["putting in place", "rolling out", "setting up"]),
    (r"\bstrateg(?:y|ies)\b", ["plan", "approach", "tactic", "game plan"]),
    (r"\bphenomen(?:on|a)\b", ["trend", "occurrence", "event", "pattern"]),
    (r"\bcontributes?\b", ["add", "give", "help", "pitch in"]),
    (r"\bcontributed\b", ["added", "gave", "helped", "pitched in"]),
    (r"\bcontribution\b", ["addition", "input", "effort", "part"]),
    (r"\binfluences?\b", ["shape", "affect", "sway", "steer"]),
    (r"\binfluenced\b", ["shaped", "affected", "swayed", "steered"]),
    (r"\bperspective(?:s)?\b", ["view", "angle", "standpoint", "take"]),
    (r"\bexperienced\b", ["faced", "went through", "encountered", "saw"]),
    (r"\bcommunication\b", ["exchange", "discussion", "dialogue", "contact"]),
    (r"\bcomplex(?:ity)?\b", ["complicated", "involved", "intricate", "layered"]),
    (r"\bcritical\b", ["vital", "key", "central", "decisive"]),
    (r"\brapidly\b", ["fast", "quickly", "swiftly", "at speed"]),
    (r"\brapid\b", ["fast", "quick", "swift", "speedy"]),
    (r"\bsophisticated\b", ["advanced", "refined", "elaborate"]),
    (r"\bunprecedented\b", ["unmatched", "historic", "extraordinary"]),
    (r"\bpotential\b", ["promise", "capacity", "ability", "prospect"]),
    (r"\bscenario(?:s)?\b", ["situation", "case", "setting", "condition"]),
    (r"\bcontext\b", ["setting", "backdrop", "circumstances", "situation"]),
    (r"\benvironment(?:s)?\b", ["setting", "surrounding", "space"]),
    (r"\bincorporates?\b", ["include", "blend in", "fold in", "add"]),
    (r"\benabled\b", ["allowed", "let", "made possible", "empowered"]),
    (r"\benabling\b", ["allowing", "making it possible for", "empowering"]),
    (r"\benables?\b", ["allows", "makes possible", "empowers"]),
    (r"\bprecisely\b", ["exactly", "specifically", "accurately"]),
    (r"\bprecise\b", ["exact", "specific", "accurate", "pinpoint"]),
    # Academic-specific
    (r"\bindicates?\b", ["point to", "suggest", "signal", "hint at"]),
    (r"\bindicated\b", ["pointed to", "suggested", "signaled"]),
    (r"\bindicating\b", ["pointing to", "suggesting", "signaling"]),
    (r"\bexamine[sd]?\b", ["look at", "study", "review", "inspect"]),
    (r"\bexamining\b", ["looking at", "studying", "reviewing"]),
    (r"\bevaluate[sd]?\b", ["assess", "judge", "weigh", "appraise"]),
    (r"\bevaluating\b", ["assessing", "judging", "weighing"]),
    (r"\bevaluation\b", ["assessment", "appraisal", "review", "judgment"]),
    (r"\bdistribution\b", ["spread", "pattern", "arrangement", "layout"]),
    (r"\bvariability\b", ["variation", "spread", "range", "fluctuation"]),
    (r"\bassumptions?\b", ["expectations", "premises", "conditions"]),
    (r"\bparametric\b", ["standard", "conventional", "traditional"]),
    (r"\bapproximately\b", ["roughly", "about", "close to", "around"]),
    # Additional academic/general vocabulary
    (r"\bfoundational\b", ["basic", "core", "underlying", "primary"]),
    (r"\belement(?:s)?\b", ["part", "component", "piece", "aspect"]),
    (r"\boffering\b", ["giving", "presenting", "delivering"]),
    (r"\bstructured\b", ["organized", "systematic", "ordered", "planned"]),
    (r"\bsummarizing\b", ["condensing", "boiling down", "recapping"]),
    (r"\binterpreting\b", ["understanding", "reading", "making sense of"]),
    (r"\bdatasets?\b", ["data sets", "collections", "data files"]),
    (r"\bemploying\b", ["using", "applying", "drawing on"]),
    (r"\bdistill\b", ["reduce", "condense", "extract", "boil down"]),
    (r"\binsights?\b", ["understanding", "findings", "takeaways", "lessons"]),
    (r"\bserve(?:s)? as\b", ["act as", "function as", "work as"]),
    (r"\bwidely\b", ["broadly", "extensively", "commonly"]),
    (r"\bprimarily\b", ["mainly", "chiefly", "mostly", "largely"]),
    (r"\bparticularly\b", ["especially", "notably", "chiefly"]),
    (r"\bcalculated\b", ["computed", "figured", "worked out", "determined"]),
    (r"\bsensitive\b", ["responsive", "susceptible", "reactive"]),
    (r"\bpreferred\b", ["favored", "chosen", "picked", "selected"]),
    (r"\bidentifies?\b", ["spot", "pick out", "locate", "pinpoint"]),
    (r"\buseful\b", ["helpful", "handy", "valuable", "practical"]),
    (r"\bfrequently\b", ["often", "regularly", "commonly", "routinely"]),
    (r"\boccurring\b", ["appearing", "showing up", "arising", "coming up"]),
    (r"\bcategorical\b", ["grouped", "classified", "sorted"]),
    (r"\bresistance\b", ["tolerance", "stability", "resilience"]),
    (r"\brepresents?\b", ["stands for", "shows", "reflects", "captures"]),
    (r"\bdescribes?\b", ["explains", "outlines", "details", "lays out"]),
    (r"\bassesses?\b", ["measures", "gauges", "checks", "reviews"]),
    (r"\bsummarizes?\b", ["condenses", "recaps", "wraps up", "sums up"]),
    (r"\billustrates?\b", ["shows", "highlights", "depicts", "portrays"]),
    (r"\bemphasizes?\b", ["stresses", "highlights", "underlines", "brings out"]),
    (r"\bdetermine[sd]?\b", ["figure out", "find", "work out", "settle"]),
    (r"\bdetermining\b", ["figuring out", "finding", "working out"]),
    (r"\bobtained\b", ["gathered", "collected", "gotten", "secured"]),
    (r"\bconducted\b", ["carried out", "performed", "run", "done"]),
    (r"\bconducting\b", ["carrying out", "performing", "running", "doing"]),
    (r"\bcomparisons?\b", ["contrasts", "side-by-side looks", "matchups"]),
    (r"\bextent\b", ["degree", "level", "scope", "range"]),
    (r"\bexhibits?\b", ["shows", "displays", "presents"]),
    (r"\bextreme\b", ["outlying", "far-off", "unusual", "exceptional"]),
    (r"\brelatively\b", ["fairly", "somewhat", "rather", "reasonably"]),
    (r"\bconsists?\b", ["is made up", "comprises", "contains"]),
    (r"\bmaintains?\b", ["keeps", "holds", "preserves", "sustains"]),
    (r"\bexplicitly\b", ["clearly", "directly", "openly", "plainly"]),
    (r"\boverall\b", ["on the whole", "taken together", "all in all"]),
]


def deep_synonym_replace(text: str, intensity: float = 0.6) -> str:
    for pattern, replacements in DEEP_SYNONYMS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m and random.random() < intensity:
            matched = m.group()
            depth = text[:m.start()].count('(') - text[:m.start()].count(')')
            if depth > 0:
                continue
            if matched[0].isupper():
                before = text[:m.start()].rstrip().split()
                after = text[m.end():].lstrip().split()
                prev_cap = before and before[-1][0].isupper() if before else False
                next_cap = after and after[0][0].isupper() if after else False
                if prev_cap or next_cap:
                    continue
            chosen = random.choice(replacements)
            text = re.sub(pattern, chosen, text, count=1, flags=re.IGNORECASE)
    return text


# ══════════════════════════════════════════════════════════════════
# Phase 3: Structural Variance
# ══════════════════════════════════════════════════════════════════

def clause_front(sentence: str) -> str:
    m = re.match(r"^(.{20,}?)\s+(because|since|although|while|whereas|given that)\s+(.{10,})$",
                 sentence, re.IGNORECASE)
    if m and random.random() < 0.4:
        main, conj, sub = m.group(1), m.group(2), m.group(3)
        main = main.rstrip(".,;")
        sub = sub.rstrip(".")
        return f"{conj.capitalize()} {sub}, {main[0].lower()}{main[1:]}."
    return sentence


def split_long_sentence(sentence: str, max_words: int = 35) -> str:
    words = sentence.split()
    if len(words) <= max_words:
        return sentence
    m = re.search(r',\s+(and|but|yet|so|or)\s+', sentence)
    if m and m.start() > len(sentence) * 0.3:
        first = sentence[:m.start()].rstrip(",. ")
        second = sentence[m.end():].strip()
        if len(second.split()) >= 5:
            return f"{first}. {second[0].upper()}{second[1:]}"
    if '; ' in sentence:
        parts = sentence.split('; ', 1)
        if len(parts[0].split()) >= 8 and len(parts[1].split()) >= 5:
            return f"{parts[0].rstrip('.')}. {parts[1][0].upper()}{parts[1][1:]}"
    return sentence


def vary_sentence_length(sentences: list[str]) -> list[str]:
    if len(sentences) < 4:
        return sentences
    result = []
    i = 0
    while i < len(sentences):
        s = sentences[i]
        if (i + 1 < len(sentences)
            and len(s.split()) < 10
            and len(sentences[i + 1].split()) < 10
            and random.random() < 0.3):
            connector = random.choice([", and ", " — ", "; "])
            merged = s.rstrip(".!?") + connector + sentences[i + 1][0].lower() + sentences[i + 1][1:]
            result.append(merged)
            i += 2
        else:
            result.append(s)
            i += 1
    return result


# ══════════════════════════════════════════════════════════════════
# Heavy Sentence Rewriter (rule-based paraphrasing when T5 underperforms)
# ══════════════════════════════════════════════════════════════════

SENTENCE_REWRITES: list[tuple[str, str]] = [
    (r"^(.+?)\s+has\s+(significantly|greatly|notably|fundamentally|dramatically)\s+(.+)$",
     r"When it comes to \1, there has been a \2 \3"),
    (r"^The\s+(\w+)\s+of\s+(.+?)\s+has\s+(.+)$",
     r"\2 has experienced \1 that \3"),
    (r"^(.+?)\s+(?:enables?|allows?)\s+(.+?)\s+to\s+(.+)$",
     r"Through \1, \2 can \3"),
    (r"^(.+?)\s+(?:provides?|offers?|gives?)\s+(.+?)\s+with\s+(.+)$",
     r"With \1, \2 gains \3"),
    (r"^It\s+is\s+(\w+)\s+that\s+(.+)$",
     r"\2 — this is \1"),
    (r"^(\w[\w\s]{5,30}?)\s+and\s+(\w[\w\s]{5,30}?)\s+have\s+(.+)$",
     r"Both \1 and \2 show \3"),
]

VOICE_PATTERNS: list[tuple[str, str]] = [
    (r"^(.{8,40}?)\s+(created|developed|designed|built|produced|introduced|established|launched)\s+(.{8,})$",
     r"\3 was \2 by \1"),
    (r"^(.{8,40}?)\s+(?:was|were)\s+(created|developed|designed|built|produced|introduced|established)\s+by\s+(.{8,})$",
     r"\3 \2 \1"),
    (r"^(.{8,40}?)\s+(improved|enhanced|boosted|advanced|strengthened)\s+(.{8,})$",
     r"\3 saw \2ment from \1"),
    (r"^(Researchers|Scientists|Studies|Experts|Analysts)\s+(found|showed|demonstrated|revealed|discovered|confirmed)\s+that\s+(.+)$",
     r"\3 — as \1 have \2"),
]

OPENER_VARIATIONS = [
    ("In addition,", ["On top of that,", "Beyond this,", "What is more,", "Added to this,"]),
    ("However,", ["That said,", "On the flip side,", "Even so,", "At the same time,"]),
    ("Therefore,", ["Because of this,", "For this reason,", "As a result,", "This means"]),
    ("For example,", ["Take, for instance,", "Consider this:", "A case in point:", "To illustrate,"]),
    ("Similarly,", ["In the same way,", "Along those lines,", "Likewise,", "Comparably,"]),
    ("Specifically,", ["More precisely,", "To be exact,", "In particular,"]),
    ("As a result,", ["Because of this,", "This led to", "The outcome was that", "From this,"]),
    ("In contrast,", ["Conversely,", "On the other hand,", "Alternatively,", "Then again,"]),
    ("Generally,", ["Broadly speaking,", "For the most part,", "By and large,", "As a rule,"]),
    ("Importantly,", ["What matters here is", "A key point:", "Of note,"]),
    ("Notably,", ["It stands out that", "Worth mentioning,", "One highlight:", "Strikingly,"]),
    ("Ultimately,", ["At the end of the day,", "When all is said and done,", "The bottom line is"]),
]


def heavy_rewrite_sentence(sentence: str) -> str:
    result = sentence
    applied = False

    for original_opener, alternatives in OPENER_VARIATIONS:
        if result.startswith(original_opener):
            result = result.replace(original_opener, random.choice(alternatives), 1)
            applied = True
            break

    if not applied and random.random() < 0.6:
        for pattern, replacement in SENTENCE_REWRITES:
            m = re.match(pattern, result, re.IGNORECASE)
            if m:
                try:
                    result = re.sub(pattern, replacement, result, count=1, flags=re.IGNORECASE)
                    applied = True
                    break
                except Exception:
                    pass

    if not applied and random.random() < 0.5:
        for pattern, replacement in VOICE_PATTERNS:
            m = re.match(pattern, result, re.IGNORECASE)
            if m:
                try:
                    result = re.sub(pattern, replacement, result, count=1, flags=re.IGNORECASE)
                    applied = True
                    break
                except Exception:
                    pass

    if not applied and ',' in result and random.random() < 0.3:
        parts = result.split(',', 1)
        if (len(parts) == 2
            and len(parts[0].split()) >= 5 and len(parts[1].split()) >= 5
            and any(w in parts[1].lower().split() for w in ['is','are','was','were','has','have','had','can','will','may'])):
            p1 = parts[0].strip().rstrip('.')
            p2 = parts[1].strip().rstrip('.')
            result = f"{p2[0].upper()}{p2[1:]}, {p1[0].lower()}{p1[1:]}."
            applied = True

    if not applied:
        result = deep_synonym_replace(result, 0.85)

    result = fix_t5_grammar(result)
    result = re.sub(r'\b(the|a|an|in|of|to|for|and|or|is|are|was|were)\s+\1\b', r'\1', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(\w{3,}ing)\s+\1\b', r'\1', result)
    result = result.strip()
    if result and result[0].islower():
        result = result[0].upper() + result[1:]
    if result and result[-1] not in '.!?':
        result += '.'
    return result


# ══════════════════════════════════════════════════════════════════
# Phase 5: Grammar Fixes
# ══════════════════════════════════════════════════════════════════

T5_GRAMMAR_FIXES: list[tuple[str, str]] = [
    (r"\bhave\s+help\b", "have helped"),
    (r"\bhas\s+help\b", "has helped"),
    (r"\bhave\s+show\b", "have shown"),
    (r"\bhas\s+show\b", "has shown"),
    (r"\bhave\s+make\b", "have made"),
    (r"\bhas\s+make\b", "has made"),
    (r"\bhave\s+give\b", "have given"),
    (r"\bhas\s+give\b", "has given"),
    (r"\bhave\s+take\b", "have taken"),
    (r"\bhas\s+take\b", "has taken"),
    (r"\bhave\s+lead\b", "have led"),
    (r"\bhas\s+lead\b", "has led"),
    (r"\bhave\s+drive\b", "have driven"),
    (r"\bhas\s+drive\b", "has driven"),
    (r"\bhave\s+rise\b", "have risen"),
    (r"\bhas\s+rise\b", "has risen"),
    (r"\bhave\s+grow\b", "have grown"),
    (r"\bhas\s+grow\b", "has grown"),
    (r"\bhave\s+begin\b", "have begun"),
    (r"\bhas\s+begin\b", "has begun"),
    (r"\bhave\s+bring\b", "have brought"),
    (r"\bhas\s+bring\b", "has brought"),
    (r"\bhave\s+write\b", "have written"),
    (r"\bhas\s+write\b", "has written"),
    (r"\bhave\s+speak\b", "have spoken"),
    (r"\bhas\s+speak\b", "has spoken"),
    (r"\bhave\s+choose\b", "have chosen"),
    (r"\bhas\s+choose\b", "has chosen"),
    (r"\btools\s+developments?\b", "tool development"),
    (r"\btools\s+systems?\b", "tool systems"),
    (r"\btools\s+(\w+tion)\b", r"tool \1"),
    (r"\btechnologies\s+developments?\b", "technology developments"),
    (r"\brecent\s+tools\b", "recent tool"),
    (r"\b(Worth noting|Looking at this|From what we see|Taking stock|Stepping back),\s+([a-z])",
     "LAMBDA_FIX_STARTER"),
    (r"\(\s+", "("),
    (r"\s+\)", ")"),
    (r"\bmachine-learning\b", "machine learning"),
    (r"\bdeep-learning\b", "deep learning"),
    (r"\bhealth\s+care\b", "healthcare"),
    (r"\bhealth-care\b", "healthcare"),
    (r"\b(AI|Artificial Intelligence)\s*\(AI\s*\)", "AI"),
    (r"\b(\w{4,})\s+\1\b", r"\1"),
    (r"\ba ([aeiou])", r"an \1"),
    (r"\ban ([^aeiouAEIOU\s])", r"a \1"),
    (r"\ban (uni\w+|Euro\w+|one\b|once\b)", r"a \1"),
    (r"(\w)\(", r"\1 ("),
    (r"\bin deal with\b", "in dealing with"),
    (r"\bin tackle\b", "in tackling"),
    (r"\bin handle\b", "in handling"),
    (r"\bfor address\b", "for addressing"),
    (r"\bby create\b", "by creating"),
    (r"\bby build\b", "by building"),
    (r"\bby set up\b", "by setting up"),
    # Fix common T5 base-form artifacts (is/was + base verb → past participle)
    (r"\bis find\b", "is found"),
    (r"\bis define\b", "is defined"),
    (r"\bis calculate\b", "is calculated"),
    (r"\bis determine\b", "is determined"),
    (r"\bis consider\b", "is considered"),
    (r"\bis observe\b", "is observed"),
    (r"\bis use\b", "is used"),
    (r"\bis know\b", "is known"),
    (r"\bis see\b", "is seen"),
    (r"\bis base\b", "is based"),
    (r"\bis make\b", "is made"),
    (r"\bis give\b", "is given"),
    (r"\bis take\b", "is taken"),
    (r"\bis call\b", "is called"),
    (r"\bwas find\b", "was found"),
    (r"\bwas define\b", "was defined"),
    (r"\bwas calculate\b", "was calculated"),
    (r"\bwas determine\b", "was determined"),
    (r"\bwas observe\b", "was observed"),
    (r"\bwas use\b", "was used"),
    (r"\bare find\b", "are found"),
    (r"\bare consider\b", "are considered"),
    (r"\bare use\b", "are used"),
    (r"\bare know\b", "are known"),
    (r"\bare base\b", "are based"),
    # Fix "pick out" → "picks out" after singular subjects
    (r"\b(mode|method|model|tool|approach|technique|system|value|mean|median)\s+pick\s+out\b", r"\1 picks out"),
    (r"\b(mode|method|model|tool|approach|technique|system|value|mean|median)\s+give\b", r"\1 gives"),
    (r"\b(mode|method|model|tool|approach|technique|system|value|mean|median)\s+offer\b", r"\1 offers"),
    (r"\b(mode|method|model|tool|approach|technique|system|value|mean|median)\s+provide\b", r"\1 provides"),
    (r"\b(mode|method|model|tool|approach|technique|system|value|mean|median)\s+make\b", r"\1 makes"),
]


def fix_t5_grammar(text: str) -> str:
    for pattern, replacement in T5_GRAMMAR_FIXES:
        if replacement == "LAMBDA_FIX_STARTER":
            text = re.sub(
                r'\b(Worth noting|Looking at this|From what we see|Taking stock|Stepping back),\s+([a-z])',
                lambda m: f"{m.group(1)}, the {m.group(2)}",
                text, flags=re.IGNORECASE
            )
        else:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


# ══════════════════════════════════════════════════════════════════
# Change Measurement
# ══════════════════════════════════════════════════════════════════

def measure_change(original: str, modified: str) -> float:
    orig = [w.lower().strip(".,;:!?\"'()[]") for w in original.split() if w.strip()]
    mod = [w.lower().strip(".,;:!?\"'()[]") for w in modified.split() if w.strip()]
    if not orig or not mod:
        return 0.0
    orig_set = set(orig)
    mod_set = set(mod)
    if not orig_set:
        return 1.0
    overlap = orig_set & mod_set
    return 1.0 - (len(overlap) / max(len(orig_set), len(mod_set)))


STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "because", "but", "and",
    "or", "if", "while", "that", "this", "these", "those", "it", "its",
    "they", "them", "their", "we", "our", "he", "she", "his", "her",
    "which", "what", "who", "whom", "about", "also",
}


def measure_meaning_overlap(original: str, modified: str) -> float:
    orig_words = {w.lower().strip(".,;:!?\"'()[]") for w in original.split()
                  if w.strip() and w.lower().strip(".,;:!?\"'()[]") not in STOPWORDS
                  and len(w.strip(".,;:!?\"'()[]")) >= 3}
    mod_words = {w.lower().strip(".,;:!?\"'()[]") for w in modified.split()
                 if w.strip() and w.lower().strip(".,;:!?\"'()[]") not in STOPWORDS
                 and len(w.strip(".,;:!?\"'()[]")) >= 3}
    if not orig_words:
        return 1.0
    overlap = orig_words & mod_words
    return len(overlap) / len(orig_words)


# ══════════════════════════════════════════════════════════════════
# First-Person Guard
# ══════════════════════════════════════════════════════════════════

_FIRST_PERSON_WORDS = {'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves'}

_FP_REPLACEMENTS = [
    (re.compile(r'\bI believe\b', re.IGNORECASE), 'It is believed'),
    (re.compile(r'\bI think\b', re.IGNORECASE), 'It appears'),
    (re.compile(r'\bI feel\b', re.IGNORECASE), 'It seems'),
    (re.compile(r'\bI suggest\b', re.IGNORECASE), 'It is suggested'),
    (re.compile(r'\bI argue\b', re.IGNORECASE), 'It can be argued'),
    (re.compile(r'\bI found\b', re.IGNORECASE), 'It was found'),
    (re.compile(r'\bI observed\b', re.IGNORECASE), 'It was observed'),
    (re.compile(r'\bIn my opinion\b', re.IGNORECASE), 'In this view'),
    (re.compile(r'\bIn my view\b', re.IGNORECASE), 'In this perspective'),
    (re.compile(r'\bmy research\b', re.IGNORECASE), 'the research'),
    (re.compile(r'\bmy analysis\b', re.IGNORECASE), 'the analysis'),
    (re.compile(r'\bmy study\b', re.IGNORECASE), 'the study'),
    (re.compile(r'\bour research\b', re.IGNORECASE), 'the research'),
    (re.compile(r'\bour findings\b', re.IGNORECASE), 'the findings'),
    (re.compile(r'\bour study\b', re.IGNORECASE), 'the study'),
    (re.compile(r'\bwe found\b', re.IGNORECASE), 'It was found'),
    (re.compile(r'\bwe observed\b', re.IGNORECASE), 'It was observed'),
    (re.compile(r'\bwe believe\b', re.IGNORECASE), 'It is believed'),
    (re.compile(r'\bwe suggest\b', re.IGNORECASE), 'It is suggested'),
    (re.compile(r'\bwe conclude\b', re.IGNORECASE), 'It is concluded'),
    (re.compile(r'\bwe propose\b', re.IGNORECASE), 'It is proposed'),
]


def has_first_person(text: str) -> bool:
    words = set(re.findall(r'\b\w+\b', text.lower()))
    return bool(words & _FIRST_PERSON_WORDS)


def remove_first_person(sentence: str) -> str:
    result = sentence
    for pattern, replacement in _FP_REPLACEMENTS:
        result = pattern.sub(replacement, result)
    result = re.sub(r'^I\b', 'It', result)
    result = re.sub(r'\b[Mm]y\b', 'the', result)
    result = re.sub(r'\b[Oo]ur\b', 'the', result)
    return result


# ══════════════════════════════════════════════════════════════════
# Sentence / Paragraph Splitting
# ══════════════════════════════════════════════════════════════════

def split_sentences(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in parts if s.strip()]


def is_title_line(line: str) -> bool:
    line = line.strip()
    if not line or len(line) > 100:
        return False
    if line[-1] in '.!?':
        return False
    if len(line.split()) > 12:
        return False
    words = line.split()
    capital_words = sum(1 for w in words if w and w[0].isupper())
    if capital_words >= len(words) * 0.6:
        return True
    return False


def split_paragraphs(text: str) -> list[dict]:
    raw_paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    result = []
    for para in raw_paragraphs:
        lines = para.split('\n')
        if len(lines) == 1 and is_title_line(lines[0]):
            result.append({'text': para, 'is_title': True, 'original_text': para})
        else:
            if len(lines) > 1 and is_title_line(lines[0]):
                result.append({'text': lines[0], 'is_title': True, 'original_text': lines[0]})
                body = ' '.join(lines[1:]).strip()
                if body:
                    result.append({'text': body, 'is_title': False, 'original_text': body})
            else:
                result.append({'text': para, 'is_title': False, 'original_text': para})
    return result


# ══════════════════════════════════════════════════════════════════
# Phase 1: T5 Generation (sentence-by-sentence, beam search ONLY)
# ══════════════════════════════════════════════════════════════════

@torch.no_grad()
def t5_generate_sentence(sentence: str, num_beams: int = 4,
                         no_repeat_ngram: int = 3,
                         length_penalty: float = 1.0,
                         repetition_penalty: float = 1.2) -> str:
    """Generate a paraphrase using T5. NEVER uses sampling — beam search only."""
    word_count = len(sentence.split())
    if word_count < 6:
        num_beams = 1

    inputs = tokenizer(
        sentence,
        return_tensors="pt",
        max_length=512,
        truncation=True,
        padding=True,
    ).to(device)

    # Tight output budget: ~1.3x input length
    max_new = min(128, max(int(word_count * 1.5), 30))

    candidates = []

    # Run 1: Standard beam search
    outputs = model.generate(
        **inputs,
        max_new_tokens=max_new,
        num_beams=num_beams,
        do_sample=False,
        no_repeat_ngram_size=no_repeat_ngram,
        length_penalty=length_penalty,
        repetition_penalty=repetition_penalty,
        early_stopping=True,
    )
    decoded = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
    if decoded:
        candidates.append(decoded)

    # Run 2: Higher diversity (only for quality/aggressive modes)
    if num_beams >= 6:
        outputs2 = model.generate(
            **inputs,
            max_new_tokens=max_new,
            num_beams=num_beams,
            do_sample=False,
            no_repeat_ngram_size=min(no_repeat_ngram + 1, 5),
            length_penalty=length_penalty * 1.2,
            repetition_penalty=min(repetition_penalty + 0.5, 2.5),
            early_stopping=True,
        )
        decoded2 = tokenizer.decode(outputs2[0], skip_special_tokens=True).strip()
        if decoded2 and decoded2 != decoded:
            candidates.append(decoded2)

    if not candidates:
        return sentence

    # Pick candidate with highest change that preserves meaning
    best = candidates[0]
    best_score = -1.0
    for cand in candidates:
        change = measure_change(sentence, cand)
        meaning = measure_meaning_overlap(sentence, cand)
        if meaning < 0.40:
            continue
        score = change * 0.7 + min(meaning, 0.8) * 0.3
        if score > best_score:
            best_score = score
            best = cand
    return best


# ══════════════════════════════════════════════════════════════════
# Mode Presets
# ══════════════════════════════════════════════════════════════════

MODE_PRESETS = {
    "quality": {
        "num_beams": 6,
        "no_repeat_ngram": 3,
        "length_penalty": 1.5,
        "repetition_penalty": 1.8,
        "max_retries": 3,
    },
    "fast": {
        "num_beams": 4,
        "no_repeat_ngram": 2,
        "length_penalty": 1.3,
        "repetition_penalty": 1.5,
        "max_retries": 1,
    },
    "aggressive": {
        "num_beams": 8,
        "no_repeat_ngram": 4,
        "length_penalty": 1.5,
        "repetition_penalty": 2.0,
        "max_retries": 8,
    },
    "turbo": {
        "num_beams": 1,
        "no_repeat_ngram": 2,
        "length_penalty": 1.0,
        "repetition_penalty": 1.3,
        "max_retries": 1,
    },
}


# ══════════════════════════════════════════════════════════════════
# Main Pipeline: 6-Phase Sentence Humanization
# ══════════════════════════════════════════════════════════════════

def humanize_sentence(original: str, preset: dict, min_change: float,
                      max_retries: int) -> tuple[str, dict]:
    """Full multi-phase humanization of a single sentence."""
    if len(original.split()) < 3:
        return original, {"skipped": True, "reason": "too_short"}

    best_result = original
    best_ratio = 0.0
    attempts = 0
    t5_retries = min(max_retries, 2)

    for attempt in range(t5_retries):
        attempts = attempt + 1

        # ── Phase 1: T5 paraphrase ──
        t5_out = t5_generate_sentence(
            original,
            num_beams=preset["num_beams"],
            no_repeat_ngram=preset["no_repeat_ngram"],
            length_penalty=preset["length_penalty"],
            repetition_penalty=preset["repetition_penalty"],
        )

        # LENGTH GUARD: reject if T5 output lost >25% of words
        if len(t5_out.split()) < max(3, len(original.split()) * 0.75):
            t5_out = original

        # MEANING GUARD: reject hallucinations
        meaning_overlap = measure_meaning_overlap(original, t5_out)
        if meaning_overlap < 0.40:
            logger.warning(f"T5 hallucination (overlap={meaning_overlap:.2f}): '{original[:60]}...'")
            t5_out = original

        # ENTITY GUARD: reject if T5 introduces new proper nouns
        orig_upper = {w.strip(".,;:!?\"'()[]") for w in original.split() if w[0:1].isupper() and len(w) > 2}
        t5_upper = {w.strip(".,;:!?\"'()[]") for w in t5_out.split() if w[0:1].isupper() and len(w) > 2}
        safe_caps = {"The", "This", "That", "These", "Those", "Also", "However",
                     "Although", "While", "Since", "After", "Before", "Despite",
                     "Because", "Furthermore", "Moreover", "Additionally",
                     "Regarding", "Meanwhile", "Still", "Yet", "But"}
        new_entities = t5_upper - orig_upper - safe_caps
        if len(new_entities) >= 2:
            logger.warning(f"T5 entity hallucination: {new_entities}")
            t5_out = original

        # LENGTH CAP: if T5 output >2x input, truncate
        if len(t5_out.split()) > len(original.split()) * 2:
            t5_words = t5_out.split()
            max_words = int(len(original.split()) * 1.5)
            t5_out = " ".join(t5_words[:max_words])
            if t5_out and t5_out[-1] not in ".!?":
                t5_out = t5_out.rstrip() + "."

        # CITATION GUARD: preserve parenthetical citations
        citation_pattern = re.compile(r'\([^)]*?\b\d{4}\b[^)]*?\)')
        orig_citations = citation_pattern.findall(original)
        if orig_citations:
            t5_out = re.sub(r'\s*\[[^\]]{1,60}\]', '', t5_out)
            for citation in orig_citations:
                if citation in t5_out:
                    continue
                years = re.findall(r'\b\d{4}\b', citation)
                replaced = False
                for year in years:
                    mangled = re.search(r'\([^)]*?' + re.escape(year) + r'[^)]*?\)', t5_out)
                    if mangled:
                        t5_out = t5_out.replace(mangled.group(), citation, 1)
                        replaced = True
                        break
                if not replaced:
                    t5_out = t5_out.rstrip()
                    if t5_out and t5_out[-1] in '.!?':
                        t5_out = t5_out[:-1] + ' ' + citation + t5_out[-1]
                    else:
                        t5_out = t5_out + ' ' + citation + '.'

        # ── Phase 2: AI word kill + filler cuts ──
        processed = apply_ai_word_kill(t5_out)
        processed = apply_filler_cuts(processed)
        processed = diversify_starters(processed)

        # ── Phase 3: Structural variance ──
        processed = clause_front(processed)
        processed = split_long_sentence(processed)

        # ── Phase 4: Deep synonym replacement (always runs) ──
        syn_intensity = 0.70 + (attempt * 0.10)
        processed = deep_synonym_replace(processed, min(syn_intensity, 0.95))
        # Second pass catches words that might have been introduced by the first pass
        if measure_change(original, processed) < min_change:
            processed = deep_synonym_replace(processed, min(syn_intensity + 0.1, 0.95))

        # ── Phase 5: Grammar fixes ──
        processed = fix_t5_grammar(processed)

        # Ensure proper formatting
        processed = processed.strip()
        if processed and processed[-1] not in '.!?':
            processed += '.'
        if processed and processed[0].islower():
            processed = processed[0].upper() + processed[1:]

        ratio = measure_change(original, processed)
        if ratio > best_ratio:
            best_result = processed
            best_ratio = ratio
        if ratio >= min_change:
            break

        # Escalate for retry
        preset = {**preset}
        preset["repetition_penalty"] = min(2.5, preset["repetition_penalty"] + 0.3)
        if preset["num_beams"] < 8:
            preset["num_beams"] += 2

    # ── Phase 4b: Heavy rule-based fallback if still below threshold ──
    fallback_retries = max(2, max_retries - t5_retries) if max_retries >= 1 else 2
    if best_ratio < min_change:
        for fb_attempt in range(fallback_retries):
            attempts += 1
            fallback = heavy_rewrite_sentence(best_result)
            intensity = 0.6 + (fb_attempt * 0.1)
            fallback = deep_synonym_replace(fallback, min(intensity, 0.95))
            fallback = apply_ai_word_kill(fallback)
            fallback = fix_t5_grammar(fallback)
            fallback = fallback.strip()
            if fallback and fallback[-1] not in '.!?':
                fallback += '.'
            if fallback and fallback[0].islower():
                fallback = fallback[0].upper() + fallback[1:]
            ratio = measure_change(original, fallback)
            if ratio > best_ratio:
                best_result = fallback
                best_ratio = ratio
            if ratio >= min_change:
                break

        # Second try: rewrite from ORIGINAL
        if best_ratio < min_change:
            for fb2 in range(3):
                attempts += 1
                fallback = heavy_rewrite_sentence(original)
                fallback = deep_synonym_replace(fallback, 0.95)
                fallback = apply_ai_word_kill(fallback)
                fallback = apply_filler_cuts(fallback)
                fallback = fix_t5_grammar(fallback)
                fallback = fallback.strip()
                if fallback and fallback[-1] not in '.!?':
                    fallback += '.'
                if fallback and fallback[0].islower():
                    fallback = fallback[0].upper() + fallback[1:]
                ratio = measure_change(original, fallback)
                if ratio > best_ratio:
                    best_result = fallback
                    best_ratio = ratio
                if ratio >= min_change:
                    break

    return best_result, {
        "attempts": attempts,
        "change_ratio": round(best_ratio, 3),
        "met_threshold": best_ratio >= min_change,
    }


# ══════════════════════════════════════════════════════════════════
# Full Text Pipeline
# ══════════════════════════════════════════════════════════════════

def humanize_text(text: str, mode: str = "quality",
                  min_change_ratio: float = 0.40,
                  max_retries: int = 5,
                  sentence_by_sentence: bool = True,
                  input_has_first_person: bool = False) -> tuple[str, dict]:
    """Full pipeline: split text -> 6-phase per sentence -> reassemble."""
    t0 = time.time()
    preset = MODE_PRESETS.get(mode, MODE_PRESETS["quality"])
    preset = {**preset}

    paragraphs = split_paragraphs(text)
    all_results: list[dict] = []
    all_stats: list[dict] = []
    total_sentences = 0
    met_threshold_count = 0

    for para_dict in paragraphs:
        para = para_dict['text']
        is_title = para_dict['is_title']

        # Preserve titles exactly
        if is_title:
            all_results.append({'text': para, 'is_title': True})
            continue

        sentences = split_sentences(para)
        total_sentences += len(sentences)

        # Parallel sentence processing
        futures = [
            _sentence_pool.submit(
                humanize_sentence, sent, {**preset}, min_change_ratio, max_retries
            )
            for sent in sentences
        ]
        processed_sentences = []
        for i, fut in enumerate(futures):
            result, stats = fut.result()

            # First-person guard: remove if not in input
            if not input_has_first_person and has_first_person(result):
                result = remove_first_person(result)

            processed_sentences.append(result)
            all_stats.append(stats)
            if stats.get("met_threshold", False) or stats.get("skipped", False):
                met_threshold_count += 1

        # Cross-sentence variance
        processed_sentences = vary_sentence_length(processed_sentences)
        all_results.append({'text': " ".join(processed_sentences), 'is_title': False})

    # Reassemble with proper title handling
    final_paragraphs = []
    for item in all_results:
        para_text = item['text'].strip()
        if not para_text:
            continue
        if item.get('is_title', False):
            if para_text and para_text[0].islower():
                para_text = para_text[0].upper() + para_text[1:]
            final_paragraphs.append(para_text)
        else:
            if para_text and para_text[0].islower():
                para_text = para_text[0].upper() + para_text[1:]
            para_text = re.sub(
                r'([.!?])\s+([a-z])',
                lambda m: f"{m.group(1)} {m.group(2).upper()}",
                para_text
            )
            final_paragraphs.append(para_text)

    humanized = "\n\n".join(final_paragraphs)

    # ── Final cleanup passes ──
    humanized = re.sub(r'  +', ' ', humanized)
    humanized = re.sub(r'\s+([.!?,;:])', r'\1', humanized)
    humanized = re.sub(r'\.{2,}', '.', humanized)
    humanized = re.sub(r'([.!?,;:])([A-Za-z])', r'\1 \2', humanized)
    humanized = re.sub(r'([.!?])\s+([a-z])', lambda m: f"{m.group(1)} {m.group(2).upper()}", humanized)
    humanized = re.sub(r'(^|\n\n)([a-z])', lambda m: m.group(1) + m.group(2).upper(), humanized)
    humanized = fix_t5_grammar(humanized)

    # Expand contractions (academic register)
    contractions = {
        "don't": "do not", "doesn't": "does not", "didn't": "did not",
        "won't": "will not", "wouldn't": "would not", "couldn't": "could not",
        "shouldn't": "should not", "can't": "cannot", "isn't": "is not",
        "aren't": "are not", "wasn't": "was not", "weren't": "were not",
        "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
        "it's": "it is", "that's": "that is", "there's": "there is",
        "what's": "what is", "who's": "who is", "let's": "let us",
        "I'm": "I am", "you're": "you are", "they're": "they are",
        "we're": "we are", "he's": "he is", "she's": "she is",
        "I've": "I have", "you've": "you have", "they've": "they have",
        "we've": "we have", "I'll": "I will", "you'll": "you will",
        "they'll": "they will", "we'll": "we will", "he'll": "he will",
        "she'll": "she will", "it'll": "it will",
    }
    for contraction, expansion in contractions.items():
        humanized = humanized.replace(contraction, expansion)
        humanized = humanized.replace(contraction.capitalize(), expansion.capitalize())

    # Remove em-dashes (AI detector signal)
    humanized = humanized.replace("\u2014", " -- ")
    humanized = humanized.replace("\u2013", " -- ")
    humanized = re.sub(r'\s*--\s*', ', ', humanized)

    # ── Post-processing validation ──
    try:
        validation_result = validate_and_repair_output(
            original_text=text,
            humanized_text=humanized,
            allow_word_change_bound=0.7,
            min_sentence_words=3,
            auto_repair=True
        )
        if validation_result['was_repaired']:
            humanized = validation_result['text']
            logger.info(f"Output repaired: {len(validation_result['repairs'])} repairs")
        validation_info = {
            'validation_passed': validation_result['validation'].is_valid,
            'was_repaired': validation_result['was_repaired'],
            'repairs': validation_result['repairs'],
            'sentence_count': {
                'original': validation_result['validation'].stats.original_sentences,
                'humanized': validation_result['validation'].stats.humanized_sentences,
            },
            'word_count': {
                'original': validation_result['validation'].stats.original_words,
                'humanized': validation_result['validation'].stats.humanized_words,
                'preservation_ratio': round(validation_result['validation'].stats.word_preservation_ratio, 3),
            },
        }
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        validation_info = {'validation_passed': False, 'error': str(e)}

    # Deduplicate near-identical consecutive sentences
    deduped_paras = []
    for para in humanized.split('\n\n'):
        sents = re.split(r'(?<=[.!?])\s+(?=[A-Z])', para)
        unique = []
        for s in sents:
            s_lower = s.lower().strip()
            if unique:
                prev_lower = unique[-1].lower().strip()
                prev_words = set(prev_lower.split())
                cur_words = set(s_lower.split())
                overlap = len(prev_words & cur_words) / max(len(prev_words | cur_words), 1)
                if overlap > 0.65:
                    continue
            unique.append(s)
        deduped_paras.append(' '.join(unique))
    humanized = '\n\n'.join(deduped_paras)

    elapsed = time.time() - t0
    word_count = len(text.split())
    avg_change = (sum(s.get("change_ratio", 0) for s in all_stats) / max(len(all_stats), 1))

    stats = {
        "mode": mode,
        "total_sentences": total_sentences,
        "met_threshold": met_threshold_count,
        "threshold_ratio": round(met_threshold_count / max(total_sentences, 1), 3),
        "avg_change_ratio": round(avg_change, 3),
        "word_count": word_count,
        "elapsed_seconds": round(elapsed, 2),
        "words_per_second": round(word_count / elapsed, 1) if elapsed > 0 else 0,
        "validation": validation_info,
    }

    logger.info(f"Oxygen 3.0: {word_count}w, {total_sentences}s, {elapsed:.1f}s, "
                f"avg_change={avg_change:.3f}, mode={mode}")

    return humanized, stats


# ══════════════════════════════════════════════════════════════════
# FastAPI Application
# ══════════════════════════════════════════════════════════════════

app = FastAPI(title="Oxygen 3.0 Humanizer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HumanizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100_000)
    strength: str = Field(default="medium")
    mode: str = Field(default="quality")
    min_change_ratio: float = Field(default=0.40, ge=0.1, le=0.9)
    max_retries: int = Field(default=5, ge=1, le=15)
    sentence_by_sentence: bool = Field(default=True)


class HumanizeResponse(BaseModel):
    humanized: str
    success: bool = True
    params_used: dict[str, Any] = Field(default_factory=dict)
    stats: dict[str, Any] = Field(default_factory=dict)


@app.get("/")
async def root():
    if model is None:
        raise HTTPException(503, "Model not loaded")
    return {"service": "Oxygen 3.0 Humanizer", "status": "running", "device": device}


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model not loaded")
    return {"status": "ok", "model": "oxygen3-humanizer", "device": device, "version": "3.0"}


@app.post("/humanize", response_model=HumanizeResponse)
async def humanize_endpoint(req: HumanizeRequest):
    if model is None or tokenizer is None:
        raise HTTPException(503, "Model not loaded")

    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    input_has_fp = has_first_person(text)

    try:
        humanized, stats = await asyncio.to_thread(
            humanize_text,
            text=text,
            mode=req.mode,
            min_change_ratio=req.min_change_ratio,
            max_retries=req.max_retries,
            sentence_by_sentence=req.sentence_by_sentence,
            input_has_first_person=input_has_fp,
        )
        return HumanizeResponse(
            humanized=humanized,
            success=True,
            params_used={
                "mode": req.mode,
                "min_change_ratio": req.min_change_ratio,
                "max_retries": req.max_retries,
                "sentence_by_sentence": req.sentence_by_sentence,
            },
            stats=stats,
        )
    except Exception as e:
        logger.exception("Inference error")
        raise HTTPException(500, str(e))


# ── Startup ──

@app.on_event("startup")
async def startup():
    if model is None:
        load_model()


if __name__ == "__main__":
    import uvicorn
    load_model()
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
