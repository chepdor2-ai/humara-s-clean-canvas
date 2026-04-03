/**
 * Linguistic Intelligence Core (LIC)
 * ====================================
 *
 * Replaces LLM "understanding" using layered linguistic analysis.
 * Produces a structured sentence map for each sentence:
 *   SUBJ / VERB / OBJ / MOD / CONTEXT
 *
 * Components:
 *   1. POS tagging (via compromise.js)
 *   2. Dependency-like parsing (SVO extraction)
 *   3. Clause segmentation
 *   4. Named entity detection
 *   5. Tense + voice detection
 *
 * Output: StructuredSentenceMap per sentence
 */

import nlp from "compromise";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SentenceComponent {
  text: string;
  role: "SUBJ" | "VERB" | "OBJ" | "MOD" | "CONTEXT" | "CONJ" | "DET" | "AUX" | "PREP" | "COMPLEMENT";
  pos: string;       // part-of-speech tag
  index: number;     // position in sentence (word index)
  headIndex?: number; // index of head word (for dependency-like relations)
}

export interface ClauseInfo {
  text: string;
  type: "main" | "subordinate" | "relative" | "adverbial" | "participial" | "appositive";
  conjunction?: string; // leading conjunction/subordinator
  position: number;     // clause index within the sentence
}

export interface NamedEntity {
  text: string;
  type: "PERSON" | "ORG" | "PLACE" | "DATE" | "NUMBER" | "OTHER";
  startIndex: number;
  endIndex: number;
}

export interface TenseVoiceInfo {
  tense: "past" | "present" | "future" | "mixed";
  voice: "active" | "passive" | "mixed";
  aspect: "simple" | "progressive" | "perfect" | "perfect_progressive";
  modality: "none" | "can" | "could" | "may" | "might" | "must" | "should" | "would" | "will";
}

export interface StructuredSentenceMap {
  id: number;
  original: string;
  subject: SentenceComponent | null;
  verb: SentenceComponent | null;
  object: SentenceComponent | null;
  modifiers: SentenceComponent[];
  context: SentenceComponent[];
  clauses: ClauseInfo[];
  entities: NamedEntity[];
  tenseVoice: TenseVoiceInfo;
  complexity: SentenceComplexity;
}

export interface SentenceComplexity {
  wordCount: number;
  clauseCount: number;
  maxDepth: number;        // nesting depth
  hasSubordination: boolean;
  hasCoordination: boolean;
  hasRelativeClause: boolean;
  hasParticipial: boolean;
  hasAppositive: boolean;
  hasPrepositionalChain: boolean; // 3+ prep phrases
  complexityScore: number; // 0-100 composite score
}

export interface TextAnalysis {
  sentences: StructuredSentenceMap[];
  globalStats: {
    avgComplexity: number;
    avgWordCount: number;
    entityCount: number;
    dominantTense: "past" | "present" | "future" | "mixed";
    dominantVoice: "active" | "passive" | "mixed";
    clauseDensity: number; // avg clauses per sentence
  };
}

// ══════════════════════════════════════════════════════════════════════════
// CLAUSE DETECTION PATTERNS
// ══════════════════════════════════════════════════════════════════════════

const SUBORDINATORS = new Set([
  "because", "since", "although", "though", "even though", "while",
  "whereas", "if", "unless", "until", "when", "whenever", "wherever",
  "where", "after", "before", "once", "provided", "so that", "in order that",
  "as long as", "as soon as", "as though", "as if", "even if", "now that",
  "rather than", "whether", "lest", "inasmuch as", "insofar as",
]);

const RELATIVE_PRONOUNS = new Set([
  "who", "whom", "whose", "which", "that", "where", "when", "whereby",
]);

const MODAL_VERBS = new Set([
  "can", "could", "may", "might", "must", "shall", "should", "will", "would",
]);

