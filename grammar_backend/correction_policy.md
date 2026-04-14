# Correction Policy — Grammar Backend v1

> This document is the **behavior contract** for the Grammar Correction API.
> Every pipeline stage, rule, and ML model **MUST** comply with these rules.
> If a proposed edit violates this policy, it must be rejected or downgraded to `review`.

---

## 1. Scope of Correction

The system **MAY** fix:

| Category           | Examples                                                  |
|--------------------|-----------------------------------------------------------|
| Punctuation        | Missing periods, commas, semicolons; double periods       |
| Capitalization     | Sentence-initial lowercase; ALL-CAPS normalization        |
| Spacing            | Double spaces; space before punctuation; detached apos.   |
| Subject-verb agr.  | "The data *shows*" → "The data *show*"                    |
| Article usage      | "She is *a* engineer" → "She is *an* engineer"            |
| Tense consistency  | Obvious tense errors within a single clause               |
| Preposition errors | "Interested *on*" → "Interested *in*"                     |
| Abbreviation form  | "eg" → "e.g."; "ie" → "i.e."                              |

The system **MUST NOT**:

- Expand, compress, or restructure ideas.
- Replace words with "better" synonyms or simplify vocabulary.
- Change the register, tone, or voice (active↔passive).
- Alter quotations, citations, or any protected span content.
- Remove or reorder sentences or paragraphs.
- Add explanatory text, transition phrases, or hedging.
- Change numbers, dates, names, or technical identifiers.

---

## 2. Protected Text Classes

These text spans are **immutable** — no edits may be applied inside them:

| Class              | Mutability | Description                                        |
|--------------------|------------|----------------------------------------------------|
| `citation`         | immutable  | Parenthetical citations: `(Smith, 2020)`           |
| `case_name`        | immutable  | Legal case names: `Brown v. Board of Education`    |
| `quotation`        | immutable  | Quoted strings in `"..."`, `"..."`, or `'...'`     |
| `url`              | immutable  | HTTP/HTTPS links                                   |
| `email`            | immutable  | Email addresses                                    |
| `code_span`        | immutable  | Inline code: `` `variable_name` ``                 |
| `reference`        | immutable  | Reference list entries                             |

These text spans allow **limited formatting fixes only** (spacing, punctuation
around — but not inside — the span):

| Class              | Mutability       | Description                                  |
|--------------------|------------------|----------------------------------------------|
| `year`             | format-only      | Standalone years: `2024`                     |
| `abbreviation`     | format-only      | `U.S.`, `Ph.D.`, `e.g.`                     |
| `heading`          | format-only      | Section headings / numbered list openers     |
| `number`           | format-only      | Currency, measurements: `$1,200`, `3.5 kg`  |
| `statute`          | immutable        | Statutory references: `42 U.S.C. § 1983`    |
| `parenthetical`    | format-only      | Parenthetical legal refs: `(holding that…)`  |

---

## 3. Edit-Size Constraints

| Metric                        | Threshold | Action on Breach                        |
|-------------------------------|-----------|----------------------------------------|
| Token change ratio / sentence | ≤ 15%     | Reject ML edits; keep rule/normalizer  |
| Content-word replacements     | ≤ 2       | Reject ML edits unless all ≥ 0.90 conf |
| Sentence length shift         | 0.7–1.3×  | Reject ML edits                        |
| Single edit span length       | ≤ 40 chars| Flag for review                        |

---

## 4. Confidence Thresholds

| Level     | Range        | Behavior                                           |
|-----------|--------------|----------------------------------------------------|
| HIGH      | ≥ 0.85       | Auto-apply (subject to diff-guard)                 |
| MEDIUM    | 0.60 – 0.84  | Apply but mark sentence verdict as `review`        |
| LOW       | 0.40 – 0.59  | Apply only if corroborated by another stage        |
| REJECTED  | < 0.40       | Never apply                                        |

---

## 5. Pipeline Stage Precedence

When two stages propose conflicting edits for the same span:

1. **Normalizer** (deterministic, confidence 0.99) — always wins.
2. **Rule engine** (high-confidence, pattern-based) — wins over ML.
3. **ML corrector** — defers to rule/normalizer on overlap.

---

## 6. Idempotency Guarantee

Running the pipeline twice on the same input **MUST** produce identical output.
If a correction is applied, re-running on the corrected text must produce zero edits.
Violation of this rule indicates a bug in the normalizer or rule engine.

---

## 7. Fallback Behavior

- If the ML model is unavailable: proceed with rule-only corrections. Log a warning.
  Do **not** return an error or empty result.
- If zero rules match: return the original text unchanged with `total_edits: 0`.
- If the diff-guard rejects all edits: return the original text with
  `warnings` explaining why.

---

## 8. Domain-Specific Overrides

| Domain     | Special Rules                                                     |
|------------|-------------------------------------------------------------------|
| `legal`    | Never alter statutory citations, case names, or section references. Preserve Latin phrases (supra, infra, id.). |
| `academic` | Protect in-text citations. Allow discipline abbreviations. Preserve reference list formatting. |
| `general`  | Default behavior applies. No extra restrictions.                  |

---

## 9. Audit Trail

Every response **MUST** include:

- `request_id` (UUID v4) — unique per request.
- `engine_version` — semantic version of the correction engine.
- `timings` — wall-clock milliseconds per pipeline stage.
- Per-edit: `source` (normalizer / rule / ml), `confidence`, `applied`, `reason` (if rejected).

This enables post-hoc debugging and quality regression analysis.

---

## 10. Versioning

This correction policy is versioned alongside the engine. Any change to thresholds,
protected-span classes, or allowed edit categories constitutes a policy version bump.

**Current policy version**: `1.0.0`
