/**
 * Purity Rules
 * ──────────────────────────────────────────────────────────────────
 * Strict output-shape rules the user mandated for every engine:
 *
 *   1. NO contractions in output (unless the input had them).
 *   2. NO first-person pronouns in output (unless the input had them).
 *   3. NO "funny phrases" — informal fillers, slang, rhetorical
 *      questions, casual hedges, or colloquialisms.
 *
 * These are enforced as a final gate right before the humanized text
 * is returned, and also used to *reject* candidate sentence rewrites
 * that introduce any of the banned patterns.
 * ──────────────────────────────────────────────────────────────────
 */

/* ── Input-shape detection ──────────────────────────────────── */

const FIRST_PERSON_RE = /\b(I|we|my|our|me|us|mine|ours|myself|ourselves)\b/;
const CONTRACTION_RE = /\b\w+[\u2019']\w+\b/;

export interface InputShape {
  hasFirstPerson: boolean;
  hasContractions: boolean;
}

export function detectInputShape(text: string): InputShape {
  return {
    hasFirstPerson: FIRST_PERSON_RE.test(text),
    hasContractions: CONTRACTION_RE.test(text),
  };
}

/* ── Contraction expansion (always applied when input had none) ── */

const CONTRACTION_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bdon['\u2019]t\b/gi, "do not"],
  [/\bdoesn['\u2019]t\b/gi, "does not"],
  [/\bdidn['\u2019]t\b/gi, "did not"],
  [/\bcan['\u2019]t\b/gi, "cannot"],
  [/\bcouldn['\u2019]t\b/gi, "could not"],
  [/\bwouldn['\u2019]t\b/gi, "would not"],
  [/\bshouldn['\u2019]t\b/gi, "should not"],
  [/\bwon['\u2019]t\b/gi, "will not"],
  [/\bisn['\u2019]t\b/gi, "is not"],
  [/\baren['\u2019]t\b/gi, "are not"],
  [/\bwasn['\u2019]t\b/gi, "was not"],
  [/\bweren['\u2019]t\b/gi, "were not"],
  [/\bhasn['\u2019]t\b/gi, "has not"],
  [/\bhaven['\u2019]t\b/gi, "have not"],
  [/\bhadn['\u2019]t\b/gi, "had not"],
  [/\bit['\u2019]s\b/gi, "it is"],
  [/\bthat['\u2019]s\b/gi, "that is"],
  [/\bthere['\u2019]s\b/gi, "there is"],
  [/\bwhat['\u2019]s\b/gi, "what is"],
  [/\bwho['\u2019]s\b/gi, "who is"],
  [/\blet['\u2019]s\b/gi, "let us"],
  [/\bI['\u2019]m\b/g, "I am"],
  [/\bI['\u2019]ve\b/g, "I have"],
  [/\bI['\u2019]d\b/g, "I would"],
  [/\bI['\u2019]ll\b/g, "I will"],
  [/\bwe['\u2019]re\b/gi, "we are"],
  [/\bwe['\u2019]ve\b/gi, "we have"],
  [/\bwe['\u2019]d\b/gi, "we would"],
  [/\bwe['\u2019]ll\b/gi, "we will"],
  [/\bthey['\u2019]re\b/gi, "they are"],
  [/\bthey['\u2019]ve\b/gi, "they have"],
  [/\bthey['\u2019]d\b/gi, "they would"],
  [/\bthey['\u2019]ll\b/gi, "they will"],
  [/\byou['\u2019]re\b/gi, "you are"],
  [/\byou['\u2019]ve\b/gi, "you have"],
  [/\byou['\u2019]d\b/gi, "you would"],
  [/\byou['\u2019]ll\b/gi, "you will"],
  [/\bshe['\u2019]s\b/gi, "she is"],
  [/\bhe['\u2019]s\b/gi, "he is"],
  [/\bshe['\u2019]d\b/gi, "she would"],
  [/\bhe['\u2019]d\b/gi, "he would"],
];

export function expandContractions(text: string): string {
  let out = text;
  for (const [re, rep] of CONTRACTION_EXPANSIONS) {
    out = out.replace(re, (match) => {
      // Preserve capitalization of the first character.
      if (match[0] === match[0].toUpperCase()) {
        return rep.charAt(0).toUpperCase() + rep.slice(1);
      }
      return rep;
    });
  }
  return out;
}

/* ── First-person removal (when input had none) ─────────────── */

/** Careful, context-aware first-person removal. */
export function removeFirstPerson(text: string): string {
  let out = text;

  // Stock phrases we rewrite to impersonal forms.
  out = out.replace(/\bI\s+believe\b/g, "The evidence suggests");
  out = out.replace(/\bI\s+think\b/g, "The analysis indicates");
  out = out.replace(/\bI\s+argue\b/g, "The argument is");
  out = out.replace(/\bI\s+contend\b/g, "One contention is");
  out = out.replace(/\bI\s+observe\b/g, "Observations show");
  out = out.replace(/\bWe\s+believe\b/gi, "The evidence suggests");
  out = out.replace(/\bWe\s+argue\b/gi, "The argument is");
  out = out.replace(/\bWe\s+observe\b/gi, "Observations show");
  out = out.replace(/\bWe\s+contend\b/gi, "One contention is");

  // Generic pronoun replacement.
  out = out.replace(/\bmyself\b/g, "oneself");
  out = out.replace(/\bourselves\b/gi, "themselves");
  out = out.replace(/\bmine\b/g, "their own");
  out = out.replace(/\bours\b/gi, "theirs");

  // Possessives.
  out = out.replace(/\bMy\b/g, "The");
  out = out.replace(/\bmy\b/g, "the");
  out = out.replace(/\bOur\b/g, "The");
  out = out.replace(/\bour\b/g, "the");

  // Subject "I"/"We" not already handled by the stock phrases — map
  // to an impersonal frame. We do NOT touch inner object "me/us" so
  // we keep surrounding grammar stable.
  out = out.replace(/\bI\s+(am|was|have|had|will|would|can|could|shall|should|may|might|do|did)\b/g,
    (_m, aux) => `This ${aux}`);
  out = out.replace(/\bWe\s+(are|were|have|had|will|would|can|could|shall|should|may|might|do|did)\b/gi,
    (_m, aux) => {
      const low = String(aux).toLowerCase();
      const mapped = low === "are" ? "is" : low === "were" ? "was" : low;
      return `This ${mapped}`;
    });

  // Lingering "I" / "we" with a verb immediately after — fall back
  // to "the analysis" / "the research".
  out = out.replace(/\bI\s+(?=\w)/g, "The analysis ");
  out = out.replace(/\bwe\s+(?=\w)/gi, "the research ");

  // Object pronouns (me/us) in prepositional phrases — replace with
  // impersonal forms. Do this AFTER subject/aux because we rely on
  // word boundaries.
  out = out.replace(/\bme\b/g, "them");
  out = out.replace(/\bus\b/g, "them");

  return out;
}

/* ── Funny-phrase / colloquialism / rhetorical-question scrub ── */

const FUNNY_PHRASES: Array<[RegExp, string]> = [
  // Casual filler fluffs
  [/\bat the end of the day,?\s*/gi, ""],
  [/\ball things considered,?\s*/gi, "Overall, "],
  [/\bneedless to say,?\s*/gi, "Clearly, "],
  [/\bthat being said,?\s*/gi, ""],
  [/\bhaving said that,?\s*/gi, ""],
  [/\bwith that (?:in mind|being said),?\s*/gi, ""],
  [/\bwhen all is said and done,?\s*/gi, "Ultimately, "],
  [/\bfor what it['\u2019]s worth,?\s*/gi, ""],
  [/\bto be (?:perfectly |totally |completely )?honest,?\s*/gi, ""],
  [/\bto tell (?:you )?the truth,?\s*/gi, ""],
  [/\blet['\u2019]s face it,?\s*/gi, ""],
  [/\bif you think about it,?\s*/gi, ""],
  [/\bin a nutshell,?\s*/gi, "In short, "],
  [/\bat the heart of the matter\b/gi, "centrally"],
  [/\bpar for the course\b/gi, "typical"],
  [/\bthe bottom line is\b/gi, "In summary,"],
  [/\bwhen push comes to shove\b/gi, "ultimately"],

  // Slangy intensifiers
  [/\btotally\b/gi, "entirely"],
  [/\babsolutely\b/gi, "clearly"],
  [/\bdefinitely\b/gi, "certainly"],
  [/\bbasically\b/gi, "essentially"],
  [/\bliterally\b/gi, ""],
  [/\bhonestly\b/gi, ""],
  [/\bkind of\b/gi, "somewhat"],
  [/\bsort of\b/gi, "somewhat"],
  [/\ba bit\b/gi, "somewhat"],
  [/\ba little\b/gi, "slightly"],

  // Casual discourse markers (sentence-initial only — never clobber mid-sentence usage)
  [/(?:^|(?<=[.!?]\s))Anyway,?\s*/g, ""],
  [/(?:^|(?<=[.!?]\s))You know,?\s*/g, ""],
  [/(?:^|(?<=[.!?]\s))Y['\u2019]know,?\s*/g, ""],
  [/(?:^|(?<=[.!?]\s))I mean,?\s*/g, ""],
  [/(?:^|(?<=[.!?]\s))Well,\s+/g, ""],
  [/(?:^|(?<=[.!?]\s))Oh,\s+/g, ""],
  [/(?:^|(?<=[.!?]\s))Ah,\s+/g, ""],
];

/** Remove rhetorical questions that an academic/formal tone would not use. */
export function removeRhetoricalQuestions(text: string): string {
  // Rhetorical question heuristic: sentence starts with an interrogative
  const patterns: Array<[RegExp, (m: string) => string]> = [
    [/(?:^|(?<=[.!?]\s))(What if|Why|How|Where|When|Who|Which)\s[^?]{5,120}\?/g,
      (m) => {
        // Strip the leading interrogative word and the trailing "?",
        // turn into an indirect statement.
        const cleaned = m
          .replace(/^(What if|Why|How|Where|When|Who|Which)\s+/i, "The question of ")
          .replace(/\?$/, ".");
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }],
  ];
  let out = text;
  for (const [re, fn] of patterns) {
    out = out.replace(re, fn);
  }
  return out;
}

export function removeFunnyPhrases(text: string): string {
  let out = text;
  for (const [re, rep] of FUNNY_PHRASES) {
    if (typeof rep === "string") {
      out = out.replace(re, rep);
    }
  }
  // Re-capitalize after any deletion that left a lowercase sentence start.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  // Clean double spaces/commas left by deletions.
  out = out.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").replace(/\s+([.,;:!?])/g, "$1");
  return out;
}

/* ── Unified purity pass ───────────────────────────────────── */

/**
 * Apply the full purity suite respecting input shape: expand
 * contractions only when input had none, remove first-person only
 * when input had none. Funny phrases are always removed.
 */
export function applyPurityRules(text: string, inputShape: InputShape): string {
  let out = text;
  if (!inputShape.hasContractions) {
    out = expandContractions(out);
  }
  if (!inputShape.hasFirstPerson) {
    out = removeFirstPerson(out);
  }
  out = removeFunnyPhrases(out);
  out = removeRhetoricalQuestions(out);
  return out;
}

/**
 * Strong-rejection patterns — candidates containing any of these
 * are considered "funny" and discarded during best-of-N selection.
 * This is a tighter subset than FUNNY_PHRASES above (which also
 * includes transforms we apply in post).
 */
const HARD_REJECT_FUNNY: RegExp[] = [
  /\bat the end of the day\b/i,
  /\bwhen all is said and done\b/i,
  /\bfor what it['\u2019]s worth\b/i,
  /\blet['\u2019]s face it\b/i,
  /\bto be (?:perfectly |totally |completely )?honest\b/i,
  /\bto tell (?:you )?the truth\b/i,
  /\bpar for the course\b/i,
  /\bwhen push comes to shove\b/i,
  /\bin a nutshell\b/i,
  /\bthe bottom line is\b/i,
  /\bgonna\b/i,
  /\bwanna\b/i,
  /\bkinda\b/i,
  /\bsorta\b/i,
  /\bya['\u2019]ll\b/i,
];

/**
 * Reject a candidate sentence if it introduces banned patterns that
 * were not in the original. Used by iterative best-of-N selectors.
 */
export function violatesPurity(
  candidate: string,
  inputShape: InputShape,
): boolean {
  if (!inputShape.hasContractions && CONTRACTION_RE.test(candidate)) return true;
  if (!inputShape.hasFirstPerson && FIRST_PERSON_RE.test(candidate)) return true;
  for (const re of HARD_REJECT_FUNNY) {
    if (re.test(candidate)) return true;
  }
  return false;
}
