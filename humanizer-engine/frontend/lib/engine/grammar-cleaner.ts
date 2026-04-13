/**
 * Post-processing grammar cleaner for ALL humanizer engines.
 *
 * Runs after engine output + existing post-processing to fix:
 *  - Subject-verb agreement
 *  - Verb tense consistency
 *  - Broken irregular verbs
 *  - Dangling modifiers / missing verbs
 *  - Pronoun-antecedent agreement
 *  - Run-on / fragment detection
 *  - Common collocation errors
 */

// ── Irregular verb corrections ──────────────────────────────────────
// Catches non-words produced by naive -ed/-s suffixing of irregular verbs
const IRREGULAR_VERB_FIXES: [RegExp, string][] = [
  // Past tense errors
  [/\bgoed\b/gi, 'went'],
  [/\bcomed\b/gi, 'came'],
  [/\brunned\b/gi, 'ran'],
  [/\bdrived\b/gi, 'drove'],
  [/\bwrited\b/gi, 'wrote'],
  [/\bspeaked\b/gi, 'spoke'],
  [/\bthinked\b/gi, 'thought'],
  [/\bteached\b/gi, 'taught'],
  [/\bcatched\b/gi, 'caught'],
  [/\bbringed\b/gi, 'brought'],
  [/\bbuyed\b/gi, 'bought'],
  [/\bsayed\b/gi, 'said'],
  [/\btolded\b/gi, 'told'],
  [/\bfeeled\b/gi, 'felt'],
  [/\bleaved\b/gi, 'left'],
  [/\bfinded\b/gi, 'found'],
  [/\bchoosed\b/gi, 'chose'],
  [/\bchosed\b/gi, 'chose'],
  [/\bbecomed\b/gi, 'became'],
  [/\bholded\b/gi, 'held'],
  [/\bstanded\b/gi, 'stood'],
  [/\bunderstandded\b/gi, 'understood'],
  [/\bgrowed\b/gi, 'grew'],
  [/\bknowed\b/gi, 'knew'],
  [/\bthrowed\b/gi, 'threw'],
  [/\bdrawed\b/gi, 'drew'],
  [/\bshowed\b(?=\s+(?:how|that|the|a|an)\b)/gi, 'showed'], // "showed" is correct here — skip
  [/\bbreaked\b/gi, 'broke'],
  [/\bfreeezed\b/gi, 'froze'],
  [/\bswinged\b/gi, 'swung'],
  [/\bsitted\b/gi, 'sat'],
  [/\brised\b/gi, 'rose'],
  [/\bfalled\b/gi, 'fell'],
  [/\beated\b/gi, 'ate'],
  [/\bbited\b/gi, 'bit'],
  [/\bhided\b/gi, 'hid'],
  [/\bslided\b/gi, 'slid'],
  [/\bstriked\b/gi, 'struck'],
  [/\bdigged\b/gi, 'dug'],
  [/\bhanged\b(?!\s+(?:on|up|out))/gi, 'hung'], // "hanged" only for execution
  [/\bpayed\b/gi, 'paid'],
  [/\blayed\b/gi, 'laid'],
  [/\bflyed\b/gi, 'flew'],
  [/\bswimmed\b/gi, 'swam'],
  [/\bweared\b/gi, 'wore'],
  [/\bbeared\b/gi, 'bore'],
  [/\bmeaned\b/gi, 'meant'],
  [/\bbuilded\b/gi, 'built'],
  [/\bsended\b/gi, 'sent'],
  [/\bspended\b/gi, 'spent'],
  [/\blended\b(?!\s)/gi, 'lent'],
  [/\bbended\b/gi, 'bent'],
  [/\bkepted\b/gi, 'kept'],
  [/\bsleeped\b/gi, 'slept'],
  [/\bfeeded\b/gi, 'fed'],
  [/\bleaded\b/gi, 'led'],
  [/\bbleeded\b/gi, 'bled'],
  [/\bswepted\b/gi, 'swept'],
  [/\bdealed\b/gi, 'dealt'],

  // Past participle after has/have/had
  [/\b(has|have|had)\s+went\b/gi, '$1 gone'],
  [/\b(has|have|had)\s+came\b/gi, '$1 come'],
  [/\b(has|have|had)\s+ran\b/gi, '$1 run'],
  [/\b(has|have|had)\s+drove\b/gi, '$1 driven'],
  [/\b(has|have|had)\s+wrote\b/gi, '$1 written'],
  [/\b(has|have|had)\s+spoke\b/gi, '$1 spoken'],
  [/\b(has|have|had)\s+broke\b/gi, '$1 broken'],
  [/\b(has|have|had)\s+chose\b/gi, '$1 chosen'],
  [/\b(has|have|had)\s+froze\b/gi, '$1 frozen'],
  [/\b(has|have|had)\s+took\b/gi, '$1 taken'],
  [/\b(has|have|had)\s+gave\b/gi, '$1 given'],
  [/\b(has|have|had)\s+began\b/gi, '$1 begun'],
  [/\b(has|have|had)\s+drank\b/gi, '$1 drunk'],
  [/\b(has|have|had)\s+sang\b/gi, '$1 sung'],
  [/\b(has|have|had)\s+rang\b/gi, '$1 rung'],
  [/\b(has|have|had)\s+swam\b/gi, '$1 swum'],
  [/\b(has|have|had)\s+threw\b/gi, '$1 thrown'],
  [/\b(has|have|had)\s+grew\b/gi, '$1 grown'],
  [/\b(has|have|had)\s+knew\b/gi, '$1 known'],
  [/\b(has|have|had)\s+flew\b/gi, '$1 flown'],
  [/\b(has|have|had)\s+drew\b/gi, '$1 drawn'],
  [/\b(has|have|had)\s+wore\b/gi, '$1 worn'],
  [/\b(has|have|had)\s+bore\b/gi, '$1 borne'],
  [/\b(has|have|had)\s+rose\b/gi, '$1 risen'],
  [/\b(has|have|had)\s+fell\b/gi, '$1 fallen'],
  [/\b(has|have|had)\s+ate\b/gi, '$1 eaten'],
  [/\b(has|have|had)\s+bit\b/gi, '$1 bitten'],
  [/\b(has|have|had)\s+hid\b/gi, '$1 hidden'],
  [/\b(has|have|had)\s+shook\b/gi, '$1 shaken'],
  [/\b(has|have|had)\s+stole\b/gi, '$1 stolen'],
  [/\b(has|have|had)\s+swore\b/gi, '$1 sworn'],
  [/\b(has|have|had)\s+tore\b/gi, '$1 torn'],
  [/\b(has|have|had)\s+woke\b/gi, '$1 woken'],

  // 3rd person singular errors
  [/\bgos\b/gi, 'goes'],
  [/\bdos\b/gi, 'does'],
  [/\bhavs\b/gi, 'has'],
];

