/**
 * Phase 12 — Deep Clean
 * ========================
 * Final aggressive pass — catches ANY remaining AI fingerprints.
 *
 * This phase runs AFTER all transformations and before final formatting.
 * It's a safety net that catches patterns the earlier phases missed.
 *
 * Strategy:
 *   1. Scan for any surviving AI marker words and kill them
 *   2. Break any remaining uniform sentence patterns
 *   3. Ensure no two consecutive sentences start the same way
 *   4. Verify burstiness is above threshold
 *   5. Remove any "tell" patterns that detectors flag
 *   6. Final vocabulary diversification pass
 *   7. Ensure paragraph variety
 */

import type { DocumentState, Phase } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── SURVIVING AI WORDS (final kill list — even these individual words flag detectors) ──
const FINAL_KILL_WORDS: Record<string, string[]> = {
  comprehensive: ['thorough', 'full-scope', 'wall-to-wall', 'top-to-bottom'],
  innovative: ['inventive', 'novel', 'fresh-thinking', 'unorthodox'],
  facilitate: ['make possible', 'smooth the way for', 'clear a path for', 'open the door to'],
  enhance: ['sharpen', 'strengthen', 'deepen', 'build on'],
  optimize: ['refine', 'tune', 'hone', 'tighten'],
  streamline: ['simplify', 'trim', 'clean up', 'pare down'],
  paradigm: ['model', 'template', 'mold', 'pattern'],
  robust: ['solid', 'hard-wearing', 'dependable', 'tough'],
  holistic: ['whole-picture', 'all-encompassing', 'complete', 'all-round'],
  synergy: ['combined effect', 'joint force', 'mutual reinforcement', 'teamwork'],
  nuanced: ['layered', 'textured', 'fine-grained', 'subtle'],
  multifaceted: ['many-sided', 'complex', 'varied', 'compound'],
  overarching: ['broad', 'sweeping', 'dominant', 'blanket'],
  underscore: ['bring home', 'hammer home', 'drive home', 'put a fine point on'],
  trajectory: ['arc', 'path', 'course', 'line'],
  landscape: ['terrain', 'field', 'scene', 'ground'],
  navigate: ['work through', 'find a way through', 'steer past', 'chart a course through'],
  encompass: ['take in', 'cover', 'span', 'stretch across'],
  foster: ['nurture', 'cultivate', 'grow', 'feed'],
  delve: ['dig', 'probe', 'look hard at', 'bore into'],
  realm: ['sphere', 'zone', 'domain', 'territory'],
  discourse: ['conversation', 'debate', 'exchange', 'dialogue'],
  pivotal: ['deciding', 'turning-point', 'make-or-break', 'hinge'],
  integral: ['built-in', 'woven-in', 'core', 'inseparable'],
  imperative: ['a must', 'pressing', 'urgent', 'non-negotiable'],
  profound: ['deep', 'far-reaching', 'sweeping', 'transformative'],
  dynamic: ['shifting', 'fluid', 'living', 'moving'],
  articulate: ['spell out', 'put into words', 'voice', 'lay out'],
  cultivate: ['grow', 'build up', 'develop', 'tend to'],
  exemplify: ['typify', 'embody', 'stand for', 'represent'],
  substantiate: ['back up', 'support', 'confirm', 'shore up'],
  perpetuate: ['keep going', 'carry on', 'prolong', 'feed'],
  delineate: ['map', 'trace', 'sketch', 'mark out'],
  ascertain: ['pin down', 'work out', 'find', 'settle'],
  proliferate: ['spread', 'multiply', 'mushroom', 'balloon'],
  exacerbate: ['make worse', 'deepen', 'compound', 'aggravate'],
  mitigate: ['lessen', 'soften', 'cushion', 'take the edge off'],
  catalyze: ['set off', 'kick-start', 'trigger', 'ignite'],
  juxtapose: ['set beside', 'pair up', 'place alongside', 'put side by side'],
  inherently: ['by its nature', 'at root', 'at bottom', 'fundamentally'],
  predominantly: ['mainly', 'chiefly', 'above all', 'first and foremost'],
  intrinsically: ['at heart', 'deep down', 'in its bones', 'to its core'],
  methodology: ['method', 'procedure', 'way of working', 'technique'],
  noteworthy: ['striking', 'worth a second look', 'telling', 'eye-catching'],
  commendable: ['admirable', 'praiseworthy', 'creditable', 'laudable'],
  exceptional: ['outstanding', 'rare', 'one of a kind', 'standout'],
  evident: ['plain', 'visible', 'in plain sight', 'unmistakable'],
  prominent: ['leading', 'front-rank', 'high-profile', 'well-placed'],
  adequate: ['enough', 'sufficient', 'passable', 'satisfactory'],
  subsequent: ['later', 'following', 'ensuing', 'after that'],
  preliminary: ['early', 'opening', 'first-pass', 'initial'],
  conducive: ['favorable', 'helpful', 'supportive', 'good for'],
  ubiquitous: ['everywhere', 'all-pervasive', 'inescapable', 'wall-to-wall'],
  tangible: ['concrete', 'solid', 'real-world', 'palpable'],
  viable: ['workable', 'doable', 'practical', 'feasible'],
  empirical: ['observed', 'fact-based', 'data-driven', 'grounded'],
  coherent: ['logical', 'consistent', 'unified', 'joined-up'],
};

