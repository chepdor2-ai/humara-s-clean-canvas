"""
Advanced NLP Transforms for the Humanizer Engine
=================================================
- Active ↔ passive voice shifts (spaCy-based)
- Deep clause restructuring (dependency-parse driven)
- Intelligent sentence splitting and merging
- Fronting / topicalization
- First-person preservation logic
"""
import random
import re

try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
except Exception:
    _nlp = None

try:
    from nltk.tokenize import word_tokenize
    from nltk import pos_tag
except Exception:
    def word_tokenize(t):
        return t.split()
    def pos_tag(tokens):
        return [(t, "NN") for t in tokens]


# ── Irregular past-participles (common academic verbs) ──────────────────────
_IRREGULAR_PP = {
    "give": "given", "take": "taken", "make": "made", "do": "done",
    "see": "seen", "write": "written", "know": "known", "show": "shown",
    "find": "found", "get": "gotten", "bring": "brought", "think": "thought",
    "tell": "told", "say": "said", "keep": "kept", "leave": "left",
    "feel": "felt", "put": "put", "run": "run", "read": "read",
    "grow": "grown", "draw": "drawn", "break": "broken", "speak": "spoken",
    "choose": "chosen", "drive": "driven", "eat": "eaten", "fall": "fallen",
    "fly": "flown", "forget": "forgotten", "hide": "hidden", "ride": "ridden",
    "rise": "risen", "shake": "shaken", "steal": "stolen", "swim": "swum",
    "throw": "thrown", "wake": "woken", "wear": "worn", "begin": "begun",
    "hold": "held", "lead": "led", "lose": "lost", "build": "built",
    "send": "sent", "spend": "spent", "stand": "stood", "understand": "understood",
    "win": "won", "pay": "paid", "set": "set", "cut": "cut",
    "hit": "hit", "let": "let", "shut": "shut", "spread": "spread",
    # Multi-syllable verbs with final-syllable stress (MUST double)
    "permit": "permitted", "commit": "committed", "submit": "submitted",
    "admit": "admitted", "emit": "emitted", "omit": "omitted",
    "transmit": "transmitted", "occur": "occurred", "prefer": "preferred",
    "refer": "referred", "transfer": "transferred", "confer": "conferred",
    "defer": "deferred", "infer": "inferred", "deter": "deterred",
    "recur": "recurred", "incur": "incurred", "compel": "compelled",
    "excel": "excelled", "impel": "impelled", "propel": "propelled",
    "control": "controlled", "patrol": "patrolled", "equip": "equipped",
    # Common verbs that do NOT double (first-syllable stress)
    "alter": "altered", "offer": "offered", "suffer": "suffered",
    "differ": "differed", "enter": "entered", "gather": "gathered",
    "foster": "fostered", "trigger": "triggered", "deliver": "delivered",
    "consider": "considered", "discover": "discovered", "remember": "remembered",
    "empower": "empowered", "encounter": "encountered", "develop": "developed",
    "heighten": "heightened", "sharpen": "sharpened", "strengthen": "strengthened",
    "broaden": "broadened", "widen": "widened", "deepen": "deepened",
    "lighten": "lightened", "darken": "darkened", "frighten": "frightened",
    "flatten": "flattened", "fasten": "fastened", "hasten": "hastened",
    "lessen": "lessened", "worsen": "worsened", "loosen": "loosened",
}

# Verbs that should NOT be passivized (intransitive / stative)
_NO_PASSIVE = {
    "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having",
    "seem", "appear", "become", "remain", "exist", "occur",
    "happen", "belong", "consist", "depend", "matter",
    "arrive", "come", "go", "die", "live", "sleep", "stay",
    "emerge", "arise", "fall", "rise", "sit", "stand",
    "agree", "disagree", "laugh", "cry", "smile",
}

# ── By-agent phrases to omit when they're generic ──────────────────────────
_GENERIC_AGENTS = {
    "people", "many", "researchers", "scholars", "experts",
    "studies", "analysts", "organizations", "governments",
    "critics", "observers", "societies", "communities",
}


# ═══════════════════════════════════════════════════════════════════════════
#  ACTIVE → PASSIVE  (spaCy dependency-parse based)
# ═══════════════════════════════════════════════════════════════════════════

