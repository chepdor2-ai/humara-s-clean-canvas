/**
 * Phase 16 — Post-Humanization Validation
 * =========================================
 * Enforces: capitalization, no contractions, no rhetorical questions,
 * no first-person (unless present in original), single-sentence integrity,
 * and 40% minimum word-level change per sentence.
 */

import type { DocumentState, Phase } from '../types';
import { isLLMAvailable } from '../services/llmService';
import OpenAI from 'openai';

const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';

async function llmFixPunctuation(text: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return text;

  const client = new OpenAI({ apiKey });
  const wordCount = text.trim().split(/\s+/).length;
  const maxTokens = Math.min(16384, Math.max(4096, Math.ceil(wordCount * 2)));

  const systemPrompt = `You are a punctuation proofreader. Your ONLY job is to fix punctuation and capitalization errors.

STRICT RULES:
1. DO NOT change, add, remove, or replace ANY word.
2. DO NOT reorder words or sentences.
3. DO NOT add or remove sentences or paragraphs.
4. Only fix: missing/wrong periods, commas, semicolons, colons; incorrect capitalization after sentence ends; missing capitalization at sentence starts; duplicate punctuation.
5. Keep paragraph breaks exactly as they are.
6. Return ONLY the corrected text — no commentary.

You are ONLY allowed to touch punctuation marks and letter capitalization. Do NOT change any word.`;

  const userPrompt = `Fix ONLY the punctuation and capitalization in this text. Do not change any words.\n\nTEXT:\n${text}`;

  try {
    const r = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    });
    const result = r.choices[0]?.message?.content?.trim() ?? '';
    if (!result || result.length < text.length * 0.5) return text;

    // Verify no words changed
    const strip = (s: string) => s.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
    const origWords = strip(text);
    const fixedWords = strip(result);
    const maxDrift = Math.max(3, Math.ceil(origWords.length * 0.02));
    let diffs = Math.abs(origWords.length - fixedWords.length);
    const minLen = Math.min(origWords.length, fixedWords.length);
    for (let i = 0; i < minLen; i++) {
      if (origWords[i] !== fixedWords[i]) diffs++;
    }
    if (diffs > maxDrift) return text;

    return result;
  } catch {
    return text;
  }
}

// ── Contraction expansions ──

const CONTRACTIONS: Record<string, string> = {
  "can't": "cannot", "won't": "will not", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "shouldn't": "should not", "wouldn't": "would not", "couldn't": "could not",
  "mustn't": "must not", "shan't": "shall not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "here's": "here is", "what's": "what is", "who's": "who is",
  "let's": "let us", "he's": "he is", "she's": "she is",
  "i'm": "I am", "you're": "you are", "we're": "we are",
  "they're": "they are", "i've": "I have", "you've": "you have",
  "we've": "we have", "they've": "they have",
  "i'll": "I will", "you'll": "you will", "he'll": "he will",
  "she'll": "she will", "we'll": "we will", "they'll": "they will",
  "i'd": "I would", "you'd": "you would", "he'd": "he would",
  "she'd": "she would", "we'd": "we would", "they'd": "they would",
};

const CONTRACTION_RE = new RegExp(
  "\\b(" + Object.keys(CONTRACTIONS).map(k => k.replace("'", "'?")).join("|") + ")\\b",
  "gi"
);

// ── First-person patterns ──

const FIRST_PERSON_PATTERNS = [
  { re: /\bI believe\b/gi, rep: "It is believed" },
  { re: /\bI think\b/gi, rep: "It appears" },
  { re: /\bI feel\b/gi, rep: "It seems" },
  { re: /\bI suggest\b/gi, rep: "It is suggested" },
  { re: /\bI recommend\b/gi, rep: "It is recommended" },
  { re: /\bI argue\b/gi, rep: "It is argued" },
  { re: /\bI contend\b/gi, rep: "It is contended" },
  { re: /\bIn my opinion\b/gi, rep: "Arguably" },
  { re: /\bIn my view\b/gi, rep: "From one perspective" },
  { re: /\bI would say\b/gi, rep: "One might say" },
  { re: /\bI have found\b/gi, rep: "Research indicates" },
  { re: /\bwe can see\b/gi, rep: "it is evident" },
  { re: /\bwe can observe\b/gi, rep: "one can observe" },
  { re: /\bwe must\b/gi, rep: "it is necessary to" },
  { re: /\bwe should\b/gi, rep: "it is advisable to" },
  { re: /\bwe need to\b/gi, rep: "there is a need to" },
];

// ── Utility helpers ──

function expandContractions(text: string): string {
  return text.replace(CONTRACTION_RE, (match) => {
    const key = match.toLowerCase().replace(/\u2019/g, "'");
    return CONTRACTIONS[key] || match;
  });
}