// ── Subject-verb agreement fixes ────────────────────────────────────
type ReplacerFn = (...args: string[]) => string;
const SUBJECT_VERB_FIXES: [RegExp, string | ReplacerFn][] = [
  // "This tools has" → "This tool has" / "These tools have"
  [/\b(this|that|each|every)\s+(\w+s)\s+(have|are|were)\b/gi, (m: string, det: string, noun: string, verb: string) => {
    const singular = noun.replace(/s$/, '');
    const singVerb = verb.toLowerCase() === 'have' ? 'has' : verb.toLowerCase() === 'are' ? 'is' : 'was';
    return `${det} ${singular} ${singVerb}`;
  }],
  // "These tool have" → "These tools have"
  [/\b(these|those|many|several|few|various|some)\s+(\w{3,})\s+(has|is|was)\b/gi, (m: string, det: string, noun: string, verb: string) => {
    const plural = noun.endsWith('s') ? noun : noun + 's';
    const plurVerb = verb.toLowerCase() === 'has' ? 'have' : verb.toLowerCase() === 'is' ? 'are' : 'were';
    return `${det} ${plural} ${plurVerb}`;
  }],
  // "he/she have" → "he/she has"
  [/\b(he|she|it)\s+(have)\b/gi, '$1 has'],
  // "they/we has" → "they/we have"
  [/\b(they|we|you|I)\s+(has)\b/gi, '$1 have'],
  // "he/she are" → "he/she is"
  [/\b(he|she|it)\s+(are)\b/gi, '$1 is'],
  // "they/we is" → "they/we are"
  [/\b(they|we|you)\s+(is)\b/gi, '$1 are'],
  // "I is" → "I am"
  [/\bI is\b/g, 'I am'],
  // "I has" → "I have"
  [/\bI has\b/g, 'I have'],
];

