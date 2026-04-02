# TypeScript vs Python Detector Comparison

## Critical Discrepancies Found

### 1. **AI Pattern Score - MAJOR DIFFERENCE**

**Python (multi_detector.py lines 563-575):**
```python
def ai_pattern_score(self) -> float:
    if self.word_count < 10:
        return 0.0  # ← Returns 0.0 for short text

    marker_count = sum(1 for w in self.words if w in AI_MARKER_WORDS)
    marker_density = marker_count / self.word_count
    
    # ... full implementation with 4 components:
    # marker_density, phrase_density, starter_ratio, consecutive_bonus
    
    marker_s = _sig_norm(marker_density, 0.012, 120.0)
    phrase_s = _sig_norm(phrase_density, 0.15, 5.0)
    starter_s = _sig_norm(starter_ratio, 0.10, 10.0)
    consec_s = min(consecutive_bonus * 15, 30)
    
    score = marker_s * 0.30 + phrase_s * 0.30 + starter_s * 0.25 + consec_s
    return _clamp(score)
```

**TypeScript (multi-detector.ts lines 407-414):**
```typescript
aiPatternScore(): number {
    if (this.wordCount < 10) return 50;  // ← Returns 50 instead of 0!
    
    // ... INCOMPLETE implementation:
    // Only 2 components: marker_density and phrase_density
    // Missing: starter_ratio and consecutive_bonus
    
    return clamp(sigNorm(markerDensity, 0.015, 120) * 0.5 + sigNorm(phraseDensity, 0.15, 8) * 0.5);
    //                                   ^^^^center is 0.015 not 0.012!
    //                                                         ^^slope is 8 not 5!
    //                   ^^^weight 0.5 not 0.3!
}
```

**CRITICAL ISSUES:**
- ❌ Default return: Python=0.0, TypeScript=50 (50-point difference!)
- ❌ Marker center: Python=0.012, TypeScript=0.015
- ❌ Phrase slope: Python=5.0, TypeScript=8.0
- ❌ Missing components: starter_ratio (25% weight) and consecutive_bonus
- ❌ Wrong component weights: 50/50 instead of 30/30/25/remainder

---

### 2. **AI Marker Words - Missing Word**

**Python:** Has "underscore" (appears once: line 48)
**TypeScript:** Missing "underscore"

But actually checking Python code more carefully:
- Python has "underscore" appearing 3 times total (delineate, delve, encapsulate, "underscore" standalone)
- Wait, I see "underscore" appears in the verb list THREE TIMES:
  - Line 48: first mention
  - Line 51: second "underscore"  
  - Line 55: third duplicate "underscore"

Actually the Python list has duplicates! Let me check the exact set more carefully...

Looking at Python lines 31-55:
```python
AI_MARKER_WORDS = frozenset({
    # ...
    "underscore", "exemplify", "encompass", "bolster",
    "catalyze", "streamline", "optimize", "enhance", "mitigate",
    "navigate", "prioritize", "articulate", "substantiate", "corroborate",
    "disseminate", "cultivate", "ascertain", "endeavor", "underscore",
    "delve", "embark", "foster", "harness", "spearhead",
    "underscore", "unravel", "unveil",
    # ...
})
```

So Python has "underscore" THREE times (duplicates are ignored by frozenset).
TypeScript has "underscore" ZERO times. But wait, let me check TypeScript again...

Looking at TypeScript lines 59-82:
```typescript
const AI_MARKER_WORDS = new Set([
  // ...
  "cultivate", "ascertain", "endeavor",  // ← no "underscore" after "endeavor"!
  "delve", "embark", "foster", "harness", "spearhead",
  "unravel", "unveil",  // ← no "underscore" here either!
  // ...
]);
```

TypeScript is missing ALL THREE occurrences of "underscore" (well, just one unique word).

Actually wait, I need to look more carefully. In Python the word appears as "underscore" in the VERBS section. But I also see it in the compound words section. Let me trace this more carefully...

Actually, I realize I'm looking at Python's pattern which shows:
- Line 48: `"underscore", "exemplify"...`
- Line 51: `"endeavor", "underscore",`  
- Line 55: `"underscore", "unravel"`

But TypeScript shows:
- Line 78: `"endeavor",` (no underscore after)
- Line 79: `"delve", "embark", "foster", "harness", "spearhead",`
- Line 80: `"unravel", "unveil",` (no underscore before)

So yes, TypeScript is completely missing "underscore" as an AI marker word.

---

### 3. **Shannon Entropy - COMPLETELY DIFFERENT**

**Python (lines 660-686):**
Calculates **character bigram conditional entropy** H(C₂|C₁):
```python
def shannon_entropy(self) -> float:
    text = self.text_lower
    if len(text) < 50:
        return 45.0

    # Character bigram and unigram counts
    bi_counts = Counter()
    uni_counts = Counter()
    for i in range(len(text) - 1):
        bi_counts[text[i:i + 2]] += 1
        uni_counts[text[i]] += 1
    uni_counts[text[-1]] = uni_counts.get(text[-1], 0) + 1

    N_bi = sum(bi_counts.values())

    # Conditional entropy H(C₂|C₁)
    H_cond = 0.0
    for (c1c2), count in bi_counts.items():
        c1 = c1c2[0]
        p_joint = count / N_bi
        p_cond = count / uni_counts[c1] if uni_counts[c1] > 0 else 0.001
        H_cond -= p_joint * _safe_log2(p_cond)

    # AI: H ≈ 2.8-3.5, Human: H ≈ 3.4-4.5, center: 3.4
    return _clamp(_sig_norm(H_cond, 3.4, 2.5))
```

