# Minimum Requirements to Make This Work

To actually feel human and maintain strict equivalence, the following minimum requirements and rules must be enforced across ALL humanizers (both LLM and non-LLM).

## Global Constraints (Strict Parity)
1. **No Splitting or Merging Sentences:** The number of sentences in the output must exactly match the number of sentences in the input. All sentences must be retained.
2. **No Contractions:** The output must not introduce any contractions (e.g., use "cannot" instead of "can't", "will not" instead of "won't").
3. **No First Person:** Do not introduce first-person pronouns (I, me, my, we, us, our) unless they were already present in the input text.
4. **Shared Dictionaries:** The non-LLM humanizer must share and utilize the same large dictionaries as the rest of the system for consistent phrasing and vocabulary.

## Technical Minimum Requirements

### 1. Phrase Dictionary (VERY IMPORTANT)
- **Scale:** At least 500k–2M phrase variations.
- **Complexity:** Must contain full patterns, not just simple word-for-word synonyms.

### 2. Transformation Rules
- **Scale:** 1k–10k syntactic templates for structural variation without breaking parity.

### 3. Corpus
- **Scale:** 10M–50M+ words minimum for accurate and realistic pattern extraction.

---
*Note: The validation layer (`validation.ts` / `semantic_guard.py`) must strictly enforce the Global Constraints on every output.*