def _get_past_participle(verb_lemma: str) -> str:
    """Return past participle of a verb."""
    if verb_lemma in _IRREGULAR_PP:
        return _IRREGULAR_PP[verb_lemma]
    # Regular: add -ed (handle doubling, silent-e, etc.)
    v = verb_lemma
    if v.endswith('e'):
        return v + 'd'
    if v.endswith('y') and len(v) > 2 and v[-2] not in 'aeiou':
        return v[:-1] + 'ied'
    # Only double final consonant for very short CVC words (3-4 chars)
    # e.g., "stop" → "stopped", "plan" → "planned", "drop" → "dropped"
    # Longer words are handled by _IRREGULAR_PP above
    if (len(v) in (3, 4)
            and v[-1] not in 'aeiouwxy'
            and v[-2] in 'aeiou'
            and v[-3] not in 'aeiou'):
        return v + v[-1] + 'ed'
    return v + 'ed'


def _choose_be_form(subj_text: str, original_tense: str) -> str:
    """Choose correct 'be' form for the new passive subject."""
    subj_lower = subj_text.lower().strip()
    
    # Use spaCy to determine number if available
    is_plural = False
    if _nlp is not None:
        doc = _nlp(subj_text.strip())
        # Check the head noun of the subject
        for token in reversed(doc):
            if token.pos_ in ("NOUN", "PROPN", "PRON"):
                if token.morph.get("Number") == ["Plur"]:
                    is_plural = True
                elif token.morph.get("Number") == ["Sing"]:
                    is_plural = False
                break
    else:
        # Fallback: simple heuristic
        is_plural = subj_lower.endswith('s') and subj_lower not in (
            "this", "it", "he", "she", "the process", "the system", "the result",
            "crisis", "thesis", "analysis", "status", "focus", "basis",
        )
    
    # Plural pronouns
    if subj_lower in ("they", "we", "these", "those"):
        is_plural = True
    if subj_lower in ("it", "this", "that", "he", "she"):
        is_plural = False
    
    return _choose_be_form_from_bool(is_plural, original_tense)


def _choose_be_form_from_bool(is_plural: bool, original_tense: str) -> str:
    """Choose 'be' form given a boolean plurality and original verb tense tag."""
    if original_tense in ("VBD", "VBN"):          # past
        return "were" if is_plural else "was"
    if original_tense in ("VBZ", "VBP"):             # present tense
        return "are" if is_plural else "is"
    if original_tense in ("VB", "VBG"):            # base / gerund
        return "are" if is_plural else "is"
    return "were" if is_plural else "was"


def active_to_passive(sentence: str) -> str:
    """Convert an active-voice sentence to passive voice using spaCy.
    Returns the original sentence if conversion is not viable."""
    if _nlp is None:
        return sentence
    
    doc = _nlp(sentence)
    
    # Find the main verb (ROOT)
    root = None
    for token in doc:
        if token.dep_ == "ROOT" and token.pos_ == "VERB":
            root = token
            break
    if root is None:
        return sentence
    
    # Skip if verb is intransitive / stative
    if root.lemma_.lower() in _NO_PASSIVE:
        return sentence
    
    # Find subject (nsubj) and direct object (dobj)
    subj = None
    dobj = None
    for child in root.children:
        if child.dep_ == "nsubj":
            subj = child
        elif child.dep_ == "dobj":
            dobj = child
    
    if subj is None or dobj is None:
        return sentence
    
    # Skip if subject is a pronoun — passivized pronoun sentences sound unnatural
    if subj.tag_ in ("PRP", "PRP$", "WP", "WP$"):
        return sentence
    # Get the full spans
    subj_span = doc[subj.left_edge.i:subj.right_edge.i + 1].text
    dobj_span = doc[dobj.left_edge.i:dobj.right_edge.i + 1].text
    
    # Build passive
    pp = _get_past_participle(root.lemma_)
    
    # Determine number from the dobj token (the new subject)
    dobj_is_plural = dobj.morph.get("Number") == ["Plur"]
    # Also check for coordinated objects (conj) which make it plural
    for child in dobj.children:
        if child.dep_ == "conj":
            dobj_is_plural = True
            break
    
    be = _choose_be_form_from_bool(dobj_is_plural, root.tag_)
    
    # Determine whether to include "by <agent>"
    agent_lower = subj_span.lower().strip()
    include_agent = agent_lower not in _GENERIC_AGENTS
    
    # Collect verb particles (prt) — must stay attached to past participle
    particles = []
    remaining = []
    for child in root.children:
        if child.dep_ == "prt":
            particles.append(child.text)
        elif child.dep_ not in ("nsubj", "dobj", "aux", "auxpass", "neg"):
            span_text = doc[child.left_edge.i:child.right_edge.i + 1].text
            remaining.append(span_text)
    
    # Handle negation
    neg = ""
    for child in root.children:
        if child.dep_ == "neg":
            neg = " not"
    
    # Capitalise new subject
    new_subj = dobj_span[0].upper() + dobj_span[1:] if dobj_span else dobj_span
    
    # Build: subject + be + past_participle + particle(s) + by agent + remaining
    pp_with_particle = pp + (" " + " ".join(particles) if particles else "")
    parts = [new_subj, be + neg, pp_with_particle]
    if include_agent and subj_span:
        parts.append("by " + subj_span.lower())
    parts.extend(remaining)
    
    result = " ".join(parts)
    # Ensure ends with period
    result = result.rstrip(" .")
    if sentence.rstrip().endswith('.'):
        result += "."
    
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  PASSIVE → ACTIVE
# ═══════════════════════════════════════════════════════════════════════════