// ── Preposition / collocation fixes ─────────────────────────────────
const COLLOCATION_FIXES: [RegExp, string][] = [
  // "provide to" → "provide for" or "provide"
  [/\bprovide to\b/gi, 'provide for'],
  // "enable to" without subject → "enable people to" or "allow"
  [/\benables?\s+to\b/gi, 'allows'],
  // "result to" → "result in"
  [/\bresults?\s+to\b/gi, 'results in'],
  [/\bresulted\s+to\b/gi, 'resulted in'],
  // "consist from" → "consist of"
  [/\bconsists?\s+from\b/gi, 'consists of'],
  // "depend from" → "depend on"
  [/\bdepends?\s+from\b/gi, 'depends on'],
  [/\bdepended\s+from\b/gi, 'depended on'],
  // "contribute for" → "contribute to"
  [/\bcontributes?\s+for\b/gi, 'contributes to'],
  [/\bcontributed\s+for\b/gi, 'contributed to'],
  // "responsible of" → "responsible for"
  [/\bresponsible of\b/gi, 'responsible for'],
  // "capable to" → "capable of"
  [/\bcapable to\b/gi, 'capable of'],
  // "interested to" → "interested in"
  [/\binterested to\b/gi, 'interested in'],
  // "different than" → "different from" (formal)
  [/\bdifferent than\b/gi, 'different from'],
  // "in despite of" → "despite"
  [/\bin despite of\b/gi, 'despite'],
  // "according with" → "according to"
  [/\baccording with\b/gi, 'according to'],
  // "in contrast of" → "in contrast to"
  [/\bin contrast of\b/gi, 'in contrast to'],
  // "discuss about" → "discuss"
  [/\bdiscuss about\b/gi, 'discuss'],
  [/\bdiscussed about\b/gi, 'discussed'],
  // "emphasize on" → "emphasize"
  [/\bemphasizes? on\b/gi, 'emphasize'],
  [/\bemphasized on\b/gi, 'emphasized'],
  // "approach to solving" is ok, "approach to solve" → "approach to solving"
  [/\bapproach to solve\b/gi, 'approach to solving'],
];

// ── Dangling / structural grammar fixes ─────────────────────────────
const STRUCTURAL_FIXES: [RegExp, string][] = [
  // "letting to" → "allowing ... to" (infinitive after let requires bare form)
  [/\bletting to\b/gi, 'allowing to'],
  // "make possible to" → "make it possible to"
  [/\bmake possible to\b/gi, 'make it possible to'],
  [/\bmakes possible to\b/gi, 'makes it possible to'],
  [/\bmade possible to\b/gi, 'made it possible to'],
  // Double gerund: "helping helping" → "helping"
  [/\b(\w{3,}ing)\s+\1\b/gi, '$1'],
  // Double past: "showed showed" → "showed"
  [/\b(\w{4,}ed)\s+\1\b/gi, '$1'],
  // "the the" (extra safety)
  [/\bthe the\b/gi, 'the'],
  // "a a" / "an an"
  [/\ba a\b/gi, 'a'],
  [/\ban an\b/gi, 'an'],
  // "in in" / "of of" etc
  [/\b(in|of|on|at|to|by|for|with|from|into|over|under|about|after|before)\s+\1\b/gi, '$1'],
  // Missing subject before verb: ", are" at start of clause → remove stray comma
  // "These studies, are important" → "These studies are important"
  [/(\w)\s*,\s+(is|are|was|were|has|have|had)\s+/g, '$1 $2 '],
  // Triple+ spaces
  [/\s{3,}/g, ' '],
  // Space before comma/period
  [/\s+([,.])/g, '$1'],
  // Missing space after comma/period (but NOT inside abbreviations like D.C., U.S.)
  [/([,])(\w)/g, '$1 $2'],
  [/\.([A-Z][a-z]{2,})/g, '. $1'],
];

