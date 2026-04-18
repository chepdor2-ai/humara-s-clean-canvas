// Humara V1.3 — Stealth Humanizer Engine v5 + deep pre/post processing
import { pipeline as rawPipeline } from './v1.3/humanize.js';
import { preProcess, restoreProtected, deepPostProcess } from './v1-3-processor.js';
import {
  buildSentenceItems,
  applySentenceSurgery,
  reassembleFromItems,
} from './sentence-surgery.ts';
import {
  DEFAULT_GROQ_SMALL_MODEL,
  getGroqClient,
  hasGroqApiKey,
  resolveGroqChatModel,
} from './groq-client.ts';

const LLM_MODEL = resolveGroqChatModel(process.env.LLM_MODEL, DEFAULT_GROQ_SMALL_MODEL);

// ── AI Vocabulary Purge (targeted, unlike deepPostProcess which corrupts) ──

const AI_KILL_MAP = {
  utilize: 'use', utilise: 'use', facilitate: 'help', leverage: 'draw on',
  comprehensive: 'thorough', multifaceted: 'complex', paramount: 'key',
  furthermore: 'also', moreover: 'also', additionally: 'also',
  consequently: 'as a result', subsequently: 'later', nevertheless: 'even so',
  notwithstanding: 'despite', aforementioned: 'noted', paradigm: 'model',
  trajectory: 'path', discourse: 'discussion', nuanced: 'subtle',
  pivotal: 'key', intricate: 'complex', meticulous: 'careful',
  profound: 'deep', overarching: 'broad', transformative: 'major',
  noteworthy: 'notable', elucidate: 'explain', delve: 'examine',
  embark: 'begin', foster: 'encourage', harness: 'use', tapestry: 'mix',
  cornerstone: 'basis', myriad: 'many', plethora: 'many',
  landscape: 'field', realm: 'area', culminate: 'lead to',
  robust: 'strong', innovative: 'new', groundbreaking: 'original',
  streamline: 'simplify', optimize: 'improve', bolster: 'support',
  catalyze: 'trigger', spearhead: 'lead', unravel: 'untangle',
  unveil: 'reveal', nexus: 'link', holistic: 'complete',
  substantive: 'real', salient: 'key', ubiquitous: 'common',
  enhance: 'improve', crucial: 'key', vital: 'needed',
  essential: 'needed', imperative: 'necessary',
  underscore: 'highlight', underscores: 'highlights', underscored: 'highlighted',
};

const AI_KILL_RE = new RegExp(
  '\\b(' + Object.keys(AI_KILL_MAP).join('|') + ')\\b', 'gi'
);

