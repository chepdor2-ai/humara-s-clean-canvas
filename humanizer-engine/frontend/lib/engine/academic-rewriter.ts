/**
 * ACADEMIC SENTENCE REWRITER
 * ===========================
 * Structural sentence-level transforms modeled on pre-2000 scholarly prose.
 *
 * Philosophy: Detectors flag STATISTICAL PATTERNS, not individual words.
 *   - Uniform sentence length → vary it (burstiness)
 *   - Predictable word sequences → reorder clauses and change voice
 *   - Over-hedging → direct assertions with strategic qualifiers
 *   - Uniform complexity → mix simple + complex sentences
 *
 * This module does NOT do word-level synonym replacement.
 * It changes STRUCTURE: voice, clause order, sentence splits/joins,
 * and academic construction patterns.
 */

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ══════════════════════════════════════════════════════════════════
// 1. SENTENCE-LEVEL PATTERN REWRITES
// ══════════════════════════════════════════════════════════════════
// Match common AI constructions → rewrite as pre-2000 academic prose.
// Each pattern: [regex, array of replacement templates]
// Use $1, $2 etc for captured groups.

const SENTENCE_PATTERNS: [RegExp, string[]][] = [
  // ── AI Purpose/Aim statements ──
  [/^The (?:primary |main |central )?(?:purpose|aim|goal|objective) of this (?:study|research|paper|investigation|work) is to (.+)/i,
    ['This investigation sets out to $1', 'The present work undertakes to $1', 'This paper seeks to $1', 'The inquiry reported here attempts to $1']],

  [/^This (?:study|research|paper|investigation) (?:aims|seeks|attempts|endeavors) to (.+)/i,
    ['The present analysis sets out to $1', 'This paper undertakes to $1', 'This investigation seeks to $1']],

  [/^The (?:study|research) aims to (.+)/i,
    ['The investigation sets out to $1', 'This paper undertakes to $1', 'The present inquiry seeks to $1']],

  // ── "It is [adjective] to" hedging ──
  [/^It is (?:important|essential|crucial|necessary|vital) to (?:note|recognize|acknowledge|understand) that (.+)/i,
    ['$1', 'One observes that $1', 'The evidence indicates that $1']],

  [/^It is (?:widely |generally )?(?:acknowledged|recognized|accepted|known|understood) that (.+)/i,
    ['A body of evidence supports the position that $1', 'The literature establishes that $1', '$1']],

  // ── "Understanding X is important" type ──
  [/^Understanding (.+?) is (?:crucial|essential|important|vital|key) (?:for|to|in) (.+)/i,
    ['A grasp of $1 bears directly on $2', 'Knowledge of $1 informs $2', '$1 has direct implications for $2']],

  // ── "X plays a [adj] role in Y" ──
  [/(.+?) plays (?:a |an )?(?:crucial|vital|key|significant|important|critical|central|essential|pivotal) role in (.+)/i,
    ['$1 is central to $2', '$1 figures prominently in $2', '$1 shapes $2', '$1 bears directly on $2']],

  // ── "X has a significant impact on Y" ──
  [/(.+?) has (?:a |an )?(?:significant|major|profound|notable|considerable|substantial) (?:impact|effect|influence) on (.+)/i,
    ['$1 affects $2', '$1 influences $2 in measurable ways', '$1 acts on $2']],

  // ── "In recent years, X has become Y" ──
  [/^In recent years,?\s*(.+?) (?:has|have) (?:become|grown|emerged as) (.+)/i,
    ['$1 has gained prominence as $2', 'The topic of $1 now occupies a notable position as $2', '$1 stands as $2 in current scholarship']],

  // ── "X provides valuable insights into Y" ──
  [/(.+?) provides? (?:valuable |important |useful |critical )?(?:insights?|information|understanding) (?:into|about|regarding|concerning) (.+)/i,
    ['$1 illuminates $2', '$1 contributes to the understanding of $2', 'Through $1 one gains perspective on $2']],

  // ── "Ultimately, X" (AI conclusion marker) ──
  [/^Ultimately,?\s*(.+)/i,
    ['In the final analysis, $1', '$1', 'Taken together, $1']],

  // ── "Overall, X" (AI summary marker) ──
  [/^Overall,?\s*(.+)/i,
    ['Taken as a whole, $1', '$1', 'On balance, $1']],

  // ── "In conclusion, X" ──
  [/^In conclusion,?\s*(.+)/i,
    ['To summarize the foregoing, $1', '$1', 'The preceding analysis indicates that $1']],

  // ── "X can be attributed to Y" passive ──
  [/(.+?) can be attributed to (.+)/i,
    ['$2 accounts for $1', '$2 explains $1', 'One may attribute $1 to $2']],

  // ── "There is a growing need for X" ──
  [/^There is (?:a )?(?:growing|increasing|pressing|urgent) need (?:for|to) (.+)/i,
    ['The need for $1 has intensified', 'Conditions now require $1', 'Present circumstances call for $1']],

  // ── "X is considered to be Y" weak passive ──
  [/(.+?) is (?:considered|regarded|seen|viewed) (?:to be |as )?(.+)/i,
    ['$1 is $2', 'Scholars treat $1 as $2', '$1 qualifies as $2']],

  // ── "This highlights the importance of X" ──
  [/This (?:highlights?|underscores?|emphasizes?|demonstrates?) the (?:importance|significance|relevance|need) of (.+)/i,
    ['The importance of $1 emerges clearly from this analysis', '$1 thus warrants close attention', 'One notes the bearing of $1 on the present discussion']],

  // ── "X and Y are closely related" ──
  [/(.+?) and (.+?) are (?:closely |strongly |deeply )?(?:related|connected|linked|intertwined|interrelated)/i,
    ['A connection exists between $1 and $2', '$1 and $2 are bound in practice', 'The relationship between $1 and $2 is well established']],

  // ── "By [gerund], X aims to Y" ──
  [/^By (\w+ing .+?),?\s*(.+?) (?:aims?|seeks?|intends?|attempts?) to (.+)/i,
    ['Through $1, $2 $3', '$2, by $1, $3', 'Employing $1, $2 $3']],

  // ── "The findings suggest/indicate/demonstrate that X" ──
  [/^(?:The |These |Our )?(?:findings|results|data|evidence|outcomes) (?:suggest|indicate|demonstrate|show|reveal|confirm) that (.+)/i,
    ['Data from this analysis indicate that $1', 'The evidence points to the conclusion that $1', 'Analysis reveals that $1']],

  // ── "X contributes to Y" ──
  [/(.+?) contributes? (?:significantly |meaningfully |substantially )?to (?:a )?(?:better|deeper|more comprehensive|greater|further) understanding of (.+)/i,
    ['$1 advances knowledge of $2', '$1 enriches the account of $2', 'Through $1 the picture of $2 becomes clearer']],
];