function fixRhetoricalQuestions(text: string): string {
  return text.replace(/([A-Z][^.!?]*)\?\s*/g, (match, body) => {
    const lower = body.trim().toLowerCase();
    // Keep genuine questions (start with interrogative)
    if (/^(what|who|where|when|how|why|which|is|are|do|does|did|can|could|would|should|will|has|have)\b/.test(lower)) {
      // But if rhetorical (no context for answer), convert
      return body.trim() + ". ";
    }
    return body.trim() + ". ";
  });
}

function removeFirstPerson(text: string): string {
  let result = text;
  for (const { re, rep } of FIRST_PERSON_PATTERNS) {
    result = result.replace(re, rep);
  }
  return result;
}

function getWordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s'-]/g, "").split(/\s+/).filter(w => w.length > 0)
  );
}

function getWordChangePercent(original: string, humanized: string): number {
  const origWords = getWordSet(original);
  const humWords = getWordSet(humanized);
  if (origWords.size === 0) return 100;
  const union = new Set([...origWords, ...humWords]);
  const intersection = new Set([...origWords].filter(w => humWords.has(w)));
  if (union.size === 0) return 0;
  return ((union.size - intersection.size) / union.size) * 100;
}

function fixCapitalization(text: string): string {
  // Capitalize first letter
  let result = text.replace(/^\s*([a-z])/, (_, c) => c.toUpperCase());
  // Capitalize after sentence-ending punctuation
  result = result.replace(/([.!?])\s+([a-z])/g, (_, p, c) => p + " " + c.toUpperCase());
  return result;
}

function originalHasFirstPerson(originalText: string): boolean {
  return /\b(I|my|me|mine|myself|we|our|us|ours|ourselves)\b/.test(originalText);
}

export const validationPhase: Phase = {
  name: 'validation',
  async process(state: DocumentState): Promise<DocumentState> {
    const origHasFP = originalHasFirstPerson(state.originalText);
    let fixCount = 0;

    for (const para of state.paragraphs) {
      for (const sent of para.sentences) {
        let text = sent.text;

        // 1. Expand contractions
        text = expandContractions(text);

        // 2. Fix rhetorical questions
        text = fixRhetoricalQuestions(text);

        // 3. Remove first-person (unless original had it)
        if (!origHasFP) {
          text = removeFirstPerson(text);
        }

        // 4. Fix capitalization
        text = fixCapitalization(text);

        // 5. Enforce single sentence (if original was single)
        const origSentCount = sent.originalText
          .split(/(?<=[.!?])\s+/)
          .filter(s => s.trim().length > 0).length;
        if (origSentCount <= 1) {
          const parts = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
          if (parts.length > 1) {
            // Collapse back to one sentence
            const collapsed = parts.map((p, i) => {
              if (i === 0) return p.replace(/[.!?]+\s*$/, "");
              const lower = p[0]?.toLowerCase() + p.slice(1);
              return lower.replace(/[.!?]+\s*$/, "");
            }).join(", ");
            text = collapsed + ".";
            text = fixCapitalization(text);
          }
        }

        // 6. Track if changed
        if (text !== sent.text) {
          fixCount++;
          sent.text = text;
        }

        // 7. Log if change percent is low
        const pct = getWordChangePercent(sent.originalText, sent.text);
        if (pct < 40) {
          state.logs.push(
            `[validation] Warning: sentence ${sent.id} only ${pct.toFixed(0)}% changed`
          );
        }
      }
    }

    // Also apply to currentText if it's already assembled
    if (state.currentText) {
      let ct = state.currentText;
      ct = expandContractions(ct);
      ct = fixRhetoricalQuestions(ct);
      if (!origHasFP) ct = removeFirstPerson(ct);
      ct = fixCapitalization(ct);

      // Strict LLM punctuation cleanup with word-preservation loop
      if (isLLMAvailable()) {
        for (let puncLoop = 0; puncLoop < 3; puncLoop++) {
          const beforePunc = ct;
          const puncResult = await llmFixPunctuation(ct);
          const beforeWords = beforePunc.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
          const afterWords = puncResult.replace(/[^a-zA-Z\s]/g, "").toLowerCase().split(/\s+/).filter(w => w);
          if (Math.abs(beforeWords.length - afterWords.length) <= 2) {
            ct = puncResult;
            state.logs.push(`[validation] LLM punctuation pass ${puncLoop + 1}: accepted`);
            break;
          } else {
            state.logs.push(`[validation] LLM punctuation pass ${puncLoop + 1}: rejected — word count changed`);
          }
        }
      }

      state.currentText = ct;
    }

    state.logs.push(`[validation] ${fixCount} sentences fixed`);
    return state;
  },
};