function purgeAIVocabulary(text) {
  return text.replace(AI_KILL_RE, (match) => {
    const replacement = AI_KILL_MAP[match.toLowerCase()];
    if (!replacement) return match;
    if (match[0] === match[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
}

// ── AI Phrase Kill ──

const AI_PHRASE_KILLS = [
  [/\bit is (?:important|crucial|essential|vital|imperative|worth noting) (?:to note |to mention |to recognize )?that\b/gi, ''],
  [/\bplays? a (?:crucial|vital|key|significant|important|pivotal|critical) role(?: in)?\b/gi, 'matters for'],
  [/\bin today'?s (?:world|society|landscape|era|age)\b/gi, 'at present'],
  [/\bserves? as a (?:testament|reminder|catalyst|cornerstone|foundation)\b/gi, 'demonstrates'],
  [/\bcannot be overstated\b/gi, 'is significant'],
  [/\bneedless to say\b/gi, ''],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\beach and every\b/gi, 'every'],
  [/\bwhen it comes to\b/gi, 'regarding'],
  [/\bat the end of the day\b/gi, 'ultimately'],
  [/\bin the context of\b/gi, 'within'],
  [/\ba (?:wide|broad|vast) (?:range|array|spectrum) of\b/gi, 'many'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the realm of\b/gi, 'in'],
  [/\bin order to\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin light of\b/gi, 'given'],
  [/\bwith respect to\b/gi, 'regarding'],
];

function purgeAIPhrases(text) {
  let result = text;
  for (const [pattern, replacement] of AI_PHRASE_KILLS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces and fix capitalization after removal
  result = result.replace(/ {2,}/g, ' ');
  result = result.replace(/([.!?])\s+([a-z])/g, (_, p, c) => p + ' ' + c.toUpperCase());
  return result;
}

// ── Contraction Expansion ──

const CONTRACTIONS_MAP = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "he's": "he is", "she's": "she is", "they're": "they are",
  "we're": "we are", "you're": "you are", "i'm": "I am",
  "they've": "they have", "we've": "we have", "you've": "you have",
  "i've": "I have", "they'll": "they will", "we'll": "we will",
  "you'll": "you will", "i'll": "I will", "let's": "let us",
};

function expandContractions(text) {
  let result = text;
  for (const [c, e] of Object.entries(CONTRACTIONS_MAP)) {
    const re = new RegExp(c.replace("'", "[''']"), 'gi');
    result = result.replace(re, (m) => m[0] === m[0].toUpperCase() ? e.charAt(0).toUpperCase() + e.slice(1) : e);
  }
  return result;
}

// ── N-gram Pattern Breaking ──

function breakNgramPatterns(text) {
  const STARTERS = [
    'At the same time, ', 'On this basis, ', 'In practical terms, ',
    'From this angle, ', 'Taken together, ', 'On a related point, ',
    'In effect, ', 'Put another way, ',
  ];
  const COMMON = new Set(['the','this','that','these','those','it','its','a','an','she','he','they','we','our','his','her','their','one','some','many','most','all','each','every','both','few']);

  return text.split(/\n\s*\n/).map(para => {
    const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    if (sentences.length < 3) return para;

    let idx = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prev = sentences[i - 1].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      const curr = sentences[i].split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      if (prev && curr && prev === curr) {
        const starter = STARTERS[idx % STARTERS.length];
        idx++;
        const firstWord = sentences[i].split(/\s/)[0].replace(/[^a-zA-Z]/g, '');
        if (COMMON.has(firstWord.toLowerCase())) {
          sentences[i] = starter + sentences[i][0].toLowerCase() + sentences[i].slice(1);
        } else {
          sentences[i] = starter + sentences[i];
        }
      }
    }
    return sentences.join(' ');
  }).join('\n\n');
}

// ── LLM Punctuation/Flow Cleanup ──

async function llmPunctuationCleanup(text) {
  try {
    if (!hasGroqApiKey()) return text;

    const client = getGroqClient();
    const wordCount = text.split(/\s+/).length;
    const maxTokens = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await client.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a punctuation and capitalization proofreader. Your ONLY job is to fix punctuation and capitalization errors.

STRICT RULES:
1. DO NOT change, add, remove, or replace ANY word.
2. DO NOT reorder words or sentences.
3. Only fix: missing/wrong periods, commas, semicolons, colons; incorrect capitalization after sentence ends; missing capitalization at sentence starts; duplicate punctuation.
4. Keep paragraph breaks exactly as they are.
5. Return ONLY the corrected text — no commentary.`,
          },
          { role: 'user', content: `Fix ONLY the punctuation and capitalization in this text. Do not change any words.\n\nTEXT:\n${text}` },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
      });

      const result = r.choices[0]?.message?.content?.trim() ?? '';
      if (!result || result.length < text.length * 0.5) continue;

      const strip = (s) => s.replace(/[^a-zA-Z\s]/g, '').toLowerCase().split(/\s+/).filter(w => w);
      const origWords = strip(text);
      const fixedWords = strip(result);
      if (Math.abs(origWords.length - fixedWords.length) <= 2) {
        return result;
      }
    }
    return text;
  } catch {
    return text;
  }
}

/**
 * Full V1.3 pipeline:
 *  1. Pre-process: protect topic keywords, numbers, citations
 *  2. Core: run Stealth Humanizer Engine v5
 *  3. Sentence surgery: merge/split for burstiness
 *  4. AI vocabulary/phrase purge: kill AI fingerprints
 *  5. N-gram pattern breaking: diversify sentence starters
 *  6. Contraction expansion: zero contractions
 *  7. LLM punctuation cleanup: fix without changing words
 *  8. Restore: put back all protected content
 */
export async function pipeline(text, style, aggr) {
  // Step 1: Protect sensitive content
  const { sanitized, map } = preProcess(text);

  // Step 2: Run core V1.3 engine
  let result = rawPipeline(sanitized, style, aggr);

  // Step 3: Sentence surgery for burstiness
  const items = buildSentenceItems(result);
  const surgeryItems = applySentenceSurgery(items);
  result = reassembleFromItems(surgeryItems);

  // Step 4: AI vocabulary purge (targeted — kills AI words without replacing academic vocab with informal)
  result = purgeAIVocabulary(result);
  result = purgeAIPhrases(result);

  // Step 5: N-gram pattern breaking
  result = breakNgramPatterns(result);

  // Step 6: Contraction expansion
  result = expandContractions(result);

  // Step 7: LLM punctuation cleanup (word-preserving)
  result = await llmPunctuationCleanup(result);

  // Step 8: Final cleanup
  result = expandContractions(result); // catch any remaining
  result = purgeAIVocabulary(result);  // catch any reintroduced

  // Step 9: Restore protected content
  result = restoreProtected(result, map);

  return result;
}