// ── Pre-compiled FINAL_KILL_WORDS patterns (built once at module load) ──
const COMPILED_FINAL_KILL: { word: string; rx: RegExp; replacements: string[] }[] =
  Object.entries(FINAL_KILL_WORDS).map(([word, replacements]) => ({
    word,
    rx: new RegExp(`\\b${word}(s|es|ed|ing|ly)?\\b`, 'gi'),
    replacements,
  }));

// ── TELL PATTERNS (specific phrases that are near-certain AI markers) ──
const TELL_PATTERNS: [RegExp, string[]][] = [
  [/\bthis (?:is|was|remains) (?:a |an )?(?:testament|reflection|indication|manifestation) (?:of|to)\b/gi, [
    'this points to', 'this says something about', 'this throws light on',
  ]],
  [/\b(?:it |this )(?:is|remains|proves) (?:evident|obvious|clear|apparent) that\b/gi, [
    'clearly,', 'one can see that', 'a look at the record shows',
  ]],
  [/\blies at the (?:heart|core|center|centre) of\b/gi, [
    'sits at the center of', 'drives', 'is the engine behind', 'is central to',
  ]],
  [/\bpaves the way for\b/gi, [
    'opens up', 'clears the ground for', 'sets the stage for', 'makes room for',
  ]],
  [/\bsheds light on\b/gi, [
    'throws light on', 'illuminates', 'brings into focus', 'clears up',
  ]],
  [/\bstands as a testament to\b/gi, [
    'speaks to', 'is proof of', 'bears witness to', 'is living proof of',
  ]],
  [/\brings true\b/gi, [
    'holds', 'stands up', 'has real force', 'carries weight',
  ]],
  [/\bpaints a (?:picture|portrait|vivid) of\b/gi, [
    'captures', 'lays out', 'presents a view of', 'sketches',
  ]],
  [/\bat the (?:intersection|crossroads|confluence) of\b/gi, [
    'where', 'at the meeting point of', 'at the juncture of', 'straddling',
  ]],
  [/\bthe (?:ever-evolving|ever-changing|rapidly evolving|rapidly changing)\b/gi, [
    'the shifting', 'the changing', 'the fast-moving', 'the unsettled',
  ]],
  [/\bdigital (?:age|era|revolution|transformation)\b/gi, [
    'computer age', 'machine era', 'present upheaval', 'technological shift',
  ]],
  [/\bmust not be (?:overlooked|underestimated|ignored|dismissed)\b/gi, [
    'deserves attention', 'should not be brushed aside', 'calls for a closer look', 'warrants notice',
  ]],
  [/\b(?:remains|remain) to be seen\b/gi, [
    'is still an open question', 'has yet to be settled', 'is up in the air', 'is anybody\'s guess',
  ]],
  [/\bcannot be overstated\b/gi, [
    'is hard to exaggerate', 'is enormous', 'looms large', 'is very real',
  ]],
];

/**
 * Ensure no two consecutive sentences start with the same word.
 */
function deduplicateStarters(sentences: { text: string; flags: string[] }[]): void {
  if (sentences.length < 2) return;
  const ALTERNATE_STARTS: string[] = [
    'In turn,', 'By contrast,', 'Equally,', 'Then,', 'Also,',
    'Add to this that', 'Likewise,', 'At the same time,',
    'Take this further:', 'To add to the picture,', 'And yet,',
    'Alongside this,', 'Put another way,', 'In parallel,',
  ];

  for (let i = 1; i < sentences.length; i++) {
    // Skip if sentence is already structurally modified
    if (sentences[i].flags.includes('struct-mod')) continue;

    const prevFirst = sentences[i - 1].text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    const currFirst = sentences[i].text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');

    if (prevFirst && currFirst && prevFirst === currFirst && sentences[i].text.length > 0) {
      const alt = pickRandom(ALTERNATE_STARTS);
      sentences[i].text = `${alt} ${sentences[i].text[0].toLowerCase()}${sentences[i].text.slice(1)}`;
      sentences[i].flags.push('struct-mod');
    }
  }
}

/**
 * Final check: verify burstiness is sufficient.
 * If not, surgically add/split for variance.
 */
