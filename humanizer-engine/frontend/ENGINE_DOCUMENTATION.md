# Engine Documentation — Humanizer Pipeline
> **Living Document** — Update this file whenever any engine, phase, model, fallback, or cost changes.
> Last updated: 2025-07

---

## Table of Contents

1. [Engine Registry](#1-engine-registry)
2. [Category A — Pure TypeScript (No LLM, No External API)](#2-category-a--pure-typescript-no-llm-no-external-api)
   - [Humara 2.0 — Oxygen (`oxygen`)](#21-humara-20--oxygen-oxygen)
   - [Nuru 2.0 (`nuru_v2`)](#22-nuru-20-nuru_v2)
3. [Category B — External Free API Proxy](#3-category-b--external-free-api-proxy)
   - [Humara 2.1 — Ozone (`ozone`)](#31-humara-21--ozone-ozone)
   - [Humara 2.2 — Easy (`easy`)](#32-humara-22--easy-easy)
4. [Category C — HuggingFace T5 Models](#4-category-c--huggingface-t5-models)
   - [Humara 2.4 — Humarin T5 (`humara_v3_3`)](#41-humara-24--humarin-t5-humara_v3_3)
   - [Humara 3.0 — Oxygen3 Fine-tuned T5 (`oxygen3`)](#42-humara-30--oxygen3-fine-tuned-t5-oxygen3)
5. [Category D — LLM-Driven](#5-category-d--llm-driven)
   - [Wikipedia / Ghost Pro (`ghost_pro_wiki`)](#51-wikipedia--ghost-pro-ghost_pro_wiki)
   - [LLM Academic Fallback (used by Humara 2.4)](#52-llm-academic-fallback-used-by-humara-24)
6. [Universal Post-Processing Pipeline](#6-universal-post-processing-pipeline)
7. [Engine Routing — How Requests Are Dispatched](#7-engine-routing--how-requests-are-dispatched)
8. [Shared Infrastructure](#8-shared-infrastructure)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Cost Summary](#10-cost-summary)
11. [Speed Reference](#11-speed-reference)

---

## 1. Engine Registry

| Engine Key | Display Name | Category | File | Cost |
|---|---|---|---|---|
| `oxygen` | Humara 2.0 | Pure TS | `lib/engine/oxygen-humanizer.ts` | $0 |
| `nuru_v2` | Nuru 2.0 | Pure TS | `lib/engine/nuru-humanizer.ts` | $0 |
| `ozone` | Humara 2.1 | Free API | `lib/engine/ozone-humanizer.ts` | $0 |
| `easy` | Humara 2.2 | Free API | `lib/engine/easy-humanizer.ts` | $0 |
| `humara_v3_3` | Humara 2.4 | HF T5 | `lib/engine/humarin-humanizer.ts` | $0 primary / ~$0.0003/1K fallback |
| `oxygen3` | Humara 3.0 | HF T5 | `lib/engine/oxygen3-humanizer.ts` | $0 |
| `ghost_pro_wiki` | Wikipedia | LLM | `lib/engine/ghost-pro.ts` | ~$0.0013/1K words |

---

## 2. Category A — Pure TypeScript (No LLM, No External API)

These engines run entirely in the Next.js server process. Zero external network calls. Zero cost at any volume. No cold starts.

---

### 2.1 Humara 2.0 — Oxygen (`oxygen`)

**File:** `lib/engine/oxygen-humanizer.ts`  
**Entry point:** `oxygenHumanize(text, strength, mode, sentenceBySentence)`  
**Modes:** `fast` | `quality` | `aggressive`  
**Tech stack:** Pure TypeScript regex + dictionary lookup + heuristic grammar engine

#### Architecture Overview

A 6-phase linear pipeline. Each phase transforms the entire text in sequence, feeding forward to the next. No sentence isolation — operates over full-text spans.

---

#### Phase 1 — AI Word & Phrase Kill

**What it does:**
- Replaces 90+ AI-overused words with human equivalents using case-preserving regex (`utilize→use`, `furthermore→also`, `leverage→draw on`, `facilitate→help`, `comprehensive→thorough`, `pivotal→key`, `paramount→crucial`, etc.)
- Strips "AI starter" sentence openers (`In conclusion,`, `In summary,`, `It is important to note that`, `Firstly, `, `Secondly,`, etc.)
- Removes filler padding phrases (`as previously mentioned`, `it goes without saying`, etc.)

**Why:** These 90+ words/phrases are the primary signals AI detectors pattern-match. Removing them early prevents downstream phases from embedding them again.

---

#### Phase 2 — Deep Synonym Replacement

**What it does:**
- Applies 150+ synonym swaps with tense awareness using `inflectVerb()` and `detectVerbForm()`
- `detectVerbForm()` reads the surrounding sentence to determine whether the original verb is present tense, past tense, gerund, or passive — then calls `inflectVerb()` to conjugate the replacement correctly
- `IRREGULAR_PAST` dictionary prevents errors like `runned`, `taked`, `goed`
- Case-preserving: if original word was capitalized (sentence-start), replacement is also capitalized

**Example flow:**
```
"This demonstrates the impact" → detectVerbForm("demonstrates") = "present_3s"
→ inflectVerb("show", "present_3s") = "shows"
→ "This shows the impact"
```

---

#### Phase 3 — Structural Variance

**What it does:**
- **Clause fronting:** moves time/place/reason adverbials to sentence start (`"The study showed X after 2003" → "After 2003, the study showed X"`)
- **Sentence splitting:** long compound sentences with `; and` or `; but` are split into two
- **Sentence merging:** short consecutive sentences (under 8 words) joined with semicolons or commas
- Adds natural inter-sentence connectors (`this meant that`, `as a result,`) in place of robotic transitions

**Why:** AI text has uniformly similar sentence lengths. Structural variance creates the burstiness that human writing naturally has.

---

#### Phase 4 — Heavy Rule-Based Rewriting

**What it does:**
- Applies structural templates: subject-verb-object reordering, prepositional phrase fronting
- Voice switching: active→passive or passive→active for a subset of sentences (not all — avoids over-uniformity)
- Hedging injection: adds `"to some extent,"`, `"in most cases,"`, `"as far as the evidence suggests,"` to approximately 20% of sentences
- Uses `STRUCTURAL_TEMPLATES` array to apply clause-level rewrites

---

#### Phase 5 — Grammar Fixes

**What it does:**
- Corrects article errors introduced by previous phases (`"a university"` → `"a university"`, `"a hour"` → `"an hour"`)
- Fixes double spaces, trailing punctuation artifacts
- Removes dangling commas and fragments shorter than 3 words
- Calls `postCleanGrammar()` for punctuation normalization

---

#### Phase 6 — Quality Gate

**What it does:**
- Calculates the word-level change ratio between input and output
- If change ratio is below the configured minimum (default: 40% for `quality`, 25% for `fast`), the pipeline loops back to Phase 2 with elevated synonym aggressiveness
- Maximum 3 retry loops — prevents infinite recursion
- `adaptiveOxygenChain()` in `route.ts` wraps this: if the first pass doesn't meet quality threshold, runs a second quality-mode pass on the output

**Why:** Without a quality gate, easy/short texts with few AI words may pass through nearly unchanged.

---

#### Fallback Behavior

- No fallback — if `oxygenHumanize()` fails, the error propagates to route.ts which has top-level error handling

---

#### Required Env Vars

None.

---

### 2.2 Nuru 2.0 (`nuru_v2`)

**File:** `lib/engine/nuru-humanizer.ts`  
**Entry point:** `nuruHumanize(text, strength, tone)`  
**Tech stack:** Pure TypeScript — per-sentence independent processing with 10 strategy variants

#### Architecture Overview

A 3-phase pipeline where each sentence is processed **independently** (not in a pipeline of full-text transforms). Each sentence receives a randomly assigned strategy from a pool of 10, determined by a deterministic hash of the sentence content and its global index. This randomness means two identical sentences at different positions get different treatments — defeating statistical uniformity attacks.

---

#### Phase 1 — Pre-Analysis

**Step 1.1 — First-Person Detection**  
Scans input for `\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b`. If found, `hasFirstPerson = true` → first-person pronouns are preserved in output. If not found, first-person pronouns are never introduced.

**Step 1.2 — Paragraph Extraction (`extractParagraphs`)**  
Splits on double-newline. If a paragraph contains single newlines, each line is examined by `isProtectedLine()`. Heading lines are split off as their own paragraph entries. This ensures headings are never fed into sentence-level transforms.

**Step 1.3 — Protected Line Detection (`isProtectedLine`)**  
A line is protected if it:
- Is a markdown heading (`# Title`)
- Is a Roman numeral list item (`I. Introduction`)
- Starts with `Part/Section/Chapter/Abstract/Introduction/Conclusion/References`
- Is a numbered or lettered list item (`1.`, `A.`)
- Is ≤5 words with no terminal punctuation
- Is ≤15 words with no terminal punctuation (title heuristic)
- Contains `:–—` without terminal punctuation

Protected lines are stored in `protectedParagraphs` map and bypassed entirely during Phase 2.

**Step 1.4 — Sentence Classification (`classifySentences`)**  
For each non-protected paragraph:
- Sentences are extracted via `robustSentenceSplit()` (handles abbreviations, decimals, URLs)
- Each sentence is assigned a `seed = hashSentence(text, globalIndex)`
- `assignedStrategy = seed % 10` — picks one of 10 strategies
- `shouldInjectError`: ~40% of non-short sentences get a deliberate typo/grammatical informality injected
- `shouldVaryStarter`: ~12% of non-short sentences get their opening phrase rotated

---

#### Phase 2 — Independent Processing (10 Strategies)

Each sentence is processed through its assigned strategy. All strategies start with `applyAIWordKill()`. The 10 strategies differ in what transforms they apply next:

| # | Name | Transforms Applied |
|---|---|---|
| 0 | Analytical | AI kill → CLAUSE_REPHRASINGS → VERB_PHRASE_SWAPS → deepRestructure(0.6) → syntacticTemplate (50%) |
| 1 | Formal Academic | AI kill → phrasePatterns → CAUSAL_SWAPS → TEMPORAL_SWAPS → TRANSITION_SWAPS → syntacticTemplate (60%) |
| 2 | Simplification | AI kill → HEDGING_PHRASES → MODIFIER_SWAPS → QUANTIFIER_SWAPS → EMPHASIS_SWAPS → connector naturalization |
| 3 | Voice Shift | AI kill → voiceShift(0.5) → deepRestructure(0.35) → phrasePatterns → CAUSAL_SWAPS → syntacticTemplate (70%) |
| 4 | Traditional | AI kill → phrasePatterns → CLAUSE_REPHRASINGS → VERB_PHRASE_SWAPS → semicolon insertion → TEMPORAL_SWAPS → deepRestructure(0.4) |
| 5 | Direct | AI kill → connector naturalization → MODIFIER_SWAPS → DIVERSITY_SWAPS → EMPHASIS_SWAPS → syntacticTemplate (40%) |
| 6 | Deep Restructure | AI kill → deepRestructure(0.45) → voiceShift(0.3) → VERB_PHRASE_SWAPS → CLAUSE_REPHRASINGS → TRANSITION_SWAPS → syntacticTemplate |
| 7 | Precision | AI kill → phrasePatterns → CAUSAL_SWAPS → QUANTIFIER_SWAPS → TEMPORAL_SWAPS → MODIFIER_SWAPS → deepRestructure(0.5, 50%) |
| 8 | Full Sweep | AI kill → phrasePatterns → all 6 swap dicts → connector naturalization → syntacticTemplate (60%) |
| 9 | Measured | AI kill → EMPHASIS_SWAPS → HEDGING_PHRASES → voiceShift(0.4) → CAUSAL_SWAPS → TEMPORAL_SWAPS → deepRestructure(0.5) |

**Garble Protection:** Every call to `deepRestructure()` and `voiceShift()` is wrapped in a safe wrapper (`safeDeepRestructure`, `safeSyntacticTemplate`) that checks `isGarbledSentence()` on the result. If garbled, it reverts to the pre-transform version. `isGarbledSentence()` catches 20+ patterns: broken passives, double prepositions, nonsense verb forms, subject-less sentences, dangling fragments, etc.

**60% Word Change Enforcement (`enforceMinimumChange`)**  
After each strategy runs, the change ratio is calculated:
- If below 40% → applies additional swap dicts (VERB_PHRASE_SWAPS, CLAUSE_REPHRASINGS, TRANSITION_SWAPS)
- Still below 40% → applies voiceShift + deepRestructure at lower intensity
- Still below 40% → applies tenseVariation
- Loops up to 3 passes

---

#### Phase 3 — Reassembly + 7-Phase Post-Processing

**Step 3.1 — Reassembly**  
Sentences are reassembled into paragraphs using the `paragraphMap`. Protected lines are re-inserted at their original paragraph positions.

**Step 3.2 — Error Injection**  
Sentences marked `shouldInjectError` receive one deliberate informality: comma splices, mild hedging (`"kind of"`, `"more or less"`), or natural speech patterns that human writers use but AI avoids.

**Step 3.3 — Starter Variation**  
Sentences marked `shouldVaryStarter` have their opening rotated through `diversifyStarters()` — prevents the document-level uniformity of every paragraph starting with `"The"` or `"This"`.

**Step 3.4 — 7-Phase Post-Processing Chain:**

| Phase | Function | What it does |
|---|---|---|
| 1 | `applyAIWordKill` | Second sweep — catches any AI words re-introduced by strategies |
| 2 | `applyPhrasePatterns` | Phrase-level AI kill (multi-word patterns) |
| 3 | `cleanSentenceStarters` | Removes remaining "Furthermore," "Moreover," etc. at sentence starts |
| 4 | `expandAllContractions` | Expands all contractions (`can't→cannot`, `it's→it is`) — Nuru NEVER uses contractions |
| 5 | `diversifyStarters` | Document-level starter deduplication — ensures no two adjacent paragraphs open the same way |
| 6 | `deepCleaningPass` | Final fragment cleanup, double-space removal, punctuation normalization |
| 7 | `applyAIWordKill` | Third/final sweep — belt-and-suspenders |

**Strict Output Rules (enforced throughout):**
- NO contractions — ever
- NO first-person unless input contained it
- NO colloquial or informal phrases
- Target: 0% AI detection score

---

#### Required Env Vars

None.

---

## 3. Category B — External Free API Proxy

These engines send text to third-party APIs that are free and require no payment. They do require a network call and are subject to the external service's uptime.

---

### 3.1 Humara 2.1 — Ozone (`ozone`)

**File:** `lib/engine/ozone-humanizer.ts`  
**Entry point:** `ozoneHumanize(text, sentenceBySentence)`  
**External API:** `https://www.ozone3.site/api/humanize`  
**Auth:** None (public API, no key required)

#### Architecture Overview

A proxy engine that segments text, sends it to the Ozone API, then applies deduplication and hallucination detection on the response.

---

#### Phase 1 — Text Segmentation (`segmentText`)

**What it does:**
- Splits text into typed segments: `title`, `sentence`, or `blank`
- Titles are identified by `isProtectedLine()` logic — they are NOT sent to the API; they pass through unchanged
- Sentences are split via `robustSentenceSplit()`
- Blank segments (empty lines) are preserved to maintain paragraph structure in output

---

#### Phase 2 — Concurrent API Calls

**What it does:**
- Groups sentences into batches of `BATCH_SIZE` (concurrent groups)
- Each sentence is sent to `https://www.ozone3.site/api/humanize` as an independent POST request
- Request body: `{ text: sentence }`
- No authentication header required
- 10s timeout per request

**Batch concurrency:** Multiple sentences are sent in parallel using `Promise.all()` per batch group. This minimizes total wall time for long texts.

---

#### Phase 3 — Response Cleaning

**What it does:**
- Strips meta-messages the API sometimes returns instead of humanized text:
  - `"Sorry, please provide text"`, `"I apologize"`, `"As an AI"`, `"I cannot"`, etc.
  - If detected → falls back to the original sentence
- Strips leading/trailing whitespace artifacts

---

#### Phase 4 — Deduplication

**Step 4.1 — Sentence Deduplication (`deduplicateSentences`)**  
Compares every sentence in output to every other sentence. If two sentences share >80% word overlap, the later one is replaced with a placeholder or removed. Prevents the Ozone API from returning near-identical variants of the same sentence.

**Step 4.2 — Paragraph Deduplication (`deduplicateParagraphs`)**  
Checks each output paragraph against the original input paragraphs. If a paragraph has <15% word overlap with any input paragraph, it is classified as "hallucinated" (the API invented content not in the original) and is removed entirely.

---

#### Phase 5 — Reassembly

Segments are reassembled in original order: titles pass through, humanized sentences are placed in their original positions, blanks are restored. Paragraph structure is fully preserved.

---

#### Fallback Behavior

None built-in at the engine level. If the API is down or all sentences fail, original text is returned sentence-by-sentence (each failed sentence falls back to original).

---

#### Route.ts Integration

In `route.ts`, Ozone engine is called via `runHumara21()`. **Ozone is the only engine that bypasses the universal Nuru post-processing** — it has its own deduplication pipeline that is incompatible with Nuru's structural transforms.

---

#### Required Env Vars

None.

---

### 3.2 Humara 2.2 — Easy (`easy`)

**File:** `lib/engine/easy-humanizer.ts`  
**Entry point:** `easyHumanize(text, strength, tone, sentenceBySentence)`  
**External API:** `https://www.essaywritingsupport.com/api/v1/humanize`  
**Auth:** Requires `EASY_API_KEY` env var

#### Architecture Overview

A proxy engine that maps Humara's strength/tone parameters to the Easy API's parameter schema, then sends the text either as a whole paper or sentence-by-sentence.

---

#### Phase 1 — Parameter Mapping

**Aggressiveness mapping (`mapAggressiveness`):**
- `light` → `3`
- `medium` → `5`
- `strong` → `8`

**Style mapping (`mapStyle`):**
- `academic` → `academic`
- `professional` → `professional`
- `casual` / anything else → `casual`

---

#### Phase 2 — Request Mode Decision

Two modes based on the `sentenceBySentence` parameter:

**Whole-paper mode** (`sentenceBySentence = false`):
- Sends the entire text as a single POST request
- Request body: `{ text, aggressiveness, style, api_key }`
- The Easy API processes it as one unit

**Sentence-by-sentence mode** (`sentenceBySentence = true`):
- Uses `segmentText()` to split into titles/sentences/blanks (same as Ozone)
- Sends sentences in batches of `BATCH_SIZE = 10` concurrently
- Each sentence sent as an individual API call with the same auth header
- Titles pass through unchanged

---

#### Phase 3 — Fallback (No API Key)

If `EASY_API_KEY` is not set in the environment:
- Logs a warning: `[Easy] EASY_API_KEY not set`
- Immediately falls back to `oxygenHumanize()` (pure TypeScript Humara 2.0)
- No API call is made

---

#### Phase 4 — Reassembly + Polish

After Easy API results are received:
- Segments reassembled in original order
- In `route.ts`, `runHumara22()` wrapper adds a single **quality-mode Oxygen polish** pass on top of Easy's output
- Then runs `stealthHumanize()` (Nuru refinement) for final cleanup

---

#### Required Env Vars

| Var | Required | Notes |
|---|---|---|
| `EASY_API_KEY` | Optional | If absent, falls back to Oxygen (Humara 2.0). Get from essaywritingsupport.com |

---

## 4. Category C — HuggingFace T5 Models

These engines call HuggingFace Spaces running T5-based neural paraphrasers. The Spaces run on free CPU tier (ZeroGPU or standard CPU). They sleep after ~15 minutes of inactivity — the keepalive cron prevents this.

---

### 4.1 Humara 2.4 — Humarin T5 (`humara_v3_3`)

**File:** `lib/engine/humarin-humanizer.ts`  
**Entry point:** `humarinHumanize(text, mode, sentenceBySentence)`  
**Primary model:** `humarin/chatgpt_paraphraser_on_T5_base` (222M parameters)  
**HF Space URL:** `https://maguna956-humarin-paraphraser.hf.space`  
**Auth:** Bearer token via `HUMARIN_API_KEY` env var

#### Architecture Overview

Calls a T5 model trained on ChatGPT-generated text to paraphrase it back into human-style prose. Has a multi-tier fallback chain: primary HF Space → backup Cloud Run instance → LLM Academic (OpenAI) → Oxygen (pure TS).

---

#### Phase 1 — API Key Check

If `HUMARIN_API_KEY` is not set:
- Immediately skips to **LLM Academic Fallback** (Phase 5)
- No T5 call is attempted

---

#### Phase 2 — Chunk Splitting (`splitIntoChunks`)

**What it does:**
- If `sentenceBySentence = true` or mode is `turbo`/`fast`, or word count ≤ 1200: text is sent as a single chunk
- Otherwise: text is split into paragraph-based chunks (max 2 for dual-endpoint, max 3 for single)
- Chunks are formed by grouping consecutive paragraphs until the chunk size limit is reached

**Why chunks:** HF Space free-tier has a single Gradio worker. Sending very long texts as one request risks timeouts. Chunking with sequential processing (not parallel) avoids the "Already borrowed" mutex error from the single worker.

---

#### Phase 3 — Dual-Endpoint Parallel (if backup configured)

If `HUMARIN_API_URL_BACKUP` is set AND text has >300 words:
- Splits text into exactly 2 chunks
- Sends chunk 1 to primary HF Space and chunk 2 to backup URL simultaneously using `Promise.all()`
- Both calls have a 5-second timeout
- If either fails, falls through to Phase 4 (primary-only sequential)

---

#### Phase 4 — Primary HF Space Call

**Request to `{HUMARIN_API_URL}/humanize`:**
```json
{
  "text": "...",
  "mode": "quality|fast|turbo",
  "sentence_by_sentence": true,
  "min_change_ratio": 0.40,
  "max_retries": 1|2|5  // turbo:1, fast:2, quality:5
}
```

**Timeout:** 5 seconds (fail-fast — if HF Space is sleeping/cold, we don't wait)

**If primary times out or fails:** falls through to Phase 4b (backup URL) or Phase 5 (LLM Academic).

---

#### Phase 4b — Backup URL (Cloud Run)

If `HUMARIN_API_URL_BACKUP` is configured:
- Same request format as primary
- 5-second timeout
- Uses `HUMARIN_API_KEY_BACKUP` if set, otherwise same key as primary
- If this also fails: falls through to Phase 5

---

#### Phase 5 — LLM Academic Fallback

Calls `llmAcademicFallback()` → `llmAcademicHumanize()` in `llm-academic-humanizer.ts`.  
Uses **OpenAI gpt-4o-mini** as primary, **gpt-4.1-nano** as per-phase retry.  
See [Section 5.2](#52-llm-academic-fallback-used-by-humara-24) for full phase details.

---

#### Phase 6 — Oxygen Polish (`adaptiveOxygenChain`)

After any successful result (T5 or LLM fallback), `route.ts` applies:
- `adaptiveOxygenChain(output, originalInput)` — runs a quality-mode Oxygen pass to catch any AI patterns the T5 reintroduced
- This is part of `runHumara24()` wrapper in route.ts

---

#### Mode Behavior

| Mode | HF Space max_retries | Best for |
|---|---|---|
| `turbo` | 1 | Speed — fastest, lowest quality |
| `fast` | 2 | Balance — default |
| `quality` | 5 | Best output — slowest |

---

#### Required Env Vars

| Var | Required | Notes |
|---|---|---|
| `HUMARIN_API_KEY` | Optional | If absent, skips T5 and uses LLM Academic fallback |
| `HUMARIN_API_URL` | Optional | Defaults to `https://maguna956-humarin-paraphraser.hf.space` |
| `HUMARIN_API_URL_BACKUP` | Optional | Cloud Run backup. If empty, single-endpoint mode |
| `HUMARIN_API_KEY_BACKUP` | Optional | Backup key, falls back to primary key if absent |

---

### 4.2 Humara 3.0 — Oxygen3 Fine-tuned T5 (`oxygen3`)

**File:** `lib/engine/oxygen3-humanizer.ts`  
**Entry point:** `oxygen3Humanize(text, mode, tone)`  
**Model:** Custom fine-tuned T5 (fine-tuned specifically for humanization, not a base paraphraser)  
**HF Space URL:** `https://maguna956-oxygen3-humanizer.hf.space`  
**Auth:** None (public Space, no bearer token)

#### Architecture Overview

Calls a fine-tuned T5 model that was specifically trained on AI→human text pairs. Unlike Humarin (trained on ChatGPT paraphrasing), Oxygen3 was trained to minimize AI detector scores. Has no LLM fallback — if the Space is down, it throws.

---

#### Phase 1 — Health Check (Wake Call)

**What it does:**
- GETs `{OXYGEN3_API_URL}/health` with a 5-second timeout
- This is **non-fatal** — if it fails, we log a warning and continue
- Purpose: wake the Space from sleep before the main call; prevents the main call from failing due to cold start

---

#### Phase 2 — Chunk Splitting

Same `splitIntoChunks()` logic as Humarin — paragraph-based, max 3 chunks.

---

#### Phase 3 — Sequential API Calls

**Request to `{OXYGEN3_API_URL}/humanize`:**
```json
{
  "text": "...",
  "mode": "quality|fast|turbo",
  "tone": "neutral|academic|...",
  "sentence_by_sentence": true
}
```

**Note:** `sentence_by_sentence: true` is always sent regardless of input — the server enforces this.

**Timeout per chunk:** 10 seconds

Chunks are processed **sequentially** (not parallel) because the HF Space has a single worker and rejects concurrent requests.

---

#### Phase 4 — Stats Aggregation

For multi-chunk texts, the engine merges the per-chunk stats:
- `total_sentences`: summed across all chunks
- `avg_change_ratio`: averaged across all chunks
- `met_threshold`: summed
- `threshold_ratio`: recalculated from summed values

---

#### Mode Behavior

| Mode | Beam Size | Description |
|---|---|---|
| `turbo` | 1 | Greedy decode — fastest |
| `fast` | 2 | Small beam — balanced (default) |
| `quality` | 4 | Full beam — slowest, best quality |

In `route.ts`: `light` strength → `fast`, `strong` strength → `quality`, `medium` → `fast`.

---

#### Fallback Behavior

**None.** If the HF Space is down or all chunks fail, an error is thrown and propagated to the API caller. No secondary model is configured.

---

#### Required Env Vars

| Var | Required | Notes |
|---|---|---|
| `OXYGEN3_API_URL` | Optional | Defaults to `https://maguna956-oxygen3-humanizer.hf.space` |

---

## 5. Category D — LLM-Driven

These engines use OpenAI chat models. They have the highest quality output and the highest cost (still very low).

---

### 5.1 Wikipedia / Ghost Pro (`ghost_pro_wiki`)

**File:** `lib/engine/ghost-pro.ts`  
**Entry point:** `ghostProHumanize(text, options)`, called via `runWikipedia()` wrapper in route.ts  
**Primary model:** `gpt-4o-mini` (via `process.env.LLM_MODEL ?? 'gpt-4o-mini'`)  
**Fallback model:** `gpt-4.1-nano` (hardcoded as `LLM_FALLBACK_MODEL`)  
**Last-resort model:** Groq `llama-3.3-70b-versatile` (client exists but not in default call path)  
**Cost:** ~$0.0013/1K words (gpt-4o-mini pricing)

#### Architecture Overview

A two-pass pipeline:
1. **Pass 1:** Full-document LLM rewrite with 6 absolute rules, tone-specific prompting, and banned vocabulary list
2. **Pass 2:** Signal-aware post-processing — catches LLM-introduced patterns that detectors flag

For `ghost_pro_wiki` specifically, the `runWikipedia()` wrapper in `route.ts` adds additional stages before and after.

---

#### Pre-Processing (route.ts `runWikipedia` wrapper)

Before Ghost Pro runs:
1. **Citation protection:** Paragraphs matching `"Author, A. (2020)."` format are extracted and protected — LLMs mangle citation paragraphs
2. **Text passed to `ghostProHumanize()` with `tone: 'wikipedia'`**

---

#### Pass 1 — LLM Deep Rewrite

**Input analysis (`analyzeInputFeatures`):**
- Detects contractions in input (if present → LLM may use them; if absent → banned)
- Detects first-person pronouns (Wikipedia mode: always banned)
- Detects rhetorical questions (Wikipedia mode: always banned)
- Counts words, sentences, paragraphs — used for word-count constraints

**System Prompt (Wikipedia mode — `getSystemPrompt`):**
The system prompt contains 6 rule categories, all non-negotiable:

1. **Sentence length variation:** Include short sentences (8–14 words) AND long ones (30–45 words). Never 3 consecutive sentences within 6 words of each other in length.

2. **Banned vocabulary (Wikipedia mode):** 30+ words banned: `utilize`, `leverage`, `delve`, `tapestry`, `cornerstone`, `bedrock`, `linchpin`, `nexus`, `myriad`, `plethora`, `multifaceted`, `holistic`, `synergy`, `paradigm`, `trajectory`, `discourse`, `dichotomy`, `conundrum`, `ramification`, `underpinning`, `efficacious`, `bolster`, `catalyze`, `spearhead`, `unravel`, `unveil`, `embark`, `harness`, `ameliorate`, `engender`, `elucidate`, `exacerbate`, `proliferate`, `culminate`. Plus 15+ banned phrases.

3. **Sentence starters (Wikipedia style):** Mostly subject-first (`"The organization..."`, `"Several studies..."`). Temporal/locational openers allowed (`"In 1976,..."`). Never: `"Furthermore,"`, `"Moreover,"`, `"Additionally,"`.

4. **Encyclopedic texture:** Neutral POV, third person only, no opinion, no rhetorical questions, no hedging. Natural relative clauses. Reference markers `[1]`, `[2]` preserved exactly.

5. **Word choice:** Precise vocabulary (`"established"`, `"implemented"`, `"comprising"`). NOT academic corporate buzzwords. NOT informal.

6. **Paragraph variation:** Different paragraph lengths. No identical paragraph structure.

**Word count constraint:** Output must stay within ±15% of original word count.

**User Prompt (`buildUserPrompt`):**  
Contains tone instructions, contraction rule, first-person rule, rhetorical question rule, paragraph count requirement, protection notice (placeholder tokens `[[PROT_0]]` etc. must pass through unchanged), and `SHORT TEXT CRITICAL RULES` for texts under 300 words.

**LLM Call (`llmCall`):**
- Tries `gpt-4o-mini` first
- If it fails (any error): retries with `gpt-4.1-nano`
- If both fail: throws error
- Temperature: `0.85` for normal text, `0.7` for Wikipedia
- Max tokens: 4000

---

#### Pass 2 — Signal-Aware Post-Processing

After the LLM rewrite, a rule-based post-processor scans for patterns that AI detectors flag even in LLM-rewritten text:

- **Template pattern breaking (`breakRepetitiveTemplates`):** Detects repeated sentence starters across paragraphs. If the same template appears 2+ times (e.g., `"This source is particularly relevant because"` appearing in 3 paragraphs), replaces later occurrences with varied alternatives from a pool of 7+ variants per pattern.

- **Hyphen spacing fix (`fixHyphenSpacing`):** Corrects `word -word` artifacts introduced by some LLM responses.

- **AI word kill (Oxygen Phase 1):** `runHumara20()` runs a single Oxygen quality pass to catch any AI vocabulary the LLM reintroduced.

- **Nuru smart passes (`applySmartNuruPolish`):** Up to 15 Nuru 2.0 smart polish passes run after the Oxygen pass, targeting remaining AI signals at sentence level.

- **Citation paragraph re-insertion:** Protected citation paragraphs are placed back into their original positions in the output.

---

#### Sentence-Level LLM Rewrite (Pass 1 variant)

For cases where whole-document rewrite produces uniform output, Ghost Pro can also operate in sentence-by-sentence mode. Each sentence is sent with:
- 2 preceding sentences and 2 following sentences as context
- A sentence-specific system prompt (`getSentenceSystemPrompt`) that forces aggressive rewrite (NOT minor edits)
- Banned vocabulary list enforced per-sentence

This mode is used in the `ghost_mini` variant — not directly by `ghost_pro_wiki`.

---

#### Required Env Vars

| Var | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for LLM) | Falls through to error if absent and LLM engines are called |
| `LLM_MODEL` | Optional | Defaults to `gpt-4o-mini`. Override to use a different model |
| `GROQ_API_KEY` | Optional | Groq client configured but not in default call path |

---

### 5.2 LLM Academic Fallback (used by Humara 2.4)

**File:** `lib/engine/llm-academic-humanizer.ts`  
**Entry point:** `llmAcademicHumanize(text, maxTotalMs)`  
**Primary model:** `gpt-4o-mini`  
**Fallback model:** `gpt-4.1-nano` (per-phase retry on failure)  
**Purpose:** Activated when Humarin T5 HF Space is unavailable (sleeping/down)  
**Cost:** ~$0.0003/1K words (3 batched API calls at gpt-4o-mini pricing)

#### Architecture Overview

Processes all sentences in **3 batched API calls** (not per-sentence). Each call handles all sentences at once, returning a JSON array of the same length. 5 logical phases are compressed into 3 API calls for speed.

Total target time: ~6 seconds for warm model, ~10s cold start.

---

#### Phase 1 — Deep Structural Rewrite (API Call 1)

**System prompt role:** `"expert undergraduate student writing academic essays"`

**Instructions:**
- Completely restructure each sentence's architecture (change clause order, split/merge)
- Use varied academic vocabulary appropriate for university level
- Maintain exact same meaning and factual content
- Write like a thoughtful student, NOT like an AI
- Avoid generic filler phrases

**Input format:** All sentences numbered `[0] sentence one\n[1] sentence two\n...`  
**Output format:** JSON array of strings, same count as input

**Timeout:** `maxTotalMs / 3` ≈ 3.3s  
**On failure:** Retries once with `gpt-4.1-nano`. If also fails: returns original sentences unchanged.

---

#### Phases 2–3 — Phrase Injection + Synonym Replacement (API Call 2)

Two logical phases compressed into one API call:

**Phase 2 — Phrase Injection:**
- Find AI-generated phrases (`"it is important to note"`, `"plays a crucial role"`, `"in the realm of"`)
- Replace with natural student-written equivalents
- Inject 1–2 human filler phrases where natural (`"as far as I can tell"`, `"looking at this more closely"`)

**Phase 3 — Synonym Replacement:**
- Replace AI-typical words with human equivalents: `utilize→use`, `leverage→draw on`, `facilitate→help`, `implement→carry out`, `comprehensive→thorough`, `enhance→improve`, `significant→notable`, `numerous→many`, `subsequent→later`, `prior→earlier`, `aforementioned→mentioned`, `demonstrate→show`, `possess→have`, `commence→begin`, `endeavor→effort`, `paramount→key`
- Max 3–4 word replacements per sentence
- Sentence structure remains **identical** — only individual words swapped

**Timeout:** `maxTotalMs / 3` ≈ 3.3s  
**Skipped if:** Less than 3s of total budget remains after Phase 1.

---

#### Phases 4–5 — Verb Form Transformation + Voice Shuffle (API Call 3)

**Phase 4 — Verb Form Transformation:**
- Convert some static verbs to `-ing` forms (`"This shows" → "This is showing"`)
- Add gerund constructions (`"Analyzing the data..."` instead of `"The analysis..."`)
- Vary tense slightly where it doesn't change meaning

**Phase 5 — Voice Shuffling:**
- Flip ~40% of sentences between active↔passive
- `"was conducted by researchers" → "researchers conducted"`
- Does NOT change every sentence — uniformity defeats the purpose

**CRITICAL:** These phases must NOT rewrite sentences — only transform verb forms and voice.

**Timeout:** `maxTotalMs / 3` ≈ 3.3s  
**Skipped if:** Less than 2s of total budget remains.

---

#### Output Assembly

- All processed sentences joined with spaces
- Change stats calculated: `avg_change_ratio`, `met_threshold`, `threshold_ratio`
- Returns same stats shape as `HumarinResult` so calling code is transparent to which path ran

---

#### Required Env Vars

| Var | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes | If absent, throws `"OPENAI_API_KEY not set"` error |
| `LLM_MODEL` | Optional | Defaults to `gpt-4o-mini` |

---

## 6. Universal Post-Processing Pipeline

**File:** `app/api/humanize/route.ts`  
**Applied to:** ALL engines except `ozone` and `phantom`

After any engine produces its output, the following pipeline runs in order:

### Step 1 — Nuru Post-Processing (`applySmartNuruPolish`)

Up to 15 Nuru 2.0 smart polish passes run on the engine output. Each pass:
- Targets AI signal sentences identified by the built-in detector
- Applies a randomly selected Nuru strategy (from the 10-strategy pool)
- Enforces 40% word change per sentence
- Checks for garbled output and reverts if detected

### Step 2 — Sentence Starters Distribution (`applySentenceStartersDistribution`)

Scans the entire document for repeated sentence-opening words and phrases. If 3+ consecutive sentences or 4+ sentences in a paragraph start with the same word, rotates the openers through a distribution list.

### Step 3 — Document Flow Calibration (`applyNuruDocumentFlowCalibration`)

Compares humanized text against original input at the paragraph level:
- Ensures paragraph ordering is preserved
- Adjusts inter-paragraph connectors for natural document flow
- Uses `sharedSource` (original sentences) to verify no content was dropped

### Step 4 — Unified Sentence Process (conditional)

Applied to most engines (excludes: `humara`, `humara_v1_3`, `humara_v3_3`, `nuru`, `nuru_v2`, `omega`, `oxygen`, `ozone`, `apex`, `king`, `ghost_pro_wiki`, deep kill mode).

Per sentence:
- Content protection (placeholders restored)
- 60%-change enforcement
- AI flow cleaning via post-assembly Nuru pass

---

## 7. Engine Routing — How Requests Are Dispatched

**File:** `app/api/humanize/route.ts`  
**Endpoint:** `POST /api/humanize`

### Request Flow

```
POST /api/humanize
  ├── Input validation (text required, max 50,000 chars)
  ├── AI score detection (getDetector().analyze(text))
  ├── Heading normalization (double-newline separation)
  ├── Effective strength calculation (30% boost if strict_meaning = false)
  │
  ├── Engine dispatch (body.engine):
  │   ├── 'oxygen'         → oxygenHumanize() via runHumara20()
  │   ├── 'ozone'          → ozoneHumanize() via runHumara21()
  │   ├── 'easy'           → easyHumanize() + Oxygen polish via runHumara22()
  │   ├── 'humara_v3_3'    → humarinHumanize() + Oxygen chain via runHumara24()
  │   ├── 'oxygen3'        → oxygen3Humanize()
  │   ├── 'ghost_pro_wiki' → ghostProHumanize() via runWikipedia()
  │   ├── 'nuru_v2'        → nuruHumanize()
  │   └── [others]         → respective handlers
  │
  ├── Universal Nuru post-processing (all except ozone/phantom)
  ├── Unified sentence process (most engines)
  └── Return { humanized, stats }
```

### Effective Strength Calculation

| Input Strength | strict_meaning | Effective Strength |
|---|---|---|
| `light` | false | `medium` |
| `medium` | false | `strong` |
| `strong` | false | `strong` |
| any | true | unchanged |

This gives users a 30% aggressiveness boost when they uncheck "Keep Meaning."

### Mode Mapping for T5 Engines

| Effective Strength | Oxygen3 Mode | Humarin Mode |
|---|---|---|
| `light` | `fast` | `turbo` |
| `medium` | `fast` | `fast` |
| `strong` | `quality` | `quality` |

---

## 8. Shared Infrastructure

### Keepalive Cron

**File:** `app/api/keepalive/route.ts`  
**Schedule:** `*/10 * * * *` (every 10 minutes) via Vercel Cron  
**Config:** `vercel.json` → `crons` array

**What it does:**
- GETs `/health` on both HF Spaces in parallel with 8s timeout:
  - `https://maguna956-humarin-paraphraser.hf.space/health`
  - `https://maguna956-oxygen3-humanizer.hf.space/health`
- Returns JSON with status per Space: `{ humarin: 'ok'|'error'|'timeout', oxygen3: 'ok'|'error'|'timeout' }`
- Prevents HF Spaces from sleeping (they sleep after ~15 min inactivity)

**Cost:** Free — Vercel Cron on free/hobby plan supports this schedule.

---

### Runtime Health Check

**File:** `lib/ops/runtime-health.ts`  
**Endpoint:** `GET /api/health`

**Required env vars (fail if missing):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Optional env vars (degraded if missing, not a failure):**
- `OPENAI_API_KEY` — LLM engines will fail but TS engines still work
- `GROQ_API_KEY` — Groq fallback unavailable
- `NEXT_PUBLIC_SITE_URL`
- `PAYSTACK_SECRET_KEY`
- `HUMARIN_API_KEY`

**Why OPENAI_API_KEY is optional:** Pure TS engines (Oxygen, Nuru, Ozone) work without it. Moving it to optional prevents a false-negative health check when only the LLM engines are affected.

---

### Content Protection System

**File:** `lib/engine/content-protection.ts`  
**Used by:** All engines via route.ts pre-processing

Before any engine runs, the route.ts applies `preserveInputStructure()` which:
- Extracts and replaces with placeholder tokens: URLs, email addresses, code blocks, citation markers `[1]`, quoted strings, math expressions
- Tokens format: `[[PROT_0]]`, `[[PROT_1]]`, etc.
- After engine output: tokens are restored to original values
- This prevents engines (especially LLMs) from paraphrasing or mangling protected content

---

### Shared Dictionaries

**File:** `lib/engine/shared-dictionaries.ts`  
**Exported functions/constants used by Nuru 2.0 and Oxygen:**

| Export | Type | Description |
|---|---|---|
| `applyAIWordKill` | function | 90+ AI word→human replacements |
| `applyPhrasePatterns` | function | Multi-word AI phrase kill |
| `applySyntacticTemplate` | function | Clause-level structural rewrite templates |
| `applyConnectorNaturalization` | function | `"Therefore"→"So"`, `"Hence"→"That is why"` |
| `expandAllContractions` | function | `"can't"→"cannot"`, all English contractions |
| `diversifyStarters` | function | Document-level sentence opener rotation |
| `fixCapitalization` | function | Restore sentence-start capitalization |
| `VERB_PHRASE_SWAPS` | dict | ~30 verb phrase replacements |
| `MODIFIER_SWAPS` | dict | ~25 adverb/adjective replacements |
| `CLAUSE_REPHRASINGS` | dict | ~20 clause-level rephrasings |
| `HEDGING_PHRASES` | dict | Certainty/hedging phrase swaps |
| `TRANSITION_SWAPS` | dict | Transition word replacements |
| `QUANTIFIER_SWAPS` | dict | `"numerous"→"many"`, `"a variety of"→"several"` |
| `TEMPORAL_SWAPS` | dict | Time expression variants |
| `CAUSAL_SWAPS` | dict | `"due to"→"because of"`, cause phrase variants |
| `EMPHASIS_SWAPS` | dict | `"clearly"→"plainly"`, emphasis word variants |
| `DIVERSITY_SWAPS` | dict | General vocabulary diversification pool |
| `perSentenceAntiDetection` | function | Per-sentence final AI signal cleanup |
| `deepCleaningPass` | function | Artifact removal, spacing, punctuation |
| `cleanSentenceStarters` | function | Remove `"Furthermore, "`, `"Moreover, "` etc. |
| `fixPunctuation` | function | Oxford comma, double-period, space normalization |

---

## 9. Environment Variables Reference

| Variable | Engine(s) | Required | Default | Notes |
|---|---|---|---|---|
| `OPENAI_API_KEY` | ghost_pro_wiki, humara_v3_3 fallback | Optional | — | Required for LLM engines to work. TS engines work without it. |
| `LLM_MODEL` | ghost_pro_wiki, humara_v3_3 fallback | Optional | `gpt-4o-mini` | Override to use any OpenAI model |
| `GROQ_API_KEY` | ghost_pro.ts (not in default path) | Optional | — | Groq client configured but not called by default |
| `HUMARIN_API_KEY` | humara_v3_3 | Optional | — | If absent, skips T5 and goes straight to LLM Academic fallback |
| `HUMARIN_API_URL` | humara_v3_3 | Optional | HF Space URL | Override to point at a different T5 server |
| `HUMARIN_API_URL_BACKUP` | humara_v3_3 | Optional | — | Cloud Run backup. If absent, single-endpoint mode |
| `HUMARIN_API_KEY_BACKUP` | humara_v3_3 | Optional | — | Falls back to `HUMARIN_API_KEY` if absent |
| `OXYGEN3_API_URL` | oxygen3 | Optional | HF Space URL | Override to self-host |
| `EASY_API_KEY` | easy | Optional | — | If absent, falls back to Oxygen (Humara 2.0) |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth/DB | **Required** | — | Health check fails without this |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth/DB | **Required** | — | Health check fails without this |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth/DB | **Required** | — | Health check fails without this |
| `NEXT_PUBLIC_SITE_URL` | Frontend | Optional | — | Used for absolute URL generation |
| `PAYSTACK_SECRET_KEY` | Payments | Optional | — | Payment processing |

---

## 10. Cost Summary

| Engine | Cost per 1K words | Notes |
|---|---|---|
| Humara 2.0 (oxygen) | **$0** | Pure TypeScript, no API |
| Nuru 2.0 (nuru_v2) | **$0** | Pure TypeScript, no API |
| Humara 2.1 (ozone) | **$0** | Free external API, no auth |
| Humara 2.2 (easy) | **$0** | Free external API (needs `EASY_API_KEY`) |
| Humara 3.0 (oxygen3) | **$0** | HF Space free tier |
| Humara 2.4 primary (T5) | **$0** | HF Space free tier |
| Humara 2.4 fallback (LLM Academic) | ~**$0.0003** | gpt-4o-mini, 3 batched calls |
| Wikipedia (ghost_pro_wiki) | ~**$0.0013** | gpt-4o-mini, full-document rewrite |
| gpt-4.1-nano fallback | < $0.0003 | Cheaper than gpt-4o-mini, nano pricing |

**Monthly cost estimate at 100K words/day:**
- If all traffic uses T5 (warm): **$0/month**
- If 20% T5 cold starts → LLM Academic fallback: ~$1.80/month
- If 5% uses Wikipedia engine: ~$2.00/month
- Worst case (all LLM): ~$12/month

---

## 11. Speed Reference

Measured wall-clock times from server initiation to response (not including network RTT to client):

| Engine | Text Size | Condition | Time |
|---|---|---|---|
| Humara 2.0 (oxygen) | 1K words | Any | 80–200ms |
| Nuru 2.0 | 1K words | Any | 200–400ms |
| Humara 2.1 (ozone) | 1K words | API up | 5–12s (concurrent) |
| Humara 2.2 (easy) | 1K words | API up | 8–15s |
| Humara 2.4 (T5 warm) | 400 words | HF Space warm | 5–10s |
| Humara 2.4 (T5 warm) | 1K words | HF Space warm | 15–30s |
| Humara 2.4 (T5 cold) | any | HF Space sleeping | 5s timeout → LLM fallback |
| LLM Academic fallback | 400 words | gpt-4o-mini warm | 6–9s |
| LLM Academic fallback | 1K words | gpt-4o-mini warm | 12–18s |
| Humara 3.0 (Oxygen3) | 400 words | HF Space warm | 8–15s |
| Wikipedia | 1K words | gpt-4o-mini | 15–25s |
| Wikipedia | 400 words | gpt-4o-mini | 8–14s |

**Keepalive cron effect:** When both HF Spaces are kept warm by the `/api/keepalive` cron running every 10 minutes, T5 cold starts are eliminated and warm times apply.

---

*This document should be updated whenever:*
- *A model is changed or added*
- *A fallback chain is modified*
- *A new phase is added or removed from any engine*
- *Env var names change*
- *Pricing changes*
- *A new engine (`engine` key) is added to route.ts*