const AUX_VERBS = new Set([
  "is", "are", "was", "were", "be", "been", "being",
  "has", "have", "had", "having",
  "do", "does", "did",
  ...MODAL_VERBS,
]);

const PASSIVE_MARKERS_RE = /\b(?:is|are|was|were|be|been|being|get|gets|got|gotten|getting)\s+(\w+ed|written|known|shown|found|made|done|seen|given|taken|held|kept|told|said|left|brought|thought|built|sent|spent|won|paid|lost|met|set|cut|put|run|read|heard|led|grown|drawn|broken|spoken|chosen|driven|eaten|fallen|flown|forgotten|hidden|ridden|risen|shaken|stolen|thrown|woken|worn|begun|drunk|forgiven|frozen|torn|borne|bitten|blown|proven|sung|sewn|spun|sprung|sworn|stuck|struck|hung|lit|taught|caught|sought|fought|fed|bound|dug)\b/i;

const PARTICIPIAL_RE = /^(Having|Being|\w+ing)\b/;
const APPOSITIVE_RE = /,\s*(?:a|an|the)\s+\w+(?:\s+\w+){0,5},/;

// ══════════════════════════════════════════════════════════════════════════
// 1. POS TAGGING (enhanced via compromise.js)
// ══════════════════════════════════════════════════════════════════════════

interface TaggedToken {
  word: string;
  tag: string;     // noun, verb, adj, adv, prep, conj, det, pron, aux, modal, num, punct
  index: number;
  isEntity: boolean;
}

function posTagSentence(sentence: string): TaggedToken[] {
  const doc = nlp(sentence);
  const terms = doc.terms().json();
  const tokens: TaggedToken[] = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const text = term.text || "";
    const tags: string[] = term.tags || [];

    let tag = "other";
    if (tags.includes("Noun") || tags.includes("ProperNoun") || tags.includes("Pronoun")) {
      tag = tags.includes("Pronoun") ? "pron" : "noun";
    } else if (tags.includes("Verb")) {
      const lower = text.toLowerCase();
      if (MODAL_VERBS.has(lower)) tag = "modal";
      else if (AUX_VERBS.has(lower)) tag = "aux";
      else tag = "verb";
    } else if (tags.includes("Adjective")) tag = "adj";
    else if (tags.includes("Adverb")) tag = "adv";
    else if (tags.includes("Preposition")) tag = "prep";
    else if (tags.includes("Conjunction")) tag = "conj";
    else if (tags.includes("Determiner")) tag = "det";
    else if (tags.includes("Cardinal") || tags.includes("Ordinal")) tag = "num";

    const isEntity = tags.includes("ProperNoun") || tags.includes("Person") ||
      tags.includes("Place") || tags.includes("Organization");

    tokens.push({ word: text, tag, index: i, isEntity });
  }

  return tokens;
}

// ══════════════════════════════════════════════════════════════════════════
// 2. SVO EXTRACTION (Subject-Verb-Object)
// ══════════════════════════════════════════════════════════════════════════

function extractSubject(tokens: TaggedToken[]): SentenceComponent | null {
  // Find first noun/pronoun before first main verb
  let firstVerbIdx = tokens.findIndex(t => t.tag === "verb");
  if (firstVerbIdx < 0) firstVerbIdx = tokens.findIndex(t => t.tag === "aux");
  if (firstVerbIdx < 0) firstVerbIdx = tokens.length;

  // Collect all noun-like tokens before the verb as subject
  const subjectTokens: TaggedToken[] = [];
  for (let i = 0; i < firstVerbIdx; i++) {
    const t = tokens[i];
    if (t.tag === "noun" || t.tag === "pron" || t.tag === "adj" || t.tag === "det" || t.tag === "num") {
      subjectTokens.push(t);
    }
  }

  if (subjectTokens.length === 0) return null;

  // The head noun is the last noun/pronoun in the subject phrase
  const headIdx = [...subjectTokens].reverse().findIndex(t => t.tag === "noun" || t.tag === "pron");
  const head = headIdx >= 0 ? subjectTokens[subjectTokens.length - 1 - headIdx] : subjectTokens[subjectTokens.length - 1];

  return {
    text: subjectTokens.map(t => t.word).join(" "),
    role: "SUBJ",
    pos: head.tag,
    index: subjectTokens[0].index,
    headIndex: head.index,
  };
}

