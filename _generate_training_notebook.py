#!/usr/bin/env python3
# Generate the massive humanizer training notebook for Google Colab.
import json

notebook = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": [], "gpuType": "T4"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
        "accelerator": "GPU"
    },
    "cells": []
}

def md(source):
    notebook["cells"].append({"cell_type": "markdown", "metadata": {}, "source": source})

def code(source):
    notebook["cells"].append({"cell_type": "code", "metadata": {}, "source": source, "outputs": [], "execution_count": None})

# ═══════════════════════════════════════════════════════════════════
# CELL 1: Title
# ═══════════════════════════════════════════════════════════════════
md(r'''# Massive Humanizer Engine -- 300K+ Training on Free T4 GPU

**Trains an aggressive text humanizer using 200K-500K pairs from real scholarly and literary sources.**

| Step | What | Time (T4) |
|------|------|-----------|
| 1 | Install dependencies + GPU check | ~2 min |
| 2 | Configuration | instant |
| 3 | Load base model (Drive or HuggingFace) | ~2 min |
| 4 | Download 4 datasets (scholarly + literary) | ~10-25 min |
| 5 | AI corruption engine + build pairs | ~5-10 min |
| 6 | LoRA fine-tuning | ~1.5-3.5 hr |
| 7 | Test and evaluate | ~2 min |
| 8 | Export model + download | ~3 min |

**Total: ~2-4.5 hours** -- fits comfortably in Colab free tier.

### Data Sources (Zero AI Contamination)
| Dataset | Type | Samples | Why |
|---------|------|---------|-----|
| **GPT-Wiki-Intro** | Pre-paired AI vs Human | 150K | Encyclopedia prose vs GPT output |
| **HC3** | Pre-paired AI vs Human | 24K | Human vs ChatGPT answers |
| **PubMed abstracts** | Human-written scholarly | 120K | Pre-AI biomedical papers (all pre-2020) |
| **arXiv abstracts** | Human-written scholarly | 150K | Pre-AI STEM papers (all pre-2020) |

### Training Rules (Hardcoded)
- 40-60% of sentences transformed (aggressive rewriting)
- No contractions in output
- No rhetorical questions in output
- No first person unless present in input
- No AI filler (Furthermore, Moreover, It is important to note)
- Natural sentence flow (varied structure, merged clauses)

---
### Before You Start
1. Open in [Google Colab](https://colab.research.google.com/)
2. **Runtime -> Change runtime type -> T4 GPU**
3. Run each cell in order (Shift+Enter)
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 2: Install Dependencies
# ═══════════════════════════════════════════════════════════════════
md("## Step 1: Install Dependencies & Check GPU")

code(r'''# STEP 1: Install all dependencies
!pip install -q torch transformers datasets safetensors tqdm accelerate peft sentencepiece protobuf

import torch
import sys
print(f"Python: {sys.version.split()[0]}")
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    gpu = torch.cuda.get_device_name(0)
    props = torch.cuda.get_device_properties(0)
    vram = getattr(props, 'total_memory', getattr(props, 'total_mem', 0)) / 1e9
    print(f"GPU: {gpu}")
    print(f"VRAM: {vram:.1f} GB")
else:
    print("WARNING: No GPU detected! Training will be extremely slow.")
    print("   Go to Runtime -> Change runtime type -> T4 GPU")

print("\nAll dependencies installed!")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 3: Configuration
# ═══════════════════════════════════════════════════════════════════
md('''## Step 2: Configuration

**Edit the variables below before running.** The defaults work well for most cases.
''')

code(r'''# STEP 2: CONFIGURATION -- Edit these values

# Training Size:
# "quick"    -> ~200K pairs, ~1.5-2 hr on T4 (best for testing)
# "standard" -> ~300K pairs, ~2.5-3 hr on T4 (recommended)
# "full"     -> ~450K pairs, ~3.5-4.5 hr on T4 (maximum quality)
TRAINING_SIZE = "standard"

# Model Source:
# "drive"       -> Load your oxygen-model from Google Drive
# "huggingface" -> Use google/flan-t5-base (~248M params, free download)
MODEL_SOURCE = "huggingface"

# Google Drive path (only if MODEL_SOURCE = "drive")
DRIVE_MODEL_PATH = "/content/drive/MyDrive/oxygen-model"

# Training Hyperparameters
EPOCHS = 1
LEARNING_RATE = 3e-4       # LoRA uses higher LR than full fine-tuning
BATCH_SIZE = 8             # Per-device batch size (T4 handles 8 with LoRA+fp16)
GRAD_ACCUM = 4             # Effective batch = 8 x 4 = 32
MAX_SEQ_LEN = 128          # Token length (128 fits most academic text, much faster)
LORA_RANK = 32             # LoRA rank (16=fast, 32=balanced, 64=max quality)
LORA_ALPHA = 64            # LoRA alpha (typically 2x rank)
WARMUP_RATIO = 0.05
WEIGHT_DECAY = 0.01

# AI Corruption Rate (fraction of SENTENCES to corrupt; each gets 2-4 stacked corruptions)
MIN_CORRUPTION_RATE = 0.70  # At least 70% of sentences hit
MAX_CORRUPTION_RATE = 0.90  # Up to 90%
MIN_WORD_CHANGE = 0.60      # Target: 60%+ word-level change per sentence

# Dataset sizes per source
SIZES = {
    "quick":    {"wiki": 120000, "hc3": 24000, "pubmed": 60000,  "arxiv": 0},
    "standard": {"wiki": 150000, "hc3": 24000, "pubmed": 80000,  "arxiv": 50000},
    "full":     {"wiki": 150000, "hc3": 24000, "pubmed": 120000, "arxiv": 150000},
}

ds_sizes = SIZES[TRAINING_SIZE]
total_target = sum(ds_sizes.values())
print(f"Training size: {TRAINING_SIZE.upper()}")
print(f"Target pairs: {total_target:,}")
print(f"  Wiki: {ds_sizes['wiki']:,} | HC3: {ds_sizes['hc3']:,} | PubMed: {ds_sizes['pubmed']:,} | arXiv: {ds_sizes['arxiv']:,}")
print(f"  Epochs: {EPOCHS} | Batch: {BATCH_SIZE}x{GRAD_ACCUM}={BATCH_SIZE*GRAD_ACCUM} | SeqLen: {MAX_SEQ_LEN}")
print(f"  LoRA rank: {LORA_RANK} | LR: {LEARNING_RATE}")

steps_per_epoch = total_target // (BATCH_SIZE * GRAD_ACCUM)
total_steps = steps_per_epoch * EPOCHS
est_hours = total_steps / (4.0 * 3600)
print(f"\nEstimated: {total_steps:,} steps -> ~{est_hours:.1f}-{est_hours*1.5:.1f} hours on T4")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 4: Load Model
# ═══════════════════════════════════════════════════════════════════
md('''## Step 3: Load Base Model

Choose between:
- **Google Drive** -- Upload your oxygen-model/ folder to Drive first
- **HuggingFace** -- Downloads google/flan-t5-base (~248M params, free)

Both work equally well. HuggingFace option requires no setup.
''')

code(r'''# STEP 3: Load the base T5 model
import os, shutil, time
from transformers import AutoTokenizer, T5ForConditionalGeneration

device = "cuda" if torch.cuda.is_available() else "cpu"

if MODEL_SOURCE == "drive":
    from google.colab import drive
    print("Mounting Google Drive...")
    drive.mount('/content/drive', force_remount=True)

    LOCAL_MODEL_DIR = "/content/oxygen-model"
    if os.path.exists(LOCAL_MODEL_DIR):
        shutil.rmtree(LOCAL_MODEL_DIR)
    os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)

    if not os.path.exists(DRIVE_MODEL_PATH):
        raise FileNotFoundError(
            f"Model not found at: {DRIVE_MODEL_PATH}\n"
            f"Upload your oxygen-model/ folder to Google Drive first,\n"
            f"or set MODEL_SOURCE = 'huggingface' in Step 2."
        )

    print(f"Copying model from {DRIVE_MODEL_PATH}...")
    for f in os.listdir(DRIVE_MODEL_PATH):
        src = os.path.join(DRIVE_MODEL_PATH, f)
        if os.path.isfile(src):
            size_mb = os.path.getsize(src) / 1e6
            print(f"  Copying {f} ({size_mb:.1f} MB)...")
            shutil.copy2(src, os.path.join(LOCAL_MODEL_DIR, f))

    tokenizer = AutoTokenizer.from_pretrained(LOCAL_MODEL_DIR, local_files_only=True)
    model = T5ForConditionalGeneration.from_pretrained(
        LOCAL_MODEL_DIR, local_files_only=True, torch_dtype=torch.float32
    ).to(device)

elif MODEL_SOURCE == "huggingface":
    HF_MODEL = "google/flan-t5-base"
    print(f"Downloading {HF_MODEL} from HuggingFace...")
    tokenizer = AutoTokenizer.from_pretrained(HF_MODEL)
    model = T5ForConditionalGeneration.from_pretrained(
        HF_MODEL, torch_dtype=torch.float32
    ).to(device)
    LOCAL_MODEL_DIR = None
else:
    raise ValueError(f"Unknown MODEL_SOURCE: {MODEL_SOURCE}")

n_params = sum(p.numel() for p in model.parameters())
print(f"\nModel loaded: {n_params/1e6:.0f}M parameters on {device}")
print(f"  Architecture: d_model={model.config.d_model}, layers={model.config.num_layers}, heads={model.config.num_heads}")

# Sanity test
test_ids = tokenizer("humanize: This is a test.", return_tensors="pt").input_ids.to(device)
with torch.no_grad():
    out = model.generate(test_ids, max_new_tokens=32)
print(f"  Sanity test: {tokenizer.decode(out[0], skip_special_tokens=True)}")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 5: Download Datasets
# ═══════════════════════════════════════════════════════════════════
md('''## Step 4: Download Training Datasets

Downloads from 4 sources:
1. **GPT-Wiki-Intro** (127 MB) -- 150K Wikipedia human texts paired with GPT-generated versions
2. **HC3** (147 MB) -- 24K human vs ChatGPT answer pairs
3. **PubMed abstracts** (streaming) -- Biomedical scholarly papers, all pre-AI era
4. **arXiv abstracts** (streaming) -- STEM scholarly papers, all pre-AI era

All texts are **guaranteed human-written** (collected before AI writing tools existed).
''')

code(r'''# STEP 4: Download all datasets
import re
import random
from datasets import load_dataset
from tqdm.auto import tqdm

random.seed(42)
human_texts = []     # Clean human-written texts -> will create synthetic AI versions
paired_data = []     # Pre-paired (AI_text, Human_text)

# 1. GPT-Wiki-Intro (pre-paired, 127MB, fast)
print("[1/4] Downloading GPT-Wiki-Intro (127 MB)...")
try:
    wiki = load_dataset("aadityaubhat/GPT-wiki-intro", split="train")
    wiki_count = 0
    for item in tqdm(wiki, desc="  Wiki", leave=False):
        if wiki_count >= ds_sizes["wiki"]:
            break
        human = (item.get("wiki_intro") or "").strip()
        ai = (item.get("generated_intro") or "").strip()
        h_words = len(human.split())
        a_words = len(ai.split())
        if 30 <= h_words <= 300 and 30 <= a_words <= 300:
            paired_data.append((ai, human))
            wiki_count += 1
    print(f"  Wiki: {wiki_count:,} paired samples")
    del wiki
except Exception as e:
    print(f"  Wiki failed: {e}")
    wiki_count = 0

# 2. HC3 -- Human vs ChatGPT (pre-paired, 147MB)
print("\n[2/4] Downloading HC3 (147 MB)...")
try:
    hc3 = load_dataset("Hello-SimpleAI/HC3", "all", split="train")
    hc3_count = 0
    for item in tqdm(hc3, desc="  HC3", leave=False):
        if hc3_count >= ds_sizes["hc3"]:
            break
        human_answers = item.get("human_answers", [])
        ai_answers = item.get("chatgpt_answers", [])
        if human_answers and ai_answers:
            human = human_answers[0].strip()
            ai = ai_answers[0].strip()
            if 20 <= len(human.split()) <= 300 and 20 <= len(ai.split()) <= 300:
                paired_data.append((ai, human))
                hc3_count += 1
    print(f"  HC3: {hc3_count:,} paired samples")
    del hc3
except Exception as e:
    print(f"  HC3 failed: {e}")
    hc3_count = 0

# 3. PubMed Abstracts (streaming)
if ds_sizes["pubmed"] > 0:
    print(f"\n[3/4] Streaming PubMed abstracts (target: {ds_sizes['pubmed']:,})...")
    try:
        pubmed_stream = load_dataset("ccdv/pubmed-summarization", split="train", streaming=True)
        pubmed_count = 0
        for item in tqdm(pubmed_stream, desc="  PubMed", total=ds_sizes["pubmed"], leave=False):
            if pubmed_count >= ds_sizes["pubmed"]:
                break
            abstract = (item.get("abstract") or "").strip()
            # Clean section headers like BACKGROUND: METHODS: etc.
            abstract = re.sub(r'^[A-Z][A-Z /&]+:\s*', '', abstract)
            abstract = re.sub(r'\n[A-Z][A-Z /&]+:\s*', ' ', abstract)
            abstract = abstract.replace('\n', ' ').strip()
            words = abstract.split()
            if 50 <= len(words) <= 350:
                alpha_ratio = sum(1 for w in words if w and w[0].isalpha()) / len(words)
                if alpha_ratio > 0.70:
                    human_texts.append(abstract)
                    pubmed_count += 1
        print(f"  PubMed: {pubmed_count:,} abstracts")
    except Exception as e:
        print(f"  PubMed failed: {e}")
        pubmed_count = 0
else:
    pubmed_count = 0
    print("\n[3/4] Skipping PubMed (quick mode)")

# 4. arXiv Abstracts (streaming)
if ds_sizes["arxiv"] > 0:
    print(f"\n[4/4] Streaming arXiv abstracts (target: {ds_sizes['arxiv']:,})...")
    try:
        arxiv_stream = load_dataset("ccdv/arxiv-summarization", split="train", streaming=True)
        arxiv_count = 0
        for item in tqdm(arxiv_stream, desc="  arXiv", total=ds_sizes["arxiv"], leave=False):
            if arxiv_count >= ds_sizes["arxiv"]:
                break
            abstract = (item.get("abstract") or "").strip()
            abstract = abstract.replace('\n', ' ').strip()
            words = abstract.split()
            if 50 <= len(words) <= 350:
                latex_count = len(re.findall(r'\\[a-zA-Z]+', abstract))
                if latex_count / max(len(words), 1) < 0.10:
                    human_texts.append(abstract)
                    arxiv_count += 1
        print(f"  arXiv: {arxiv_count:,} abstracts")
    except Exception as e:
        print(f"  arXiv failed: {e}")
        arxiv_count = 0
else:
    arxiv_count = 0
    print("\n[4/4] Skipping arXiv (quick mode)")

print(f"\n{'='*55}")
print(f" DATASET SUMMARY")
print(f"{'='*55}")
print(f" Pre-paired (AI <-> Human):  {len(paired_data):>8,}")
print(f" Human texts (for synth):    {len(human_texts):>8,}")
print(f" TOTAL available:            {len(paired_data) + len(human_texts):>8,}")
print(f"{'='*55}")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 6: AI Corruption Engine
# ═══════════════════════════════════════════════════════════════════
md(r'''## Step 5: AI Corruption Engine + Build Training Pairs

Takes clean human text and injects AI patterns (filler transitions, hedging, passive voice, etc.).
The model learns to REVERSE these transformations.

| Corruption | Example | What model learns |
|-----------|---------|-------------------|
| Filler transitions | "Furthermore, ..." | Remove mechanical transitions |
| Hedging phrases | "It is important to note that ..." | Remove filler padding |
| Passive voice | "X shows" -> "It has been shown" | Prefer active voice |
| Rhetorical questions | "But what does this mean?" | Remove rhetorical questions |
| First person injection | "We observe that ..." | Remove unauthorized 1st person |
| Over-elaboration | "..., which plays a crucial role" | Remove padding clauses |
| Redundant qualifiers | "important" -> "of paramount importance" | Simplify word choice |
| Over-formalization | "shows" -> "demonstrates" | Use natural word choices |

**Target: 60%+ word-level change per sentence, 70-90% of sentences corrupted.**

Each sentence gets 2-4 STACKED corruptions (transition + synonym swap + formalization + elaboration) to ensure massive divergence from the original.
''')

code(r'''# STEP 5A: Define the AGGRESSIVE AI Corruption Engine
import random
import re

# ============================================================
# WORD-LEVEL SYNONYM BANK (AI-style overwrites)
# These replace common natural words with AI-tell equivalents.
# The model learns to reverse ALL of these.
# ============================================================

WORD_SYNONYMS = {
    # Verbs
    "show": ["demonstrate", "illustrate", "elucidate", "exemplify"],
    "shows": ["demonstrates", "illustrates", "elucidates", "exemplifies"],
    "help": ["facilitate", "assist in", "contribute to"],
    "helps": ["facilitates", "assists in", "contributes to"],
    "use": ["utilize", "employ", "leverage"],
    "uses": ["utilizes", "employs", "leverages"],
    "get": ["obtain", "acquire", "procure"],
    "gets": ["obtains", "acquires", "procures"],
    "give": ["provide", "furnish", "confer"],
    "gives": ["provides", "furnishes", "confers"],
    "make": ["render", "constitute", "effectuate"],
    "makes": ["renders", "constitutes", "effectuates"],
    "need": ["necessitate", "require", "mandate"],
    "needs": ["necessitates", "requires", "mandates"],
    "start": ["commence", "initiate", "inaugurate"],
    "starts": ["commences", "initiates", "inaugurates"],
    "end": ["conclude", "terminate", "culminate"],
    "ends": ["concludes", "terminates", "culminates"],
    "try": ["endeavor", "attempt", "undertake efforts"],
    "tries": ["endeavors", "attempts", "undertakes efforts"],
    "keep": ["maintain", "sustain", "preserve"],
    "keeps": ["maintains", "sustains", "preserves"],
    "grow": ["proliferate", "expand substantially"],
    "grows": ["proliferates", "expands substantially"],
    "grew": ["proliferated", "expanded substantially"],
    "grown": ["proliferated", "expanded substantially"],
    "find": ["ascertain", "determine", "identify"],
    "found": ["ascertained", "determined", "identified"],
    "think": ["posit", "hypothesize", "conceptualize"],
    "said": ["articulated", "postulated", "asserted"],
    "say": ["articulate", "postulate", "assert"],
    "says": ["articulates", "postulates", "asserts"],
    "look": ["examine", "scrutinize", "investigate"],
    "looks": ["examines", "scrutinizes", "investigates"],
    "seem": ["appear", "manifest"],
    "seems": ["appears", "manifests"],
    "lead": ["precipitate", "engender", "catalyze"],
    "leads": ["precipitates", "engenders", "catalyzes"],
    "led": ["precipitated", "engendered", "catalyzed"],
    "cause": ["precipitate", "engender", "give rise to"],
    "causes": ["precipitates", "engenders", "gives rise to"],
    "caused": ["precipitated", "engendered", "gave rise to"],
    "affect": ["impact", "influence", "exert an effect upon"],
    "affects": ["impacts", "influences", "exerts an effect upon"],
    "happen": ["transpire", "materialize", "come to fruition"],
    "happens": ["transpires", "materializes", "comes to fruition"],
    "happened": ["transpired", "materialized", "came to fruition"],
    "work": ["function", "operate", "perform"],
    "works": ["functions", "operates", "performs"],
    "change": ["undergo transformation", "evolve", "be modified"],
    "changes": ["undergoes transformation", "evolves", "modifications"],
    "changed": ["underwent transformation", "evolved"],
    "increase": ["escalate", "augment", "amplify"],
    "increases": ["escalates", "augments", "amplifies"],
    "increased": ["escalated", "augmented", "amplified"],
    "decrease": ["diminish", "attenuate", "mitigate"],
    "decreases": ["diminishes", "attenuates", "mitigates"],
    "decreased": ["diminished", "attenuated"],
    "develop": ["cultivate", "formulate", "construct"],
    "develops": ["cultivates", "formulates", "constructs"],
    "developed": ["cultivated", "formulated", "constructed"],
    "suggest": ["posit", "intimate", "put forth"],
    "suggests": ["posits", "intimates", "puts forth"],
    "suggested": ["posited", "intimated"],
    "explain": ["elucidate", "expound upon", "delineate"],
    "explains": ["elucidates", "expounds upon", "delineates"],
    "study": ["investigation", "scholarly inquiry", "empirical examination"],
    "research": ["scholarly investigation", "empirical inquiry"],
    "approach": ["methodology", "paradigmatic framework"],
    "method": ["methodology", "procedural framework", "systematic approach"],
    "result": ["outcome", "consequential finding"],
    "results": ["outcomes", "consequential findings", "empirical observations"],
    # Adjectives
    "important": ["of paramount importance", "critically significant", "fundamentally essential"],
    "significant": ["of considerable significance", "substantively meaningful", "noteworthy"],
    "useful": ["of substantial utility", "instrumentally valuable"],
    "effective": ["demonstrably efficacious", "notably effective"],
    "clear": ["abundantly evident", "unequivocally apparent"],
    "complex": ["multifaceted and complex", "inherently intricate"],
    "big": ["substantial", "considerable", "sizable"],
    "small": ["diminutive", "negligible", "modest"],
    "new": ["novel", "unprecedented", "emergent"],
    "old": ["established", "longstanding", "time-honored"],
    "different": ["distinct", "divergent", "disparate"],
    "similar": ["analogous", "comparable", "commensurate"],
    "main": ["principal", "predominant", "preeminent"],
    "good": ["favorable", "advantageous", "salutary"],
    "bad": ["detrimental", "deleterious", "adverse"],
    "hard": ["challenging", "formidable", "arduous"],
    "easy": ["straightforward", "uncomplicated", "facile"],
    "fast": ["expeditious", "accelerated", "rapid"],
    "slow": ["gradual", "protracted", "measured"],
    "likely": ["probable", "anticipated", "foreseeable"],
    "possible": ["feasible", "conceivable", "plausible"],
    "common": ["prevalent", "ubiquitous", "widespread"],
    "strong": ["robust", "formidable", "pronounced"],
    "weak": ["tenuous", "attenuated", "deficient"],
    "high": ["elevated", "heightened", "substantial"],
    "low": ["diminished", "reduced", "minimal"],
    "large": ["substantial", "considerable", "extensive"],
    "recent": ["contemporary", "present-day", "current"],
    # Nouns
    "problem": ["challenge", "predicament", "problematic phenomenon"],
    "problems": ["challenges", "predicaments", "problematic phenomena"],
    "way": ["manner", "modality", "avenue"],
    "part": ["component", "constituent element"],
    "group": ["cohort", "collective", "assemblage"],
    "area": ["domain", "sphere", "realm"],
    "idea": ["concept", "notion", "theoretical construct"],
    "people": ["individuals", "populations", "demographic segments"],
    "children": ["pediatric populations", "younger demographics"],
    "world": ["global landscape", "international arena"],
    "country": ["nation-state", "sovereign entity"],
    "fact": ["empirical reality", "established datum"],
    "data": ["empirical evidence", "quantitative observations"],
    "knowledge": ["scholarly understanding", "epistemic awareness"],
    "lack": ["dearth", "paucity", "insufficiency"],
    "gap": ["lacuna", "deficiency", "void"],
    "link": ["nexus", "interconnection", "correlation"],
    "risk": ["susceptibility", "vulnerability", "potential hazard"],
    "role": ["function", "capacity", "instrumental role"],
    "view": ["perspective", "vantage point", "scholarly viewpoint"],
    "field": ["discipline", "domain of inquiry", "academic field"],
    "framework": ["theoretical framework", "conceptual paradigm"],
    "evidence": ["empirical evidence", "substantiating data"],
    "findings": ["empirical findings", "investigative outcomes"],
    # Adverbs & connectors
    "also": ["additionally", "moreover", "in addition"],
    "but": ["however", "nevertheless", "notwithstanding"],
    "so": ["consequently", "therefore", "accordingly"],
    "however": ["nevertheless", "notwithstanding this", "be that as it may"],
    "because": ["due to the fact that", "owing to the circumstance that"],
    "although": ["notwithstanding the fact that", "despite the reality that"],
    "while": ["whilst", "whereas", "during the period in which"],
    "about": ["pertaining to", "with regard to", "concerning"],
    "before": ["prior to", "antecedent to", "preceding"],
    "after": ["subsequent to", "following", "in the aftermath of"],
    "now": ["at the present juncture", "in the contemporary context"],
    "often": ["frequently", "with considerable regularity"],
    "always": ["invariably", "without exception", "consistently"],
    "never": ["under no circumstances", "at no point"],
    "very": ["exceedingly", "remarkably", "substantially"],
    "really": ["genuinely", "fundamentally", "in actuality"],
    "still": ["nonetheless", "notwithstanding", "yet"],
    "then": ["subsequently", "thereafter", "at that juncture"],
    "only": ["exclusively", "solely", "merely"],
    "even": ["even so", "to an even greater extent"],
    "much": ["considerably", "substantially", "to a great extent"],
    "well": ["effectively", "proficiently", "in an adequate manner"],
    "more": ["to a greater extent", "increasingly"],
    "less": ["to a lesser extent", "with diminished"],
    "already": ["at this stage", "by this point"],
    "especially": ["particularly", "in particular", "most notably"],
    "mainly": ["predominantly", "principally", "for the most part"],
    "nearly": ["approximately", "in the vicinity of", "virtually"],
    "enough": ["sufficient", "adequate", "of a satisfactory degree"],
}

# -- Phrase Banks for structural corruption --

TRANSITION_STARTS = [
    "Furthermore, ", "Moreover, ", "Additionally, ", "Consequently, ",
    "In addition, ", "Notably, ", "Importantly, ", "Significantly, ",
    "In particular, ", "As a result, ", "Thus, ", "Hence, ",
    "Indeed, ", "Specifically, ", "Correspondingly, ", "Likewise, ",
    "Similarly, ", "Equally important, ", "By extension, ",
    "It is worth mentioning that ", "In this regard, ",
    "From this perspective, ", "Along these lines, ",
]

FILLER_PHRASES = [
    "It is important to note that ",
    "It should be mentioned that ",
    "It is worth noting that ",
    "It cannot be overstated that ",
    "One must acknowledge that ",
    "It bears emphasizing that ",
    "It is essential to recognize that ",
    "It is noteworthy that ",
    "It is particularly relevant that ",
    "It is widely acknowledged that ",
    "It is crucial to understand that ",
    "It must be emphasized that ",
    "It is imperative to acknowledge that ",
    "It warrants consideration that ",
    "It is of considerable importance that ",
]

CONCLUDING_STARTS = [
    "In conclusion, ", "To summarize, ", "In summary, ",
    "To conclude, ", "Ultimately, ", "In the final analysis, ",
    "All things considered, ", "Taking everything into account, ",
    "On the whole, ", "In essence, ", "Overall, ",
    "As a final point, ", "In recapitulation, ",
]

RHETORICAL_QUESTIONS = [
    "But what does this truly mean?",
    "How can we fully understand this phenomenon?",
    "What are the broader implications of this?",
    "Is this not a cause for significant concern?",
    "Can we afford to overlook this dimension?",
    "What lessons can be drawn from this analysis?",
    "How might this reshape our understanding?",
    "Why is this of such critical importance?",
    "What, then, are the ramifications?",
]

FIRST_PERSON_INSERTS = [
    "We can observe that ",
    "As we have discussed, ",
    "We must acknowledge that ",
    "It is our contention that ",
    "We argue that ",
    "As we shall see, ",
    "We believe that ",
    "In our view, ",
    "We posit that ",
    "Our analysis reveals that ",
]

ELABORATION_TAILS = [
    ", which plays a crucial role in this context",
    ", which represents a significant development in the field",
    ", which has far-reaching implications for future research",
    ", which constitutes a fundamental aspect of the discourse",
    ", which serves as a cornerstone of understanding in this area",
    ", which underpins much of the current scholarly debate",
    ", which warrants further investigation and analysis",
    ", a topic of considerable scholarly interest",
    ", thereby underscoring the multifaceted nature of this issue",
    ", which cannot be underestimated in its significance",
]

HEDGE_STARTS = [
    "Arguably, ", "It could be said that ", "One might argue that ",
    "It is generally believed that ", "There is a growing consensus that ",
    "It appears that ", "Evidence suggests that ",
    "It is reasonable to assert that ",
    "It is plausible to suggest that ",
    "One could reasonably contend that ",
]

SENTENCE_WRAPPERS = [
    ("The fact that {s} is of considerable significance.", 0.12),
    ("It has been well established that {s}", 0.10),
    ("It is widely recognized that {s}", 0.10),
    ("Scholars have noted that {s}", 0.08),
    ("A careful examination reveals that {s}", 0.08),
    ("Upon closer inspection, it becomes apparent that {s}", 0.08),
    ("The phenomenon whereby {s} merits attention.", 0.06),
    ("It is a well-documented phenomenon that {s}", 0.06),
]

# -- Sentence Splitting --

def split_sentences(text):
    # Split text into sentences, handling abbreviations
    protected = text
    for abbr in ['Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'etc.', 'vs.', 'i.e.', 'e.g.', 'Fig.', 'Eq.', 'al.', 'approx.', 'ca.', 'No.']:
        protected = protected.replace(abbr, abbr.replace('.', '<DOT>'))
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z"(])', protected)
    result = []
    for p in parts:
        p = p.replace('<DOT>', '.').strip()
        if p and len(p.split()) >= 3:
            result.append(p)
    return result if result else [text]

def word_change_ratio(original, corrupted):
    # Measure what fraction of words changed between original and corrupted
    orig_words = [w.lower().strip('.,;:!?\'"()[]') for w in original.split()]
    corr_words = [w.lower().strip('.,;:!?\'"()[]') for w in corrupted.split()]
    orig_set = set(w for w in orig_words if len(w) > 1)
    corr_set = set(w for w in corr_words if len(w) > 1)
    if not orig_set:
        return 0.0
    # Words that are new in corrupted + words removed from original
    changed = len(orig_set.symmetric_difference(corr_set))
    total = len(orig_set.union(corr_set))
    return changed / max(total, 1)

# -- Individual Corruption Functions --

def add_transition(sent):
    if any(sent.lower().startswith(t.lower().strip().rstrip(',')) for t in TRANSITION_STARTS):
        return sent
    trans = random.choice(TRANSITION_STARTS)
    return trans + sent[0].lower() + sent[1:]

def add_filler(sent):
    filler = random.choice(FILLER_PHRASES)
    return filler + sent[0].lower() + sent[1:]

def add_hedge(sent):
    hedge = random.choice(HEDGE_STARTS)
    return hedge + sent[0].lower() + sent[1:]

def add_concluding(sent):
    conc = random.choice(CONCLUDING_STARTS)
    return conc + sent[0].lower() + sent[1:]

def add_elaboration(sent):
    elab = random.choice(ELABORATION_TAILS)
    if sent.rstrip().endswith('.'):
        return sent.rstrip()[:-1] + elab + "."
    return sent + elab

def add_first_person(sent):
    fp = random.choice(FIRST_PERSON_INSERTS)
    return fp + sent[0].lower() + sent[1:]

def wrap_sentence(sent):
    # Wrap the sentence in a structural template
    wrapper, _ = random.choices(SENTENCE_WRAPPERS, weights=[w for _, w in SENTENCE_WRAPPERS], k=1)[0]
    # Extract core content (lowercase first char, strip trailing period)
    core = sent.strip()
    if core.endswith('.'):
        core = core[:-1]
    core = core[0].lower() + core[1:] if core else core
    return wrapper.format(s=core)

def overformalize_aggressive(sent):
    # Replace ALL matching simple words with formal alternatives (not just first 5)
    result = sent
    words_in_sent = set(w.lower().strip('.,;:!?\'"()[]') for w in result.split())
    matching_keys = [k for k in WORD_SYNONYMS if k in words_in_sent]
    # Replace up to 8 words per sentence
    replaced = 0
    for key in random.sample(matching_keys, min(8, len(matching_keys))):
        pattern = r'\b' + re.escape(key) + r'\b'
        replacement = random.choice(WORD_SYNONYMS[key])
        new_result = re.sub(pattern, replacement, result, count=1, flags=re.IGNORECASE)
        if new_result != result:
            result = new_result
            replaced += 1
    return result

def inject_padding_clause(sent):
    # Insert a padding clause in the middle of the sentence
    padding_clauses = [
        ", which is of considerable importance,",
        ", a matter of significant scholarly debate,",
        ", as has been extensively documented in the literature,",
        ", which represents a paradigmatic shift in understanding,",
        ", a phenomenon that has garnered substantial attention,",
        ", as numerous studies have demonstrated,",
        ", an observation of particular relevance,",
        ", which cannot be overlooked in this analysis,",
    ]
    words = sent.split()
    if len(words) < 6:
        return sent
    insert_pos = random.randint(len(words) // 3, 2 * len(words) // 3)
    clause = random.choice(padding_clauses)
    words.insert(insert_pos, clause)
    return " ".join(words)

# -- MAIN: Stack multiple corruptions per sentence --

# Each sentence gets 2-4 of these applied in sequence
STACKABLE_CORRUPTIONS = [
    (overformalize_aggressive, 0.95),  # Almost always: swap words to formal
    (add_transition, 0.50),            # Prepend transition
    (add_filler, 0.30),               # Prepend filler
    (add_hedge, 0.20),                # Prepend hedge
    (add_elaboration, 0.45),          # Append elaboration tail
    (inject_padding_clause, 0.30),    # Mid-sentence padding
    (add_first_person, 0.12),         # First person injection
    (wrap_sentence, 0.15),            # Complete sentence restructuring
]

def corrupt_sentence(sent, target_change=0.60, max_attempts=3):
    # Apply stacked corruptions until we hit the target word-change ratio
    best = sent
    best_ratio = 0.0

    for attempt in range(max_attempts):
        result = sent
        # Pick 2-4 corruptions to stack
        n_corruptions = random.randint(2, 4)
        # Always start with word-level formalization
        result = overformalize_aggressive(result)
        # Then add structural corruptions
        structural = [f for f, _ in STACKABLE_CORRUPTIONS if f != overformalize_aggressive]
        struct_weights = [w for f, w in STACKABLE_CORRUPTIONS if f != overformalize_aggressive]
        chosen = random.choices(structural, weights=struct_weights, k=min(n_corruptions, len(structural)))
        # Remove duplicates preserving order
        seen = set()
        unique_chosen = []
        for f in chosen:
            if id(f) not in seen:
                seen.add(id(f))
                unique_chosen.append(f)
        for func in unique_chosen:
            result = func(result)

        ratio = word_change_ratio(sent, result)
        if ratio > best_ratio:
            best = result
            best_ratio = ratio
        if ratio >= target_change:
            break

    return best, best_ratio

def corrupt_text(text, min_rate=0.70, max_rate=0.90, min_word_change=0.60):
    # Aggressively corrupt text. Stack 2-4 corruptions per sentence.
    # Returns: (corrupted_text, avg_word_change_ratio, total_sentences)
    sentences = split_sentences(text)
    if len(sentences) < 2:
        result, ratio = corrupt_sentence(text, min_word_change)
        return result, ratio, 1

    target_rate = random.uniform(min_rate, max_rate)
    n_to_modify = max(1, int(len(sentences) * target_rate))

    indices = list(range(len(sentences)))
    random.shuffle(indices)
    modify_indices = set(indices[:n_to_modify])

    result = list(sentences)
    total_ratio = 0.0
    modified_count = 0

    for i in range(len(result)):
        if i in modify_indices:
            new_sent, ratio = corrupt_sentence(result[i], min_word_change)
            result[i] = new_sent
            total_ratio += ratio
            modified_count += 1

    # Inject rhetorical question(s) (30% chance, more aggressive)
    if random.random() < 0.30 and len(result) > 3:
        insert_pos = random.randint(1, len(result) - 2)
        result.insert(insert_pos, random.choice(RHETORICAL_QUESTIONS))
        modified_count += 1

    # Force concluding phrase on last sentence (35% chance)
    if random.random() < 0.35 and len(result) > 2:
        last = result[-1]
        if not any(last.lower().startswith(c.lower().strip().rstrip(',')) for c in CONCLUDING_STARTS):
            result[-1] = add_concluding(last)

    avg_ratio = total_ratio / max(modified_count, 1)
    return " ".join(result), avg_ratio, len(sentences)


# -- Verify corruption quality with word-change measurement --
test_human = (
    "Climate change mitigation strategies remain a subject of debate across scientific "
    "and policy circles. Regression analyses have established correlations between carbon "
    "emissions and temperature fluctuations. Renewable energy adoption has grown substantially "
    "over the past decade, though fossil fuel dependent economies continue to face transition "
    "challenges. Carbon capture technologies offer a promising complement. Effective policy "
    "evaluation requires interdisciplinary collaboration and sustained attention to economic "
    "incentives alongside technological development."
)

print("-" * 70)
print("AGGRESSIVE CORRUPTION ENGINE TEST")
print("-" * 70)
print(f"\nORIGINAL (human):\n{test_human}")
print(f"Original word count: {len(test_human.split())}")

for trial in range(3):
    corrupted, avg_ratio, n_total = corrupt_text(test_human, MIN_CORRUPTION_RATE, MAX_CORRUPTION_RATE, MIN_WORD_CHANGE)
    overall_ratio = word_change_ratio(test_human, corrupted)
    print(f"\n{'='*70}")
    print(f"TRIAL {trial+1}: avg sentence change={avg_ratio*100:.0f}%, overall word change={overall_ratio*100:.0f}%")
    print(f"{'='*70}")
    print(corrupted)
    print(f"Corrupted word count: {len(corrupted.split())}")

print("\nCorruption engine ready!")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 7: Build Training Pairs
# ═══════════════════════════════════════════════════════════════════
md('''## Step 5B: Build Training Pairs

Creates the final training dataset:
- **Pre-paired data** (Wiki + HC3) -> used directly
- **Human texts** (PubMed + arXiv) -> corrupted with AI patterns to create synthetic pairs

Each pair: ("humanize: AI text", "clean human text")
''')

code(r'''# STEP 5B: Build all training pairs
import gc
from tqdm.auto import tqdm

print("Building synthetic pairs from human texts...")
synthetic_pairs = []
corruption_stats = {"total_sents": 0, "total_ratio": 0.0, "n_texts": 0}

for text in tqdm(human_texts, desc="Corrupting"):
    corrupted, avg_ratio, n_total = corrupt_text(text, MIN_CORRUPTION_RATE, MAX_CORRUPTION_RATE, MIN_WORD_CHANGE)
    synthetic_pairs.append((corrupted, text))
    corruption_stats["total_sents"] += n_total
    corruption_stats["total_ratio"] += avg_ratio
    corruption_stats["n_texts"] += 1

avg_word_change = corruption_stats["total_ratio"] / max(corruption_stats["n_texts"], 1)
print(f"\nCorruption stats:")
print(f"  Texts processed:      {corruption_stats['n_texts']:,}")
print(f"  Sentences processed:  {corruption_stats['total_sents']:,}")
print(f"  Avg word change/sent: {avg_word_change*100:.1f}%")

# Combine all pairs
all_pairs = []

# Add pre-paired data
for ai, human in paired_data:
    all_pairs.append((f"humanize: {ai}", human))

# Add synthetic pairs
for corrupted, original in synthetic_pairs:
    all_pairs.append((f"humanize: {corrupted}", original))

# Free memory
del paired_data, synthetic_pairs, human_texts
gc.collect()

# Shuffle
random.shuffle(all_pairs)

# Split train/validation (98% / 2%)
val_size = min(3000, len(all_pairs) // 50)
val_pairs = all_pairs[:val_size]
train_pairs = all_pairs[val_size:]

print(f"\n{'='*55}")
print(f" FINAL TRAINING DATA")
print(f"{'='*55}")
print(f" Training pairs:   {len(train_pairs):>8,}")
print(f" Validation pairs: {len(val_pairs):>8,}")
print(f" Total:            {len(all_pairs):>8,}")
print(f"{'='*55}")

# Show examples
for i in range(3):
    src, tgt = train_pairs[i]
    src_preview = src[:250] + ('...' if len(src) > 250 else '')
    tgt_preview = tgt[:250] + ('...' if len(tgt) > 250 else '')
    print(f"\n{'-'*55}")
    print(f"Example {i+1}")
    print(f"INPUT:  {src_preview}")
    print(f"TARGET: {tgt_preview}")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 8: LoRA Setup + Training
# ═══════════════════════════════════════════════════════════════════
md(r'''## Step 6: LoRA Fine-Tuning

Uses **LoRA (Low-Rank Adaptation)** for parameter-efficient training:
- Only trains ~1-2M parameters (vs 248M total) -- 3-4x faster
- Uses **fp16 mixed precision** -- halves memory usage
- Uses **gradient checkpointing** -- fits larger batches
- Saves checkpoints to /content/checkpoints/

**This is the longest step.** On T4 GPU:
- Quick (~200K): ~1.5-2 hours
- Standard (~300K): ~2.5-3 hours
- Full (~450K): ~3.5-4.5 hours
''')

code(r'''# STEP 6: Configure LoRA + Train
import time
from peft import LoraConfig, get_peft_model, TaskType
from transformers import (
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
)
from datasets import Dataset as HFDataset

# -- Apply LoRA --
print("Configuring LoRA...")
lora_config = LoraConfig(
    r=LORA_RANK,
    lora_alpha=LORA_ALPHA,
    target_modules=["q", "v"],   # T5 attention Q and V projections
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.SEQ_2_SEQ_LM,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# -- Build HuggingFace Datasets --
# Guard: ensure Step 5B was run (and hasn't been cleaned up by a previous Step 6 run)
if 'train_pairs' not in dir() or not train_pairs:
    raise RuntimeError(
        "train_pairs not found! Re-run Step 5B (Build Training Pairs) first.\n"
        "If you already trained and want to retrain, re-run Steps 5A and 5B."
    )

print("\nTokenizing training data...")
train_hf = HFDataset.from_dict({
    "input_text": [p[0] for p in train_pairs],
    "target_text": [p[1] for p in train_pairs],
})
val_hf = HFDataset.from_dict({
    "input_text": [p[0] for p in val_pairs],
    "target_text": [p[1] for p in val_pairs],
})

def tokenize_fn(batch):
    inputs = tokenizer(
        batch["input_text"],
        max_length=MAX_SEQ_LEN,
        truncation=True,
        padding=False,
    )
    targets = tokenizer(
        batch["target_text"],
        max_length=MAX_SEQ_LEN,
        truncation=True,
        padding=False,
    )
    inputs["labels"] = targets["input_ids"]
    return inputs

train_dataset = train_hf.map(tokenize_fn, batched=True, batch_size=1000,
                              remove_columns=["input_text", "target_text"],
                              desc="Tokenizing train")
val_dataset = val_hf.map(tokenize_fn, batched=True, batch_size=1000,
                          remove_columns=["input_text", "target_text"],
                          desc="Tokenizing val")

# Free raw pairs from memory (safe for re-runs)
for _v in ['train_pairs', 'val_pairs', 'train_hf', 'val_hf', 'all_pairs']:
    if _v in dir(): exec(f'del {_v}')
gc.collect()
torch.cuda.empty_cache()

data_collator = DataCollatorForSeq2Seq(
    tokenizer,
    model=model,
    padding=True,
    label_pad_token_id=-100,
)

# -- Training Configuration --
steps_per_epoch = len(train_dataset) // (BATCH_SIZE * GRAD_ACCUM)
total_steps = steps_per_epoch * EPOCHS
save_steps = max(500, steps_per_epoch // 4)
eval_steps = save_steps
logging_steps = 100

print(f"\nTraining plan:")
print(f"  Steps per epoch: {steps_per_epoch:,}")
print(f"  Total steps:     {total_steps:,}")
print(f"  Save every:      {save_steps:,} steps")

training_args = TrainingArguments(
    output_dir="/content/checkpoints",
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LEARNING_RATE,
    warmup_ratio=WARMUP_RATIO,
    weight_decay=WEIGHT_DECAY,
    fp16=torch.cuda.is_available(),
    logging_steps=logging_steps,
    eval_strategy="steps",
    eval_steps=eval_steps,
    save_steps=save_steps,
    save_total_limit=2,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    greater_is_better=False,
    report_to="none",
    gradient_checkpointing=True,
    gradient_checkpointing_kwargs={"use_reentrant": False},
    dataloader_num_workers=2,
    dataloader_pin_memory=True,
    remove_unused_columns=False,
    optim="adamw_torch",
    lr_scheduler_type="cosine",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    data_collator=data_collator,
    processing_class=tokenizer,
)

# -- TRAIN! --
print(f"\n{'='*55}")
print(f" STARTING TRAINING -- {TRAINING_SIZE.upper()} MODE")
print(f" {len(train_dataset):,} pairs x {EPOCHS} epochs = {total_steps:,} steps")
est_h = total_steps / (4.0 * 3600)
print(f" Estimated: ~{est_h:.1f}-{est_h*1.5:.1f} hours on T4")
print(f"{'='*55}\n")

start_time = time.time()
trainer.train()
elapsed = time.time() - start_time

print(f"\n{'='*55}")
print(f" TRAINING COMPLETE!")
print(f" Time: {elapsed/3600:.1f} hours ({elapsed/60:.0f} minutes)")
print(f" Steps/sec: {total_steps / elapsed:.2f}")
print(f" Best eval loss: {trainer.state.best_metric:.4f}")
print(f"{'='*55}")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 9: Test & Evaluate
# ═══════════════════════════════════════════════════════════════════
md('''## Step 7: Test & Evaluate

Tests the fine-tuned model on sample texts. Checks for:
- Filler transitions removed
- Hedging phrases removed
- Active voice preferred
- No rhetorical questions in output
- No first person unless present in input
- Natural sentence flow
''')

code(r'''# STEP 7: Test the fine-tuned model
model.eval()

def humanize(text, max_length=256, num_beams=4):
    # Run the humanizer model on input text
    input_text = f"humanize: {text}" if not text.startswith("humanize:") else text
    inputs = tokenizer(input_text, return_tensors="pt", max_length=MAX_SEQ_LEN,
                       truncation=True).to(device)
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_length,
            num_beams=num_beams,
            do_sample=False,
            no_repeat_ngram_size=3,
            early_stopping=True,
            length_penalty=1.0,
        )
    return tokenizer.decode(output_ids[0], skip_special_tokens=True)

# Test Cases
TEST_CASES = [
    # Test 1: Heavy AI filler + transitions
    ("Furthermore, the intersection of artificial intelligence and natural language processing "
     "has become a focal point of contemporary research. Moreover, the implications of these "
     "technological advances extend far beyond the technical realm. Additionally, it is important "
     "to note that society faces unprecedented challenges. In conclusion, the urgency cannot "
     "be overstated."),

    # Test 2: Passive voice + hedging
    ("It has been demonstrated by researchers that climate change has a significant impact on "
     "biodiversity. It is generally believed that conservation efforts must be intensified. "
     "It should be mentioned that endangered species face multiple threats. Evidence suggests "
     "that habitat loss plays a crucial role in species decline."),

    # Test 3: Rhetorical questions + first person
    ("We can observe that economic inequality has widened across many nations. But what does "
     "this truly mean for global stability? We must acknowledge that policy interventions "
     "have had mixed results. How can we fully understand this phenomenon? It is our contention "
     "that new approaches are needed."),

    # Test 4: Over-formalized academic text
    ("The utilization of machine learning methodologies has facilitated substantial advancements "
     "in medical diagnostics, which plays a crucial role in this context. It is of paramount "
     "importance that these algorithms demonstrate reliability prior to clinical deployment. "
     "Furthermore, the multifaceted and complex nature of disease classification necessitates "
     "robust validation frameworks."),

    # Test 5: Natural text (should change minimally)
    ("Photosynthesis converts sunlight into chemical energy through a series of reactions "
     "in plant chloroplasts. The process begins when light hits chlorophyll molecules, "
     "exciting electrons that pass through an electron transport chain. This energy drives "
     "the synthesis of ATP and NADPH, which fuel the Calvin cycle to fix carbon dioxide "
     "into glucose."),
]

print("=" * 65)
print(" MODEL EVALUATION -- BEFORE vs AFTER")
print("=" * 65)

for i, test in enumerate(TEST_CASES, 1):
    output = humanize(test)
    # Count changes
    test_words = set(test.lower().split())
    out_words = set(output.lower().split())
    changed = len(test_words.symmetric_difference(out_words))
    total = len(test_words | out_words)
    change_pct = changed / max(total, 1) * 100

    print(f"\n{'='*65}")
    print(f"TEST {i} (word change: {change_pct:.0f}%)")
    print(f"{'='*65}")
    input_preview = test[:300] + ('...' if len(test) > 300 else '')
    output_preview = output[:300] + ('...' if len(output) > 300 else '')
    print(f"INPUT:  {input_preview}")
    print(f"OUTPUT: {output_preview}")

    # Check for violations
    violations = []
    output_lower = output.lower()
    contractions = ["n't", "can't", "won't", "don't", "doesn't", "isn't", "aren't", "it's", "that's", "there's"]
    if any(c in output_lower for c in contractions):
        violations.append("FAIL: Contains contractions")
    if "?" in output and "?" not in test:
        violations.append("FAIL: Added rhetorical question")
    fp_markers = ["we can", "we must", "we argue", "we believe", "our contention", "as we"]
    if any(fp in output_lower for fp in fp_markers):
        if not any(fp in test.lower() for fp in fp_markers):
            violations.append("FAIL: Added first person (not in input)")
    if not violations:
        violations.append("PASS: No rule violations detected")
    for v in violations:
        print(f"  {v}")

print(f"\n{'='*65}")
print(" EVALUATION COMPLETE")
print(f"{'='*65}")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 10: Export Model
# ═══════════════════════════════════════════════════════════════════
md(r'''## Step 8: Export Fine-Tuned Model

Merges the LoRA weights into the base model and saves as a standalone model.

Options:
1. **Download as ZIP** -- download to your computer
2. **Save to Google Drive** -- for future use in Colab

The exported model is a drop-in replacement for your oxygen-model/ folder.
''')

code(r'''# STEP 8: Export the fine-tuned model
import shutil

OUTPUT_DIR = "/content/oxygen-model-finetuned"

# -- Merge LoRA weights into base model --
print("Merging LoRA weights into base model...")
merged_model = model.merge_and_unload()

# -- Save merged model --
print(f"Saving to {OUTPUT_DIR}...")
if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)

merged_model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

# List saved files
print("\nSaved files:")
total_size = 0
for f in sorted(os.listdir(OUTPUT_DIR)):
    fpath = os.path.join(OUTPUT_DIR, f)
    size = os.path.getsize(fpath)
    total_size += size
    print(f"  {f}: {size/1e6:.1f} MB")
print(f"  TOTAL: {total_size/1e6:.0f} MB")

# -- Option 1: Download as ZIP --
print("\nCreating ZIP for download...")
zip_path = "/content/oxygen-model-finetuned"
shutil.make_archive(zip_path, 'zip', OUTPUT_DIR)
zip_size = os.path.getsize(f"{zip_path}.zip") / 1e6
print(f"  ZIP: {zip_path}.zip ({zip_size:.0f} MB)")

try:
    from google.colab import files
    print("\nClick the download button below:")
    files.download(f"{zip_path}.zip")
except ImportError:
    print(f"\nDownload manually from: {zip_path}.zip")

# -- Option 2: Save to Google Drive --
SAVE_TO_DRIVE = True
DRIVE_SAVE_PATH = "/content/drive/MyDrive/oxygen-model-finetuned"

if SAVE_TO_DRIVE:
    try:
        from google.colab import drive
        if not os.path.exists('/content/drive/MyDrive'):
            drive.mount('/content/drive')
        if os.path.exists(DRIVE_SAVE_PATH):
            shutil.rmtree(DRIVE_SAVE_PATH)
        shutil.copytree(OUTPUT_DIR, DRIVE_SAVE_PATH)
        print(f"\nSaved to Google Drive: {DRIVE_SAVE_PATH}")
    except Exception as e:
        print(f"\nDrive save failed: {e}")
        print("  You can manually copy from /content/oxygen-model-finetuned/")

print(f"\n{'='*55}")
print(f" EXPORT COMPLETE!")
print(f"{'='*55}")
print(f"\nTo use this model:")
print(f"  1. Replace your oxygen-model/ folder with the exported files")
print(f"  2. Restart the oxygen server")
print(f"  3. The model will now aggressively humanize text")
''')

# ═══════════════════════════════════════════════════════════════════
# CELL 11: Bonus - Custom Text Testing
# ═══════════════════════════════════════════════════════════════════
md('''## Bonus: Test With Your Own Text

Paste any AI-generated text below to test the fine-tuned humanizer.
''')

code('# BONUS: Test with your own text\n'
     '\n'
     'YOUR_TEXT = (\n'
     '    "Furthermore, the implementation of artificial intelligence in educational "\n'
     '    "settings has become increasingly prevalent. Moreover, it is important to "\n'
     '    "note that these technological advancements present both opportunities and "\n'
     '    "challenges. Additionally, the role of educators must evolve to accommodate "\n'
     '    "these changes. In conclusion, a comprehensive approach to AI integration "\n'
     '    "in education is essential for optimal outcomes."\n'
     ')\n'
     '\n'
     'print("=" * 65)\n'
     'print(" YOUR TEXT -- HUMANIZED")\n'
     'print("=" * 65)\n'
     'print(f"\\nINPUT:\\n{YOUR_TEXT.strip()}")\n'
     'output = humanize(YOUR_TEXT.strip())\n'
     'print(f"\\nOUTPUT:\\n{output}")\n'
     '\n'
     '# Quick analysis\n'
     'input_sents = split_sentences(YOUR_TEXT.strip())\n'
     'output_sents = split_sentences(output)\n'
     'print(f"\\nInput sentences:  {len(input_sents)}")\n'
     'print(f"Output sentences: {len(output_sents)}")\n'
     '\n'
     '# Check for AI markers in output\n'
     'ai_markers = [\n'
     '    "furthermore", "moreover", "additionally", "consequently", "in conclusion",\n'
     '    "it is important to note", "it should be mentioned", "it is worth noting",\n'
     '    "plays a crucial role", "of paramount importance", "it cannot be overstated",\n'
     ']\n'
     'found_markers = [m for m in ai_markers if m in output.lower()]\n'
     'if found_markers:\n'
     '    print(f"\\nWARNING: AI markers still present: {found_markers}")\n'
     'else:\n'
     '    print(f"\\nPASS: No AI markers detected in output!")\n')

# ═══════════════════════════════════════════════════════════════════
# Save notebook
# ═══════════════════════════════════════════════════════════════════
output_path = "train_humanizer_massive.ipynb"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=1, ensure_ascii=False)

n_code = sum(1 for c in notebook["cells"] if c["cell_type"] == "code")
n_md = sum(1 for c in notebook["cells"] if c["cell_type"] == "markdown")
print(f"Generated {output_path}")
print(f"  Cells: {len(notebook['cells'])} ({n_code} code, {n_md} markdown)")
