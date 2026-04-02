# Humanizer Engine Training Guide - Academic Essays

This guide walks you through training and optimizing your non-LLM humanizer engine for academic and essay content. Training here means **iterative rule tuning**, not machine learning.

## 📋 Quick Start (5 minutes)

### 1. Set up training environment
```bash
# Install dependencies
pip install -r requirements.txt

# Download spacy model (if not done)
python -m spacy download en_core_web_sm
```

### 2. Test with sample data
The `data/train/` folder contains 6 ready-to-use academic text pairs (AI versions + human versions).

### 3. Run quick evaluation
```bash
python trainer.py quick
```

This evaluates all samples and shows you current engine performance.

### 4. Launch full training loop
```bash
python trainer.py train
```

Or use interactive mode:
```bash
python trainer.py
# Choose option 2 for full training
```

**Expected time:** 5-15 minutes depending on sample count.

---

## 🎯 Training Architecture

### Three Core Tools

| Tool | Purpose | Output |
|------|---------|--------|
| **evaluator.py** | Measures 10+ metrics per text (burstiness, repetition, AI patterns, tone) | CSV results + summary stats |
| **trainer.py** | Orchestrates loop: evaluate → analyze → update rules → re-evaluate | Checkpoints + training report |
| **academic_rules.py** | Rule set optimized for essays (or use stock `rules.py`) | Parameter suggestions |

### Metrics You'll See

Each evaluation produces:
- **Burstiness** (sentence length variance): Higher = more human-like
- **Vocabulary diversity**: Type-token ratio (0.5-0.75 is good)
- **AI transitions** (%, lower is better): Detects "furthermore, moreover, in conclusion" patterns
- **Repetition density** (%, lower is better): Flags repeated phrases
- **Academic tone** (0-1): Measures formality appropriate for essays
- **Overall score** (0-100): Composite quality metric

### Example Output

```
==================================================
EVALUATION SUMMARY - ACADEMIC ESSAY CONTENT
==================================================

Total samples evaluated: 6
Average overall score: 72.3/100
Min score: 58.4
Max score: 84.1
Std dev: 9.4

--- AVERAGE IMPROVEMENTS ---
Burstiness improvement: 3.45
Vocabulary diversity gain: 0.0234
AI transition reduction: 1.23%

--- AI SIGNATURE INDICATORS (lower is better) ---
Avg AI transitions per text: 0.67%
Avg repetition density: 3.12%

--- ACADEMIC TONE (0-1 scale) ---
Average academic tone score: 0.782
```

---

## 🔄 The Training Loop (Step-by-Step)

### Iteration 1: Baseline

**What happens:**
1. Engine processes all 6 samples with current rules
2. Evaluator measures: burstiness, transitions, vocabulary, tone, etc.
3. Composite "overall score" calculated for each sample
4. Average score reported (e.g., 72.3/100)

**Rules at start (from `rules.py`):**
```python
BURSTINESS_TARGET = 0.65
CONTRACTION_RATE = 0.35
TRANSITION_RATE = 0.28
SHORTEN_RATE = 0.42
```

### Iteration 2: Analysis & Adjustment

**Trainer analyzes failures:**
- "AI transitions still 1.8%? Too high."
  → Lower TRANSITION_RATE from 0.28 → 0.23
  
- "Burstiness only improved by 2.1? Need more."
  → Raise BURSTINESS_TARGET from 0.65 → 0.75
  
- "High repetition (4.5%)? Shorten more sentences."
  → Raise SHORTEN_RATE from 0.42 → 0.47

**Rules after adjustment:**
```python
BURSTINESS_TARGET = 0.75      # Up
CONTRACTION_RATE = 0.35       # Unchanged
TRANSITION_RATE = 0.23        # Down
SHORTEN_RATE = 0.47           # Up
```

### Iteration 3-N: Repeat Until Convergence

Each cycle:
- Re-humanizes same 6 samples with new rules
- Evaluates → Gets new scores
- Checks if average score ≥ target (default 75/100)
- If yes: **Training converged!** Save best checkpoint
- If no: Make more adjustments based on remaining failures

**Typical progression:**
```
Iteration 1: 72.3/100
Iteration 2: 74.1/100  (better transitions)
Iteration 3: 76.2/100  (target reached!)
✓ CONVERGED at iteration 3
```

---

## 📁 File Organization