function ensureBurstiness(sentences: string[], target: number = 0.75): string[] {
  const lengths = sentences.map(s => s.split(/\s+/).length);
  if (lengths.length < 2) return sentences;

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stddev = Math.sqrt(lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length);
  const burstiness = mean > 0 ? stddev / mean : 0;

  if (burstiness >= target) return sentences;

  // Need more variance: find the most "average" sentence and split it
  const result = [...sentences];
  const diffs = lengths.map((l, i) => ({ idx: i, diff: Math.abs(l - mean) }));
  diffs.sort((a, b) => a.diff - b.diff);

  // Split the most average-length sentence
  for (const { idx } of diffs.slice(0, 2)) {
    const words = result[idx].split(/\s+/);
    if (words.length > 14) {
      // Find a natural split point (comma, conjunction) near mid
      const mid = Math.floor(words.length * 0.45);
      let splitAt = -1;
      for (let j = mid - 3; j <= mid + 3 && j < words.length; j++) {
        if (j < 2) continue;
        const w = words[j].toLowerCase().replace(/[^a-z]/g, '');
        if (words[j].endsWith(',') || ['and', 'but', 'which', 'while', 'however'].includes(w)) {
          splitAt = j;
          break;
        }
      }
      // Only split at a natural break point, not mid-clause
      if (splitAt > 0) {
        const first = words.slice(0, splitAt + 1).join(' ').replace(/,\s*$/, '.');
        let second = words.slice(splitAt + 1).join(' ');
        // Validate: second half must have a verb (not a fragment)
        const hasVerb = /\b(is|are|was|were|has|have|had|does|do|did|can|could|will|would|shall|should|may|might|must)\b/i.test(second);
        const startsWithGerund = /^[A-Z]?\w+ing\b/.test(second.trim());
        if (hasVerb && !startsWithGerund) {
          second = second[0].toUpperCase() + second.slice(1);
          if (!/[.!?]$/.test(second)) second += '.';
          result.splice(idx, 1, first, second);
          break;
        }
      }
    }
  }

  return result;
}

export const deepCleanPhase: Phase = {
  name: 'deepClean',
  async process(state: DocumentState): Promise<DocumentState> {
    let wordKills = 0;
    let tellKills = 0;

    for (const paragraph of state.paragraphs) {
      // 1. Kill surviving AI words
      for (const sentence of paragraph.sentences) {
        let text = sentence.text;

        // Word-level kills (handle plurals and verb forms)
        for (const { word, rx, replacements } of COMPILED_FINAL_KILL) {
          rx.lastIndex = 0;
          const matches = text.match(rx);
          if (matches) {
            for (const m of matches) {
              const suffix = m.slice(word.length).toLowerCase();
              const base = pickRandom(replacements);
              let replacement: string;
              if (suffix === 's' || suffix === 'es') {
                if (!base.includes(' ')) {
                  // Single word: add 's' with proper spelling
                  // Words ending in s, x, z, ch, sh need 'es'
                  if (/(?:s|x|z|ch|sh)$/i.test(base)) {
                    replacement = base + 'es';
                  } else if (/[^aeiou]y$/i.test(base)) {
                    // consonant + y → ies (e.g., "supply" → "supplies")
                    replacement = base.slice(0, -1) + 'ies';
                  } else {
                    replacement = base + 's';
                  }
                } else {
                  // Multi-word: add 's' to the FIRST word (verb form)
                  // "drive home" → "drives home", "stretch across" → "stretches across"
                  const parts = base.split(' ');
                  if (/(?:s|x|z|ch|sh)$/i.test(parts[0])) {
                    parts[0] = parts[0] + 'es';
                  } else if (/[^aeiou]y$/i.test(parts[0])) {
                    parts[0] = parts[0].slice(0, -1) + 'ies';
                  } else {
                    parts[0] = parts[0] + 's';
                  }
                  replacement = parts.join(' ');
                }
              } else {
                replacement = base;
              }
              // Preserve case of first letter
              if (m[0] === m[0].toUpperCase()) {
                replacement = replacement[0].toUpperCase() + replacement.slice(1);
              }
              text = text.replace(m, replacement);
              wordKills++;
            }
          }
        }

        // Tell pattern kills
        for (const [pattern, replacements] of TELL_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            pattern.lastIndex = 0;
            text = text.replace(pattern, () => pickRandom(replacements));
            tellKills++;
          }
        }

        sentence.text = text;
      }

      // 2. Deduplicate sentence starters
      deduplicateStarters(paragraph.sentences);

      // 3. Ensure burstiness
      const finalTexts = paragraph.sentences.map(s => s.text);
      const bursty = ensureBurstiness(finalTexts);
      if (bursty.length !== finalTexts.length) {
        paragraph.sentences = bursty.map((text, i) => ({
          id: paragraph.sentences[i]?.id ?? (paragraph.id * 10000 + i + 500),
          text,
          originalText: paragraph.sentences[i]?.originalText ?? '',
          flags: paragraph.sentences[i]?.flags ?? [],
          score: paragraph.sentences[i]?.score ?? 0,
        }));
      }
    }

    state.logs.push(
      `[deepClean] ${wordKills} AI word kills, ${tellKills} tell kills`
    );
    return state;
  },
};
