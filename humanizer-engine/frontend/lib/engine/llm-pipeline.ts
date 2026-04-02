/**
 * LLM Pipeline — 8-Phase Anti-Detection Engine (TypeScript port)
 * ==============================================================
 * Surgical AI-text refinement for achieving <5% detection across all detectors.
 *
 * PRE-LLM: Phase 1 (parse/chunk), Phase 2 (AI vocabulary purge)
 * LLM:     Phases 3-6 (combined single-prompt per chunk, concurrent)
 * POST-LLM: Phase 7 (sentence boundary enforcement), Phase 8 (format scrub)
 */

import { readFileSync } from "fs";
import { join } from "path";
// @ts-ignore — OpenAI types
import OpenAI from "openai";
import { sentTokenize } from "./utils";
import { PROTECTED_WORDS } from "./rules";
import { expandContractions } from "./advanced-transforms";
import { protectSpecialContent, restoreSpecialContent } from "./content-protection";

// ── Config ──

const PIPELINE_MODEL = process.env.PIPELINE_MODEL ?? "gpt-4o-mini";
const CHUNK_MAX_WORDS = 200;
const MIN_SENT_WORDS = 8;
const MAX_SENT_WORDS = 50;
const MERGE_SPLIT_BUDGET = 0.05;
const CONCURRENCY_LIMIT = parseInt(process.env.PIPELINE_CONCURRENCY ?? "15", 10);
const LLM_TIMEOUT = parseInt(process.env.PIPELINE_TIMEOUT ?? "8000", 10);

// ── Curated synonyms ──

let CURATED_SYNONYMS: Record<string, string[]> = {};
try {
  const dictDir = join(process.cwd(), "..", "dictionaries");
  CURATED_SYNONYMS = JSON.parse(readFileSync(join(dictDir, "curated_synonyms.json"), "utf-8"));
} catch { /* skip */ }

// ── AI vocabulary kill list ──

const AI_WORD_PURGE: Record<string, string> = {
  furthermore: "also", moreover: "also", additionally: "also",
  consequently: "so", nevertheless: "still", nonetheless: "still",
  subsequently: "then", henceforth: "from now on",
  notwithstanding: "despite", aforementioned: "previous",
  utilize: "use", utilise: "use", leverage: "use",
  facilitate: "help", comprehensive: "thorough",
  multifaceted: "complex", paramount: "key",
  pivotal: "key", crucial: "important",
  delve: "look into", foster: "encourage",
  harness: "use", robust: "strong",
  innovative: "new", groundbreaking: "important",
  transformative: "major", holistic: "whole",
  nuanced: "detailed", meticulous: "careful",
  paradigm: "model", methodology: "method",
  framework: "approach", trajectory: "path",
  discourse: "discussion", dichotomy: "divide",
  ramification: "effect", synergy: "cooperation",
  tapestry: "mix", cornerstone: "foundation",
  bedrock: "basis", catalyst: "driver",
  nexus: "connection", landscape: "field",
  realm: "area", myriad: "many",
  plethora: "plenty", multitude: "many",
  underscore: "highlight", exemplify: "show",
  elucidate: "explain", delineate: "describe",
  ameliorate: "improve", exacerbate: "worsen",
  engender: "create", perpetuate: "continue",
  substantiate: "support", corroborate: "confirm",
  disseminate: "spread", cultivate: "develop",
  ascertain: "find out", endeavor: "try",
  spearhead: "lead", streamline: "simplify",
  optimize: "improve", articulate: "express",
  navigate: "handle", mitigate: "reduce",
  catalyze: "drive", bolster: "support",
  encompass: "include", culminate: "end",
  enhance: "improve", ubiquitous: "widespread",
  salient: "notable", intricate: "complex",
  profound: "deep", inherent: "built-in",
  overarching: "main", substantive: "real",
  efficacious: "effective", noteworthy: "notable",
  proliferate: "spread", necessitate: "require",
  illuminate: "clarify", embark: "start",
  unravel: "untangle", unveil: "reveal",
  notably: "in particular", crucially: "importantly",
  significantly: "greatly", essentially: "basically",
  fundamentally: "at its core", undeniably: "clearly",
  undoubtedly: "certainly", remarkably: "unusually",
  evidently: "clearly",
};