```
humanizer-engine/
├── evaluator.py              # Evaluation metrics engine
├── trainer.py                # Training loop orchestrator
├── rules.py                  # Current rules (auto-updated during training)
├── academic_rules.py         # Academic-optimized rules template
├── humanizer.py              # Your core humanizer
├── utils.py                  # NLP utilities
│
├── data/
│   └── train/
│       ├── sample_001_ai.txt         # AI text input
│       ├── sample_001_human.txt      # Reference human version
│       ├── sample_002_ai.txt
│       ├── sample_002_human.txt
│       └── ... (add your own pairs)
│
└── training_logs/            # Auto-created during training
    ├── evaluation_20250401_120530.csv
    ├── training_report.json
    └── iteration_01_score_72.3.csv
```

---

## 🚀 How to Expand Training Data

### Adding Your Own Academic Samples

1. **Create pair for each sample:**
   ```
   data/train/
   ├── sample_007_ai.txt       (AI-generated academic text)
   └── sample_007_human.txt    (High-quality humanized version)
   ```

2. **Naming convention:**
   - Always use `_ai.txt` and `_human.txt` suffixes
   - Sequential naming helps (sample_001, sample_002, etc.)
   - Trainer ignores files that don't match

3. **Where to get AI texts:**
   - Use ChatGPT, Claude, Grok to generate academic passages (300-500 words)
   - Topics: philosophy, sociology, literary analysis, climate science, etc.
   - Variety helps the engine learn broader patterns

4. **Where to get human versions:**
   - **Option A:** Manually edit the AI version until it passes 2-3 detectors
   - **Option B:** Use light humanization prompt if available
   - **Option C:** Extract from published academic journals (with attribution)

5. **Quality check:**
   ```bash
   # After adding sample_007, run evaluation
   python trainer.py quick
   
   # Check if sample_007 scores well (>70)
   # If <60, it may need refinement
   ```

---

## 🎓 Advanced: Custom Rule Tuning

### Manual Rule Adjustment

Edit `rules.py` or create `academic_rules.py`:

```python
# Increase variation for better burstiness
BURSTINESS_TARGET = 0.80  # Was 0.65

# Use fewer formal transitions in essays
TRANSITION_RATE = 0.22    # Was 0.28

# More sentence shortening = breaks AI patterns
SHORTEN_RATE = 0.55       # Was 0.42

# Academic essays: moderate contractions
CONTRACTION_RATE = 0.28   # Was 0.35
```

**Test impact:**
```bash
# Make change ↑ above
python trainer.py quick
# See if overall score improves
```

### Custom Transitions for Your Content

Replace `ACADEMIC_TRANSITIONS` in `academic_rules.py` with your field-specific phrases:

**For philosophy essays:**
```python
ACADEMIC_TRANSITIONS = [
    "The key insight is", "What emerges is",
    "One might argue that", "Building on this reasoning",
    "It's worth noting", "The crucial point is",
    # ...
]
```

**For literary analysis:**
```python
ACADEMIC_TRANSITIONS = [
    "The author suggests", "This passage reveals",
    "In other words", "What's striking is",
    "The evidence points to", "Reading closely,",
    # ...
]
```

---

## 📊 Interpreting Results

### Overall Score Interpretation

| Score | Meaning | Action |
|-------|---------|--------|
| 0-40 | Poor humanization | Increase BURSTINESS_TARGET, SHORTEN_RATE |
| 40-60 | Below target | Adjust TRANSITION_RATE down, vary more |
| 60-75 | Close to target | Fine-tune individual parameters |
| 75-85 | Good human-like | Ready for production |
| 85-100 | Excellent | Rules well-optimized for your content |

### Common Failure Patterns

**"AI transitions still 2%+"**
- Solution: Lower TRANSITION_RATE (reduce fake transitions)
- Or: Add more AI patterns to AI_TRANSITIONS_TO_AVOID

**"Burstiness improvement only 1-2"**
- Solution: Raise BURSTINESS_TARGET (force more variation)
- Or: Increase SHORTEN_RATE (break up long sentences more)

**"Repetition density > 5%"**
- Solution: Increase SHORTEN_RATE (removes redundancy)
- Or: Add PHRASE_SUBSTITUTIONS in academic_rules.py

**"Academic tone score < 0.7"**
- Solution: Adjust sentence structure (academic sweet spot: 15-25 words/sent)
- Or: Increase vocabulary diversity via more CONTRACTIONS

---

## 🧪 Testing Against Real Detectors

Once your engine reaches **overall score > 75**, test against actual AI detectors:

### Free tier tools:
- **GPTZero** (https://www.gptzero.me/)
- **ZeroGPT** (https://www.zerogpt.com/)
- **Originality.ai** (free limited checks)
- **Turnitin** (if you have access through school/work)

### Test protocol:
```
1. Take a sample_XXX_ai.txt (original AI text)
2. Humanize locally:
   - Convert to humanizer.py call
   - Get output
3. Upload to 2 detectors
   - Record "AI confidence" scores
4. Track: Does score drop significantly?
   - Original: 95% AI confidence
   - After humanize: 35-50% AI confidence = SUCCESS
```

---

## 🔐 Saving Your Best Model

Once training converges with a good score (>75), save the rule configuration:

```bash
# After successful training run:
# The trainer auto-saves to training_logs/training_report.json

# Manually copy best rules:
# From training_logs/training_report.json
# Copy the "best_rules" section to rules.py
```

**Training report shows:**
```json
{
  "best_score": 78.4,
  "best_iteration": 7,
  "best_rules": {
    "BURSTINESS_TARGET": 0.72,
    "CONTRACTION_RATE": 0.30,
    "TRANSITION_RATE": 0.21,
    "SHORTEN_RATE": 0.52
  }
}
```

**Copy to rules.py:**
```python
BURSTINESS_TARGET = 0.72    # From training
CONTRACTION_RATE = 0.30
TRANSITION_RATE = 0.21
SHORTEN_RATE = 0.52
```

---

## 📈 Expected Timeline

| Phase | Duration | What Happens |
|-------|----------|--------------|
| **Setup** | 10 min | Install, add sample data |
| **Baseline eval** | 2 min | Quick check of initial performance |
| **Training run** | 5-15 min | 3-10 iterations until convergence |
| **Validation** | 10-20 min | Test against real detectors |
| **Refinement** | 1-3 hours | Add more samples, fine-tune edge cases |
| **Production ready** | Total: ~2 days | Engine ready for deployment |

---

## 🛠️ Troubleshooting

### "Training seems stuck at iteration 5"
**Issue:** Score plateaus around 70, won't improve.
**Fix:**
- Add more diversity: increase SHORTEN_RATE or BURSTINESS_TARGET
- Check AI_TRANSITIONS_TO_AVOID: add more patterns
- Manually review failed samples (score < 65)

### "Humanized text sounds awkward"
**Issue:** Engine over-corrects (too many short sentences, forced contractions).
**Fix:**
- Lower SHORTEN_RATE (e.g., 0.45 → 0.35)
- Lower CONTRACTION_RATE (e.g., 0.35 → 0.25)
- Increase BURSTINESS_TARGET (brings back longer, natural sentences)

### "Training runs but evaluator shows '✗ No AI text files found'"
**Issue:** Sample file naming wrong.
**Fix:**
```bash
# Correct naming:
data/train/sample_001_ai.txt
data/train/sample_001_human.txt

# Wrong (won't be picked up):
data/train/ai_001.txt          # Wrong order
data/train/sample_001_AItext.txt  # Capitalization
```

### "ImportError: No module named 'spacy'"
**Fix:**
```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

---

## 📚 Academic Essay Tips

### What detectors look for in academic AI:

1. **Repetitive transitions:** "Furthermore, moreover, additionally"
2. **Uniform sentence length:** ~20 words each (robotic)
3. **Overused phrases:** "it is important," "in conclusion," "the author argues"
4. **Low vocabulary diversity:** Same words repeated
5. **Passive voice everywhere:** "It is argued that" vs. "The researcher argues"

### Your humanizer should:

- ✓ Vary sentence length (5-40 words)
- ✓ Use natural transitions ("Look," "Here's the thing," "In my analysis")
- ✓ Replace AI patterns with authentic academic language
- ✓ Keep high vocabulary diversity
- ✓ Mix passive and active voice naturally

---

## 🎓 Next Steps After Training

1. **Test on real detectors** (GPTZero, ZeroGPT)
2. **Expand data:** Add 10-20 more sample pairs in your specific niches
3. **Discipline tuning:** If academic essays work, try blogs/marketing (adjust rules)
4. **Production integration:** Use trained engine in FastAPI endpoint

See [DATASET_GUIDE.md](DATASET_GUIDE.md) for integrating with the AI detection model.

---

## 💡 Questions?

Refer to:
- `evaluator.py` docstrings for metric definitions
- `trainer.py` code for optimization logic
- `academic_rules.py` for rule explanations
- `humanizer.py` for core transformation logic