def passive_to_active(sentence: str) -> str:
    """Convert a passive-voice sentence to active voice.
    Returns original if conversion is not viable."""
    if _nlp is None:
        return sentence
    
    doc = _nlp(sentence)
    
    # Find passive construction: nsubjpass + auxpass + ROOT
    root = None
    nsubjpass = None
    agent = None
    
    for token in doc:
        if token.dep_ == "ROOT":
            root = token
    
    if root is None:
        return sentence
    
    for child in root.children:
        if child.dep_ == "nsubjpass":
            nsubjpass = child
        if child.dep_ == "agent":
            # "by" phrase
            for grandchild in child.children:
                if grandchild.dep_ == "pobj":
                    agent = grandchild
    
    if nsubjpass is None:
        return sentence  # Not passive
    
    nsubj_span = doc[nsubjpass.left_edge.i:nsubjpass.right_edge.i + 1].text
    
    if agent is None:
        return sentence  # No agent to make the active subject
    
    agent_span = doc[agent.left_edge.i:agent.right_edge.i + 1].text
    
    # Rebuild in active voice
    # Use the verb lemma conjugated for the agent
    verb = root.lemma_
    # Simple present/past based on tense
    if root.tag_ == "VBN":
        # Determine tense from aux
        for child in root.children:
            if child.dep_ == "auxpass":
                if child.tag_ == "VBD":
                    verb = root.text  # Keep past participle → use past tense
                    if verb.endswith("ed"):
                        verb = verb  # already past
                    elif root.lemma_ in _IRREGULAR_PP:
                        verb = root.lemma_ + "ed"  # approximate
                break
    
    new_subj = agent_span[0].upper() + agent_span[1:]
    
    result = f"{new_subj} {verb} {nsubj_span.lower()}"
    
    # Collect remaining
    skip_indices = set()
    # Skip the agent subtree and nsubjpass subtree and aux
    for token in doc:
        if token.dep_ in ("nsubjpass", "auxpass", "agent"):
            for t in token.subtree:
                skip_indices.add(t.i)
        if token == root:
            skip_indices.add(token.i)
    
    remaining = []
    for token in doc:
        if token.i not in skip_indices and token.dep_ not in ("nsubjpass", "auxpass", "agent", "ROOT"):
            if token.dep_ == "pobj" and token.head.dep_ == "agent":
                continue
            remaining.append(token.text)
    
    if remaining:
        result += " " + " ".join(remaining)
    
    result = result.rstrip(" .")
    if sentence.rstrip().endswith('.'):
        result += "."
    
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  INTELLIGENT VOICE SHIFT (decides direction automatically)
# ═══════════════════════════════════════════════════════════════════════════

def is_passive(sentence: str) -> bool:
    """Detect if a sentence is in passive voice using spaCy."""
    if _nlp is None:
        return False
    doc = _nlp(sentence)
    for token in doc:
        if token.dep_ == "nsubjpass":
            return True
    return False


