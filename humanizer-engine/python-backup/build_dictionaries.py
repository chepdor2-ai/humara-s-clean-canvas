"""
Build all three dictionary files for the Humanizer Engine.
Generates:
  1. dictionaries/en_thesaurus.jsonl  — massive synonym/thesaurus
  2. dictionaries/words_dictionary.json — word validation set
  3. dictionaries/words_alpha.txt — plain word list fallback

Sources:
  - NLTK WordNet (120k+ synsets, high quality)
  - Hardcoded AI-targeted overrides (the most critical swaps)
"""

import json
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure NLTK data is available
# ---------------------------------------------------------------------------
try:
    import nltk
    for resource in ['wordnet', 'omw-1.4', 'punkt', 'punkt_tab', 'averaged_perceptron_tagger', 'averaged_perceptron_tagger_eng']:
        try:
            nltk.data.find(f'corpora/{resource}' if resource in ('wordnet', 'omw-1.4') else f'tokenizers/{resource}' if 'punkt' in resource else f'taggers/{resource}')
        except LookupError:
            print(f"Downloading NLTK resource: {resource}")
            nltk.download(resource, quiet=True)
    from nltk.corpus import wordnet
except ImportError:
    print("ERROR: NLTK is required. Run: pip install nltk")
    sys.exit(1)

OUT_DIR = Path("dictionaries")
OUT_DIR.mkdir(exist_ok=True)