// ══════════════════════════════════════════════════════════════════
// 2. STRUCTURAL TRANSFORMS
// ══════════════════════════════════════════════════════════════════

/**
 * Convert active voice to passive (strategic, not blanket).
 * "Researchers demonstrated X" → "X was demonstrated by researchers"
 */
function activeToPassive(sentence: string): string {
  // Pattern: [Subject] [verb-ed] [object]
  const m = sentence.match(
    /^(The (?:researchers?|authors?|investigators?|analysts?|study|findings?|results?|data|evidence|analysis))\s+(demonstrate[ds]?|show[eds]?|reveal[eds]?|indicate[ds]?|confirm[eds]?|establish(?:es|ed)?|identif(?:y|ied|ies)|highlight[eds]?|suggest[eds]?)\s+(?:that\s+)?(.+)/i
  );
  if (m) {
    const [, subj, verb, obj] = m;
    // Simple passive construction
    const pastPart = verb.replace(/es?$/i, 'ed').replace(/ied$/i, 'ied').replace(/s$/i, 'ed');
    if (obj.length > 20) {
      return `It was ${pastPart} by ${subj.toLowerCase()} that ${obj}`;
    }
  }
  return sentence;
}

/**
 * Front a subordinate clause for variety.
 * "X because Y" → "Because Y, X"
 * "X although Y" → "Although Y, X"
 */
function frontSubordinateClause(sentence: string): string {
  // Check if the sentence has a subordinate clause at the end
  const subordinators = /,?\s*(because|although|though|whereas|while|since|given that|provided that|unless|if)\s+(.+)/i;
  const m = sentence.match(subordinators);
  if (m && m.index && m.index > 15) {
    const mainClause = sentence.substring(0, m.index).trim();
    const conjunction = m[1];
    const subClause = m[2].replace(/\.\s*$/, '');
    // Capitalize the conjunction
    const cap = conjunction.charAt(0).toUpperCase() + conjunction.slice(1);
    return `${cap} ${subClause}, ${mainClause.charAt(0).toLowerCase()}${mainClause.slice(1)}.`;
  }
  return sentence;
}