function extractVerb(tokens: TaggedToken[]): SentenceComponent | null {
  // Find main verb (first non-aux verb, or first aux if no main verb)
  const mainVerb = tokens.find(t => t.tag === "verb");
  if (mainVerb) {
    // Include preceding auxiliaries and modals
    const verbParts: TaggedToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].index === mainVerb.index) {
        // Look back for aux/modal
        let j = i - 1;
        while (j >= 0 && (tokens[j].tag === "aux" || tokens[j].tag === "modal" || tokens[j].tag === "adv")) {
          if (tokens[j].tag === "adv" && j < i - 2) break; // don't go too far back for adverbs
          verbParts.unshift(tokens[j]);
          j--;
        }
        verbParts.push(mainVerb);
        break;
      }
    }

    return {
      text: verbParts.map(t => t.word).join(" "),
      role: "VERB",
      pos: "verb",
      index: verbParts[0].index,
      headIndex: mainVerb.index,
    };
  }

  // Fallback: first aux verb
  const auxVerb = tokens.find(t => t.tag === "aux");
  if (auxVerb) {
    return {
      text: auxVerb.word,
      role: "VERB",
      pos: "aux",
      index: auxVerb.index,
    };
  }

  return null;
}

function extractObject(tokens: TaggedToken[], verbIdx: number): SentenceComponent | null {
  // Find first noun phrase after the verb
  const afterVerb = tokens.filter(t => t.index > verbIdx);
  const objectTokens: TaggedToken[] = [];
  let foundNoun = false;

  for (const t of afterVerb) {
    if (t.tag === "prep" && foundNoun) break; // stop at prep phrase after object
    if (t.tag === "conj") break; // stop at conjunction
    if (t.tag === "noun" || t.tag === "pron" || t.tag === "adj" || t.tag === "det" || t.tag === "num") {
      objectTokens.push(t);
      if (t.tag === "noun" || t.tag === "pron") foundNoun = true;
    } else if (foundNoun && t.tag !== "adv") {
      break;
    }
  }

  if (objectTokens.length === 0) return null;

  const head = [...objectTokens].reverse().find(t => t.tag === "noun" || t.tag === "pron") || objectTokens[objectTokens.length - 1];

  return {
    text: objectTokens.map(t => t.word).join(" "),
    role: "OBJ",
    pos: head.tag,
    index: objectTokens[0].index,
    headIndex: head.index,
  };
}

function extractModifiers(tokens: TaggedToken[], subj: SentenceComponent | null, verb: SentenceComponent | null, obj: SentenceComponent | null): SentenceComponent[] {
  const usedIndices = new Set<number>();
  if (subj) for (let i = subj.index; i < subj.index + subj.text.split(/\s+/).length; i++) usedIndices.add(i);
  if (verb) for (let i = verb.index; i < verb.index + verb.text.split(/\s+/).length; i++) usedIndices.add(i);
  if (obj) for (let i = obj.index; i < obj.index + obj.text.split(/\s+/).length; i++) usedIndices.add(i);

  const mods: SentenceComponent[] = [];
  for (const t of tokens) {
    if (usedIndices.has(t.index)) continue;
    if (t.tag === "adv" || t.tag === "adj") {
      mods.push({
        text: t.word,
        role: "MOD",
        pos: t.tag,
        index: t.index,
      });
    }
  }

  return mods;
}

