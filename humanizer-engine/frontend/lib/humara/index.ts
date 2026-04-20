/**
 * Humara — Stealth Humanizer Engine v5 + proven v2 safeguards
 * ============================================================
 * Primary engine: new v5 algorithmic pipeline.
 * Quality layer: backed-up v2 protections, constraint enforcement,
 * sentence fallback, and coherence cleanup.
 */

import { pipeline } from './engine.js';
import {
  protectContent,
  restoreContent,
  repairGrammar,
  applyCoherenceFixes,
} from './post-process.js';
import { humaraHumanize as backupHumaraHumanize } from '../humara-v2-backup/core/Humanizer';
import { enforceConstraints } from '../humara-v2-backup/core/ConstraintEngine';
import { splitSentences, enforceSentenceCount } from '../humara-v2-backup/core/SentenceLock';
import { minimalTransform } from '../humara-v2-backup/core/Transformer';
import {
  looksLikeHeadingLine,
  parseStructuredBlocks,
  reflowParagraphToOriginalLines,
} from '../engine/structure-preserver';
import {
  humanizeSentence,
} from '../humanize-transforms';
import { validateAndRepairOutput } from '../engine/validation-post-process';

export interface HumaraOptions {
  strength?: 'light' | 'medium' | 'heavy';
  tone?: 'neutral' | 'academic' | 'professional' | 'casual';
  strictMeaning?: boolean;
}

const STRENGTH_TO_AGGR: Record<string, number> = {
  light: 4,
  medium: 6,
  heavy: 8,
};

const TONE_TO_STYLE: Record<string, string> = {
  neutral: 'academic',
  academic: 'academic',
  professional: 'professional',
  casual: 'casual',
};

const TONE_TO_BACKUP: Record<string, 'neutral' | 'academic' | 'casual'> = {
  neutral: 'neutral',
  academic: 'academic',
  professional: 'academic',
  casual: 'casual',
};

const FIRST_PERSON_RE = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
const CRITICAL_TOKEN_RE = /\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b|\[[^\]]+\]|\([A-Z][^)]*\d{4}[a-z]?\)|\b[A-Z]{2,}\b/g;
const SUSPICIOUS_PATTERNS = [
  /⟦p\d+⟧|⟦PROT_\d+⟧|«DM\d+»/i,
  /\bmore\s+(?:along with|together with)\s+more\b/i,
  /\b(?:the described|the noted|the cited|the mentioned)\b/i,
  /\bsignificant to note\b|\bimportant to note\b/i,
  /\b(outcome|result|finding|consequence)\s+(outcome|result|finding|consequence)\b/i,
  /\b(?:point|aspect|element|factor)\s+to\s+(?:that|the|an?)\b/i,
  /\b(\w+)\s+\1\b/i,
  /,,|;;|\.\.|,\.|;\./,
  /\b(?:and|with|of|to|for|in)\s+(?:and|with|of|to|for|in)\b/i,
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeSentence(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%$()[\].,\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractCriticalTokens(text: string): string[] {
  return Array.from(new Set(text.match(CRITICAL_TOKEN_RE) ?? []));
}

function looksLikeHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && lines.every((line) => looksLikeHeadingLine(line));
}

function isSuspiciousSentence(original: string, candidate: string): boolean {
  const cleaned = candidate.trim();
  if (!cleaned) return true;

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(cleaned)) return true;
  }

  const originalWordCount = countWords(original);
  const candidateWordCount = countWords(cleaned);
  if (originalWordCount >= 8) {
    const ratio = candidateWordCount / Math.max(originalWordCount, 1);
    if (ratio < 0.55 || ratio > 1.7) return true;
  }

  for (const token of extractCriticalTokens(original)) {
    if (!cleaned.includes(token)) return true;
  }

  return false;
}

function scoreCandidate(original: string, candidate: string): number {
  const cleaned = candidate.trim();
  if (!cleaned) return -999;

  let score = 100;
  const originalWordCount = countWords(original);
  const candidateWordCount = countWords(cleaned);
  const ratio = candidateWordCount / Math.max(originalWordCount, 1);

  if (normalizeSentence(cleaned) !== normalizeSentence(original)) score += 6;
  if (cleaned === original.trim()) score -= 4;
  if (!/[.!?]$/.test(cleaned)) score -= 10;
  if (isSuspiciousSentence(original, cleaned)) score -= 60;
  score -= Math.abs(1 - ratio) * 20;

  return score;
}

function buildConservativeFallback(original: string, inputHadFirstPerson: boolean): string {
  let result = minimalTransform(original);
  result = repairGrammar(result);
  result = enforceConstraints(result, inputHadFirstPerson);
  return result;
}

function chooseBestSentence(
  original: string,
  candidates: Array<string | undefined>,
  inputHadFirstPerson: boolean,
): string {
  const safeCandidates = candidates
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => enforceConstraints(repairGrammar(candidate), inputHadFirstPerson));

  if (safeCandidates.length === 0) {
    return buildConservativeFallback(original, inputHadFirstPerson);
  }

  let best = safeCandidates[0];
  let bestScore = scoreCandidate(original, best);

  for (const candidate of safeCandidates.slice(1)) {
    const score = scoreCandidate(original, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore < 45 ? buildConservativeFallback(original, inputHadFirstPerson) : best;
}

function runPrimaryPass(input: string, style: string, aggr: number): string {
  const { sanitized, map } = protectContent(input);
  const output = pipeline(sanitized, style, aggr);
  return restoreContent(output, map);
}

function humanizeBlock(text: string, options: Required<HumaraOptions>): string {
  const input = text.trim();
  if (!input) return text;
  if (looksLikeHeading(input) || countWords(input) <= 5) return input;

  const style = TONE_TO_STYLE[options.tone] ?? 'academic';
  const requestedAggr = STRENGTH_TO_AGGR[options.strength] ?? 6;
  const aggr = options.strictMeaning ? Math.min(requestedAggr, 5) : requestedAggr;

  let output = input;
  try {
    output = runPrimaryPass(input, style, aggr);
  } catch {
    output = input;
  }

  // Light grammar/coherence cleanup (no sentence splitting to avoid citation breakage)
  output = repairGrammar(output);
  output = output.replace(/[ \t]{2,}/g, ' ').trim();

  return output;
}

export function humaraHumanize(text: string, options: HumaraOptions = {}): string {
  if (!text || !text.trim()) return text;

  const normalizedOptions: Required<HumaraOptions> = {
    strength: options.strength ?? 'medium',
    tone: options.tone ?? 'neutral',
    strictMeaning: options.strictMeaning ?? false,
  };

  let output = parseStructuredBlocks(text)
    .map((block) => {
      if (block.type === 'blank' || block.type === 'heading') {
        return block.rawLines.join('\n');
      }

      const paragraph = block.rawLines
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ');

      const humanized = humanizeBlock(paragraph, normalizedOptions);
      return reflowParagraphToOriginalLines(block.rawLines, humanized);
    })
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ');

  // ── POST-PROCESSING VALIDATION ──
  try {
    const validationResult = validateAndRepairOutput(text, output, {
      allowWordChangeBound: 0.7,
      minSentenceWords: 3,
      autoRepair: true,
    });
    if (validationResult.wasRepaired) {
      output = validationResult.text;
    }
  } catch (error) {
    console.warn('[humaraHumanize] Validation error:', error);
  }

  return output;
}
