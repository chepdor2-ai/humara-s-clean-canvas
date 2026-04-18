/**
 * AntiPangram — Sentence Surgeon
 * ================================
 * Sentence-level transforms that break AI detection signals.
 * Each transform targets a specific Pangram detection feature.
 *
 * Strategy: Apply transforms selectively based on the sentence's
 * AI signal profile. Only modify what triggers detection.
 */

import type { SentenceProfile, DocumentContext } from './types';

// ═══════════════════════════════════════════════════════════════════
// 1. CONNECTOR DISRUPTION
//    Formal connectors at sentence start are the #1 Pangram signal.
//    Strategy: Remove, absorb into clause, or replace with nothing.
// ═══════════════════════════════════════════════════════════════════

const CONNECTOR_REMOVALS: Record<string, string[]> = {
  'furthermore': [''],
  'moreover': [''],
  'additionally': [''],
  'consequently': ['this meant'],
  'nevertheless': ['still'],
  'nonetheless': ['still'],
  'subsequently': ['then'],
  'accordingly': ['so'],
  'therefore': ['so'],
  'however': ['but'],
  'thus': ['so'],
  'hence': ['so'],
  'indeed': [''],
  'notably': [''],
  'specifically': [''],
  'in contrast': ['but'],
  'by contrast': ['but'],
  'as a result': ['so'],
  'in addition': ['also'],
  'for example': [''],
  'for instance': [''],
  'on the other hand': ['but'],
  'in other words': [''],
  'to begin with': [''],
  'in particular': [''],
  'as such': ['so'],
  'in essence': [''],
  'in summary': [''],
  'in conclusion': [''],
  'first and foremost': ['first'],
};