function extractContext(tokens: TaggedToken[], subj: SentenceComponent | null, verb: SentenceComponent | null, obj: SentenceComponent | null, mods: SentenceComponent[]): SentenceComponent[] {
  const usedIndices = new Set<number>();
  if (subj) for (let i = subj.index; i < subj.index + subj.text.split(/\s+/).length; i++) usedIndices.add(i);
  if (verb) for (let i = verb.index; i < verb.index + verb.text.split(/\s+/).length; i++) usedIndices.add(i);
  if (obj) for (let i = obj.index; i < obj.index + obj.text.split(/\s+/).length; i++) usedIndices.add(i);
  for (const m of mods) usedIndices.add(m.index);

  const contexts: SentenceComponent[] = [];
  let currentPrepPhrase: TaggedToken[] = [];
  let inPrepPhrase = false;

  for (const t of tokens) {
    if (usedIndices.has(t.index)) {
      if (inPrepPhrase && currentPrepPhrase.length > 0) {
        contexts.push({
          text: currentPrepPhrase.map(tok => tok.word).join(" "),
          role: "CONTEXT",
          pos: "prep_phrase",
          index: currentPrepPhrase[0].index,
        });
        currentPrepPhrase = [];
        inPrepPhrase = false;
      }
      continue;
    }

    if (t.tag === "prep") {
      if (inPrepPhrase && currentPrepPhrase.length > 0) {
        contexts.push({
          text: currentPrepPhrase.map(tok => tok.word).join(" "),
          role: "CONTEXT",
          pos: "prep_phrase",
          index: currentPrepPhrase[0].index,
        });
      }
      currentPrepPhrase = [t];
      inPrepPhrase = true;
    } else if (inPrepPhrase) {
      currentPrepPhrase.push(t);
    }
  }

  if (inPrepPhrase && currentPrepPhrase.length > 0) {
    contexts.push({
      text: currentPrepPhrase.map(tok => tok.word).join(" "),
      role: "CONTEXT",
      pos: "prep_phrase",
      index: currentPrepPhrase[0].index,
    });
  }

  return contexts;
}

// ══════════════════════════════════════════════════════════════════════════
// 3. CLAUSE SEGMENTATION
// ══════════════════════════════════════════════════════════════════════════