# ============================================================================
# 1. AI-TARGETED SYNONYM OVERRIDES  (highest priority — these are the swaps
#    that matter most for defeating AI detectors)
# ============================================================================
AI_TARGETED_SYNONYMS = {
    # --- Verbs AI loves ---
    "utilize": ["use", "employ", "apply", "draw on", "work with"],
    "utilise": ["use", "employ", "apply"],
    "utilize": ["use", "employ", "apply", "draw on"],
    "demonstrate": ["show", "reveal", "prove", "illustrate", "display", "make clear"],
    "facilitate": ["help", "ease", "enable", "support", "assist", "make easier"],
    "implement": ["carry out", "put in place", "execute", "apply", "roll out", "set up"],
    "optimize": ["improve", "refine", "fine-tune", "streamline", "enhance"],
    "leverage": ["use", "exploit", "tap into", "draw on", "take advantage of"],
    "enhance": ["improve", "boost", "strengthen", "elevate", "raise", "enrich"],
    "mitigate": ["reduce", "lessen", "ease", "soften", "curb", "limit"],
    "navigate": ["handle", "manage", "deal with", "work through", "steer through"],
    "underscore": ["highlight", "stress", "emphasize", "point out", "bring attention to"],
    "exemplify": ["show", "illustrate", "represent", "typify", "embody"],
    "encompass": ["include", "cover", "span", "contain", "embrace"],
    "prioritize": ["rank", "focus on", "put first", "favor", "give priority to"],
    "streamline": ["simplify", "speed up", "make efficient", "smooth out"],
    "articulate": ["express", "state", "voice", "put into words", "spell out"],
    "substantiate": ["support", "back up", "prove", "confirm", "verify"],
    "delineate": ["outline", "describe", "define", "sketch", "lay out"],
    "elucidate": ["explain", "clarify", "shed light on", "make clear"],
    "illuminate": ["clarify", "explain", "shed light on", "reveal", "highlight"],
    "necessitate": ["require", "demand", "call for", "make necessary"],
    "constitute": ["make up", "form", "represent", "amount to", "compose"],
    "perpetuate": ["continue", "maintain", "sustain", "keep alive", "preserve"],
    "exacerbate": ["worsen", "aggravate", "intensify", "make worse"],
    "alleviate": ["ease", "relieve", "reduce", "lessen", "lighten"],
    "culminate": ["end", "finish", "peak", "climax", "conclude"],
    "proliferate": ["spread", "multiply", "increase", "expand", "grow"],
    "consolidate": ["combine", "merge", "unite", "strengthen", "bring together"],
    "corroborate": ["confirm", "support", "back up", "verify", "validate"],
    "disseminate": ["spread", "distribute", "share", "circulate", "broadcast"],
    "cultivate": ["develop", "grow", "build", "foster", "nurture"],
    "augment": ["increase", "add to", "boost", "expand", "supplement"],
    "ascertain": ["find out", "determine", "discover", "establish", "learn"],
    "commence": ["begin", "start", "kick off", "launch", "open"],
    "terminate": ["end", "stop", "finish", "close", "halt"],
    "endeavor": ["try", "attempt", "strive", "aim", "seek"],
    "formulate": ["create", "develop", "devise", "design", "craft"],
    "inaugurate": ["launch", "start", "begin", "open", "kick off"],
    "juxtapose": ["compare", "contrast", "set side by side", "place together"],
    "postulate": ["suggest", "propose", "assume", "theorize", "put forward"],
    "propound": ["propose", "suggest", "put forward", "advance"],
    "scrutinize": ["examine", "inspect", "study", "analyze", "look closely at"],
    "surmount": ["overcome", "beat", "conquer", "get past", "rise above"],
    "transcend": ["go beyond", "surpass", "exceed", "rise above", "outdo"],
    "ameliorate": ["improve", "better", "enhance", "upgrade", "make better"],
    "engender": ["cause", "produce", "create", "generate", "bring about"],
    "promulgate": ["announce", "promote", "spread", "publicize", "declare"],
    "delineate": ["outline", "describe", "define", "map out", "lay out"],
    "extrapolate": ["infer", "project", "estimate", "extend", "predict"],
    "interpolate": ["insert", "add", "introduce", "estimate"],
    "obviate": ["prevent", "avoid", "remove", "eliminate", "do away with"],
    "precipitate": ["cause", "trigger", "bring about", "spark", "provoke"],
    "predicate": ["base", "found", "rest", "build", "ground"],
    "promulgate": ["announce", "declare", "publish", "proclaim"],
    "recapitulate": ["summarize", "recap", "sum up", "review", "go over"],
    "reiterate": ["repeat", "restate", "say again", "stress again"],
    "stipulate": ["require", "specify", "demand", "state", "set out"],
    "substantiate": ["prove", "confirm", "support", "back up", "verify"],
    "underscore": ["stress", "highlight", "emphasize", "point up"],
    "validate": ["confirm", "verify", "prove", "support", "back up"],
    "attain": ["reach", "achieve", "gain", "get", "earn"],
    "bolster": ["support", "strengthen", "boost", "reinforce", "prop up"],
    "catalyze": ["trigger", "spark", "cause", "drive", "accelerate"],
    "circumvent": ["avoid", "bypass", "get around", "sidestep", "dodge"],
    "coalesce": ["merge", "unite", "combine", "come together", "fuse"],
    "cognize": ["know", "recognize", "understand", "perceive", "grasp"],
    "compel": ["force", "drive", "push", "make", "pressure"],
    "conceptualize": ["imagine", "envision", "picture", "think up", "conceive"],
    "concur": ["agree", "accord", "align", "see eye to eye"],
    "conjecture": ["guess", "speculate", "suppose", "theorize", "surmise"],
    "contravene": ["violate", "break", "breach", "go against", "defy"],
    "convene": ["gather", "assemble", "meet", "come together", "congregate"],
    "deliberate": ["consider", "discuss", "debate", "think over", "weigh"],
    "demarcate": ["mark", "define", "separate", "distinguish", "bound"],
    "discern": ["see", "notice", "detect", "spot", "recognize", "make out"],
    "effectuate": ["carry out", "accomplish", "achieve", "bring about"],
    "enunciate": ["state", "declare", "pronounce", "articulate", "voice"],
    "epitomize": ["represent", "embody", "typify", "symbolize", "sum up"],
    "espouse": ["support", "adopt", "embrace", "champion", "advocate"],
    "evince": ["show", "reveal", "display", "demonstrate", "exhibit"],
    "expound": ["explain", "describe", "detail", "elaborate", "lay out"],
    "fabricate": ["make", "build", "create", "construct", "invent"],
    "galvanize": ["motivate", "inspire", "energize", "stir", "rouse"],
    "hypothesize": ["guess", "theorize", "suppose", "speculate", "propose"],
    "impede": ["block", "hinder", "slow", "obstruct", "hold back"],
    "incite": ["provoke", "stir", "spark", "trigger", "arouse"],
    "incorporate": ["include", "add", "integrate", "combine", "blend"],
    "infer": ["conclude", "deduce", "gather", "assume", "reason"],
    "instigate": ["start", "provoke", "trigger", "initiate", "spark"],
    "integrate": ["combine", "merge", "blend", "unify", "mix"],
    "manifest": ["show", "display", "reveal", "express", "exhibit"],
    "mediate": ["negotiate", "settle", "resolve", "arbitrate", "broker"],
    "mobilize": ["organize", "rally", "assemble", "gather", "activate"],
    "modulate": ["adjust", "regulate", "control", "vary", "tune"],
    "negate": ["cancel", "deny", "undo", "reverse", "invalidate"],
    "obfuscate": ["confuse", "cloud", "obscure", "muddle", "complicate"],
    "orchestrate": ["organize", "arrange", "coordinate", "plan", "manage"],
    "permeate": ["spread through", "fill", "penetrate", "pervade", "saturate"],
    "perpetuate": ["continue", "maintain", "keep up", "sustain", "preserve"],
    "posit": ["suggest", "propose", "assume", "put forward", "claim"],
    "preclude": ["prevent", "rule out", "stop", "block", "exclude"],
    "propagate": ["spread", "promote", "advance", "distribute", "transmit"],
    "rectify": ["fix", "correct", "remedy", "put right", "amend"],
    "reinforce": ["strengthen", "support", "bolster", "back up", "fortify"],
    "replicate": ["copy", "repeat", "reproduce", "duplicate", "mirror"],
    "synthesize": ["combine", "merge", "blend", "integrate", "fuse"],
    "traverse": ["cross", "travel", "go across", "pass through", "cover"],
    "underscore": ["stress", "highlight", "emphasize", "call attention to"],

    # --- Adjectives AI overuses ---
    "significant": ["major", "notable", "important", "big", "key", "meaningful"],
    "comprehensive": ["complete", "thorough", "full", "extensive", "wide-ranging", "all-round"],
    "substantial": ["large", "considerable", "sizable", "major", "meaningful"],
    "crucial": ["key", "vital", "critical", "essential", "important"],
    "pivotal": ["key", "central", "critical", "vital", "decisive"],
    "fundamental": ["basic", "core", "essential", "primary", "central"],
    "profound": ["deep", "intense", "strong", "powerful", "far-reaching"],
    "multifaceted": ["complex", "varied", "diverse", "many-sided"],
    "overarching": ["broad", "main", "central", "dominant", "sweeping"],
    "paramount": ["supreme", "top", "chief", "foremost", "primary"],
    "prevalent": ["common", "widespread", "frequent", "dominant", "rife"],
    "pertinent": ["relevant", "related", "applicable", "fitting", "apt"],
    "intricate": ["complex", "detailed", "elaborate", "involved", "complicated"],
    "robust": ["strong", "solid", "sturdy", "resilient", "tough"],
    "nuanced": ["subtle", "detailed", "complex", "refined", "delicate"],
    "salient": ["key", "main", "important", "notable", "prominent"],
    "ubiquitous": ["everywhere", "widespread", "common", "pervasive"],
    "inherent": ["built-in", "natural", "innate", "intrinsic", "inborn"],
    "plausible": ["reasonable", "likely", "believable", "credible", "possible"],
    "feasible": ["possible", "doable", "practical", "workable", "viable"],
    "efficacious": ["effective", "successful", "useful", "productive"],
    "exemplary": ["outstanding", "model", "ideal", "excellent", "first-rate"],
    "imperative": ["essential", "vital", "critical", "urgent", "necessary"],
    "indispensable": ["essential", "vital", "necessary", "crucial", "key"],
    "meticulous": ["careful", "thorough", "precise", "exact", "detailed"],
    "prolific": ["productive", "fertile", "abundant", "creative"],
    "quintessential": ["classic", "typical", "ideal", "perfect", "pure"],
    "resilient": ["tough", "strong", "hardy", "adaptable", "flexible"],
    "seminal": ["influential", "groundbreaking", "pioneering", "key"],
    "tangible": ["real", "concrete", "solid", "physical", "actual"],
    "unequivocal": ["clear", "definite", "certain", "absolute", "plain"],
    "unprecedented": ["new", "novel", "unheard-of", "first", "unique"],
    "volatile": ["unstable", "unpredictable", "changeable", "erratic"],
    "detrimental": ["harmful", "damaging", "bad", "negative", "hurtful"],
    "commendable": ["praiseworthy", "admirable", "laudable", "worthy"],
    "concomitant": ["accompanying", "associated", "related", "connected"],
    "consequential": ["important", "significant", "major", "meaningful"],
    "deleterious": ["harmful", "damaging", "destructive", "bad"],
    "discernible": ["noticeable", "visible", "clear", "detectable", "obvious"],
    "disparate": ["different", "distinct", "unlike", "varied", "diverse"],
    "elusive": ["hard to find", "tricky", "slippery", "evasive", "fleeting"],
    "empirical": ["observed", "experimental", "measured", "practical"],
    "equitable": ["fair", "just", "balanced", "impartial", "even"],
    "erroneous": ["wrong", "incorrect", "false", "mistaken", "flawed"],
    "extraneous": ["irrelevant", "unnecessary", "extra", "unrelated"],
    "gratuitous": ["unnecessary", "uncalled for", "unwarranted", "needless"],
    "heterogeneous": ["mixed", "diverse", "varied", "assorted"],
    "homogeneous": ["uniform", "consistent", "alike", "similar"],
    "idiosyncratic": ["unique", "individual", "personal", "peculiar"],
    "immutable": ["unchanging", "fixed", "permanent", "constant"],
    "impervious": ["resistant", "immune", "unaffected", "proof against"],
    "incipient": ["beginning", "early", "emerging", "developing", "budding"],
    "incontrovertible": ["undeniable", "certain", "indisputable", "sure"],
    "indelible": ["lasting", "permanent", "enduring", "unforgettable"],
    "indigenous": ["native", "local", "original", "natural"],
    "ineffable": ["indescribable", "unspeakable", "beyond words"],
    "inexorable": ["relentless", "unstoppable", "inevitable", "unyielding"],
    "innumerable": ["countless", "many", "numerous", "endless"],
    "insidious": ["sneaky", "subtle", "gradual", "stealthy", "creeping"],
    "judiciously": ["wisely", "carefully", "sensibly", "prudently"],
    "laudable": ["praiseworthy", "admirable", "commendable", "worthy"],
    "lamentable": ["regrettable", "sad", "unfortunate", "deplorable"],
    "lucrative": ["profitable", "rewarding", "money-making", "paying"],
    "malleable": ["flexible", "adaptable", "pliable", "moldable"],
    "nascent": ["new", "emerging", "budding", "developing", "young"],
    "nefarious": ["wicked", "evil", "criminal", "villainous", "sinister"],
    "negligible": ["tiny", "small", "minor", "trivial", "insignificant"],
    "nominal": ["small", "token", "minimal", "slight", "symbolic"],
    "onerous": ["burdensome", "heavy", "demanding", "difficult", "tough"],
    "palpable": ["obvious", "clear", "noticeable", "unmistakable", "plain"],
    "paradoxical": ["contradictory", "conflicting", "ironic", "puzzling"],
    "pecuniary": ["financial", "monetary", "money-related", "fiscal"],
    "pervasive": ["widespread", "common", "prevalent", "extensive"],
    "pragmatic": ["practical", "realistic", "sensible", "down-to-earth"],
    "precarious": ["risky", "unstable", "uncertain", "dangerous", "shaky"],
    "prodigious": ["huge", "enormous", "vast", "immense", "impressive"],
    "proficient": ["skilled", "expert", "capable", "competent", "able"],
    "propitious": ["favorable", "promising", "lucky", "encouraging"],
    "rudimentary": ["basic", "simple", "elementary", "fundamental"],
    "superfluous": ["unnecessary", "excess", "extra", "redundant"],
    "surreptitious": ["secret", "sneaky", "covert", "hidden", "stealthy"],
    "tenuous": ["weak", "thin", "slight", "flimsy", "shaky"],
    "ubiquitous": ["everywhere", "omnipresent", "widespread", "common"],
    "unambiguous": ["clear", "definite", "plain", "certain", "obvious"],
    "vacuous": ["empty", "blank", "mindless", "hollow", "vapid"],
    "verbose": ["wordy", "long-winded", "rambling", "lengthy"],
    "viable": ["workable", "feasible", "practical", "possible", "realistic"],
    "zealous": ["eager", "passionate", "enthusiastic", "keen", "fervent"],

    # --- Adverbs AI overuses ---
    "consequently": ["so", "as a result", "because of this", "therefore"],
    "subsequently": ["later", "then", "after that", "next", "following this"],
    "fundamentally": ["basically", "at its core", "essentially", "at heart"],
    "inherently": ["naturally", "by nature", "essentially", "intrinsically"],
    "predominantly": ["mostly", "mainly", "largely", "chiefly", "primarily"],
    "inevitably": ["unavoidably", "naturally", "surely", "certainly"],
    "undeniably": ["clearly", "without doubt", "certainly", "obviously"],
    "substantively": ["meaningfully", "significantly", "in a real way"],
    "ostensibly": ["apparently", "seemingly", "on the face of it"],
    "unequivocally": ["clearly", "without doubt", "absolutely", "definitely"],
    "meticulously": ["carefully", "thoroughly", "precisely", "painstakingly"],
    "intrinsically": ["naturally", "inherently", "essentially", "by nature"],
    "categorically": ["absolutely", "completely", "totally", "flatly"],
    "judiciously": ["wisely", "carefully", "sensibly", "prudently"],
    "expeditiously": ["quickly", "swiftly", "promptly", "rapidly"],
    "indiscriminately": ["randomly", "blindly", "carelessly", "without thought"],
    "paradoxically": ["oddly", "strangely", "ironically", "surprisingly"],
    "predominantly": ["mainly", "mostly", "largely", "chiefly"],
    "systematically": ["methodically", "step by step", "in order", "logically"],
    "unilaterally": ["alone", "single-handedly", "independently", "on one's own"],

    # --- Nouns AI overuses ---
    "methodology": ["method", "approach", "technique", "process", "way"],
    "paradigm": ["model", "framework", "pattern", "standard", "example"],
    "framework": ["structure", "system", "model", "setup", "plan"],
    "landscape": ["scene", "field", "area", "picture", "situation"],
    "trajectory": ["path", "course", "direction", "trend", "route"],
    "discourse": ["discussion", "debate", "conversation", "dialogue", "talk"],
    "dichotomy": ["split", "divide", "contrast", "gap", "difference"],
    "conundrum": ["puzzle", "problem", "dilemma", "riddle", "mystery"],
    "juxtaposition": ["contrast", "comparison", "pairing", "side-by-side"],
    "ramification": ["consequence", "result", "effect", "outcome", "impact"],
    "underpinning": ["basis", "foundation", "support", "base", "backbone"],
    "synergy": ["teamwork", "cooperation", "collaboration", "combined effect"],
    "catalyst": ["trigger", "spark", "driver", "cause", "spur"],
    "prerequisite": ["requirement", "condition", "necessity", "must-have"],
    "stakeholder": ["party", "participant", "player", "interest group"],
    "infrastructure": ["system", "setup", "foundation", "framework", "base"],
    "initiative": ["plan", "program", "effort", "project", "scheme"],
    "implication": ["effect", "consequence", "result", "meaning", "impact"],
    "proliferation": ["spread", "growth", "increase", "expansion"],
    "propensity": ["tendency", "inclination", "leaning", "likelihood"],
    "juxtaposition": ["contrast", "comparison", "pairing"],
    "amalgamation": ["mix", "blend", "merger", "combination", "fusion"],
    "cognizance": ["awareness", "knowledge", "notice", "understanding"],
    "conjecture": ["guess", "theory", "speculation", "assumption"],
    "consortium": ["group", "alliance", "partnership", "body"],
    "contingency": ["backup", "alternative", "fallback", "plan B"],
    "dichotomy": ["divide", "split", "contrast", "difference"],
    "disparity": ["gap", "difference", "inequality", "imbalance"],
    "efficacy": ["effectiveness", "success", "potency", "power"],
    "endeavor": ["effort", "attempt", "try", "project", "venture"],
    "hegemony": ["dominance", "control", "power", "authority", "rule"],
    "heterogeneity": ["diversity", "variety", "difference", "mix"],
    "impediment": ["barrier", "obstacle", "block", "hurdle", "hindrance"],
    "inclination": ["tendency", "preference", "leaning", "urge", "desire"],
    "juxtaposition": ["contrast", "side-by-side placement", "comparison"],
    "magnitude": ["size", "scale", "extent", "degree", "scope"],
    "manifestation": ["sign", "expression", "display", "form", "evidence"],
    "nomenclature": ["naming", "terminology", "terms", "vocabulary"],
    "paradigm": ["model", "pattern", "example", "standard"],
    "pedagogy": ["teaching", "education", "instruction", "training"],
    "phenomenon": ["event", "occurrence", "happening", "fact"],
    "postulation": ["assumption", "theory", "claim", "assertion"],
    "proponent": ["supporter", "advocate", "backer", "champion"],
    "recapitulation": ["summary", "recap", "review", "overview"],
    "remuneration": ["pay", "salary", "compensation", "wage", "earnings"],
    "requisite": ["requirement", "need", "must-have", "essential"],
    "stratification": ["layering", "ranking", "grading", "ordering"],
    "substantiation": ["proof", "evidence", "confirmation", "support"],
    "symbiosis": ["partnership", "cooperation", "mutual benefit"],
    "ubiquity": ["prevalence", "commonness", "omnipresence"],

    # --- Phrases AI loves ---
    "in order to": ["to", "so as to", "for"],
    "a wide range of": ["many", "various", "diverse", "all kinds of"],
    "a plethora of": ["many", "lots of", "plenty of", "a wealth of"],
    "a myriad of": ["many", "countless", "numerous", "a host of"],
    "in the context of": ["in", "within", "regarding", "about"],
    "with respect to": ["about", "regarding", "concerning", "on"],
    "in terms of": ["regarding", "about", "when it comes to", "for"],
    "due to the fact that": ["because", "since", "as"],
    "it is worth noting that": ["notably", "note that", "keep in mind"],
    "it is important to note": ["note that", "importantly", "keep in mind"],
    "it is crucial to": ["we must", "we need to", "it's key to"],
    "on the other hand": ["but", "however", "yet", "then again"],
    "as a matter of fact": ["in fact", "actually", "really"],
    "at the end of the day": ["ultimately", "in the end", "finally"],
    "the fact of the matter is": ["the truth is", "really", "in reality"],
    "in light of": ["given", "considering", "because of", "due to"],
    "with regard to": ["about", "regarding", "concerning", "on"],
    "in the realm of": ["in", "within", "in the field of"],
    "it goes without saying": ["obviously", "clearly", "of course"],
    "needless to say": ["obviously", "clearly", "of course"],
    "for the purpose of": ["to", "for", "in order to"],
    "in the event that": ["if", "should", "in case"],
    "prior to": ["before", "ahead of", "earlier than"],
    "subsequent to": ["after", "following", "once"],
    "in conjunction with": ["with", "along with", "together with"],
    "in the absence of": ["without", "lacking", "minus"],
    "in accordance with": ["following", "per", "as per", "under"],
    "notwithstanding": ["despite", "regardless", "even so", "still"],
    "with the exception of": ["except", "apart from", "other than"],
    "in the vicinity of": ["near", "around", "close to", "by"],
    "at this point in time": ["now", "currently", "right now"],
    "on a regular basis": ["regularly", "often", "routinely"],
    "in close proximity to": ["near", "close to", "by", "next to"],
    "a significant number of": ["many", "lots of", "a large number of"],
    "a considerable amount of": ["a lot of", "much", "plenty of"],
    "plays a crucial role": ["matters", "is key", "is important"],
    "serves as a": ["is a", "acts as a", "works as a"],
    "it can be argued that": ["arguably", "some say", "one could say"],
    "there is no doubt that": ["clearly", "certainly", "without question"],
    "it is evident that": ["clearly", "plainly", "obviously"],
    "it should be noted that": ["note that", "keep in mind", "notably"],
    "this is particularly true": ["this especially applies", "this holds true especially"],
    "the aforementioned": ["the above", "this", "these", "the previous"],
    "henceforth": ["from now on", "going forward", "from here on"],
    "therein lies": ["that's where", "this is where", "here is where"],
    "to that end": ["for this reason", "so", "with that goal"],
    "by and large": ["mostly", "generally", "on the whole", "overall"],
    "first and foremost": ["first", "mainly", "above all", "most importantly"],
    "each and every": ["every", "all", "each"],
    "in this day and age": ["today", "now", "these days", "currently"],
    "the bottom line is": ["basically", "in short", "the point is"],

    # --- Common everyday words with richer alternatives ---
    "good": ["solid", "strong", "fine", "decent", "great", "positive", "quality"],
    "bad": ["poor", "weak", "negative", "flawed", "lacking", "problematic"],
    "very": ["really", "quite", "highly", "extremely", "remarkably"],
    "important": ["key", "vital", "critical", "central", "major", "essential"],
    "interesting": ["notable", "compelling", "engaging", "striking", "curious"],
    "different": ["distinct", "unique", "separate", "varied", "diverse"],
    "large": ["big", "sizable", "vast", "extensive", "major", "huge"],
    "small": ["little", "minor", "modest", "slight", "compact", "tiny"],
    "many": ["numerous", "several", "plenty of", "a number of", "various"],
    "show": ["reveal", "display", "illustrate", "present", "demonstrate"],
    "help": ["assist", "support", "aid", "enable", "facilitate"],
    "think": ["believe", "consider", "feel", "reason", "reckon", "figure"],
    "make": ["create", "build", "form", "produce", "craft", "develop"],
    "get": ["obtain", "receive", "gain", "acquire", "pick up", "earn"],
    "give": ["provide", "offer", "supply", "deliver", "present", "grant"],
    "take": ["grab", "seize", "accept", "adopt", "pick", "select"],
    "use": ["employ", "apply", "draw on", "work with", "rely on"],
    "find": ["discover", "locate", "identify", "spot", "uncover", "detect"],
    "know": ["understand", "realize", "recognize", "see", "grasp", "get"],
    "need": ["require", "want", "demand", "call for", "depend on"],
    "keep": ["maintain", "hold", "retain", "preserve", "sustain"],
    "start": ["begin", "launch", "kick off", "open", "initiate"],
    "try": ["attempt", "aim", "seek", "strive", "work to"],
    "tell": ["inform", "let know", "advise", "share", "relay"],
    "seem": ["appear", "look", "come across as", "feel"],
    "feel": ["sense", "experience", "perceive", "notice"],
    "become": ["turn into", "grow", "develop into", "evolve into"],
    "leave": ["depart", "exit", "go", "move on", "withdraw"],
    "put": ["place", "set", "position", "lay", "post"],
    "mean": ["indicate", "suggest", "imply", "signal", "denote"],
    "change": ["alter", "modify", "shift", "adjust", "revise", "transform"],
    "move": ["shift", "transfer", "relocate", "advance", "progress"],
    "follow": ["pursue", "track", "trail", "obey", "adhere to"],
    "ask": ["request", "inquire", "question", "query", "seek"],
    "work": ["function", "operate", "perform", "labor", "serve"],
    "call": ["name", "label", "term", "dub", "refer to"],
    "run": ["operate", "manage", "lead", "drive", "conduct"],
    "hold": ["grasp", "grip", "carry", "bear", "possess"],
    "turn": ["shift", "rotate", "convert", "switch", "transform"],
    "bring": ["deliver", "carry", "supply", "fetch", "transport"],
    "lead": ["guide", "direct", "head", "steer", "manage"],
    "live": ["reside", "dwell", "inhabit", "exist", "stay"],
    "stand": ["endure", "tolerate", "bear", "withstand", "remain"],
    "set": ["establish", "arrange", "fix", "place", "define"],
    "learn": ["discover", "find out", "pick up", "study", "absorb"],
    "grow": ["expand", "increase", "develop", "rise", "mature"],
    "lose": ["misplace", "forfeit", "drop", "shed", "sacrifice"],
    "pay": ["compensate", "reimburse", "settle", "cover", "fund"],
    "meet": ["encounter", "greet", "connect with", "join", "gather"],
    "include": ["contain", "involve", "cover", "embrace", "feature"],
    "continue": ["proceed", "carry on", "persist", "go on", "maintain"],
    "stop": ["halt", "cease", "end", "pause", "quit"],
    "create": ["make", "build", "design", "develop", "produce"],
    "speak": ["talk", "say", "voice", "express", "communicate"],
    "read": ["study", "review", "examine", "scan", "peruse"],
    "allow": ["let", "permit", "enable", "authorize", "grant"],
    "add": ["include", "attach", "insert", "append", "supplement"],
    "spend": ["devote", "invest", "allocate", "use up"],
    "increase": ["raise", "boost", "grow", "expand", "climb"],
    "decrease": ["drop", "reduce", "lower", "decline", "shrink"],
    "improve": ["enhance", "better", "upgrade", "refine", "boost"],
    "develop": ["build", "create", "design", "craft", "evolve"],
    "provide": ["give", "supply", "offer", "deliver", "furnish"],
    "require": ["need", "demand", "call for", "take", "depend on"],
    "consider": ["think about", "weigh", "ponder", "examine", "review"],
    "suggest": ["propose", "recommend", "advise", "hint", "imply"],
    "produce": ["make", "create", "generate", "yield", "manufacture"],
    "achieve": ["reach", "attain", "accomplish", "earn", "gain"],
    "maintain": ["keep", "preserve", "sustain", "hold", "uphold"],
    "establish": ["set up", "create", "found", "build", "start"],
    "determine": ["decide", "find out", "settle", "figure out", "resolve"],
    "indicate": ["show", "suggest", "point to", "signal", "reveal"],
    "involve": ["include", "require", "entail", "concern", "engage"],
    "represent": ["stand for", "symbolize", "depict", "show", "mean"],
    "support": ["back", "help", "aid", "sustain", "uphold"],
    "affect": ["influence", "impact", "change", "alter", "shape"],
    "identify": ["spot", "recognize", "detect", "find", "pinpoint"],
    "assume": ["suppose", "presume", "expect", "guess", "believe"],
    "occur": ["happen", "take place", "arise", "come about", "emerge"],
    "exist": ["be", "live", "persist", "survive", "remain"],
    "appear": ["seem", "look", "show up", "emerge", "surface"],
    "describe": ["explain", "outline", "detail", "depict", "portray"],
    "contribute": ["add", "give", "provide", "supply", "lend"],
    "reveal": ["show", "uncover", "expose", "display", "disclose"],
    "obtain": ["get", "acquire", "gain", "secure", "earn"],
    "relate": ["connect", "link", "tie", "associate", "refer"],
    "examine": ["study", "inspect", "analyze", "review", "look at"],
    "compare": ["contrast", "measure against", "weigh", "match"],
    "explore": ["investigate", "look into", "study", "probe", "research"],
    "define": ["describe", "explain", "specify", "outline", "characterize"],
    "ensure": ["make sure", "guarantee", "confirm", "secure", "verify"],
    "operate": ["run", "work", "function", "manage", "handle"],
    "apply": ["use", "employ", "put to use", "exercise", "implement"],
    "reduce": ["cut", "lower", "decrease", "lessen", "shrink"],
    "select": ["choose", "pick", "opt for", "decide on", "go with"],
    "generate": ["create", "produce", "make", "yield", "cause"],
    "promote": ["encourage", "push", "advance", "boost", "support"],
    "assess": ["evaluate", "judge", "review", "measure", "appraise"],
    "address": ["tackle", "deal with", "handle", "respond to", "confront"],
    "pursue": ["follow", "chase", "seek", "go after", "strive for"],
    "explain": ["describe", "clarify", "spell out", "break down", "interpret"],
    "demonstrate": ["show", "prove", "illustrate", "display", "exhibit"],
    "retain": ["keep", "hold", "maintain", "preserve", "save"],
    "discover": ["find", "uncover", "detect", "spot", "stumble upon"],
    "enable": ["allow", "let", "empower", "make possible", "permit"],
    "approach": ["method", "way", "strategy", "angle", "tactic"],
}