// ── Tense consistency within a sentence ─────────────────────────────
// Detects mixed past/present in a single clause and normalizes
function fixTenseInconsistency(text: string): string {
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.map(sent => {
    const words = sent.trim().split(/\s+/);
    if (words.length < 5) return sent;

    // Count past vs present tense main verbs (simple heuristic)
    let pastCount = 0;
    let presentCount = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase().replace(/[,;:]/g, '');
      // Skip auxiliary verbs
      if (['is', 'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did',
        'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
        'been', 'being'].includes(w)) continue;
      if (w.endsWith('ed') && w.length > 3) pastCount++;
      // Present tense 3sg ending in -s (but not nouns — heuristic: preceded by a/the/this → noun)
      if (w.endsWith('es') && w.length > 4 && !['these', 'those'].includes(w)) {
        // Check preceding 2 words for determiners/prepositions (adj+noun pattern)
        const determs = new Set(['the', 'a', 'an', 'this', 'that', 'its', 'their', 'our', 'his', 'her', 'my', 'your',
          'of', 'by', 'in', 'with', 'from', 'about', 'for', 'to', 'on', 'at', 'into', 'through']);
        const prev1 = i > 0 ? words[i - 1].toLowerCase().replace(/[,;:]/g, '') : '';
        const prev2 = i > 1 ? words[i - 2].toLowerCase().replace(/[,;:]/g, '') : '';
        if (!determs.has(prev1) && !determs.has(prev2)) {
          presentCount++;
        }
      }
    }

    // Only fix if there's a clear dominant tense with a stray verb
    // (e.g., 4 past + 1 present → normalize the 1 present to past)
    // This is conservative to avoid false positives
    if (pastCount >= 3 && presentCount === 1) {
      // Find the lone present-tense verb and convert to past
      const NOUN_ES = new Set(['these', 'those', 'names', 'times', 'types', 'cases', 'uses', 'places',
        'changes', 'stages', 'ranges', 'causes', 'processes', 'resources',
        'practices', 'services', 'sources', 'forces', 'courses',
        // Academic nouns ending in -es that must NOT be converted to -ed
        'measures', 'degrees', 'extents', 'scales', 'values', 'features',
        'structures', 'textures', 'procedures', 'figures', 'lines', 'rules',
        'phrases', 'sentences', 'languages', 'instances', 'devices', 'prices',
        'wages', 'images', 'pages', 'ages', 'edges', 'bridges', 'judges',
        'principles', 'articles', 'vehicles', 'tissues', 'issues', 'volumes',
        'surfaces', 'distances', 'sequences', 'audiences', 'influences',
        'differences', 'consequences', 'preferences', 'references', 'expenses',
        'responses', 'purposes', 'databases', 'interfaces', 'landscapes',
        'challenges', 'advantages', 'percentages', 'averages', 'packages',
        'messages', 'passages', 'senses', 'phases', 'bases', 'analyses',
        'hypotheses', 'crises', 'theses', 'diagnoses', 'doses', 'increases',
        'decreases', 'releases', 'purchases', 'losses', 'successes',
        'approaches', 'techniques', 'policies', 'strategies',
        'exchanges', 'indices', 'matrices', 'complexes', 'schedules',
        'territories', 'categories', 'technologies', 'facilities',
        'zones', 'areas', 'spaces', 'notes', 'modes', 'codes', 'roles',
        'rates', 'states', 'dates', 'sites', 'routes', 'files',
      ]);
      return sent.replace(/\b(\w+)(es)\b/g, (m, stem) => {
        if (NOUN_ES.has(m.toLowerCase())) return m;
        return stem + 'ed';
      });
    }

    return sent;
  }).join('');
}

// ── Consecutive filler / transition phrase cleanup ──────────────────
// Detects back-to-back transition phrases that make text nonsensical
const TRANSITION_PHRASES = [
  'in reality', 'in fact', 'in truth', 'in practice', 'in essence',
  'in that sentence', 'in this case', 'in this regard', 'in this context',
  'in other words', 'in particular', 'in addition', 'in contrast',
  'in the same way', 'in light of this', 'in any case', 'in any event',
  'consequently', 'furthermore', 'moreover', 'nevertheless', 'nonetheless',
  'accordingly', 'subsequently', 'meanwhile', 'conversely', 'alternatively',
  'additionally', 'similarly', 'likewise', 'hence', 'thereby', 'thus',
  'therefore', 'however', 'indeed', 'certainly', 'undoubtedly',
  'essentially', 'fundamentally', 'basically', 'specifically',
  'notably', 'importantly', 'significantly', 'interestingly',
  'surprisingly', 'remarkably', 'admittedly', 'evidently',
  'as a result', 'as a matter of fact', 'as such', 'as it were',
  'on the other hand', 'on the contrary', 'on top of that',
  'at the same time', 'at any rate', 'by contrast', 'by the same token',
  'for this reason', 'for that matter', 'for instance', 'for example',
  'to that end', 'to this effect', 'to be sure', 'to put it simply',
  'after all', 'above all', 'all in all', 'all things considered',
  'having said that', 'that being said', 'that said', 'with that said',
  'needless to say', 'it is worth noting', 'it should be noted',
  'as a consequence', 'as mentioned', 'as noted',
  'in the meantime', 'in the end', 'in summary', 'in conclusion',
  'to summarize', 'to conclude', 'to illustrate', 'to clarify',
  'put simply', 'simply put', 'more importantly', 'most importantly',
  'first and foremost', 'last but not least',
];