function segmentClauses(sentence: string): ClauseInfo[] {
  const clauses: ClauseInfo[] = [];

  // Split at clause boundaries: punctuation + subordinators, relative pronouns, etc.
  // This is a heuristic approach since we don't have a full parser

  // First, identify subordinate clause boundaries
  // (patterns used by loop below via SUBORDINATORS set)

  // Find relative clauses
  // (patterns used by loop below via RELATIVE_PRONOUNS set)

  // Start with the full sentence as main clause
  let remaining = sentence;
  let clauseIdx = 0;

  // Find all subordinate clauses
  const subordinateParts: { text: string; conjunction: string; start: number; end: number }[] = [];

  // Subordinate clauses
  for (const sub of SUBORDINATORS) {
    const regex = new RegExp(`(?:^|,\\s*|;\\s*)(${sub.replace(/\s+/g, "\\s+")}\\s+[^,;]+)`, "gi");
    let match;
    while ((match = regex.exec(sentence)) !== null) {
      subordinateParts.push({
        text: match[1],
        conjunction: sub,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Relative clauses
  for (const rp of RELATIVE_PRONOUNS) {
    const regex = new RegExp(`(?:,\\s*)(${rp}\\s+[^,]+)`, "gi");
    let match;
    while ((match = regex.exec(sentence)) !== null) {
      subordinateParts.push({
        text: match[1],
        conjunction: rp,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Check for participial phrases
  if (PARTICIPIAL_RE.test(sentence)) {
    const match = sentence.match(/^(\w+ing\s+[^,]+),?\s*/);
    if (match) {
      clauses.push({
        text: match[1],
        type: "participial",
        position: clauseIdx++,
      });
      remaining = sentence.slice(match[0].length); // eslint-disable-line @typescript-eslint/no-unused-vars
    }
  }

  // Check for appositive
  const appMatch = sentence.match(APPOSITIVE_RE);
  if (appMatch) {
    clauses.push({
      text: appMatch[0].replace(/^,\s*/, "").replace(/,\s*$/, ""),
      type: "appositive",
      position: clauseIdx++,
    });
  }

  // Add subordinate clauses
  for (const part of subordinateParts) {
    const isRelative = RELATIVE_PRONOUNS.has(part.conjunction);
    clauses.push({
      text: part.text.trim(),
      type: isRelative ? "relative" : "subordinate",
      conjunction: part.conjunction,
      position: clauseIdx++,
    });
  }

  // The main clause is everything not covered by subordinate/relative clauses
  let mainText = sentence;
  // Remove subordinate parts from main
  for (const part of subordinateParts.sort((a, b) => b.start - a.start)) {
    mainText = mainText.slice(0, part.start) + mainText.slice(part.end);
  }
  mainText = mainText.replace(/,\s*,/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").trim();

  if (mainText) {
    clauses.unshift({
      text: mainText,
      type: "main",
      position: 0,
    });
  }

  // If no clauses found, the whole sentence is the main clause
  if (clauses.length === 0) {
    clauses.push({
      text: sentence,
      type: "main",
      position: 0,
    });
  }

  return clauses;
}

// ══════════════════════════════════════════════════════════════════════════
// 4. NAMED ENTITY DETECTION (via compromise.js)
// ══════════════════════════════════════════════════════════════════════════

function detectEntities(sentence: string): NamedEntity[] {
  const doc = nlp(sentence);
  const entities: NamedEntity[] = [];

  // People
  const people = doc.people().json();
  for (const p of people) {
    const idx = sentence.indexOf(p.text);
    if (idx >= 0) {
      entities.push({
        text: p.text,
        type: "PERSON",
        startIndex: idx,
        endIndex: idx + p.text.length,
      });
    }
  }

  // Places
  const places = doc.places().json();
  for (const p of places) {
    const idx = sentence.indexOf(p.text);
    if (idx >= 0) {
      entities.push({
        text: p.text,
        type: "PLACE",
        startIndex: idx,
        endIndex: idx + p.text.length,
      });
    }
  }

  // Organizations
  const orgs = doc.organizations().json();
  for (const o of orgs) {
    const idx = sentence.indexOf(o.text);
    if (idx >= 0) {
      entities.push({
        text: o.text,
        type: "ORG",
        startIndex: idx,
        endIndex: idx + o.text.length,
      });
    }
  }

  // Dates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dates = (doc as any).dates?.()?.json?.() ?? [];
  for (const d of dates) {
    const idx = sentence.indexOf(d.text);
    if (idx >= 0) {
      entities.push({
        text: d.text,
        type: "DATE",
        startIndex: idx,
        endIndex: idx + d.text.length,
      });
    }
  }

  // Numbers
  const nums = doc.numbers().json();
  for (const n of nums) {
    const idx = sentence.indexOf(n.text);
    if (idx >= 0) {
      entities.push({
        text: n.text,
        type: "NUMBER",
        startIndex: idx,
        endIndex: idx + n.text.length,
      });
    }
  }

  return entities;
}

// ══════════════════════════════════════════════════════════════════════════
// 5. TENSE & VOICE DETECTION
// ══════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectTenseVoice(sentence: string, _tokens: TaggedToken[]): TenseVoiceInfo {
  const doc = nlp(sentence);

  // Tense detection
  let tense: TenseVoiceInfo["tense"] = "present";
  const verbs = doc.verbs().json();

  if (verbs.length > 0) {
    const tenses: string[] = [];
    for (const v of verbs) {
      const tags: string[] = v.tags || [];
      if (tags.includes("PastTense") || tags.includes("Participle")) tenses.push("past");
      else if (tags.includes("FutureTense")) tenses.push("future");
      else tenses.push("present");
    }

    const pastCount = tenses.filter(t => t === "past").length;
    const presentCount = tenses.filter(t => t === "present").length;
    const futureCount = tenses.filter(t => t === "future").length;

    if (pastCount > presentCount && pastCount > futureCount) tense = "past";
    else if (futureCount > pastCount && futureCount > presentCount) tense = "future";
    else if (pastCount > 0 && presentCount > 0) tense = "mixed";
    else tense = "present";
  }

  // Check for will/shall → future
  if (/\b(?:will|shall|going to)\b/i.test(sentence)) {
    tense = tense === "present" ? "future" : "mixed";
  }

  // Voice detection
  let voice: TenseVoiceInfo["voice"] = "active";
  if (PASSIVE_MARKERS_RE.test(sentence)) {
    voice = "passive";
  }

  // Aspect detection
  let aspect: TenseVoiceInfo["aspect"] = "simple";
  if (/\b(?:has|have|had)\s+been\s+\w+ing\b/i.test(sentence)) {
    aspect = "perfect_progressive";
  } else if (/\b(?:has|have|had)\s+(?:\w+ed|\w+en)\b/i.test(sentence)) {
    aspect = "perfect";
  } else if (/\b(?:is|are|was|were|am)\s+\w+ing\b/i.test(sentence)) {
    aspect = "progressive";
  }

  // Modality detection
  let modality: TenseVoiceInfo["modality"] = "none";
  for (const modal of MODAL_VERBS) {
    if (new RegExp(`\\b${modal}\\b`, "i").test(sentence)) {
      modality = modal as TenseVoiceInfo["modality"];
      break;
    }
  }

  return { tense, voice, aspect, modality };
}

// ══════════════════════════════════════════════════════════════════════════
// 6. COMPLEXITY ANALYSIS
// ══════════════════════════════════════════════════════════════════════════

function analyzeComplexity(sentence: string, clauses: ClauseInfo[], tokens: TaggedToken[]): SentenceComplexity {
  const words = sentence.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const clauseCount = clauses.length;

  // Nesting depth — count nested subordinators
  let maxDepth = 1;
  let currentDepth = 1;
  const lowerSent = sentence.toLowerCase();
  for (const sub of SUBORDINATORS) {
    const regex = new RegExp(`\\b${sub.replace(/\s+/g, "\\s+")}\\b`, "gi");
    const matches = lowerSent.match(regex);
    if (matches) currentDepth += matches.length;
  }
  maxDepth = Math.max(maxDepth, currentDepth);

  const hasSubordination = clauses.some(c => c.type === "subordinate" || c.type === "adverbial");
  const hasCoordination = /\b(?:and|but|or|yet|so|nor)\b/.test(sentence);
  const hasRelativeClause = clauses.some(c => c.type === "relative");
  const hasParticipial = clauses.some(c => c.type === "participial") || PARTICIPIAL_RE.test(sentence);
  const hasAppositive = clauses.some(c => c.type === "appositive") || APPOSITIVE_RE.test(sentence);

  // Count prep phrases
  const prepCount = tokens.filter(t => t.tag === "prep").length;
  const hasPrepositionalChain = prepCount >= 3;

  // Composite complexity score (0-100)
  let score = 0;
  score += Math.min(wordCount * 1.5, 30); // word count contribution (max 30)
  score += clauseCount * 8; // clause count (max ~40 for 5 clauses)
  score += maxDepth * 5; // nesting (max 15)
  if (hasSubordination) score += 5;
  if (hasRelativeClause) score += 5;
  if (hasParticipial) score += 3;
  if (hasAppositive) score += 3;
  if (hasPrepositionalChain) score += 4;
  score = Math.min(100, Math.round(score));

  return {
    wordCount,
    clauseCount,
    maxDepth,
    hasSubordination,
    hasCoordination,
    hasRelativeClause,
    hasParticipial,
    hasAppositive,
    hasPrepositionalChain,
    complexityScore: score,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 7. MAIN ANALYSIS FUNCTION — Produces full StructuredSentenceMap
// ══════════════════════════════════════════════════════════════════════════

export function analyzeSentence(sentence: string, id: number): StructuredSentenceMap {
  const tokens = posTagSentence(sentence);
  const clauses = segmentClauses(sentence);
  const entities = detectEntities(sentence);
  const tenseVoice = detectTenseVoice(sentence, tokens);

  const subject = extractSubject(tokens);
  const verb = extractVerb(tokens);
  const verbIdx = verb?.headIndex ?? verb?.index ?? -1;
  const object = extractObject(tokens, verbIdx);
  const modifiers = extractModifiers(tokens, subject, verb, object);
  const context = extractContext(tokens, subject, verb, object, modifiers);
  const complexity = analyzeComplexity(sentence, clauses, tokens);

  return {
    id,
    original: sentence,
    subject,
    verb,
    object,
    modifiers,
    context,
    clauses,
    entities,
    tenseVoice,
    complexity,
  };
}

/**
 * Analyze an entire text — produces structured maps for all sentences.
 * This is the main entry point for the Linguistic Intelligence Core.
 */
export function analyzeText(sentences: string[]): TextAnalysis {
  const maps: StructuredSentenceMap[] = [];

  for (let i = 0; i < sentences.length; i++) {
    maps.push(analyzeSentence(sentences[i], i));
  }

  // Compute global stats
  const complexities = maps.map(m => m.complexity.complexityScore);
  const wordCounts = maps.map(m => m.complexity.wordCount);
  const allEntities = maps.flatMap(m => m.entities);
  const clauseCounts = maps.map(m => m.complexity.clauseCount);

  // Dominant tense
  const tenseCounts: Record<string, number> = { past: 0, present: 0, future: 0, mixed: 0 };
  for (const m of maps) tenseCounts[m.tenseVoice.tense]++;
  const dominantTense = (Object.entries(tenseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "present") as TextAnalysis["globalStats"]["dominantTense"];

  // Dominant voice
  const voiceCounts: Record<string, number> = { active: 0, passive: 0, mixed: 0 };
  for (const m of maps) voiceCounts[m.tenseVoice.voice]++;
  const dominantVoice = (Object.entries(voiceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "active") as TextAnalysis["globalStats"]["dominantVoice"];

  return {
    sentences: maps,
    globalStats: {
      avgComplexity: complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0,
      avgWordCount: wordCounts.length > 0 ? wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length : 0,
      entityCount: allEntities.length,
      dominantTense,
      dominantVoice,
      clauseDensity: clauseCounts.length > 0 ? clauseCounts.reduce((a, b) => a + b, 0) / clauseCounts.length : 0,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 8. STRATEGY RECOMMENDATION (LIC-Enhanced)
// ══════════════════════════════════════════════════════════════════════════

export type EnhancedStrategy =
  | "S0_minimal"        // Anti-pattern detection — minimal change
  | "S1_lexical"        // Lexical variation — word/phrase swaps
  | "S2_clause_reorder" // Clause restructuring
  | "S3_voice_shift"    // Voice transformation (active↔passive)
  | "S4_emphasis_shift" // Emphasis/focus shift
  | "S5_hybrid_deep";   // Hybrid deep rewrite (multiple transforms)

/**
 * Assign an enhanced transformation strategy based on LIC analysis.
 * This is what makes the engine "intelligent" — not random rewriting.
 *
 * Selection logic:
 *   - sentence length
 *   - complexity score
 *   - position in paragraph
 *   - similarity to neighboring sentences
 *   - current voice and tense
 */
export function assignEnhancedStrategies(
  analysis: TextAnalysis,
  paragraphBoundaries: number[], // sentence indices that start a new paragraph
): EnhancedStrategy[] {
  const strategies: EnhancedStrategy[] = [];
  const maps = analysis.sentences;

  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const isParaStart = paragraphBoundaries.includes(i);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _isParaEnd = paragraphBoundaries.includes(i + 1) || i === maps.length - 1;

    // Simple short sentences → minimal change or lexical only
    if (m.complexity.wordCount < 8) {
      strategies.push(i % 3 === 0 ? "S0_minimal" : "S1_lexical");
      continue;
    }

    // Very complex sentences → clause reorder or hybrid deep
    if (m.complexity.complexityScore > 65) {
      if (m.complexity.hasSubordination && m.complexity.clauseCount >= 3) {
        strategies.push("S2_clause_reorder");
        continue;
      }
      strategies.push("S5_hybrid_deep");
      continue;
    }

    // Passive voice → can shift to active (strategy S3)
    if (m.tenseVoice.voice === "passive" && m.complexity.wordCount > 10) {
      // Don't do voice shift for every passive sentence — vary it
      if (i % 3 === 0) {
        strategies.push("S3_voice_shift");
        continue;
      }
    }

    // Has subordination → can reorder clauses
    if (m.complexity.hasSubordination && m.complexity.wordCount > 15) {
      strategies.push("S2_clause_reorder");
      continue;
    }

    // Paragraph-start sentences → emphasis shift for variety
    if (isParaStart && m.complexity.wordCount > 12) {
      strategies.push("S4_emphasis_shift");
      continue;
    }

    // Medium complexity → lexical variation or phrase-heavy
    if (m.complexity.complexityScore > 30) {
      // Check if previous sentence used same strategy
      const prev = i > 0 ? strategies[i - 1] : null;
      if (prev === "S1_lexical") {
        strategies.push("S4_emphasis_shift");
      } else {
        strategies.push("S1_lexical");
      }
      continue;
    }

    // Default: cycle through strategies to ensure variety
    const cycle: EnhancedStrategy[] = ["S1_lexical", "S0_minimal", "S4_emphasis_shift", "S1_lexical", "S2_clause_reorder"];
    let candidate = cycle[i % cycle.length];

    // Avoid adjacent duplicates
    if (i > 0 && strategies[i - 1] === candidate) {
      candidate = cycle[(i + 1) % cycle.length];
    }
    strategies.push(candidate);
  }

  return strategies;
}

// ══════════════════════════════════════════════════════════════════════════
// 9. SENTENCE SIMILARITY (for neighbor comparison)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Compute Jaccard-like structural similarity between two sentence maps.
 * Used to detect when neighboring sentences are structurally too similar
 * (a hallmark of AI-generated text).
 */
export function structuralSimilarity(a: StructuredSentenceMap, b: StructuredSentenceMap): number {
  let score = 0;
  let total = 0;

  // Compare word count ratio
  total++;
  const wcRatio = Math.min(a.complexity.wordCount, b.complexity.wordCount) /
    Math.max(a.complexity.wordCount, b.complexity.wordCount);
  if (wcRatio > 0.8) score++; // similar length

  // Compare clause count
  total++;
  if (a.complexity.clauseCount === b.complexity.clauseCount) score++;

  // Compare voice
  total++;
  if (a.tenseVoice.voice === b.tenseVoice.voice) score++;

  // Compare tense
  total++;
  if (a.tenseVoice.tense === b.tenseVoice.tense) score++;

  // Compare subject position (both start with subject?)
  total++;
  const aSubjFirst = a.subject !== null && a.subject.index === 0;
  const bSubjFirst = b.subject !== null && b.subject.index === 0;
  if (aSubjFirst === bSubjFirst) score++;

  // Compare complexity score bracket
  total++;
  const aBracket = Math.floor(a.complexity.complexityScore / 20);
  const bBracket = Math.floor(b.complexity.complexityScore / 20);
  if (aBracket === bBracket) score++;

  // Compare modifier count
  total++;
  if (Math.abs(a.modifiers.length - b.modifiers.length) <= 1) score++;

  // Compare context phrase count
  total++;
  if (Math.abs(a.context.length - b.context.length) <= 1) score++;

  return total > 0 ? score / total : 0;
}