def build_thesaurus():
    """Build en_thesaurus.jsonl from WordNet + AI-targeted overrides."""
    print("Building thesaurus from WordNet + AI-targeted overrides...")
    
    thesaurus = {}
    
    # Phase 1: Extract ALL WordNet synonym relationships
    count = 0
    for synset in wordnet.all_synsets():
        lemma_names = [l.name().lower().replace("_", " ") for l in synset.lemmas()]
        # For each word in the synset, all other words are synonyms
        for word in lemma_names:
            if word not in thesaurus:
                thesaurus[word] = set()
            for other in lemma_names:
                if other != word:
                    thesaurus[word].add(other)
        count += 1
    
    print(f"  Phase 1: Extracted synonyms from {count} WordNet synsets")
    print(f"  Unique words so far: {len(thesaurus)}")
    
    # Phase 2: Overlay AI-targeted overrides (these take priority)
    for word, syns in AI_TARGETED_SYNONYMS.items():
        word_lower = word.lower()
        if word_lower not in thesaurus:
            thesaurus[word_lower] = set()
        # Prepend AI-targeted synonyms (they'll be listed first in output)
        existing = thesaurus[word_lower]
        thesaurus[word_lower] = set(s.lower() for s in syns) | existing
    
    print(f"  Phase 2: Applied {len(AI_TARGETED_SYNONYMS)} AI-targeted overrides")
    
    # Phase 3: Write JSONL
    out_path = OUT_DIR / "en_thesaurus.jsonl"
    written = 0
    with open(out_path, 'w', encoding='utf-8') as f:
        for word in sorted(thesaurus.keys()):
            syns = list(thesaurus[word])
            if syns:
                entry = {"word": word, "synonyms": syns}
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                written += 1
    
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"  Written: {out_path} ({written} entries, {size_mb:.1f} MB)")
    return written