/**
 * Split a long compound sentence into two sentences.
 * "X, and Y" → "X. Y" (when both clauses are independent)
 */
function splitCompound(sentence: string): string {
  const words = sentence.split(/\s+/);
  if (words.length < 20) return sentence; // Only split long sentences

  // Find ", and " or "; " that splits two independent clauses
  const splitPoints = [
    /,\s+and\s+(?:the |this |these |those |it |such |a |an )/i,
    /;\s+(?:the |this |these |those |it |such |a |an |however|moreover|furthermore)/i,
  ];

  for (const sp of splitPoints) {
    const m = sentence.match(sp);
    if (m && m.index && m.index > 30 && m.index < sentence.length - 30) {
      const first = sentence.substring(0, m.index).trim();
      let second = sentence.substring(m.index + m[0].length).trim();
      // Capitalize second sentence
      second = second.charAt(0).toUpperCase() + second.slice(1);
      // Ensure first ends with period
      const firstEnding = first.replace(/[,;]\s*$/, '') + '.';
      return `${firstEnding} ${second}`;
    }
  }
  return sentence;
}

/**
 * Combine two short adjacent sentences (called on pairs).
 * "X. Y" → "X, and Y" or "X; moreover, Y"
 */
export function combineShortSentences(s1: string, s2: string): string | null {
  const w1 = s1.split(/\s+/).length;
  const w2 = s2.split(/\s+/).length;

  // Only combine if both are short
  if (w1 > 12 || w2 > 12 || w1 + w2 > 22) return null;

  const clean1 = s1.replace(/[.!?]\s*$/, '');
  const lower2 = s2.charAt(0).toLowerCase() + s2.slice(1);

  // Choose a connector based on content
  const connectors = [', and ', '; ', ', while '];
  return `${clean1}${pick(connectors)}${lower2}`;
}

// ══════════════════════════════════════════════════════════════════
// 3. ACADEMIC CONSTRUCTION PATTERNS (pre-2000 style)
// ══════════════════════════════════════════════════════════════════

/**
 * Insert academic qualifiers that pre-2000 papers use.
 * These add complexity and vary the sentence structure.
 */
function addAcademicQualifier(sentence: string): string {
  // DISABLED: Was injecting unnatural parentheticals like "as noted in the literature",
  // "at least in part", "to varying degrees" into clean sentences
  return sentence;
}

/**
 * Convert common AI "listing" patterns to prose.
 * "First, X. Second, Y. Third, Z" → proper academic paragraph flow
 */
