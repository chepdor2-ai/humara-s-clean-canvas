/**
 * forensics.ts
 * ───────────────────────────────────────────────────────────────────────
 * Per-detector forensic cleanup passes. Each pass targets the specific
 * statistical/linguistic signals that a given detector family is known
 * to flag (ZeroGPT, Turnitin, Originality, Copyleaks, GPTZero, Pangram,
 * Surfer SEO, Scribbr, Winston).
 *
 * All passes are:
 *   • Non-LLM (pure regex / dictionary replacements)
 *   • Meaning-preserving (1-for-1 natural substitutions only)
 *   • Paragraph-structure preserving
 *   • Stable under repeated application (idempotent after 2 passes)
 * ───────────────────────────────────────────────────────────────────────
 */

import {
  AI_WORD_NATURAL_REPLACEMENTS,
  AI_MARKER_WORDS,
  AI_SENTENCE_STARTERS,
  type DetectorName,
} from '../ai-signal-dictionary';

/* ─────────────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────────────── */

function recapAfter(m: string): string {
  return m.replace(/^([a-z])/, (c) => c.toUpperCase());
}

/** Preserve the capitalization of the original match when replacing. */
function matchCapitalization(original: string, replacement: string): string {
  if (!replacement) return replacement;
  if (/^[A-Z]/.test(original)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Split text on paragraph boundaries so cleanup never merges paragraphs. */
function perParagraph(text: string, fn: (para: string) => string): string {
  const parts = text.split(/(\n\s*\n)/);
  for (let i = 0; i < parts.length; i++) {
    if (/^\n\s*\n$/.test(parts[i])) continue;
    parts[i] = fn(parts[i]);
  }
  return parts.join('');
}

/* ─────────────────────────────────────────────────────────────────────
 * 1. ZeroGPT — uniform connectors, transition over-indexing
 * ───────────────────────────────────────────────────────────────────── */

const ZEROGPT_TRANSITIONS: Record<string, string[]> = {
  furthermore: ['Also', 'On top of that', 'Plus'],
  moreover: ['Also', 'Besides that', 'On top of that'],
  additionally: ['Also', 'Plus', 'On top of that'],
  consequently: ['So', 'As a result', 'Because of this'],
  therefore: ['So', 'That is why', 'Which is why'],
  thus: ['So', 'That is why'],
  hence: ['So', 'That is why'],
  subsequently: ['Later', 'After that', 'Then'],
  accordingly: ['So', 'Following that', 'On this basis'],
  nevertheless: ['Still', 'Even so', 'Yet'],
  notwithstanding: ['Even so', 'Despite that', 'Still'],
};

export function cleanZeroGPTPass(text: string): string {
  let cleaned = text;

  for (const [word, alts] of Object.entries(ZEROGPT_TRANSITIONS)) {
    let idx = 0;
    const openerRe = new RegExp(`(^|\\n\\s*|[.!?]\\s+)${word}[,]?\\s+`, 'gi');
    cleaned = cleaned.replace(openerRe, (_m, pre) => {
      const alt = alts[idx % alts.length];
      idx++;
      return `${pre}${alt}, `;
    });
  }

  // Flatten pileups like "also, besides, so, "
  cleaned = cleaned.replace(/\b(also|besides|plus|so|still),\s+(also|besides|plus|so|still),\s+/gi, '$1, ');
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 2. Surfer SEO — keyword stuffing, robotic lists, SEO fluff
 * ───────────────────────────────────────────────────────────────────── */

const SURFER_FLUFF: Array<{ match: RegExp; rep: string }> = [
  { match: /\b(crucial|vital|essential|critical|pivotal)\s+(aspect|element|component|part|factor)\b/gi, rep: 'key $2' },
  { match: /\b(comprehensive|ultimate|definitive|in[- ]depth)\s+(guide|overview|analysis|resource|breakdown)\b/gi, rep: 'full $2' },
  { match: /\bthe (?:ultimate|definitive|complete|essential) guide to\b/gi, rep: 'a practical guide to' },
  { match: /\beverything you need to know (?:about|regarding|on)\b/gi, rep: 'the basics of' },
  { match: /\ba (?:must[- ]have|must[- ]read|must[- ]know|game[- ]changer|no[- ]brainer)\b/gi, rep: 'worth your time' },
  { match: /\bin the (?:fast[- ]paced|ever[- ]changing|ever[- ]evolving|rapidly changing) (?:world|landscape|environment)\b/gi, rep: 'today' },
  { match: /\bunlock(?:s|ed|ing)? the (?:power|potential|secrets|mysteries|key) of\b/gi, rep: 'make the most of' },
  { match: /\bharness(?:es|ed|ing)? the (?:power|potential|capabilities) of\b/gi, rep: 'put to good use the strengths of' },
  { match: /\btap(?:s|ped|ping)? into the (?:power|potential) of\b/gi, rep: 'draw on the strengths of' },
  { match: /\bin today'?s (?:fast[- ]paced|rapidly[- ]changing|digital) (?:world|age|landscape)\b/gi, rep: 'in the current climate' },
];

export function cleanSurferSEOPass(text: string): string {
  let cleaned = text;
  for (const rule of SURFER_FLUFF) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 3. Originality AI — adjective-noun over-pairing, delve/tapestry
 * ───────────────────────────────────────────────────────────────────── */

const ORIGINALITY_PREDICTABLE: Array<{ match: RegExp; rep: string }> = [
  { match: /\bdelve(?:s|d|ing)?\s+(?:deep(?:ly)? )?into\b/gi, rep: 'look into' },
  { match: /\bdive(?:s|d)?\s+(?:deep(?:ly)? )?into\b/gi, rep: 'look into' },
  { match: /\bembark(?:s|ed|ing)?\s+on\s+(?:a\s+)?(?:journey|exploration|quest)\b/gi, rep: 'set out' },
  { match: /\btapestry\s+of\b/gi, rep: 'mix of' },
  { match: /\ba\s+(?:rich|diverse|beautiful|complex)\s+tapestry\b/gi, rep: 'a mix' },
  { match: /\bseamless(?:ly)?\s+(integrate|integration|connect|connection|blend|combine)\b/gi, rep: 'smoothly $1' },
  { match: /\b(?:stands? as |serves? as |is )?a testament to\b/gi, rep: 'shows' },
  { match: /\b(?:stands? as |serves? as |is )?a reminder of\b/gi, rep: 'reminds us of' },
  { match: /\boverarching\b/gi, rep: 'main' },
  { match: /\binnovative\s+(solution|approach|method|strategy|framework|way)\b/gi, rep: 'new $1' },
  { match: /\bcutting[- ]edge\s+(technology|research|solution|approach|tool)\b/gi, rep: 'advanced $1' },
  { match: /\bstate[- ]of[- ]the[- ]art\s+(system|solution|technology|model|tool|approach)\b/gi, rep: 'advanced $1' },
  { match: /\bplays?\s+a\s+(?:crucial|vital|pivotal|critical|significant|key|central|fundamental|instrumental)\s+role\s+in\b/gi, rep: 'is central to' },
  { match: /\bin\s+the\s+(?:realm|sphere|domain|landscape|arena|world)\s+of\b/gi, rep: 'in the field of' },
  { match: /\ba\s+(?:myriad|plethora|multitude|host|wealth)\s+of\b/gi, rep: 'a range of' },
  { match: /\ba\s+wide\s+(?:range|array|spectrum|variety)\s+of\b/gi, rep: 'a number of' },
  { match: /\bshed(?:s|ding)?\s+light\s+on\b/gi, rep: 'clarifies' },
  { match: /\bpave(?:s|d)?\s+the\s+way\s+for\b/gi, rep: 'enables' },
  { match: /\bgive(?:s|n)?\s+rise\s+to\b/gi, rep: 'leads to' },
  { match: /\bnavigat(?:e|es|ed|ing)\s+(?:the\s+)?(complex(?:ities)?|challenges?|intricacies|landscape|terrain|waters?)\b/gi, rep: 'manage $1' },
  { match: /\bat\s+the\s+(?:core|heart|forefront)\s+of\b/gi, rep: 'central to' },
  { match: /\bultimately\s+(?:leads|leading)\s+to\b/gi, rep: 'leading to' },
  { match: /\bwhich\s+contributes?\s+to\s+(better|improved|enhanced|greater|stronger)\b/gi, rep: ', improving' },
  { match: /\bhas\s+(?:gained|garnered|received|attracted)\s+(?:significant|considerable|substantial|growing)\s+(?:attention|interest|traction|momentum)\b/gi, rep: 'has drawn attention' },
  { match: /\bthis\s+(?:highlights|underscores|emphasizes|demonstrates|reinforces)\s+the\s+(importance|need|significance|value|role)\s+of\b/gi, rep: 'this shows why $1 of' },
];

export function cleanOriginalityAIPass(text: string): string {
  let cleaned = text;
  for (const rule of ORIGINALITY_PREDICTABLE) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 4. GPTZero — burstiness (sentence-length variance)
 * ───────────────────────────────────────────────────────────────────── */

/**
 * GPTZero flags low burstiness. This pass occasionally merges two short
 * sentences or splits one long sentence at a safe connective to create
 * variance. Operates per paragraph, so structure is preserved.
 */
export function cleanGPTZeroPass(text: string): string {
  return perParagraph(text, (para) => {
    const sents = para.match(/[^.!?]+[.!?]+/g);
    if (!sents || sents.length < 3) return para;

    const out: string[] = [];
    let i = 0;
    let merged = false;
    let split = false;

    while (i < sents.length) {
      const current = sents[i].trim();
      const words = current.split(/\s+/).length;

      // Merge two short sentences once per paragraph
      if (!merged && i < sents.length - 1) {
        const next = sents[i + 1].trim();
        const nextWords = next.split(/\s+/).length;
        if (
          words <= 9 && nextWords <= 9 &&
          /[a-z]/.test(current.slice(-2, -1)) &&
          /^(?:It|This|That|These|Those|The|A|An|Many|Most|Some|Several)\s/.test(next)
        ) {
          const firstClean = current.replace(/[.!?]+$/, '');
          const nextLower = next.charAt(0).toLowerCase() + next.slice(1);
          out.push(`${firstClean}, and ${nextLower}`);
          i += 2;
          merged = true;
          continue;
        }
      }

      // Split one long sentence at a safe comma connective
      if (!split && words > 26) {
        const splitRe = /(,\s+(?:which|and|but|so that|so)\s+)/;
        const m = current.match(splitRe);
        if (m && m.index && m.index > 30 && m.index < current.length - 20) {
          const before = current.slice(0, m.index).trim();
          const connector = m[1].replace(/^,\s+/, '').replace(/\s+$/, '');
          let after = current.slice(m.index + m[0].length).trim();
          after = after.charAt(0).toUpperCase() + after.slice(1);
          out.push(/[.!?]$/.test(before) ? before : before + '.');
          const starterMap: Record<string, string> = {
            which: 'This',
            and: 'Also,',
            but: 'Still,',
            so: 'So',
            'so that': 'So',
          };
          const starter = starterMap[connector.toLowerCase()] ?? '';
          out.push(starter
            ? `${starter} ${after.charAt(0).toLowerCase() + after.slice(1)}`
            : after);
          i++;
          split = true;
          continue;
        }
      }

      out.push(current);
      i++;
    }

    const trailing = para.match(/\s+$/)?.[0] ?? '';
    return out.join(' ') + trailing;
  });
}

/* ─────────────────────────────────────────────────────────────────────
 * 5. Pangram — structural perfection, balanced clauses
 * ───────────────────────────────────────────────────────────────────── */

const PANGRAM_STRUCTURAL: Array<{ match: RegExp; rep: string }> = [
  { match: /\bnot only\b\s+(.{3,80}?)\s+\bbut also\b\s+/gi, rep: '$1, and ' },
  { match: /\beach and every\b/gi, rep: 'every' },
  { match: /\bfirst and foremost\b/gi, rep: 'above all' },
  { match: /\b(?:by the same token|in the same vein)\b/gi, rep: 'likewise' },
  { match: /\bon the one hand\b,?\s*/gi, rep: '' },
  { match: /\bin the grand scheme of things\b/gi, rep: 'overall' },
];

export function cleanPangramPass(text: string): string {
  let cleaned = text;
  for (const rule of PANGRAM_STRUCTURAL) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  cleaned = cleaned.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 6. Turnitin — academic fluff, "it is important to note" family
 * ───────────────────────────────────────────────────────────────────── */

const TURNITIN_FLUFF: Array<{ match: RegExp; rep: string }> = [
  { match: /\b(?:It is worth noting that|It is important to note that|It is essential to (?:note|recognize|understand) that|It should be noted that|It is evident that|It is clear that|It is obvious that|It is apparent that|It is well[- ]known that|It is widely (?:recognized|acknowledged|accepted) that|It goes without saying that|There is no doubt that|Needless to say,)\s+/gi, rep: 'Notably, ' },
  { match: /\bIn conclusion,\s+/gi, rep: 'Overall, ' },
  { match: /\bTo summarize,\s+/gi, rep: 'In short, ' },
  { match: /\bIn summary,\s+/gi, rep: 'In short, ' },
  { match: /\bTo conclude,\s+/gi, rep: 'Overall, ' },
  { match: /\bdue to the fact that\b/gi, rep: 'because' },
  { match: /\bin order to\b/gi, rep: 'to' },
  { match: /\bfor the purpose of\b/gi, rep: 'to' },
  { match: /\bwith the aim of\b/gi, rep: 'to' },
  { match: /\bwith (?:respect|regard) to\b/gi, rep: 'about' },
  { match: /\bon the basis of\b/gi, rep: 'based on' },
  { match: /\bin the context of\b/gi, rep: 'in' },
  { match: /\bin light of\b/gi, rep: 'given' },
  { match: /\bin view of\b/gi, rep: 'given' },
  { match: /\bin terms of\b/gi, rep: 'regarding' },
  { match: /\ba large number of\b/gi, rep: 'many' },
  { match: /\bas a result\b/gi, rep: 'so' },
  { match: /\bprior to\b/gi, rep: 'before' },
  { match: /\bsubsequent to\b/gi, rep: 'after' },
  { match: /\bin accordance with\b/gi, rep: 'per' },
  { match: /\b(?:this|the|present) (?:study|paper|research|article|analysis) (?:aims|seeks|attempts) to\b/gi, rep: 'this looks to' },
  { match: /\b(?:research|studies) (?:has|have) shown that\b/gi, rep: 'research shows' },
];

export function cleanTurnitinPass(text: string): string {
  let cleaned = text;
  for (const rule of TURNITIN_FLUFF) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  cleaned = cleaned.replace(/(^|\n|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 7. Copyleaks — hedging stacks, "that being said" family
 * ───────────────────────────────────────────────────────────────────── */

const COPYLEAKS_HEDGES: Array<{ match: RegExp; rep: string }> = [
  { match: /\bthat being said,?\s*/gi, rep: '' },
  { match: /\bhaving said that,?\s*/gi, rep: '' },
  { match: /\bwith that (?:in mind|being said),?\s*/gi, rep: '' },
  { match: /\bat the end of the day,?\s*/gi, rep: '' },
  { match: /\ball things considered,?\s*/gi, rep: 'Overall, ' },
  { match: /\bwhen it comes to\b/gi, rep: 'for' },
  { match: /\bin the (?:modern|current|contemporary|present|digital) (?:era|age|world|landscape)\b/gi, rep: 'today' },
  { match: /\bin today'?s (?:world|society|era|age|environment|landscape)\b/gi, rep: 'today' },
];

export function cleanCopyleaksPass(text: string): string {
  let cleaned = text;
  for (const rule of COPYLEAKS_HEDGES) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  cleaned = cleaned.replace(/(^|\n|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 8. Scribbr — academic over-formality, hedging stacks
 * ───────────────────────────────────────────────────────────────────── */

const SCRIBBR_HEDGES: Array<{ match: RegExp; rep: string }> = [
  { match: /\b(it is|this is) (?:arguably|undeniably|undoubtedly|clearly|evidently)\s+/gi, rep: '$1 ' },
  { match: /\b(rather|quite|somewhat|fairly|relatively|considerably|substantially)\s+(important|significant|notable|relevant|crucial)\b/gi, rep: '$2' },
  { match: /\bit could be argued that\b/gi, rep: 'arguably,' },
  { match: /\bone could (?:argue|say|suggest) that\b/gi, rep: 'arguably,' },
  { match: /\bit may be the case that\b/gi, rep: 'perhaps,' },
  { match: /\bit is often (?:argued|claimed|suggested|said|stated) that\b/gi, rep: '' },
];

export function cleanScribbrPass(text: string): string {
  let cleaned = text;
  for (const rule of SCRIBBR_HEDGES) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  cleaned = cleaned.replace(/(^|\n|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 9. Winston — "ever-evolving landscape" / trend fluff
 * ───────────────────────────────────────────────────────────────────── */

const WINSTON_FLUFF: Array<{ match: RegExp; rep: string }> = [
  { match: /\bin the ever[- ](?:evolving|changing|growing) (?:landscape|world|field|realm|environment)(?:\s+of)?\b/gi, rep: 'in' },
  { match: /\bat an unprecedented (?:pace|rate|scale|level)\b/gi, rep: 'quickly' },
  { match: /\bas (?:technology|the world|society|we) (?:advance|advances|progress|progresses|evolve|evolves)\b/gi, rep: 'as things change' },
  { match: /\b(?:moving|going) forward,?\s*/gi, rep: '' },
  { match: /\bin recent years,?\s+there (?:has|have) been\b/gi, rep: 'recently there has been' },
];

export function cleanWinstonPass(text: string): string {
  let cleaned = text;
  for (const rule of WINSTON_FLUFF) {
    cleaned = cleaned.replace(rule.match, (m, ...rest) => {
      const replaced = rule.rep.replace(/\$(\d+)/g, (_x, n) => rest[Number(n) - 1] ?? '');
      return matchCapitalization(m, replaced);
    });
  }
  cleaned = cleaned.replace(/(^|\n|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 10. Universal AI-phrase sweep
 * ───────────────────────────────────────────────────────────────────── */

export function universalPhraseSweep(text: string): string {
  let cleaned = text;
  const sweepRules: Array<{ pattern: RegExp; rep: string }> = [
    { pattern: /\bto put it (?:simply|briefly|plainly)\b/gi, rep: 'simply put' },
    { pattern: /\bsimply put,?\s+/gi, rep: 'Put plainly, ' },
    { pattern: /\bmore (?:importantly|specifically|notably),?\s+/gi, rep: 'Of note, ' },
    { pattern: /\bin other words,?\s+/gi, rep: 'That is, ' },
    { pattern: /\bto put it differently,?\s+/gi, rep: 'Put another way, ' },
    { pattern: /\bto be sure,?\s+/gi, rep: 'Granted, ' },
    { pattern: /\bneedless to say,?\s+/gi, rep: 'Clearly, ' },
    { pattern: /\bfor all intents and purposes\b/gi, rep: 'essentially' },
    { pattern: /\bgoing forward\b/gi, rep: 'ahead' },
    { pattern: /\bmoving forward\b/gi, rep: 'ahead' },
  ];
  for (const { pattern, rep } of sweepRules) {
    cleaned = cleaned.replace(pattern, (m) => matchCapitalization(m, rep));
  }
  cleaned = cleaned.replace(/(^|\n|[.!?]\s+)([a-z])/g, (_m, pre, c) => pre + c.toUpperCase());
  return cleaned;
}

/* ─────────────────────────────────────────────────────────────────────
 * 11. AI marker-word swap — single-word natural replacements
 * ───────────────────────────────────────────────────────────────────── */

function pickIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % Math.max(1, mod);
}

export function swapAIMarkers(text: string, aggressive = false): string {
  const replacementTarget = aggressive ? 0.85 : 0.55;
  const words = text.split(/(\b)/);
  const totalWords = words.filter(w => /^[a-z]+$/i.test(w)).length;
  const maxReplacements = Math.ceil(totalWords * replacementTarget);
  let replacedCount = 0;

  for (let i = 0; i < words.length; i++) {
    const tok = words[i];
    if (replacedCount >= maxReplacements) break;
    if (!/^[a-zA-Z]{3,}$/.test(tok)) continue;
    const lower = tok.toLowerCase();
    if (!AI_MARKER_WORDS.has(lower)) continue;
    const alts = AI_WORD_NATURAL_REPLACEMENTS[lower];
    if (!alts || alts.length === 0) continue;
    const alt = alts[pickIndex(lower + i, alts.length)];
    const replaced = tok[0] === tok[0].toUpperCase()
      ? alt.charAt(0).toUpperCase() + alt.slice(1)
      : alt;
    words[i] = replaced;
    replacedCount++;
  }

  return words.join('');
}

/* ─────────────────────────────────────────────────────────────────────
 * 12. AI starter strip — kill cliché openers that survive earlier passes
 * ───────────────────────────────────────────────────────────────────── */

export function stripAIStarters(text: string): string {
  // Only strip multi-word filler openers that add zero meaning.
  // Single-word connectors (furthermore, moreover, etc.) are handled by
  // detector-specific passes which REPLACE them rather than DELETE them.
  // This prevents word-count erosion from double-stripping.
  const STRIP_ONLY_STARTERS = new Set([
    "it is important", "it is crucial", "it is essential", "it is worth noting",
    "it is worth mentioning", "it is worth highlighting", "it should be noted",
    "it must be noted", "it can be argued", "it can be seen", "it is clear",
    "it is evident", "it is apparent", "it is obvious", "it stands to reason",
    "in today's", "in the modern", "in the current", "in the contemporary",
    "in the digital age", "in this digital age", "in the 21st century",
    "since the dawn of",
  ]);

  const paragraphs = text.split(/(\n\s*\n)/);
  for (let p = 0; p < paragraphs.length; p++) {
    if (/^\n\s*\n$/.test(paragraphs[p])) continue;
    const para = paragraphs[p];
    const sentences = para.match(/[^.!?]+[.!?]+|\s*$/g);
    if (!sentences) continue;
    paragraphs[p] = sentences
      .map((s) => {
        const trimmed = s.trim();
        if (!trimmed) return s;
        for (const starter of STRIP_ONLY_STARTERS) {
          if (trimmed.toLowerCase().startsWith(starter)) {
            const after = trimmed.slice(starter.length).replace(/^[,;:\s]+/, '').trim();
            if (after.length < 5) return s;
            const trailing = s.match(/\s+$/)?.[0] ?? '';
            return recapAfter(after) + trailing;
          }
        }
        return s;
      })
      .join('');
  }
  return paragraphs.join('');
}

/* ─────────────────────────────────────────────────────────────────────
 * 13. Unified deep-signal clean — orchestrates all passes
 * ───────────────────────────────────────────────────────────────────── */

export interface DeepCleanOptions {
  /** When true, swap marker words aggressively (85% coverage). */
  aggressive?: boolean;
  /** Skip GPTZero burstiness pass. */
  skipBurstiness?: boolean;
  /** Skip starter stripping — useful when caller re-injects starters. */
  skipStarterStrip?: boolean;
  /** Limit which detectors are targeted. Omit for "all". */
  onlyDetectors?: ReadonlyArray<DetectorName>;
}

export function deepSignalClean(text: string, opts: DeepCleanOptions = {}): string {
  if (!text || text.trim().length === 0) return text;

  const { aggressive = false, skipBurstiness = false, skipStarterStrip = false, onlyDetectors } = opts;
  const shouldRun = (d: DetectorName) => !onlyDetectors || onlyDetectors.includes(d);

  let cleaned = text;

  // Phase 1 — surface phrase cleanup (detector-specific)
  if (shouldRun('turnitin')) cleaned = cleanTurnitinPass(cleaned);
  if (shouldRun('originality')) cleaned = cleanOriginalityAIPass(cleaned);
  if (shouldRun('copyleaks')) cleaned = cleanCopyleaksPass(cleaned);
  if (shouldRun('surfer')) cleaned = cleanSurferSEOPass(cleaned);
  if (shouldRun('winston')) cleaned = cleanWinstonPass(cleaned);
  if (shouldRun('scribbr')) cleaned = cleanScribbrPass(cleaned);
  if (shouldRun('pangram')) cleaned = cleanPangramPass(cleaned);

  // Phase 2 — marker-word swaps
  cleaned = swapAIMarkers(cleaned, aggressive);

  // Phase 3 — universal phrase sweep
  cleaned = universalPhraseSweep(cleaned);

  // Phase 4 — connector rotation
  if (shouldRun('zerogpt')) cleaned = cleanZeroGPTPass(cleaned);

  // Phase 5 — starter stripping
  if (!skipStarterStrip) cleaned = stripAIStarters(cleaned);

  // Phase 6 — burstiness adjustment
  if (!skipBurstiness && shouldRun('gptzero')) cleaned = cleanGPTZeroPass(cleaned);

  // Second pass of Turnitin fluff in case earlier phases surfaced new matches
  if (shouldRun('turnitin')) cleaned = cleanTurnitinPass(cleaned);

  // Collapse double spaces / stray whitespace
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');

  return cleaned;
}

/** Back-compat export used by Nuru 2.0 and others. */
export function runFullDetectorForensicsCleanup(text: string): string {
  return deepSignalClean(text, { aggressive: false });
}