def voice_shift(sentence: str, probability: float = 0.3) -> str:
    """Intelligently shift voice: active→passive or passive→active.
    Fires probabilistically. Returns original if shift fails or quality is poor."""
    if random.random() > probability:
        return sentence
    if len(sentence.split()) < 8 or len(sentence.split()) > 25:
        return sentence
    
    # Skip sentences with infinitive complements (e.g., "enabled X to Y")
    # — these produce awkward passives
    if " to " in sentence.lower() and any(
            w in sentence.lower() for w in
            ("enabled", "enabled", "allowed", "caused", "forced",
             "required", "expected", "asked", "told", "encouraged",
             "enable", "allow", "cause", "force")):
        return sentence

        # Skip sentences with phrasal-verb predicates that produce broken passives
        # e.g. "give rise to" → "Rise to X was given by Y" (fragment)
        _lower_s = sentence.lower()
        if any(ph in _lower_s for ph in (
                "give rise to", "given rise to", "gives rise to",
                "has given rise to", "have given rise to",
                "gave rise to", "set the stage", "pave the way",
                "take place", "take shape", "fall short")):
            return sentence
    
    # Only try active→passive (safer and more predictable)
    if is_passive(sentence):
        return sentence  # Don't convert passive→active (too error-prone)
    
    result = active_to_passive(sentence)
    
    # Quality checks
    if result == sentence:
        return sentence
    if len(result.split()) < len(sentence.split()) * 0.4:
        return sentence
    if not result or not result[0].isupper():
        return sentence
    # Check for obviously broken grammar
    lower_r = result.lower()
    if any(bad in lower_r for bad in [" ,", " .", "  ", "by by", "the the", " to flow", " to move"]):
        return sentence
    
    return result


# ═══════════════════════════════════════════════════════════════════════════
#  DEEP SENTENCE RESTRUCTURING
# ═══════════════════════════════════════════════════════════════════════════

def _front_adverbial(sentence: str) -> str:
    """Move a trailing adverbial/prepositional phrase to the front.
    E.g., 'The economy grew rapidly in recent years.' →
          'In recent years, the economy grew rapidly.'
    """
    if _nlp is None:
        return sentence
    
    doc = _nlp(sentence)
    root = None
    for token in doc:
        if token.dep_ == "ROOT":
            root = token
            break
    if root is None:
        return sentence
    
    # Find a trailing prepositional phrase (prep) attached to root
    prep_phrases = []
    for child in root.children:
        if child.dep_ in ("prep", "advmod", "npadvmod") and child.i > root.i:
            span = doc[child.left_edge.i:child.right_edge.i + 1]
            if 2 <= len(span) <= 8:
                prep_phrases.append(span)
    
    if not prep_phrases:
        return sentence
    
    # Pick the last one (often the temporal/locative phrase)
    phrase = prep_phrases[-1]
    phrase_text = phrase.text

    # Skip if phrase starts with a gerund or infinitive particle — these are
    # often object-carrying phrases ("to streamlining processes") not movable
    # adverbials.
    _first_tok = phrase[0]
    if _first_tok.tag_ in ("VBG",) or (
            _first_tok.lower_ == "to" and len(phrase) > 1
            and phrase[1].tag_ in ("VB", "VBG", "VBN", "VBP", "VBZ")):
        return sentence
    
    # Remove from original position and front it
    before = sentence[:phrase.start_char].rstrip(' ,')
    after = sentence[phrase.end_char:].strip()
    
    # Build fronted sentence
    fronted = phrase_text[0].upper() + phrase_text[1:]
    # Downcase the remainder, but preserve ALL-CAPS acronyms (e.g. "AI")
    if before:
        _first_word_before = before.split()[0] if before.split() else ""
        if _first_word_before.isupper() and len(_first_word_before) > 1:
            rest = before  # preserve acronym
        else:
            rest = before[0].lower() + before[1:]
    else:
        rest = ""
    
    result = fronted + ", " + rest
    if after:
        result += " " + after
    
    result = result.rstrip(" .")
    if sentence.rstrip().endswith('.'):
        result += "."
    
    return result


def _clause_swap(sentence: str) -> str:
    """Swap the order of two independent clauses joined by a conjunction.
    E.g., 'A happened, but B happened.' → 'B happened, but A happened.'
    """
    # Look for clause boundaries at conjunctions
    conjunctions = [", but ", ", yet ", ", while ", ", whereas ",
                    "; however, ", ", although "]
    
    for conj in conjunctions:
        if conj in sentence:
            parts = sentence.split(conj, 1)
            if len(parts) == 2 and len(parts[0].split()) >= 4 and len(parts[1].split()) >= 4:
                p1 = parts[0].strip()
                p2 = parts[1].strip().rstrip('.')
                
                # Swap: capitalize p2 as new start, lowercase p1
                p2_cap = p2[0].upper() + p2[1:] if p2 else p2
                # Preserve ALL-CAPS acronyms (e.g. "AI") when downcasing
                _p1_first = p1.split()[0] if p1.split() else ""
                if _p1_first.isupper() and len(_p1_first) > 1:
                    p1_low = p1
                else:
                    p1_low = p1[0].lower() + p1[1:] if p1 else p1
                
                result = p2_cap + ", " + conj.strip(', ') + " " + p1_low
                if sentence.rstrip().endswith('.'):
                    result = result.rstrip('.') + "."
                return result
    
    return sentence


