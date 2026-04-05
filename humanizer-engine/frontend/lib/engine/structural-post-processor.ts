/**
 * Structural Post-Processor v3 — Deep Structural Rewriting
 *
 * Targets what REAL external detectors (ZeroGPT, Turnitin, Copyleaks, Surfer SEO) catch:
 *
 *   1. AI sentence templates — "X plays a vital role in Y", "It is important to note that"
 *   2. Uniform paragraph structure — every paragraph is 4-5 sentences, same template
 *   3. Zero rhetorical questions — AI never asks questions mid-text
 *   4. No concessive/hedging language — humans naturally qualify claims
 *   5. Token predictability — sentences follow Subject-Verb-Object uniformly
 *   6. No contractions — AI avoids informal contractions
 *   7. Sentence-length monotony — all sentences are 15-25 words
 *   8. Perfect parallel structure — AI repeats the same sentence shape
 *
 * 10 Phases:
 *   Phase 1: AI Sentence Template Breaking (structural rewrites)
 *   Phase 2: Clause Fronting / Sentence Inversion
 *   Phase 3: Rhetorical Question Injection
 *   Phase 4: Concessive & Hedging Injection
 *   Phase 5: Paragraph Structure Disruption
 *   Phase 6: Sentence Length Diversification
 *   Phase 7: Long Sentence Splitting
 *   Phase 8: Vocabulary Guard (enrichment without AI words)
 *   Phase 9: Aggressive Contraction Injection
 *   Phase 10: Punctuation & Starter Diversity
 */

import { robustSentenceSplit } from "./content-protection";

// ── AI word blacklist — NEVER introduce these via vocabulary enrichment ──
const AI_FLAGGED = new Set([
  "utilize","leverage","facilitate","comprehensive","multifaceted","paramount",
  "furthermore","moreover","additionally","consequently","subsequently","nevertheless",
  "notwithstanding","aforementioned","henceforth","paradigm","methodology","framework",
  "trajectory","discourse","dichotomy","conundrum","juxtaposition","ramification",
  "underpinning","synergy","robust","nuanced","salient","ubiquitous","pivotal",
  "intricate","meticulous","profound","inherent","overarching","substantive",
  "efficacious","holistic","transformative","innovative","groundbreaking","noteworthy",
  "proliferate","exacerbate","ameliorate","engender","promulgate","delineate",
  "elucidate","illuminate","necessitate","perpetuate","culminate","underscore",
  "exemplify","encompass","bolster","catalyze","streamline","optimize","enhance",
  "mitigate","navigate","prioritize","articulate","substantiate","corroborate",
  "disseminate","cultivate","ascertain","endeavor","delve","embark","foster",
  "harness","spearhead","unravel","unveil","notably","specifically","crucially",
  "importantly","significantly","essentially","fundamentally","arguably","undeniably",
  "undoubtedly","interestingly","remarkably","evidently","implication","implications",
  "realm","landscape","tapestry","cornerstone","bedrock","linchpin","catalyst",
  "nexus","spectrum","myriad","plethora","multitude","crucial","vital","imperative",
  "notable","significant","substantial","remarkable","considerable","unprecedented",
]);

// ── Deterministic RNG ──
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: AI SENTENCE TEMPLATE BREAKING
// ════════════════════════════════════════════════════════════════════════════
// Detects and rewrites the most common AI sentence patterns that
// persist even after word-level transformations.