**TypeScript (lines 419-426):**
Calculates **WORD unigram entropy** H(word):
```typescript
shannonEntropy(): number {
    if (this.vocabSize < 5) return 50;
    let entropy = 0;
    for (const count of this.wordFreq.values()) {
      const p = count / this.wordCount;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return clamp(sigNorm(entropy, 5.5, 1.2));
}
```

**CRITICAL ISSUE:**
- ❌ **COMPLETELY DIFFERENT CALCULATIONS**
- Python: Character bigram conditional entropy (3-5 bits)
- TypeScript: Word unigram entropy (2-8 bits)
- ❌ Different centers: Python=3.4, TypeScript=5.5
- ❌ Different slopes: Python=2.5, TypeScript=1.2
- ❌ This will produce COMPLETELY different scores!

---

### 4. **Readability Consistency - Missing textstat Fallback**

**Python (lines 688-730):**
Has FULL implementation with textstat library OR fallback to sentence length CV:
```python
def readability_consistency(self) -> float:
    if not _HAS_TEXTSTAT or self.sentence_count < 6:
        # Fallback: use average sentence length variance as proxy
        if self.sentence_count < 4:
            return 45.0
        lengths = [len(ws) for ws in self.sent_words if ws]
        cv_l = _cv(lengths)
        return _clamp(_sig_norm(cv_l, 0.25, 5.0))

    # Build chunks of ~3 sentences
    chunk_size = 3
    chunks = []
    for i in range(0, self.sentence_count, chunk_size):
        chunk = " ".join(self.sentences[i:i + chunk_size])
        if len(chunk.split()) >= 10:
            chunks.append(chunk)

    if len(chunks) < 3:
        return 45.0

    # Multiple readability metrics per chunk
    fre_scores = []
    ari_scores = []
    for c in chunks:
        try:
            fre_scores.append(textstat.flesch_reading_ease(c))
        except Exception:
            pass
        try:
            ari_scores.append(textstat.automated_readability_index(c))
        except Exception:
            pass

    cvs = []
    if len(fre_scores) >= 3 and min(fre_scores) > 0:
        cvs.append(_cv(fre_scores))
    if len(ari_scores) >= 3 and min(ari_scores) > 0:
        cvs.append(_cv(ari_scores))

    if not cvs:
        return 45.0

    avg_cv = _mean(cvs)
    # AI: CV ≈ 0.03-0.12, Human: CV ≈ 0.10-0.40, center: 0.10
    return _clamp(_sig_norm(avg_cv, 0.10, 8.0))
```

**TypeScript (lines 428-438):**
Only has simplified approximation:
```typescript
readabilityConsistency(): number {
    if (this.sentenceCount < 5) return 50;
    const sentScores = this.sentWords.map((ws) => {
      if (ws.length === 0) return 50;
      const avgWordLen = ws.reduce((s, w) => s + w.length, 0) / ws.length;
      return 206.835 - 1.015 * ws.length - 84.6 * (avgWordLen / 5);
    });
    const cvScore = cv(sentScores.map((s) => Math.max(s, 1)));
    return clamp(100 - sigNorm(cvScore, 0.25, 6.0));
    //                                    ^^^^center=0.25 not 0.10!
    //                                          ^^^slope=6.0 not 8.0!
    //           ^^^^^ inverted (100 - score) vs Python's direct score!
}
```

**ISSUES:**
- ⚠️ Different implementations (Python chunks + textstat vs TypeScript per-sentence approx)
- ❌ Different center: Python=0.10, TypeScript=0.25
- ❌ Different slope: Python=8.0, TypeScript=6.0
- ❌ TypeScript INVERTS score (100 - x) vs Python direct
- ⚠️ May produce different results

---

### 5. **Stylometric Score - COMPLETELY DIFFERENT**

**Python (lines 732-811):**
COMPREHENSIVE 8-component analysis:
```python
def stylometric_score(self) -> float:
    # (a) Punctuation diversity and density
    # (b) Comma-to-period ratio
    # (c) Question/exclamation usage
    # (d) Parenthetical & dash usage
    # (e) Contraction usage
    # (f) Personal pronoun density
    
    # Scoring components (6 components)
    pt_s = _sig_norm(punct_types, 4.5, 0.8)
    cr_s = _sig_norm(abs(comma_ratio - 1.5), 0.8, -2.0)
    qe_s = _sig_norm(qe_ratio, 0.03, 15.0)
    pd_s = _sig_norm(pd_ratio, 0.02, 20.0)
    ct_s = _sig_norm(contraction_ratio, 0.005, 200.0)
    pr_s = _sig_norm(pronoun_ratio, 0.015, 60.0)
    
    return _clamp(
        pt_s * 0.15 + cr_s * 0.10 + qe_s * 0.15 +
        pd_s * 0.15 + ct_s * 0.20 + pr_s * 0.25
    )
```