// AI phrase purge patterns
const AI_PHRASE_PURGE: [RegExp, string][] = [
  [/it is (?:important|crucial|essential|vital|imperative) (?:to note )?that\s*/gi, ""],
  [/it (?:should|must|can) be (?:noted|argued|said|emphasized) that\s*/gi, ""],
  [/in (?:order )?to\b/gi, "to"],
  [/in today'?s (?:world|society|landscape|era)\b/gi, "now"],
  [/in the modern (?:era|age|world)\b/gi, "today"],
  [/plays? a (?:crucial|vital|key|significant|important|pivotal|critical) role\b/gi, "matters"],
  [/a (?:wide|broad|vast|diverse) (?:range|array|spectrum|variety) of\b/gi, "many"],
  [/a (?:plethora|myriad|multitude|wealth|abundance) of\b/gi, "many"],
  [/(?:due to|owing to) the fact that\b/gi, "because"],
  [/first and foremost\b/gi, "first"],
  [/each and every\b/gi, "every"],
  [/serves? as a (?:testament|reminder|catalyst|cornerstone)\b/gi, "shows"],
  [/the (?:importance|significance|impact) of\b/gi, "how"],
  [/not only (.{5,40}?) but also\b/gi, "$1 and also"],
  [/(?:taken together|all things considered|on the whole)\b/gi, "overall"],
  [/(?:that being said|having said that|with that in mind)\b/gi, "still"],
  [/(?:in light of|in view of) (?:the above|this|these)\b/gi, "given this"],
  [/at the end of the day\b/gi, "ultimately"],
  [/needless to say\b/gi, "clearly"],
  [/there is no doubt that\b/gi, "clearly"],
];

// AI sentence starters
const AI_STARTER_PATTERNS: [RegExp, string[]][] = [
  [/^Furthermore,?\s+/i, ["Also, ", "On top of that, ", "Beyond this, "]],
  [/^Moreover,?\s+/i, ["Besides, ", "On top of that, ", "Then again, "]],
  [/^Additionally,?\s+/i, ["Also, ", "Along with this, ", "On top of this, "]],
  [/^Consequently,?\s+/i, ["So, ", "Because of this, ", "As a result, "]],
  [/^Subsequently,?\s+/i, ["Then, ", "After that, ", "From there, "]],
  [/^Nevertheless,?\s+/i, ["Still, ", "Even so, ", "That said, "]],
  [/^Nonetheless,?\s+/i, ["Yet, ", "All the same, ", "Even so, "]],
  [/^In\s+conclusion,?\s+/i, ["Overall, ", "All in all, ", "To wrap up, "]],
  [/^Ultimately,?\s+/i, ["In the end, ", "When it comes down to it, "]],
  [/^It is (?:important|crucial|essential|worth|vital) to (?:note|recognize|mention) that\s+/i, [""]],
  [/^In today'?s (?:world|society|era),?\s+/i, [""]],
  [/^In the modern (?:era|age|world),?\s+/i, [""]],
  [/^(?:This|These)\s+(?:findings?|results?)\s+(?:suggest|indicate|demonstrate)\s+that\s+/i, [""]],
];

// Contraction expansion
const CONTRACTION_MAP: Record<string, string> = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not",
  "mustn't": "must not", "it's": "it is", "that's": "that is",
  "there's": "there is", "here's": "here is", "he's": "he is",
  "she's": "she is", "they're": "they are", "we're": "we are",
  "you're": "you are", "i'm": "I am", "they've": "they have",
  "we've": "we have", "you've": "you have", "i've": "I have",
  "they'll": "they will", "we'll": "we will", "you'll": "you will",
  "i'll": "I will", "he'll": "he will", "she'll": "she will",
  "it'll": "it will", "let's": "let us", "who's": "who is",
  "what's": "what is",
};

const CONTRACTION_RE = new RegExp(
  "\\b(" + Object.keys(CONTRACTION_MAP).map((k) => k.replace(/'/g, "'?")).join("|") + ")\\b",
  "gi",
);

function pipelineExpandContractions(text: string): string {
  return text.replace(CONTRACTION_RE, (match) => {
    const expanded = CONTRACTION_MAP[match.toLowerCase()] ?? match;
    return match[0] === match[0].toUpperCase() && expanded[0] === expanded[0].toLowerCase()
      ? expanded[0].toUpperCase() + expanded.slice(1) : expanded;
  });
}

// ── Helpers ──

function safeDowncaseFirst(s: string): string {
  if (!s) return s;
  const fw = s.split(/\s+/)[0] ?? "";
  if (fw.length > 1 && fw === fw.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

function wordCount(text: string): number { return text.split(/\s+/).filter(Boolean).length; }

function sentenceLengths(sents: string[]): number[] { return sents.map((s) => wordCount(s)); }

function getDistribution(lengths: number[]): Record<string, number> {
  if (lengths.length === 0) return {};
  const buckets: [number, number][] = [[10, 15], [16, 25], [26, 35], [36, 45], [46, 50]];
  const result: Record<string, number> = {};
  for (const [lo, hi] of buckets) {
    const c = lengths.filter((l) => l >= lo && l <= hi).length;
    result[`${lo}-${hi}`] = c / lengths.length;
  }
  return result;
}

// ── Phase 1: sentence parsing & chunking ──

type ChunkItem = { type: "SENT" | "BREAK"; text: string };

function phase1ParseAndChunk(text: string): ChunkItem[][] {
  const paragraphs = text.split(/\n\s*\n/);
  const items: ChunkItem[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;
    for (const s of sentTokenize(para)) {
      const st = s.trim();
      if (st) items.push({ type: "SENT", text: st });
    }
    if (i < paragraphs.length - 1) items.push({ type: "BREAK", text: "" });
  }

  const chunks: ChunkItem[][] = [];
  let current: ChunkItem[] = [];
  let currentWords = 0;

  for (const item of items) {
    if (item.type === "BREAK") { current.push(item); continue; }
    const wc = wordCount(item.text);
    if (currentWords + wc > CHUNK_MAX_WORDS && current.some((c) => c.type === "SENT")) {
      chunks.push(current);
      current = [item];
      currentWords = wc;
    } else {
      current.push(item);
      currentWords += wc;
    }
  }
  if (current.some((c) => c.type !== "BREAK")) chunks.push(current);
  return chunks;
}

// ── Phase 2: AI vocabulary purge ──

function phase2VocabularyPurge(chunks: ChunkItem[][]): ChunkItem[][] {
  return chunks.map((chunk) =>
    chunk.map((item) => {
      if (item.type === "BREAK") return item;
      let sent = item.text;

      // Phrase purge
      for (const [pattern, repl] of AI_PHRASE_PURGE) {
        sent = sent.replace(new RegExp(pattern.source, pattern.flags), repl);
      }

      // Starter kill
      for (const [pattern, replacements] of AI_STARTER_PATTERNS) {
        const m = sent.match(pattern);
        if (m) {
          const repl = replacements[Math.floor(Math.random() * replacements.length)];
          let rest = sent.slice(m[0].length);
          if (!repl && rest) rest = rest[0].toUpperCase() + rest.slice(1);
          sent = repl + rest;
          break;
        }
      }

      // Word-by-word vocabulary purge
      const words = sent.split(/\s+/);
      const newWords: string[] = [];
      for (const w of words) {
        const stripped = w.replace(/^[.,;:!?"'()\-\[\]{}]+/, "").replace(/[.,;:!?"'()\-\[\]{}]+$/, "");
        const lower = stripped.toLowerCase();

        let purgeMatch: string | null = null;
        if (AI_WORD_PURGE[lower]) purgeMatch = lower;
        else {
          for (const suffix of ["ed", "ing", "s", "es", "ly", "ment", "tion", "ness"]) {
            if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
              let stem = lower.slice(0, -suffix.length);
              if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2]) stem = stem.slice(0, -1);
              if (AI_WORD_PURGE[stem]) { purgeMatch = stem; break; }
              if (AI_WORD_PURGE[stem + "e"]) { purgeMatch = stem + "e"; break; }
            }
          }
        }

        if (purgeMatch) {
          let replacement = AI_WORD_PURGE[purgeMatch];
          if (stripped[0] === stripped[0].toUpperCase()) replacement = replacement[0].toUpperCase() + replacement.slice(1);
          const pre = w.match(/^[.,;:!?"'()\-\[\]{}]+/)?.[0] ?? "";
          const suf = w.match(/[.,;:!?"'()\-\[\]{}]+$/)?.[0] ?? "";
          newWords.push(pre + replacement + suf);
        } else {
          // Curated synonym swap (15% chance)
          if (CURATED_SYNONYMS[lower] && Math.random() < 0.15 && !PROTECTED_WORDS.has(lower) && lower.length > 3) {
            const candidates = CURATED_SYNONYMS[lower].filter((c) => !c.includes(" ") && c.length >= 3 && c.length <= 15);
            if (candidates.length > 0) {
              let repl = candidates[Math.floor(Math.random() * candidates.length)];
              if (stripped[0] === stripped[0].toUpperCase()) repl = repl[0].toUpperCase() + repl.slice(1);
              const pre = w.match(/^[.,;:!?"'()\-\[\]{}]+/)?.[0] ?? "";
              const suf = w.match(/[.,;:!?"'()\-\[\]{}]+$/)?.[0] ?? "";
              newWords.push(pre + repl + suf);
            } else {
              newWords.push(w);
            }
          } else {
            newWords.push(w);
          }
        }
      }
      sent = newWords.join(" ").trim();
      if (sent && sent[0] !== sent[0].toUpperCase()) sent = sent[0].toUpperCase() + sent.slice(1);

      return { type: "SENT" as const, text: sent };
    }),
  );
}

// ── Phases 3-6: LLM combined prompt ──

function buildCombinedPrompt(chunkText: string): string {
  const sentences = sentTokenize(chunkText);
  const annotated = sentences.map((s) => `[${wordCount(s)}w] ${s}`).join("\n");

  return `Edit each sentence. [Nw] = current word count.

RULES:
1. Swap 1-3 formal/predictable words with simpler ones. Word-for-word only. Do NOT remove words.
2. If 3+ consecutive sentences share voice (active/passive), convert ONE to the opposite.
3. Each sentence must stay within ±3 words of its [Nw] count and be at least 8 words.
4. Keep exactly ${sentences.length} sentences. No merging, splitting, adding, removing.

DO NOT CHANGE these terms: artificial intelligence, machine learning, AI, deep learning, natural language, neural network, data science, blockchain, cybersecurity, internet of things, cloud computing, human.
BANNED: em-dash, en-dash, semicolon, Furthermore, Moreover, Additionally, Consequently, Nevertheless, crucial, utilize, foster, delve, leverage, paradigm, tapestry, pivotal, holistic.

Output only the edited flowing text. No labels, commentary, markdown.

${annotated}`;
}

function chunkToText(chunk: ChunkItem[]): string {
  const parts: string[] = [];
  let current: string[] = [];
  for (const item of chunk) {
    if (item.type === "BREAK") {
      if (current.length) { parts.push(current.join(" ")); current = []; }
    } else {
      current.push(item.text);
    }
  }
  if (current.length) parts.push(current.join(" "));
  return parts.join("\n\n");
}

async function asyncLlmCall(
  client: OpenAI, chunkText: string,
): Promise<string> {
  const prompt = buildCombinedPrompt(chunkText);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await client.chat.completions.create(
      {
        model: PIPELINE_MODEL,
        messages: [
          { role: "system", content: "Precision text editor. Surgical word-level edits only. Return edited text, nothing else." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 400,
      },
      { signal: controller.signal },
    );
    let result = response.choices[0]?.message?.content?.trim() ?? chunkText;
    if (result.startsWith("```")) {
      result = result.split("\n").filter((l: string) => !l.trim().startsWith("```")).join("\n").trim();
    }
    return result;
  } catch {
    return chunkText;
  } finally {
    clearTimeout(timeout);
  }
}

async function phases3to6LlmProcess(chunks: ChunkItem[][]): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return chunks.map(chunkToText);
  }

  const client = new OpenAI({ apiKey });

  // Process with concurrency limit
  const results: string[] = new Array(chunks.length);
  const texts = chunks.map(chunkToText);

  for (let i = 0; i < texts.length; i += CONCURRENCY_LIMIT) {
    const batch = texts.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map((t) => asyncLlmCall(client, t));
    const batchResults = await Promise.allSettled(promises);
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j] as PromiseSettledResult<string>;
      results[i + j] = r.status === "fulfilled" ? r.value : texts[i + j];
    }
  }

  return results;
}

// ── Phase 7: sentence boundary enforcement ──

function phase7EnforceBoundaries(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const enforced: string[] = [];

  for (const para of paragraphs) {
    const tp = para.trim();
    if (!tp) continue;
    let sentences = sentTokenize(tp);
    if (sentences.length < 1) { enforced.push(tp); continue; }

    const totalCount = sentences.length;
    const mergeBudget = totalCount >= 6 ? Math.ceil(totalCount * MERGE_SPLIT_BUDGET) : 0;

    // Pass 1: distribution shaping — merge short pairs into 26-50w
    if (mergeBudget > 0 && totalCount >= 4) {
      const candidates: [number, number][] = [];
      for (let i = 0; i < sentences.length - 1; i++) {
        const wc1 = wordCount(sentences[i]);
        const wc2 = wordCount(sentences[i + 1]);
        const combined = wc1 + wc2 + 1;
        if (wc1 <= 30 && wc2 <= 30 && combined >= 26 && combined <= MAX_SENT_WORDS) {
          candidates.push([combined >= 36 ? 3 : combined >= 26 ? 1 : 0, i]);
        }
      }
      candidates.sort((a, b) => b[0] - a[0]);
      const mergeIndices = new Set<number>();
      let planned = 0;
      for (const [, idx] of candidates) {
        if (planned >= mergeBudget) break;
        if (!mergeIndices.has(idx) && !mergeIndices.has(idx + 1)) {
          mergeIndices.add(idx);
          planned++;
        }
      }
      const joiners = ["and", "while", "because", "since", "as"];
      const result: string[] = [];
      let i = 0;
      while (i < sentences.length) {
        if (mergeIndices.has(i) && i + 1 < sentences.length) {
          const joiner = joiners[Math.floor(Math.random() * joiners.length)];
          let merged = sentences[i].replace(/[.\s]+$/, "") + ", " + joiner + " " + safeDowncaseFirst(sentences[i + 1]);
          if (!/[.!?]$/.test(merged.trim())) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
          result.push(merged);
          i += 2;
        } else {
          result.push(sentences[i]);
          i++;
        }
      }
      sentences = result;
    }

    // Pass 2: merge too-short (<MIN_SENT_WORDS)
    {
      const result: string[] = [];
      let i = 0;
      while (i < sentences.length) {
        const wc = wordCount(sentences[i]);
        if (wc < MIN_SENT_WORDS) {
          if (i + 1 < sentences.length) {
            let merged = sentences[i].replace(/[.\s]+$/, "") + ", " + safeDowncaseFirst(sentences[i + 1]);
            if (!/[.!?]$/.test(merged.trim())) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
            result.push(merged);
            i += 2;
            continue;
          }
          if (result.length > 0) {
            let merged = result[result.length - 1].replace(/[.\s]+$/, "") + ", " + safeDowncaseFirst(sentences[i]);
            if (!/[.!?]$/.test(merged.trim())) merged = merged.replace(/[.,;:\s]+$/, "") + ".";
            result[result.length - 1] = merged;
            i++;
            continue;
          }
        }
        result.push(sentences[i]);
        i++;
      }
      sentences = result;
    }

    // Pass 3: split too-long (>MAX_SENT_WORDS)
    {
      const result: string[] = [];
      for (const sent of sentences) {
        const words = sent.split(/\s+/);
        if (words.length > MAX_SENT_WORDS) {
          const mid = Math.floor(words.length / 2);
          let done = false;
          for (let offset = 0; offset < Math.min(15, mid - MIN_SENT_WORDS); offset++) {
            for (const pos of [mid + offset, mid - offset]) {
              if (pos < MIN_SENT_WORDS || pos > words.length - MIN_SENT_WORDS) continue;
              const w = words[pos - 1];
              const nextW = words[pos].toLowerCase().replace(/[.,;:]/g, "");
              if (w.endsWith(",") || w.endsWith(";") || ["and", "but", "while", "though", "although", "because", "since", "whereas", "however", "so"].includes(nextW)) {
                const s1 = words.slice(0, pos).join(" ").replace(/[,;]+$/, "") + ".";
                const s2Words = [...words.slice(pos)];
                if (s2Words[0] && ["and", "but", "so"].includes(s2Words[0].toLowerCase().replace(/[.,;:]/g, ""))) {
                  if (s2Words.length > 1) s2Words.shift();
                }
                if (s2Words[0]) s2Words[0] = s2Words[0][0].toUpperCase() + s2Words[0].slice(1);
                let s2 = s2Words.join(" ");
                if (!/[.!?]$/.test(s2)) s2 = s2.replace(/[.,;:\s]+$/, "") + ".";
                if (wordCount(s1) >= MIN_SENT_WORDS && wordCount(s2) >= MIN_SENT_WORDS) {
                  result.push(s1, s2);
                  done = true;
                  break;
                }
              }
            }
            if (done) break;
          }
          if (!done) result.push(sent);
        } else {
          result.push(sent);
        }
      }
      sentences = result;
    }

    enforced.push(sentences.join(" "));
  }

  return enforced.join("\n\n");
}

// ── Phase 8: format scrub ──

function phase8FormatScrub(text: string, noContractions = true): string {
  // Process each paragraph independently to preserve paragraph breaks
  const paragraphs = text.split(/\n\s*\n/);
  const cleaned: string[] = [];

  for (const para of paragraphs) {
    let p = para.trim();
    if (!p) continue;

    // Em/en dashes → commas
    p = p.replace(/ — /g, ", ").replace(/—/g, ", ");
    p = p.replace(/ – /g, ", ").replace(/–/g, ", ");
    p = p.replace(/ - (?=[A-Za-z])/g, ", ");

    // Semicolons → periods
    p = p.replace(/;\s*/g, ". ");
    p = p.replace(/\.\s+([a-z])/g, (_, c) => ". " + c.toUpperCase());

    // Whitespace (only horizontal — preserve no newlines within a paragraph)
    p = p.replace(/[^\S\n]+/g, " ");
    p = p.replace(/,\s*,/g, ",");
    p = p.replace(/,\./g, ".");

    // a/an agreement
    p = p.replace(/\ba ([aeiouAEIOU])/g, "an $1");
    p = p.replace(/\bA ([aeiouAEIOU])/g, "An $1");
    p = p.replace(/\ban ([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ])/g, "a $1");

    if (noContractions) p = pipelineExpandContractions(p);

    const sents = sentTokenize(p);
    const cs = sents.map((s) => {
      s = s.trim();
      if (!s) return "";
      s = s[0].toUpperCase() + s.slice(1);
      if (!/[.!?]$/.test(s)) s = s.replace(/[.,;:\s]+$/, "") + ".";
      return s;
    }).filter(Boolean);
    cleaned.push(cs.join(" "));
  }
  return cleaned.join("\n\n");
}

// ── Pipeline orchestrator ──

export async function runPipelineAsync(text: string, noContractions = true): Promise<string> {
  if (!text?.trim()) return text;

  // Protect brackets, figures, percentages before processing
  const { text: protectedText, map: protectionMap } = protectSpecialContent(text);

  // Phase 1: Parse & Chunk
  const chunks = phase1ParseAndChunk(protectedText);

  // Phase 2: AI Vocabulary Purge
  const purged = phase2VocabularyPurge(chunks);

  // Phases 3-6: LLM Processing (concurrent)
  const processed = await phases3to6LlmProcess(purged);

  // Stitch together
  let fullText = processed.join("\n\n");

  // Phase 8: Format Scrub (before boundary enforcement)
  fullText = phase8FormatScrub(fullText, noContractions);

  // Phase 7: Boundary Enforcer (runs LAST)
  fullText = phase7EnforceBoundaries(fullText);

  // Restore protected content
  fullText = restoreSpecialContent(fullText, protectionMap);

  return fullText;
}