export function disruptConnector(sentence: string, profile: SentenceProfile): string {
  if (!profile.hasConnector || !profile.connectorType) return sentence;

  const connLower = profile.connectorType.toLowerCase();
  const replacements = CONNECTOR_REMOVALS[connLower];
  if (!replacements) return sentence;

  const replacement = replacements[Math.floor(Math.random() * replacements.length)];

  // Remove the connector and its trailing comma/space
  const connectorRe = new RegExp(
    `^${escapeRegExp(profile.connectorType)}[,;]?\\s*`,
    'i'
  );

  let result = sentence.replace(connectorRe, '').trim();

  if (replacement) {
    // Insert replacement at start
    result = replacement.charAt(0).toUpperCase() + replacement.slice(1) +
      (result.charAt(0) === result.charAt(0).toUpperCase() ? ' ' + result.charAt(0).toLowerCase() + result.slice(1) : ' ' + result);
  } else {
    // Just capitalize the remaining text
    if (result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 2. EVALUATIVE PHRASE SURGERY
//    "One of the major strengths of CBT is its practical approach"
//    → "CBT takes a practical approach"
//    "plays a crucial role in" → "shapes" / "affects"
// ═══════════════════════════════════════════════════════════════════

const EVALUATIVE_SURGERIES: Array<{ pattern: RegExp; replaceFn: (match: string, ...groups: string[]) => string }> = [
  {
    // "One of the major/key/most important strengths/advantages of X is"
    pattern: /\b[Oo]ne of the (?:major|key|most important|primary|greatest|significant) (?:strengths|advantages|benefits|features) of (.+?) is (?:its |that it |the fact that it )?/gi,
    replaceFn: (_m, subject) => `${subject.trim()} `,
  },
  {
    // "plays a crucial/vital/key role in [verb]ing"
    pattern: /\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical|fundamental|central|essential|major) role in\b/gi,
    replaceFn: () => {
      const alts = ['shapes', 'affects', 'influences', 'helps with', 'contributes to'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is widely used in the treatment of" → "It treats" / "Doctors use it for"
    pattern: /\b[Ii]t is widely used in the treatment of\b/gi,
    replaceFn: () => {
      const alts = ['It treats', 'Doctors use it for', 'It is used to treat'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "which contributes to better X and Y" → simplify
    pattern: /,?\s*which contributes? to (?:better |improved |enhanced |greater |stronger |more effective )?/gi,
    replaceFn: () => {
      const alts = [', improving', ', and this helps', '. This supports'];
      return alts[Math.floor(Math.random() * alts.length)] + ' ';
    },
  },
  {
    // "By understanding X, individuals can learn how to Y"
    pattern: /\b[Bb]y (?:understanding|recognizing|identifying|addressing|examining|exploring) (?:these |this |the )?([\w\s]+?),\s*(?:individuals|people|patients|students|learners) can (?:learn (?:how )?to |begin to |start to )?/gi,
    replaceFn: (_m, topic) => {
      const alts = [
        `Understanding ${topic.trim()} helps people `,
        `Knowing about ${topic.trim()} means people can `,
        `With a grasp of ${topic.trim()}, it becomes easier to `,
      ];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "Through guided sessions, people learn how to"
    pattern: /\b[Tt]hrough (?:guided |structured |regular |ongoing )?sessions?,?\s*(?:people|individuals|patients|clients|learners) (?:learn|are taught|develop the ability|gain the ability) (?:how )?to\b/gi,
    replaceFn: () => {
      const alts = [
        'In sessions, people pick up ways to',
        'Sessions teach people to',
        'With practice in sessions, people learn to',
      ];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "Research has shown that X significantly improves"
    pattern: /\b[Rr]esearch has shown that\b/gi,
    replaceFn: () => {
      const alts = ['Studies show', 'Evidence shows', 'Research shows', 'The data suggests'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is based on the idea that"
    pattern: /\b[Ii]t is based on the idea that\b/gi,
    replaceFn: () => {
      const alts = ['The idea is that', 'The premise is that', 'It works on the basis that'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "As a result, people become more confident in"
    pattern: /\b[Aa]s a result,?\s*(?:people|individuals|patients) become (?:more )?/gi,
    replaceFn: () => {
      const alts = ['People end up ', 'This makes people ', 'So people get '];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
];

export function surgicalEvaluativeRewrite(sentence: string): string {
  let result = sentence;
  for (const { pattern, replaceFn } of EVALUATIVE_SURGERIES) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replaceFn);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 3. PARALLEL STRUCTURE BREAKER
//    "manage stress, control emotional reactions, and improve X"
//    → break into separate clauses or use different syntax
// ═══════════════════════════════════════════════════════════════════

export function breakParallelStructure(sentence: string): string {
  // Pattern: "verb X, verb Y, and verb Z" — break into two sentences or use different conjunction
  const tripleVerb = sentence.match(/(\w+)\s+([\w\s]+?),\s+(\w+)\s+([\w\s]+?),?\s+and\s+(\w+)\s+([\w\s]+?)([.!?])$/i);
  if (tripleVerb) {
    const [, v1, o1, v2, o2, v3, o3, punct] = tripleVerb;
    const strategies = [
      // Split into two sentences
      () => {
        const base = sentence.slice(0, tripleVerb.index!);
        return `${base}${v1} ${o1} and ${v2} ${o2}${punct} It also helps ${v3} ${o3}${punct}`;
      },
      // Use "as well as" instead of parallel
      () => {
        const base = sentence.slice(0, tripleVerb.index!);
        return `${base}${v1} ${o1}, ${v2} ${o2} as well as ${v3} ${o3}${punct}`;
      },
    ];
    return strategies[Math.floor(Math.random() * strategies.length)]();
  }

  // Pattern: "X, Y, Z, and W" noun enumeration — vary with "along with" or split
  const nounList = sentence.match(/\b((?:\w+(?:\s+\w+)?),\s+(?:\w+(?:\s+\w+)?),\s+(?:\w+(?:\s+\w+)?),?\s+and\s+(?:\w+(?:\s+\w+)?))\b/i);
  if (nounList) {
    const items = nounList[1].split(/,\s+/).map(s => s.replace(/^and\s+/i, '').trim());
    if (items.length >= 4) {
      const half1 = items.slice(0, 2).join(' and ');
      const half2 = items.slice(2).join(' and ');
      const result = sentence.replace(nounList[1], `${half1}, along with ${half2}`);
      return result;
    }
  }

  return sentence;
}

// ═══════════════════════════════════════════════════════════════════
// 4. NOMINALIZATION UNPACKER
//    "emotional regulation and mental well-being" →
//    "regulating emotions and staying mentally healthy"
// ═══════════════════════════════════════════════════════════════════

const NOMINALIZATION_UNPACKS: Record<string, string[]> = {
  'emotional regulation': ['regulating emotions', 'managing emotions', 'keeping emotions in check'],
  'mental well-being': ['staying mentally healthy', 'mental health', 'mental fitness'],
  'emotional stability': ['staying emotionally stable', 'emotional balance', 'keeping emotions steady'],
  'decision-making': ['making decisions', 'deciding', 'how people decide'],
  'problem-solving': ['solving problems', 'working through problems', 'fixing issues'],
  'self-control': ['controlling oneself', 'discipline', 'restraint'],
  'long-term emotional stability': ['lasting emotional balance', 'being emotionally stable over time'],
  'emotional reactions': ['how people react', 'reactions', 'emotional responses'],
  'coping strategies': ['ways to cope', 'coping methods', 'tools for coping'],
  'coping mechanisms': ['ways of coping', 'coping methods', 'tools to handle things'],
  'thinking patterns': ['how people think', 'thought habits', 'ways of thinking'],
  'negative behavior': ['bad habits', 'harmful behavior', 'destructive patterns'],
  'psychological difficulties': ['mental struggles', 'emotional challenges', 'mental difficulties'],
  'mental health conditions': ['mental health issues', 'conditions like anxiety or depression', 'psychological issues'],
  'functioning and quality of life': ['how well people function and feel', 'daily life and overall health'],
};

export function unpackNominalizations(sentence: string): string {
  let result = sentence;
  for (const [nominal, replacements] of Object.entries(NOMINALIZATION_UNPACKS)) {
    const re = new RegExp(`\\b${escapeRegExp(nominal)}\\b`, 'gi');
    if (re.test(result)) {
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(re, replacement);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 5. SENTENCE LENGTH SURGEON
//    Split long uniform sentences or merge short ones
//    Target: create burstiness (CV > 0.4)
// ═══════════════════════════════════════════════════════════════════

export function splitLongSentence(sentence: string): string[] {
  const words = sentence.split(/\s+/);
  if (words.length < 20) return [sentence];

  // Strategy 1: Split at non-restrictive "which/where/who" clauses (preceded by comma)
  // Do NOT split at "that" — those are restrictive clauses and splitting breaks grammar
  const relMatch = sentence.match(/^(.{30,}?),\s+(which|where|who)\s+(.+)$/i);
  if (relMatch) {
    const [, main, _rel, rest] = relMatch;
    const mainClean = main.trim().replace(/,$/, '').trim();
    const mainPunct = /[.!?]$/.test(mainClean) ? mainClean : mainClean + '.';
    const restCap = rest.charAt(0).toUpperCase() + rest.slice(1);
    const restPunct = /[.!?]$/.test(restCap) ? restCap : restCap + '.';
    // Only split if both parts are substantial
    if (mainClean.split(/\s+/).length >= 6 && rest.split(/\s+/).length >= 6) {
      return [mainPunct, 'This ' + restPunct.charAt(0).toLowerCase() + restPunct.slice(1)];
    }
  }

  // Strategy 2: Split at coordinating conjunction ONLY when it joins independent clauses
  // The part after the conjunction must start with a subject (article, pronoun, proper noun)
  const independentClauseStart = /^(?:the|a|an|this|that|these|those|it|they|he|she|we|you|I|its|their|his|her|our|my|your|there|here|most|many|some|all|each|both|every|such|several|no|any|one|two|three|people|companies|organizations|students|individuals|researchers|scientists|experts|businesses|governments)\b/i;
  const conjMatch = sentence.match(/^(.{25,}?),\s+(and|but|so|yet)\s+(.{15,})$/i);
  if (conjMatch) {
    const [, part1, _conj, part2] = conjMatch;
    // Only split if part2 starts with an independent clause subject
    if (independentClauseStart.test(part2.trim())) {
      const p1 = part1.trim().replace(/,$/, '').trim();
      const p1Punc = /[.!?]$/.test(p1) ? p1 : p1 + '.';
      const p2Cap = part2.charAt(0).toUpperCase() + part2.slice(1);
      return [p1Punc, p2Cap];
    }
  }

  // Strategy 3: Split at ", yet/but " (almost always joins independent clauses)
  const yetMatch = sentence.match(/^(.{20,}?),\s+(yet|but)\s+(.{15,})$/i);
  if (yetMatch && yetMatch[1].split(/\s+/).length >= 6) {
    const [, part1, _conj, part2] = yetMatch;
    const p1 = part1.trim().replace(/,$/, '').trim() + '.';
    const p2Cap = part2.charAt(0).toUpperCase() + part2.slice(1);
    return [p1, p2Cap];
  }

  return [sentence];
}

export function mergeShortSentences(sent1: string, sent2: string): string | null {
  const w1 = sent1.split(/\s+/).length;
  const w2 = sent2.split(/\s+/).length;

  // Only merge if both are short and combined is reasonable
  if (w1 > 12 || w2 > 12 || w1 + w2 > 25) return null;

  const s1Clean = sent1.replace(/[.!?]$/, '').trim();
  const s2Lower = sent2.charAt(0).toLowerCase() + sent2.slice(1);

  // Use a simple conjunction
  const conjunctions = [' and ', ', and ', ' while also ', '; '];
  const conj = conjunctions[Math.floor(Math.random() * conjunctions.length)];

  return s1Clean + conj + s2Lower;
}

// ═══════════════════════════════════════════════════════════════════
// 6. REGISTER MICRO-SHIFTER
//    Insert subtle formality shifts within paragraphs
// ═══════════════════════════════════════════════════════════════════

const REGISTER_SHIFTS: Array<{ pattern: RegExp; casual: string[]; formal: string[] }> = [
  {
    pattern: /\bindividuals\b/gi,
    casual: ['people', 'someone'],
    formal: ['persons', 'individuals'],
  },
  {
    pattern: /\butilize\b/gi,
    casual: ['use'],
    formal: ['employ'],
  },
  {
    pattern: /\bfacilitate\b/gi,
    casual: ['help', 'allow'],
    formal: ['enable', 'support'],
  },
  {
    pattern: /\benhance\b/gi,
    casual: ['improve', 'boost'],
    formal: ['strengthen', 'augment'],
  },
  {
    pattern: /\baddress\b/gi,
    casual: ['deal with', 'handle'],
    formal: ['tackle', 'confront'],
  },
  {
    pattern: /\benables\b/gi,
    casual: ['lets', 'allows'],
    formal: ['permits', 'empowers'],
  },
  {
    pattern: /\bdemonstrate\b/gi,
    casual: ['show', 'prove'],
    formal: ['illustrate', 'establish'],
  },
];

export function applyRegisterShift(sentence: string, targetShift: 'casual' | 'formal'): string {
  let result = sentence;
  for (const rule of REGISTER_SHIFTS) {
    if (rule.pattern.test(result)) {
      const replacements = targetShift === 'casual' ? rule.casual : rule.formal;
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, replacement);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 7. COMPOUND SENTENCE SIMPLIFIER
//    "X because it addresses how thoughts influence feelings and actions"
//    → "X. It looks at how thoughts affect feelings and actions."
// ═══════════════════════════════════════════════════════════════════

const COMPOUND_SIMPLIFIERS: Array<{ pattern: RegExp; replaceFn: (m: string, ...g: string[]) => string }> = [
  {
    // "because it addresses/examines/explores how X influence Y and Z"
    pattern: /\bbecause it (?:addresses|examines|explores|considers|investigates|looks at) how ([\w\s]+?) (?:influence|affect|impact|shape) ([\w\s]+?) and ([\w\s]+?)([.!?])/gi,
    replaceFn: (_m, x, y, z, punct) => {
      return `. It looks at how ${x.trim()} affect ${y.trim()} and ${z.trim()}${punct}`;
    },
  },
  {
    // "allowing/enabling/helping X to Y in a more Z way"
    pattern: /,?\s*(?:allowing|enabling|helping|letting) (?:them|individuals|people|patients) to (.+?) in a (?:more )?(\w+) (?:and (?:more )?(\w+) )?way/gi,
    replaceFn: (_m, action, adj1, adj2) => {
      const adjPart = adj2 ? `${adj1} and ${adj2}` : adj1;
      return `. This helps them ${action.trim()} in a ${adjPart} way`;
    },
  },
];

export function simplifyCompoundSentence(sentence: string): string {
  let result = sentence;
  for (const { pattern, replaceFn } of COMPOUND_SIMPLIFIERS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replaceFn);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