def _split_long_sentence(sentence: str) -> str:
    """Split overly long sentences at natural clause boundaries.
    Targets sentences > 35 words."""
    words = sentence.split()
    if len(words) < 35:
        return sentence
    
    # Only split at markers that produce complete clauses (both halves need subjects)
    # Avoid ", which " since the second half is a relative clause fragment
    split_markers = ["; ", ", and this ", ", and these ",
                     ", resulting in ", ", leading to "]
    
    for marker in split_markers:
        if marker in sentence:
            idx = sentence.find(marker)
            before = sentence[:idx].strip()
            after = sentence[idx + len(marker):].strip()
            if len(before.split()) >= 8 and len(after.split()) >= 6:
                before = before.rstrip('.,')
                after = after[0].upper() + after[1:] if after else after
                if not before.endswith('.'):
                    before += '.'
                if not after.endswith('.'):
                    after = after.rstrip('.') + '.'
                return before + " " + after
    
    return sentence


def _merge_short_sentences(sent1: str, sent2: str) -> str:
    """Merge two short consecutive sentences into one using a connector."""
    w1 = len(sent1.split())
    w2 = len(sent2.split())
    
    if w1 > 10 or w2 > 10 or w1 < 3 or w2 < 3:
        return None  # Not suitable for merging
    
    connectors = [", and ", ", which also ", ". In addition, ",
                  ", and at the same time ", "; moreover, "]
    connector = random.choice(connectors)
    
    s1 = sent1.rstrip('.')
    s2 = sent2[0].lower() + sent2[1:] if sent2 else sent2
    s2 = s2.rstrip('.')
    
    return s1 + connector + s2 + "."


def deep_restructure(sentence: str, intensity: float = 1.0) -> str:
    """Apply deep restructuring transforms probabilistically.
    Higher intensity = more aggressive restructuring."""
    
    # Each transform has its own probability scaled by intensity
    # _split_long_sentence removed — LLM pipeline handles sentence splitting
    transforms = [
        (0.15 * intensity, _front_adverbial),
        (0.12 * intensity, _clause_swap),
    ]
    
    for prob, transform in transforms:
        if random.random() < prob:
            result = transform(sentence)
            if result != sentence and len(result.split()) >= 3:
                return result
    
    return sentence


# ═══════════════════════════════════════════════════════════════════════════
#  FIRST-PERSON DETECTION (preserve if in input)
# ═══════════════════════════════════════════════════════════════════════════

_FIRST_PERSON_MARKERS = re.compile(
    r'\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b', re.IGNORECASE
)

def has_first_person(text: str) -> bool:
    """Detect if the text uses first-person pronouns."""
    return bool(_FIRST_PERSON_MARKERS.search(text))


# ═══════════════════════════════════════════════════════════════════════════
#  CONTRACTION EXPANSION (safety net)
# ═══════════════════════════════════════════════════════════════════════════

_CONTRACTIONS = {
    "can't": "cannot", "won't": "will not", "don't": "do not",
    "doesn't": "does not", "didn't": "did not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "wouldn't": "would not", "shouldn't": "should not",
    "couldn't": "could not", "mustn't": "must not",
    "it's": "it is", "that's": "that is", "there's": "there is",
    "here's": "here is", "what's": "what is", "who's": "who is",
    "he's": "he is", "she's": "she is", "let's": "let us",
    "they're": "they are", "we're": "we are", "you're": "you are",
    "I'm": "I am", "they've": "they have", "we've": "we have",
    "you've": "you have", "I've": "I have",
    "they'll": "they will", "we'll": "we will", "you'll": "you will",
    "I'll": "I will", "he'll": "he will", "she'll": "she will",
    "it'll": "it will", "they'd": "they would", "we'd": "we would",
    "you'd": "you would", "I'd": "I would", "he'd": "he would",
    "she'd": "she would",
}

def expand_contractions(text: str) -> str:
    """Expand all contractions to full forms."""
    for contraction, expansion in _CONTRACTIONS.items():
        # Case-insensitive but preserve sentence-start capitalisation
        pattern = re.compile(re.escape(contraction), re.IGNORECASE)
        def _replace(m):
            matched = m.group(0)
            if matched[0].isupper():
                return expansion[0].upper() + expansion[1:]
            return expansion
        text = pattern.sub(_replace, text)
    return text