function delistify(sentence: string): string {
  // Remove numeric listing prefixes
  return sentence
    .replace(/^(?:First(?:ly)?|Second(?:ly)?|Third(?:ly)?|Fourth(?:ly)?|Lastly|Finally),?\s*/i, '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^\d+[.)]\s*/, '');
}

// ══════════════════════════════════════════════════════════════════
// 4. BURSTINESS INJECTION
// ══════════════════════════════════════════════════════════════════
// AI text has very uniform sentence lengths. Real academic writing
// mixes long complex sentences with short declarative ones.

const SHORT_ACADEMIC_INSERTS = [
  'This distinction matters.',
  'The evidence is clear on this point.',
  'Two considerations arise.',
  'A qualification is warranted.',
  'The pattern holds across studies.',
  'This merits closer attention.',
  'The implication is straightforward.',
  'One qualification is in order.',
  'Such a pattern recurs in the literature.',
  'The data bear this out.',
  'This deserves emphasis.',
  'A brief elaboration is necessary.',
  'The reasoning follows directly.',
  'This observation is not trivial.',
  'Several factors converge here.',
];

/**
 * Inject burstiness — DISABLED: injecting fabricated sentences destroys meaning fidelity.
 * Sentence length variance should come from restructuring, not from adding content.
 */
export function injectBurstiness(sentences: string[]): string[] {
  return sentences;
}

// ══════════════════════════════════════════════════════════════════
// 5. OVER-HEDGING REMOVAL
// ══════════════════════════════════════════════════════════════════
// AI text hedges excessively. Remove redundant hedges.

function removeOverHedging(sentence: string): string {
  return sentence
    // "It is important to mention that X" → "X"
    .replace(/^It is (?:important|worth mentioning|necessary|essential|relevant) (?:to (?:mention|note|point out|observe|highlight|emphasize) that|that)\s*/i, '')
    // "It can be argued that X" → "X"
    .replace(/^It (?:can|could|may|might) be (?:argued|said|suggested|noted|observed|maintained) that\s*/i, '')
    // "There is no doubt that X" → "X"
    .replace(/^There is (?:no|little) doubt that\s*/i, '')
    // "It goes without saying that X" → "X"
    .replace(/^It goes without saying that\s*/i, '')
    // "Needless to say, X" → "X"
    .replace(/^Needless to say,?\s*/i, '');
}

// ══════════════════════════════════════════════════════════════════
// 6. EXCESSIVE CONNECTOR REMOVAL
// ══════════════════════════════════════════════════════════════════
// AI stacks connectors at sentence starts. Remove excess ones while
// keeping a natural density (~1 per 3-4 sentences).

const CONNECTOR_RE = /^(?:Furthermore|Moreover|Additionally|In addition|Besides|Likewise|Similarly|Equally|Correspondingly|Analogously),?\s*/i;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _connectorCount = 0;
let sentencesSinceConnector = 0;

export function resetConnectorTracking(): void {
  _connectorCount = 0;
  sentencesSinceConnector = 0;
}

function manageConnectors(sentence: string): string {
  sentencesSinceConnector++;

  if (CONNECTOR_RE.test(sentence)) {
    // Allow a connector every 3-4 sentences; strip excess
    if (sentencesSinceConnector < 3) {
      sentence = sentence.replace(CONNECTOR_RE, '');
      // Capitalize first letter after removal
      if (sentence.length > 0) {
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      }
    } else {
      _connectorCount++;
      sentencesSinceConnector = 0;
    }
  }

  return sentence;
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ══════════════════════════════════════════════════════════════════

/**
 * Rewrite a single sentence using academic structural patterns.
 * This is the core per-sentence transform.
 */
export function academicRewrite(sentence: string): string {
  if (!sentence || sentence.length < 20) return sentence;

  let result = sentence;

  // Step 1: Remove over-hedging (AI verbosity)
  result = removeOverHedging(result);
  if (result.length < 5 && sentence.length > 20) result = sentence; // safety

  // Step 2: Apply sentence-level patterns (first match only)
  for (const [pattern, templates] of SENTENCE_PATTERNS) {
    if (pattern.test(result)) {
      const rewritten = result.replace(pattern, pick(templates));
      if (rewritten !== result && rewritten.length > 10) {
        result = rewritten;
        break;
      }
    }
  }

  // Step 3: Remove listing prefixes
  result = delistify(result);

  // Step 4: Manage connector density
  result = manageConnectors(result);

  // Step 5: Structural transforms (one per sentence, probabilistic)
  const roll = Math.random();
  if (roll < 0.15) {
    // 15% chance: front a subordinate clause
    const fronted = frontSubordinateClause(result);
    if (fronted !== result) result = fronted;
  } else if (roll < 0.25) {
    // 10% chance: active → passive
    const passived = activeToPassive(result);
    if (passived !== result) result = passived;
  } else if (roll < 0.35) {
    // 10% chance: split a long compound sentence
    const split = splitCompound(result);
    if (split !== result) result = split;
  }

  // Step 6: Academic qualifier insertion (25% chance, handled inside)
  result = addAcademicQualifier(result);

  // Ensure first character is uppercase
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // Ensure sentence ends with punctuation
  if (result.length > 0 && !/[.!?]$/.test(result.trim())) {
    result = result.trim() + '.';
  }

  return result;
}

/**
 * Document-level academic post-processing.
 * Applies burstiness and cross-sentence coherence.
 */
export function academicPostProcess(text: string): string {
  if (!text || text.length < 50) return text;

  // Reset tracking
  resetConnectorTracking();

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const cleaned = sentences.map(s => s.trim()).filter(s => s.length > 0);

  // Inject burstiness (short sentences after long ones)
  const bursty = injectBurstiness(cleaned);

  return bursty.join(' ');
}