def build_word_dictionary():
    """Build words_dictionary.json and words_alpha.txt from WordNet."""
    print("\nBuilding word validation dictionary from WordNet...")
    
    words = set()
    
    # Collect every lemma from WordNet
    for synset in wordnet.all_synsets():
        for lemma in synset.lemmas():
            word = lemma.name().lower().replace("_", " ")
            # Only include single words (no multi-word phrases) for the validation dict
            if " " not in word and word.isalpha():
                words.add(word)
    
    # Add common words that might be missing from WordNet
    common_extras = {
        "a", "an", "the", "is", "am", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should",
        "may", "might", "must", "can", "could", "i", "you", "he", "she", "it", "we",
        "they", "me", "him", "her", "us", "them", "my", "your", "his", "its", "our",
        "their", "mine", "yours", "hers", "ours", "theirs", "this", "that", "these",
        "those", "who", "whom", "which", "what", "whose", "where", "when", "why", "how",
        "all", "each", "every", "both", "few", "more", "most", "other", "some", "such",
        "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
        "just", "because", "as", "until", "while", "of", "at", "by", "for", "with",
        "about", "against", "between", "through", "during", "before", "after", "above",
        "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
        "again", "further", "then", "once", "here", "there", "when", "where", "why",
        "how", "all", "both", "each", "few", "more", "most", "other", "some", "such",
        "and", "but", "if", "or", "yet", "also", "still", "even", "now", "already",
        "always", "never", "often", "sometimes", "usually", "really", "quite", "rather",
        "well", "much", "far", "long", "soon", "today", "tomorrow", "yesterday",
        "ok", "okay", "yeah", "yes", "no", "nope", "gonna", "wanna", "gotta",
        "kinda", "sorta", "dunno", "hey", "hi", "hello", "bye", "goodbye",
    }
    words.update(common_extras)
    
    sorted_words = sorted(words)
    
    # Write JSON format
    json_path = OUT_DIR / "words_dictionary.json"
    word_dict = {w: 1 for w in sorted_words}
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(word_dict, f, ensure_ascii=False)
    
    json_size = json_path.stat().st_size / (1024 * 1024)
    print(f"  Written: {json_path} ({len(sorted_words)} words, {json_size:.1f} MB)")
    
    # Write plain text format
    txt_path = OUT_DIR / "words_alpha.txt"
    with open(txt_path, 'w', encoding='utf-8') as f:
        for w in sorted_words:
            f.write(w + "\n")
    
    txt_size = txt_path.stat().st_size / (1024 * 1024)
    print(f"  Written: {txt_path} ({len(sorted_words)} words, {txt_size:.1f} MB)")
    
    return len(sorted_words)


if __name__ == "__main__":
    print("=" * 60)
    print("HUMANIZER ENGINE — DICTIONARY BUILDER")
    print("=" * 60)
    print()
    
    thesaurus_count = build_thesaurus()
    word_count = build_word_dictionary()
    
    print()
    print("=" * 60)
    print("BUILD COMPLETE")
    print("=" * 60)
    print(f"  Thesaurus entries:  {thesaurus_count:,}")
    print(f"  Validation words:   {word_count:,}")
    print(f"  Output directory:   {OUT_DIR.resolve()}")
    print()
    print("All dictionaries are ready. The humanizer will auto-load them.")