**TypeScript (lines 440-448):**
Only 2-component simplification (word length skewness + kurtosis):
```typescript
stylometricScore(): number {
    if (this.wordCount < 30) return 45;
    const wordLens = this.words.map((w) => w.length);
    const wlSkewness = this._skewness(wordLens);
    const wlKurtosis = this._kurtosis(wordLens);
    const skewScore = sigNorm(Math.abs(wlSkewness), 0.3, 3.0);
    const kurtScore = sigNorm(wlKurtosis, 3.0, 0.5);
    return clamp(skewScore * 0.5 + kurtScore * 0.5);
}
```

**CRITICAL ISSUE:**
- ❌ **COMPLETELY DIFFERENT CALCULATIONS**
- Python: 6 components (punctuation, commas, questions, dashes, contractions, pronouns)
- TypeScript: 2 components (word length skewness + kurtosis)
- ❌ NO OVERLAP in what they measure!
- ❌ Will produce COMPLETELY different results!

---

### 6. **Minor Discrepancies in Other Signals**

Most other signals appear to match, but there are small differences in:

- **aiPatternScore** marker center: 0.012 vs 0.015
- **perSentenceAiRatio** implementation looks similar but may have minor threshold differences

---

## Summary of Critical Failures

| Signal | Python | TypeScript | Match? |
|--------|--------|------------|--------|
| perplexity | ✓ Full implementation | ✓ Full implementation | ✅ |
| burstiness | ✓ Full implementation | ✓ Full implementation | ✅ |
| vocabulary_richness | ✓ Full implementation | ✓ Full implementation | ✅ |
| sentence_uniformity | ✓ Full implementation | ✓ Full implementation | ✅ |
| **ai_pattern_score** | **4 components** | **2 components, wrong params** | ❌ |
| **shannon_entropy** | **Char bigram H(C₂\|C₁)** | **Word unigram H(word)** | ❌ |
| **readability_consistency** | **Textstat FRE+ARI chunks** | **Simplified per-sent approx** | ⚠️ |
| **stylometric_score** | **6 punctuation/pronoun metrics** | **2 word-length moments** | ❌ |
| ngram_repetition | ✓ Full implementation | ✓ Full implementation | ✅ |
| starter_diversity | ✓ Full implementation | ✓ Full implementation | ✅ |
| word_length_variance | ✓ Full implementation | ✓ Full implementation | ✅ |
| paragraph_uniformity | ✓ Full implementation | ✓ Full implementation | ✅ |
| avg_word_commonality | ✓ Full implementation | ✓ Full implementation | ✅ |
| zipf_deviation | ✓ Full implementation | ✓ Full implementation | ✅ |
| token_predictability | ✓ Full implementation | ✓ Full implementation | ✅ |
| per_sentence_ai_ratio | ✓ Full implementation | ✓ Full implementation | ✅ |
| spectral_flatness | ✓ Full implementation | ✓ Full implementation | ✅ |
| lexical_density_var | ✓ Full implementation | ✓ Full implementation | ✅ |
| function_word_freq | ✓ Full implementation | ✓ Full implementation | ✅ |
| dependency_depth | ✓ Full implementation | ✓ Full implementation | ✅ |

---

## Detector Profiles & Calibration

All 22 detector profiles appear to match in:
- ✅ Weights
- ✅ Bias
- ✅ Temperature  
- ✅ Interactions

All Platt calibration parameters (a, b) match exactly:
- ✅ All 22 detectors have identical (a, b) values

---

## CONCLUSION

**4 CRITICAL SIGNAL MISMATCHES** that will cause different detection scores:

1. **ai_pattern_score**: Missing 2 components, wrong parameters, wrong default (50 vs 0)
2. **shannon_entropy**: Completely different calculation (char bigram vs word unigram)
3. **readability_consistency**: Different implementation (chunks+textstat vs per-sentence)
4. **stylometric_score**: Completely different calculation (6 punctuation metrics vs 2 word-length moments)

These signals are used by MULTIPLE detectors with significant weights:
- **ai_pattern_score**: Used by 15+ detectors (weights 0.4-0.8)
- **shannon_entropy**: Used by 8 detectors (weights 0.3-0.5)
- **readability_consistency**: Used by 7 detectors (weights 0.3-0.8)
- **stylometric_score**: Used by 6 detectors (weights 0.3-0.7)

**IMPACT**: Detection scores will be SIGNIFICANTLY DIFFERENT between Python and TypeScript. This violates the 100% accuracy requirement.

---

## REQUIRED FIXES

Need to port exact Python implementations for:
1. `ai_pattern_score()` - Add starter_ratio and consecutive_bonus components
2. `shannon_entropy()` - Switch to character bigram conditional entropy
3. `readability_consistency()` - Match Python's textstat-based or fallback logic
4. `stylometric_score()` - Port all 6 punctuation/pronoun components

Also fix:
5. Add "underscore" to AI_MARKER_WORDS