const TEMPLATE_REWRITES: [RegExp, (m: RegExpExecArray, rng: () => number) => string][] = [
  // "X plays/play a [adj] role in Y" → structural inversion
  [
    /^(.+?)\s+(?:plays?|holds?|fills?|occupies?)\s+(?:a\s+)?(?:\w+\s+)?(?:role|part|function)\s+in\s+(.+)$/i,
    (m, rng) => {
      const alts = [
        `When it comes to ${m[2].replace(/\.\s*$/, "")}, ${m[1].toLowerCase()} ${pickOne(["matter a great deal", "are at the center of it", "carry real weight", "stand out"], rng)}.`,
        `${m[2].replace(/\.\s*$/, "")} ${pickOne(["depends heavily on", "leans on", "rests on", "hinges on"], rng)} ${m[1].toLowerCase()}.`,
        `Without ${m[1].toLowerCase()}, ${m[2].replace(/\.\s*$/, "")} ${pickOne(["would look very different", "would not work the same way", "falls apart quickly"], rng)}.`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "It is [adj] to [verb]..." → direct imperative or observation
  [
    /^It\s+is\s+(?:important|crucial|essential|vital|necessary|critical|key|imperative)\s+(?:to\s+)(.+)$/i,
    (m, rng) => {
      const verb = m[1].replace(/\.\s*$/, "");
      const alts = [
        `One thing that cannot be skipped: ${verb}.`,
        `${verb[0].toUpperCase() + verb.slice(1)} — and there is no getting around it.`,
        `The need to ${verb} is hard to overstate.`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "It is [adj] to note/mention that..." → direct statement
  [
    /^It\s+(?:is|should\s+be|must\s+be|can\s+be)\s+(?:\w+\s+)?(?:to\s+)?(?:note|noted|mention|mentioned|emphasize|emphasized|stress|stressed|recognize|recognized|acknowledge|acknowledged|point\s+out|pointed\s+out)\s+that\s+(.+)$/i,
    (m, rng) => {
      const claim = m[1].trim();
      const alts = [
        `Worth pointing out: ${claim}`,
        `Here's what stands out — ${claim}`,
        `One thing to keep in mind: ${claim}`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "The [importance/significance/impact/role] of X cannot be overstated" → rewrite
  [
    /^The\s+(?:importance|significance|impact|relevance|value|role|influence|effect)\s+of\s+(.+?)\s+(?:cannot|can\s*not|should\s+not)\s+be\s+(?:overstated|underestimated|overlooked|ignored|denied)(.*)$/i,
    (m, rng) => {
      const topic = m[1].trim();
      const rest = m[2]?.trim() ?? "";
      const ending = rest ? ` ${rest}` : ".";
      const alts = [
        `${topic[0].toUpperCase() + topic.slice(1)} matters — a great deal${ending}`,
        `It is difficult to overstate how much ${topic} shapes outcomes${ending}`,
        `Take away ${topic}, and the whole picture changes${ending}`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "This [approach/strategy/method] ensures/allows/enables..." → vary structure
  [
    /^(?:This|Such\s+an?|The)\s+(?:approach|strategy|method|technique|practice|framework|system|process)\s+(?:ensures?|allows?|enables?|provides?|promotes?|supports?|creates?)\s+(.+)$/i,
    (m, rng) => {
      const benefit = m[1].replace(/\.\s*$/, "");
      const alts = [
        `The result? ${benefit[0].toUpperCase() + benefit.slice(1)}.`,
        `What this means in practice: ${benefit}.`,
        `Done well, it leads to ${benefit}.`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "There are several/many/various X that..." → rewrite
  [
    /^There\s+(?:are|exist)\s+(?:several|many|numerous|various|multiple|different|a\s+number\s+of)\s+(.+)$/i,
    (m, rng) => {
      const rest = m[1].replace(/\.\s*$/, "");
      const alts = [
        `A few ${rest} stand out.`,
        `Several ${rest} deserve mention.`,
        `More than one can point to ${rest}.`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "In conclusion / To summarize / Overall / In summary" → human wrap-ups
  [
    /^(?:In\s+conclusion|To\s+summarize|In\s+summary|Overall|All\s+in\s+all|To\s+conclude|Taken\s+together),?\s+(.+)$/i,
    (m, rng) => {
      const rest = m[1].trim();
      const alts = [
        `Looking at the full picture, ${rest}`,
        `When you step back, ${rest}`,
        `Put it all together, and ${rest}`,
        `So where does this leave things? ${rest[0].toUpperCase() + rest.slice(1)}`,
      ];
      return pickOne(alts, rng);
    },
  ],

  // "As a result, X" / "Consequently, X" / "Therefore, X" → varied causal
  [
    /^(?:As\s+a\s+result|Consequently|Therefore|Thus|Hence|Accordingly),?\s+(.+)$/i,
    (m, rng) => {
      const rest = m[1].trim();
      const alts = [
        `That's why ${rest[0].toLowerCase() + rest.slice(1)}`,
        `The upshot: ${rest}`,
        `So ${rest[0].toLowerCase() + rest.slice(1)}`,
      ];
      return pickOne(alts, rng);
    },
  ],
];

function breakAITemplates(sentences: string[], rng: () => number): string[] {
  let rewrites = 0;
  const maxRewrites = Math.max(3, Math.floor(sentences.length * 0.20));

  return sentences.map((sent) => {
    if (rewrites >= maxRewrites) return sent;

    for (const [pattern, rewriter] of TEMPLATE_REWRITES) {
      const match = pattern.exec(sent);
      if (match) {
        const rewritten = rewriter(match, rng);
        if (rewritten && rewritten.length > 10) {
          rewrites++;
          return rewritten;
        }
      }
    }
    return sent;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: CLAUSE FRONTING / SENTENCE INVERSION
// ════════════════════════════════════════════════════════════════════════════
// Moves trailing subordinate clauses to the front of some sentences,
// breaking the monotonous SVO → SVO → SVO pattern.

function frontClauses(sentences: string[], rng: () => number): string[] {
  let inversions = 0;
  const maxInversions = Math.max(2, Math.floor(sentences.length * 0.15));

  return sentences.map((sent) => {
    if (inversions >= maxInversions) return sent;
    const wc = sent.split(/\s+/).length;
    if (wc < 12 || wc > 35) return sent;

    // Match trailing adverbial: "..., especially/particularly/mainly/often in/when/for..."
    const trailMatch = sent.match(
      /^(.{20,}?),\s*(especially|particularly|mainly|often|primarily|largely|mostly|chiefly|typically)\s+(in|when|for|among|within|across|during|through)\s+(.+)$/i
    );
    if (trailMatch && rng() < 0.50) {
      const main = trailMatch[1].trim().replace(/[.]\s*$/, "");
      const adv = trailMatch[2];
      const prep = trailMatch[3];
      const rest = trailMatch[4].replace(/[.]\s*$/, "");
      inversions++;
      return `${adv[0].toUpperCase() + adv.slice(1)} ${prep} ${rest}, ${main[0].toLowerCase() + main.slice(1)}.`;
    }

    // Match trailing "because/since/as/while + clause"
    const causalMatch = sent.match(
      /^(.{15,}?),?\s+(because|since|as|while|given that|considering that)\s+(.{10,})$/i
    );
    if (causalMatch && rng() < 0.40) {
      const main = causalMatch[1].trim().replace(/[.]\s*$/, "");
      const conj = causalMatch[2];
      const reason = causalMatch[3].replace(/[.]\s*$/, "");
      inversions++;
      return `${conj[0].toUpperCase() + conj.slice(1)} ${reason}, ${main[0].toLowerCase() + main.slice(1)}.`;
    }

    return sent;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: RHETORICAL QUESTION INJECTION
// ════════════════════════════════════════════════════════════════════════════
// Inserts 1-3 contextual rhetorical questions after strong claims.
// AI almost never generates mid-text questions — this is one of the
// strongest human-writing signals for real detectors.

const RHETORICAL_QUESTIONS = [
  "But does this actually hold up in practice?",
  "So what does this look like on the ground?",
  "Why does this matter so much?",
  "The real question is: how far does this go?",
  "Is this enough, though?",
  "But how well does this work in reality?",
  "What happens when these systems fall short?",
  "Can the same be said across the board?",
  "And yet, is the current approach working?",
  "How do we know this is not just wishful thinking?",
  "But where does the effort actually go?",
  "What is missing from this picture?",
  "Does the evidence really back this up?",
  "So why has more progress not been made?",
  "Is this a realistic goal, or just an ideal?",
  "But who actually benefits from this?",
  "How sustainable is this in the long run?",
  "At what cost, though?",
];

function injectQuestions(sentences: string[], rng: () => number): string[] {
  if (sentences.length < 8) return sentences;

  const result: string[] = [];
  let questionsAdded = 0;
  const maxQuestions = sentences.length >= 20 ? 3 : sentences.length >= 12 ? 2 : 1;

  // Identify good insertion points: after sentences making strong claims
  const claimIndicators = /\b(?:important|essential|key|critical|significant|central|necessary|needed|required|effective|powerful|strong|major|clear|obvious|evident|must|should|cannot)\b/i;

  const targetIndices = new Set<number>();
  for (let i = 2; i < sentences.length - 2; i++) {
    if (claimIndicators.test(sentences[i]) && sentences[i].split(/\s+/).length > 10) {
      targetIndices.add(i);
    }
  }

  // Spread questions evenly through the text
  const used = new Set<number>();
  const targetArr = [...targetIndices];
  if (targetArr.length > 0) {
    const step = Math.max(1, Math.floor(targetArr.length / maxQuestions));
    for (let j = 0; j < targetArr.length && used.size < maxQuestions; j += step) {
      used.add(targetArr[j]);
    }
  }

  const usedQuestions = new Set<string>();
  for (let i = 0; i < sentences.length; i++) {
    result.push(sentences[i]);
    if (used.has(i) && questionsAdded < maxQuestions) {
      let q: string;
      do {
        q = pickOne(RHETORICAL_QUESTIONS, rng);
      } while (usedQuestions.has(q) && usedQuestions.size < RHETORICAL_QUESTIONS.length);
      usedQuestions.add(q);
      result.push(q);
      questionsAdded++;
    }
  }

  // Fallback: insert at least one question if none placed
  if (questionsAdded === 0 && sentences.length >= 8) {
    const mid = Math.floor(result.length * 0.55);
    result.splice(mid, 0, pickOne(RHETORICAL_QUESTIONS, rng));
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4: CONCESSIVE & HEDGING INJECTION
// ════════════════════════════════════════════════════════════════════════════
// Humans naturally qualify claims, express uncertainty, and concede points.
// AI text is unnaturally confident and linear.

const CONCESSIVE_STARTERS = [
  "Granted, not everyone sees it this way.",
  "To be fair, the picture is not entirely clear.",
  "Of course, this comes with caveats.",
  "That said, there are real limits to this view.",
  "None of this is straightforward, though.",
  "It is worth noting that opinions differ here.",
  "This is not without controversy, of course.",
  "Some pushback on this point is fair.",
  "There is a counterargument worth hearing.",
  "Not all experts agree on this, naturally.",
  "Still, one should not overstate the case.",
  "Fair enough, the evidence is not airtight.",
  "Then again, context shapes everything here.",
];

function injectConcessives(sentences: string[], rng: () => number): string[] {
  if (sentences.length < 8) return sentences;

  const result: string[] = [];
  let added = 0;
  const maxConcessives = sentences.length >= 18 ? 3 : sentences.length >= 10 ? 2 : 1;

  // Place concessives in the middle portion of the text
  const startZone = Math.floor(sentences.length * 0.25);
  const endZone = Math.floor(sentences.length * 0.80);

  for (let i = 0; i < sentences.length; i++) {
    result.push(sentences[i]);
    if (
      added < maxConcessives &&
      i >= startZone &&
      i <= endZone &&
      sentences[i].split(/\s+/).length > 10 &&
      rng() < 0.30
    ) {
      result.push(pickOne(CONCESSIVE_STARTERS, rng));
      added++;
    }
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5: PARAGRAPH STRUCTURE DISRUPTION
// ════════════════════════════════════════════════════════════════════════════
// AI paragraphs are uniformly 4-5 sentences. Human writing has
// 1-sentence emphasis paragraphs, 2-sentence paragraphs, and
// 7-8 sentence paragraphs mixed together.

function disruptParagraphs(paragraphs: string[]): string[] {
  if (paragraphs.length < 3) return paragraphs;

  const result: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    const sentences = robustSentenceSplit(para);

    // Skip short paragraphs or title-like lines
    if (sentences.length <= 2 || para.split(/\s+/).length < 15) {
      result.push(para);
      continue;
    }

    // If paragraph has 5+ sentences, consider splitting it
    if (sentences.length >= 5 && i > 0 && i < paragraphs.length - 1) {
      // Pull out one strong sentence as its own mini-paragraph
      const emphasisIdx = sentences.findIndex(
        (s, idx) =>
          idx >= 2 &&
          idx < sentences.length - 1 &&
          s.split(/\s+/).length <= 18 &&
          /\b(?:matters?|clear|key|critical|real|true|enough|gap|problem|challenge|need|must|should|cannot)\b/i.test(s)
      );

      if (emphasisIdx >= 2 && emphasisIdx < sentences.length - 1) {
        const before = sentences.slice(0, emphasisIdx).join(" ");
        const emphasis = sentences[emphasisIdx];
        const after = sentences.slice(emphasisIdx + 1).join(" ");
        result.push(before);
        result.push(emphasis); // One-sentence paragraph for emphasis
        result.push(after);
        continue;
      }
    }

    result.push(para);
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6: SENTENCE LENGTH DIVERSIFICATION
// ════════════════════════════════════════════════════════════════════════════
// Creates burstiness: mix of very short and very long sentences.

const SHORT_OBSERVATIONS = [
  "The data backs this up.",
  "Results vary, of course.",
  "Not every case fits neatly.",
  "Context matters here.",
  "Gaps remain.",
  "The need is real.",
  "Progress has been slow.",
  "Others have drawn the same conclusion.",
  "The trend is clear enough.",
  "Opinions differ, and rightly so.",
  "There are no simple answers.",
  "The costs add up fast.",
  "Every situation is different.",
  "The evidence is hard to ignore.",
  "It is a persistent problem.",
  "That alone is telling.",
  "Some things do not scale easily.",
  "And the window is narrowing.",
  "Nobody disputes that part.",
  "That is only half the story.",
];

function diversifyLengths(sentences: string[], rng: () => number): string[] {
  if (sentences.length < 5) return sentences;

  const result: string[] = [];
  let shortInserted = 0;
  let mergesDone = 0;
  const maxShorts = Math.max(2, Math.floor(sentences.length * 0.12));
  const maxMerges = Math.max(1, Math.floor(sentences.length * 0.08));

  let i = 0;
  while (i < sentences.length) {
    const sent = sentences[i];
    const wc = sent.split(/\s+/).length;

    // MERGE: two medium sentences into one long complex sentence
    if (
      mergesDone < maxMerges &&
      i + 1 < sentences.length &&
      wc >= 10 && wc <= 22 &&
      sentences[i + 1].split(/\s+/).length >= 10 &&
      sentences[i + 1].split(/\s+/).length <= 22 &&
      rng() < 0.30
    ) {
      const connectors = [
        " — and this ties directly into how",
        ", a reality that's closely linked to",
        "; at the same time,",
        ", which dovetails with the fact that",
      ];
      const first = sent.replace(/[.]\s*$/, "");
      const next = sentences[i + 1];
      const nextLower = next[0].toLowerCase() + next.slice(1);
      result.push(first + pickOne(connectors, rng) + " " + nextLower);
      mergesDone++;
      i += 2;
      continue;
    }

    result.push(sent);

    // INSERT short observation after long sentences
    if (
      shortInserted < maxShorts &&
      wc > 14 &&
      i < sentences.length - 1 &&
      // Don't insert after a question
      !/[?]/.test(sent) &&
      rng() < 0.20
    ) {
      result.push(pickOne(SHORT_OBSERVATIONS, rng));
      shortInserted++;
    }

    i++;
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7: LONG SENTENCE SPLITTING
// ════════════════════════════════════════════════════════════════════════════

function splitLongSentences(sentences: string[]): string[] {
  const result: string[] = [];
  let splits = 0;
  const maxSplits = Math.max(2, Math.floor(sentences.length * 0.10));

  for (const sent of sentences) {
    const wc = sent.split(/\s+/).length;
    if (splits >= maxSplits || wc <= 30) {
      result.push(sent);
      continue;
    }

    let didSplit = false;

    // Split at semicolons
    if (sent.includes(";")) {
      const parts = sent.split(/;\s*/);
      if (parts.length >= 2 && parts[0].split(/\s+/).length >= 5) {
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          let fin = trimmed;
          if (!/[.!?]$/.test(fin)) fin += ".";
          fin = fin[0].toUpperCase() + fin.slice(1);
          result.push(fin);
        }
        didSplit = true;
        splits++;
      }
    }

    // Split at ", which" / ", and this" / ", but this"
    if (!didSplit) {
      const cm = sent.match(/^(.{30,}?),\s*(which|and this|and that|but this|but that)\s+(.+)$/i);
      if (cm) {
        let first = cm[1].trim();
        if (!/[.!?]$/.test(first)) first += ".";
        const conj = cm[2].toLowerCase();
        let second = cm[3].trim();
        if (conj === "which") second = "This " + second;
        else second = second[0].toUpperCase() + second.slice(1);
        if (!/[.!?]$/.test(second)) second += ".";
        result.push(first);
        result.push(second);
        didSplit = true;
        splits++;
      }
    }

    if (!didSplit) result.push(sent);
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 8: VOCABULARY GUARD
// ════════════════════════════════════════════════════════════════════════════
// Enriches vocabulary (boosts hapax/TTR) but NEVER introduces AI-flagged words.
// This fixes the v2 bug where words like "pivotal" and "foster" were injected.

const SAFE_VOCAB: Record<string, string[]> = {
  important: ["pressing", "weighty", "consequential"],
  provide: ["supply", "deliver", "offer"],
  support: ["back", "sustain", "reinforce"],
  improve: ["strengthen", "refine", "sharpen"],
  increase: ["expand", "broaden", "grow"],
  include: ["cover", "span", "involve"],
  address: ["tackle", "confront", "handle"],
  impact: ["bearing", "effect", "footprint"],
  community: ["neighborhood", "locality", "population"],
  approach: ["method", "tactic", "pathway"],
  challenge: ["hurdle", "obstacle", "difficulty"],
  process: ["procedure", "operation", "routine"],
  outcome: ["result", "consequence", "upshot"],
  disease: ["illness", "condition", "ailment"],
  prevention: ["deterrence", "avoidance", "safeguarding"],
  education: ["instruction", "training", "teaching"],
  access: ["availability", "reach", "entry"],
  efforts: ["initiatives", "actions", "undertakings"],
  help: ["aid", "assist", "contribute to"],
  also: ["likewise", "equally", "in parallel"],
  role: ["function", "part", "responsibility"],
  key: ["central", "core", "primary"],
  ensure: ["guarantee", "confirm", "secure"],
  various: ["assorted", "wide-ranging", "mixed"],
  environment: ["setting", "surroundings", "backdrop"],
  promote: ["encourage", "advance", "push for"],
};

function enrichVocabulary(sentences: string[], rng: () => number): string[] {
  const usedAlts = new Map<string, Set<string>>();
  const globalFreq = new Map<string, number>();

  for (const sent of sentences) {
    for (const w of sent.toLowerCase().split(/\s+/)) {
      const clean = w.replace(/[^a-z]/g, "");
      if (clean) globalFreq.set(clean, (globalFreq.get(clean) ?? 0) + 1);
    }
  }

  return sentences.map((sent) => {
    const words = sent.split(/\s+/);
    let swaps = 0;
    const maxSwaps = Math.max(1, Math.floor(words.length * 0.05));

    return words
      .map((word) => {
        if (swaps >= maxSwaps) return word;
        const clean = word.toLowerCase().replace(/[^a-z]/g, "");
        const alts = SAFE_VOCAB[clean];
        if (!alts || (globalFreq.get(clean) ?? 0) < 3) return word;

        // Double-check: filter out ANY ai-flagged alternatives
        const safeAlts = alts.filter(
          (a) => !a.split(/\s+/).some((w) => AI_FLAGGED.has(w.toLowerCase()))
        );
        if (safeAlts.length === 0) return word;

        const used = usedAlts.get(clean) ?? new Set<string>();
        const available = safeAlts.filter((a) => !used.has(a));
        if (available.length === 0) return word;

        const alt = pickOne(available, rng);
        used.add(alt);
        usedAlts.set(clean, used);
        globalFreq.set(clean, (globalFreq.get(clean) ?? 1) - 1);

        const leadPunct = word.match(/^[^a-zA-Z]*/)?.[0] ?? "";
        const trailPunct = word.match(/[^a-zA-Z]*$/)?.[0] ?? "";
        let replacement = alt;
        if (/^[A-Z]/.test(word))
          replacement = alt[0].toUpperCase() + alt.slice(1);
        swaps++;
        return leadPunct + replacement + trailPunct;
      })
      .join(" ");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 9: CONTRACTION EXPANSION (ENFORCE ZERO CONTRACTIONS)
// ════════════════════════════════════════════════════════════════════════════
// Academic writing must NEVER contain contractions. This phase expands
// any contractions that may have slipped through from other phases.

const CONTRACTION_EXPANSIONS: [RegExp, string][] = [
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bcannot\b/gi, "cannot"],
  [/\bcan't\b/gi, "cannot"],
  [/\bcan not\b/gi, "cannot"],
  [/\bwon't\b/gi, "will not"],
  [/\bwill not\b/gi, "will not"],
  [/\bshouldn't\b/gi, "should not"],
  [/\bwouldn't\b/gi, "would not"],
  [/\bcouldn't\b/gi, "could not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"],
  [/\bhasn't\b/gi, "has not"],
  [/\bhaven't\b/gi, "have not"],
  [/\bhadn't\b/gi, "had not"],
  [/\bmustn't\b/gi, "must not"],
  [/\bneedn't\b/gi, "need not"],
  [/\bit's\b/gi, "it is"],
  [/\bthat's\b/gi, "that is"],
  [/\bthey're\b/gi, "they are"],
  [/\bwe're\b/gi, "we are"],
  [/\bthere's\b/gi, "there is"],
  [/\bwho's\b/gi, "who is"],
  [/\bwhat's\b/gi, "what is"],
  [/\bit'll\b/gi, "it will"],
  [/\bthey'll\b/gi, "they will"],
  [/\bthat'd\b/gi, "that would"],
  [/\bwe've\b/gi, "we have"],
  [/\bthey've\b/gi, "they have"],
  [/\bthere're\b/gi, "there are"],
  [/\byou're\b/gi, "you are"],
  [/\byou've\b/gi, "you have"],
  [/\byou'll\b/gi, "you will"],
  [/\bhe's\b/gi, "he is"],
  [/\bshe's\b/gi, "she is"],
  [/\bhe'll\b/gi, "he will"],
  [/\bshe'll\b/gi, "she will"],
  [/\bI'm\b/g, "I am"],
  [/\bI've\b/g, "I have"],
  [/\bI'll\b/g, "I will"],
  [/\bI'd\b/g, "I would"],
  [/\blet's\b/gi, "let us"],
  [/\bwhere's\b/gi, "where is"],
  [/\bhow's\b/gi, "how is"],
  [/\bwhen's\b/gi, "when is"],
  [/\bhere's\b/gi, "here is"],
];

function expandAllContractions(sentences: string[]): string[] {
  return sentences.map((sent) => {
    let modified = sent;
    for (const [pattern, replacement] of CONTRACTION_EXPANSIONS) {
      modified = modified.replace(pattern, replacement);
    }
    return modified;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 10: PUNCTUATION & STARTER DIVERSITY
// ════════════════════════════════════════════════════════════════════════════

// TAIL_ASIDES removed: they inject fabricated content ("which few would dispute",
// "and the data reflects this") that changes the meaning and isn't in the original.

function diversifyPunctuation(sentences: string[], _rng: () => number): string[] {
  // No-op: tail asides removed to prevent meaning-altering filler injection
  return sentences;
}

const STARTER_ALTS: Record<string, string[]> = {
  the: ["One", "A", "Each", "Every"],
  this: ["Such", "That kind of", "One such"],
  these: ["Such", "Several of these", "Those kinds of"],
  they: ["Those involved", "The people in question", "The ones doing this work"],
  it: ["That", "One thing", "What stands out"],
  in: ["Within", "Across", "Throughout"],
  by: ["Through", "Via", "By way of"],
  community: ["Local", "Neighborhood", "Population-level"],
  furthermore: ["Beyond that", "Also", "On top of that"],
  moreover: ["Beyond that", "Also", "Plus"],
  additionally: ["Also", "On top of that", "Plus"],
};

function diversifyStarters(sentences: string[]): string[] {
  if (sentences.length < 4) return sentences;
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i];
    if (i > 0) {
      const prevStart = (result[result.length - 1] ?? "").split(/\s+/)[0]?.toLowerCase() ?? "";
      const currStart = sent.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (prevStart === currStart && STARTER_ALTS[currStart]) {
        const alt =
          STARTER_ALTS[currStart][i % STARTER_ALTS[currStart].length];
        sent = alt + sent.slice(currStart.length);
      }
    }
    result.push(sent);
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

export function structuralPostProcess(text: string): string {
  if (!text?.trim()) return text;

  // Deterministic seed from text content
  let seed = 0;
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    seed = (seed * 31 + text.charCodeAt(i)) | 0;
  }
  const rng = mulberry32(Math.abs(seed));

  // Split into paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  // ── Phase 5: Paragraph structure disruption (operates on paragraphs) ──
  const restructured = disruptParagraphs(paragraphs);

  // ── Process each paragraph through sentence-level phases ──
  const processedParagraphs: string[] = [];

  for (const para of restructured) {
    const trimmed = para.trim();

    // Skip title-like lines
    if (trimmed.split(/\s+/).length < 8 && !/[.!?]/.test(trimmed)) {
      processedParagraphs.push(trimmed);
      continue;
    }

    let sentences = robustSentenceSplit(trimmed);
    if (sentences.length < 3) {
      processedParagraphs.push(trimmed);
      continue;
    }

    // Phase 1: Break AI sentence templates
    sentences = breakAITemplates(sentences, rng);

    // Phase 2: Front trailing clauses
    sentences = frontClauses(sentences, rng);

    // Phase 3: Rhetorical questions — DISABLED to preserve 1:1 sentence mapping
    // sentences = injectQuestions(sentences, rng);

    // Phase 4: Concessives & hedging — DISABLED to preserve 1:1 sentence mapping
    // sentences = injectConcessives(sentences, rng);

    // Phase 6: Sentence length diversification — DISABLED to preserve 1:1 sentence mapping
    // (was adding short observations and merging sentences)
    // sentences = diversifyLengths(sentences, rng);

    // Phase 7: Split overly long sentences — DISABLED to preserve 1:1 sentence mapping
    // sentences = splitLongSentences(sentences);

    // Phase 8: Safe vocabulary enrichment
    sentences = enrichVocabulary(sentences, rng);

    // Phase 9: Contraction expansion (enforce zero contractions)
    sentences = expandAllContractions(sentences);

    // Phase 10: Punctuation + starter diversity
    sentences = diversifyPunctuation(sentences, rng);
    sentences = diversifyStarters(sentences);

    processedParagraphs.push(sentences.join(" "));
  }

  return processedParagraphs.join("\n\n");
}