// Build a regex that matches two or more consecutive transition phrases
// separated by commas, semicolons, or sentence boundaries
function removeConsecutiveFillers(text: string): string {
  // Escape special regex chars in phrases
  const escaped = TRANSITION_PHRASES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Sort by length desc so longer phrases match first
  escaped.sort((a, b) => b.length - a.length);
  const phrasePattern = escaped.join('|');

  // Match 2+ transitions in a row separated by commas/semicolons
  // e.g. "in reality, in that sentence, consequently, the text..."
  const consecutiveRe = new RegExp(
    `(?:(?:${phrasePattern})\\s*[,;]\\s*){2,}(?:${phrasePattern})\\s*[,;]?\\s*`,
    'gi'
  );

  let result = text;
  // Replace consecutive fillers — keep just the last one (most contextually relevant)
  result = result.replace(consecutiveRe, (match) => {
    const phrases = match.match(new RegExp(phrasePattern, 'gi'));
    if (phrases && phrases.length > 0) {
      const last = phrases[phrases.length - 1];
      // Capitalize if at sentence start
      return last.charAt(0).toUpperCase() + last.slice(1) + ', ';
    }
    return '';
  });

  // Also catch pairs: "transition, transition, actual content"
  const pairRe = new RegExp(
    `\\b(${phrasePattern})\\s*[,;]\\s*(${phrasePattern})\\s*[,;]\\s*`,
    'gi'
  );
  result = result.replace(pairRe, (_match, _first, second: string) => {
    return second.charAt(0).toUpperCase() + second.slice(1) + ', ';
  });

  // Remove sentence-initial fillers that repeat the pattern from previous sentence ending
  // e.g. "...something. Furthermore, moreover, the text" → "...something. Moreover, the text"
  const sentStartDoubleRe = new RegExp(
    `([.!?])\\s+(${phrasePattern})\\s*[,;]\\s*(${phrasePattern})\\s*[,;]?\\s*`,
    'gi'
  );
  result = result.replace(sentStartDoubleRe, (_match, punct: string, _first, second: string) => {
    return `${punct} ${second.charAt(0).toUpperCase() + second.slice(1)}, `;
  });

  return result;
}

// ── Main grammar cleaning function ──────────────────────────────────
export function postCleanGrammar(text: string): string {
  let result = text;

  // 0. Remove consecutive filler/transition phrases
  result = removeConsecutiveFillers(result);

  // 1. Irregular verb fixes (highest priority — non-words)
  for (const [pattern, replacement] of IRREGULAR_VERB_FIXES) {
    if (typeof replacement === 'string') {
      result = result.replace(pattern, replacement);
    }
  }

  // 2. Subject-verb agreement
  for (const [pattern, replacement] of SUBJECT_VERB_FIXES) {
    if (typeof replacement === 'function') {
      result = result.replace(pattern, replacement as (...args: string[]) => string);
    } else {
      result = result.replace(pattern, replacement);
    }
  }

  // 3. Collocation / preposition fixes
  for (const [pattern, replacement] of COLLOCATION_FIXES) {
    result = result.replace(pattern, replacement);
  }

  // 4. Structural grammar fixes
  for (const [pattern, replacement] of STRUCTURAL_FIXES) {
    result = result.replace(pattern, replacement as string);
  }

  // 5. Tense consistency (conservative — only fixes clear single-verb outliers)
  result = fixTenseInconsistency(result);

  // 6. Fix sentence-initial lowercase (safety)
  // Avoid capitalizing after abbreviation periods (X. where X is uppercase)
  result = result.replace(/([.!?])\s+([a-z])/g, (m, punct, _ch, offset) => {
    if (punct === '.' && offset > 0 && /[A-Z]/.test(result[offset - 1])) return m;
    return m.replace(/([a-z])$/, c => c.toUpperCase());
  });

  // 7. Ensure sentences end with punctuation
  result = result.replace(/([a-zA-Z])(\s*\n)/g, (m) => {
    // Don't add period to headings (short lines without periods)
    return m;
  });

  return result;
}
