import { applySentenceStartersDistribution, applyNuruDocumentFlowCalibration } from '@/lib/engine/stealth/nuru-document-phases';
import { robustSentenceSplit } from '@/lib/engine/content-protection';
import { getDetector } from '@/lib/engine/multi-detector';
import OpenAI from 'openai';
import { isMeaningPreserved, isMeaningPreservedSync } from '@/lib/engine/semantic-guard';
import { fixCapitalization, applyPhrasePatterns, fixPunctuation, expandAllContractions, AI_WORD_REPLACEMENTS } from '@/lib/engine/shared-dictionaries';
import { deduplicateRepeatedPhrases } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure } from '@/lib/engine/structure-preserver';
import { structuralPostProcess } from '@/lib/engine/structural-post-processor';
import { unifiedSentenceProcess } from '@/lib/sentence-processor';
import { expandContractions } from '@/lib/humanize-transforms';
import { removeEmDashes, fixOutOfContextSynonyms, validateCollocations, replaceCollocations, compressPhrases } from '@/lib/engine/v13-shared-techniques';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { kingHumanize } from '@/lib/engine/king-humanizer';
import { llmHumanize, deepAICleanOneSentence, restructureSentence } from '@/lib/engine/llm-humanizer';
import { premiumHumanize } from '@/lib/engine/premium-humanizer';
import { humanizeV11 } from '@/lib/engine/v11';
import { humaraHumanize } from '@/lib/humara';
import { nuruHumanize } from '@/lib/engine/nuru-humanizer';
import { stealthHumanize, stealthHumanizeTargeted } from '@/lib/engine/stealth';
import { applySentenceStartersDistribution, applyNuruDocumentFlowCalibration } from '@/lib/engine/stealth/nuru-document-phases';
import { omegaHumanize } from '@/lib/engine/omega-humanizer';
import { easyHumanize } from '@/lib/engine/easy-humanizer';
import { ozoneHumanize } from '@/lib/engine/ozone-humanizer';
import { oxygenHumanize } from '@/lib/engine/oxygen-humanizer';
import { dipperHumanize } from '@/lib/engine/dipper-humanizer';
import { humarinHumanize } from '@/lib/engine/humarin-humanizer';
import { t5Humanize } from '@/lib/engine/t5-humanizer';
import { oxygen3Humanize } from '@/lib/engine/oxygen3-humanizer';
import { synonymReplace } from '@/lib/engine/utils';
import { applyAIWordKill } from '@/lib/engine/shared-dictionaries';
import { postCleanGrammar } from '@/lib/engine/grammar-cleaner';
import { fixMidSentenceCapitalization } from '@/lib/engine/validation-post-process';
import { analyze as analyzeContext } from '@/lib/engine/context-analyzer';
import { analyzeText as analyzeLinguisticText } from '@/lib/engine/linguistic-intelligence-core';
import { createServiceClient } from '@/lib/supabase';

export const maxDuration = 120;

/* ── SSE streaming humanization with per-sentence stage updates ─────── */

// Event types sent to the client:
// { type: 'init', sentences: string[], paragraphs: number[] }
//   → original sentences, with paragraph boundary indices
// { type: 'stage', stage: string }
//   → a new processing stage has started
// { type: 'sentence', index: number, text: string, stage: string }
//   → sentence at index updated to new text for given stage
// { type: 'done', humanized: string, detection: {...}, meaning: number }
//   → final result with scores

function sendSSE(controller: ReadableStreamDefaultController, data: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function sendStage(
  controller: ReadableStreamDefaultController,
  stage: string,
  details: {
    phaseOps?: number;
    cycleCurrent?: number;
    cycleTotal?: number;
    cycleLabel?: string;
  } = {},
) {
  sendSSE(controller, { type: 'stage', stage, ...details });
}

/** Small delay to allow the stream to flush so the browser can render intermediate states */
function flushDelay(ms = 1): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ms, 2))));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timer));
  });
}

/** Staggered per-sentence emit with small delays between each */
async function emitSentencesStaggered(
  controller: ReadableStreamDefaultController,
  sentences: string[],
  stage: string,
  delayMs = 2,
) {
  for (let i = 0; i < sentences.length; i++) {
    sendSSE(controller, { type: 'sentence', index: i, text: sentences[i], stage });
    if (i < sentences.length - 1) await flushDelay(delayMs);
  }
}

/** Split text into sentences and track paragraph boundaries */
function splitIntoIndexedSentences(text: string): { sentences: string[]; paragraphBoundaries: number[] } {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const sentences: string[] = [];
  const paragraphBoundaries: number[] = [];

  for (const para of paragraphs) {
    paragraphBoundaries.push(sentences.length);
    const trimmed = para.trim();
    // Detect headings
    const isHeading = trimmed.length < 120 && !/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length <= 15;
    if (isHeading) {
      sentences.push(trimmed);
    } else {
      const sents = robustSentenceSplit(trimmed);
      sentences.push(...(sents.length ? sents : [trimmed]));
    }
  }
  return { sentences, paragraphBoundaries };
}

/** Reassemble sentences into paragraphed text */
function reassembleText(sentences: string[], paragraphBoundaries: number[]): string {
  const paragraphs: string[][] = [];
  for (let i = 0; i < paragraphBoundaries.length; i++) {
    const start = paragraphBoundaries[i];
    const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
    paragraphs.push(sentences.slice(start, end));
  }
  return paragraphs.map(p => p.join(' ')).join('\n\n');
}

function measureSentenceChange(original: string, modified: string): number {
  const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
  const len = Math.max(origWords.length, modWords.length);
  if (len === 0) return 1;
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
  }
  return changed / len;
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Invalid request body' }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const { text, engine, strength, tone, strict_meaning, no_contractions, enable_post_processing, premium, humanization_rate } = body as {
      text: string; engine?: string; strength?: string; tone?: string;
      strict_meaning?: boolean; no_contractions?: boolean;
      enable_post_processing?: boolean; premium?: boolean;
      humanization_rate?: number;
    };

    // Humanization rate: 1-10 scale → minimum word-change threshold
    const hRate = Math.max(1, Math.min(10, Math.round(humanization_rate ?? 8)));
    const minChangeThreshold = hRate / 10; // rate 8 → 0.80 = 80% min change

    // 30% aggressiveness boost: when "Keep Meaning" is unchecked, bump strength one level
    const effectiveStrength = (!strict_meaning && strength === 'light') ? 'medium'
      : (!strict_meaning && (strength ?? 'medium') === 'medium') ? 'strong'
      : (strength ?? 'medium');

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Text is required' }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Max 2000 words per request
    const inputWordCount = text.trim().split(/\s+/).length;
    if (inputWordCount > 2000) {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: `Maximum 2,000 words per request. You submitted ${inputWordCount.toLocaleString()} words.` }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Auth + quota enforcement
    let userId: string | null = null;
    let userEmail: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      try {
        const supa = createServiceClient();
        const { data: { user: authUser }, error: authError } = await supa.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError) {
          console.error('Auth getUser failed:', authError.message);
        }
        if (authUser) {
          userId = authUser.id;
          userEmail = authUser.email ?? null;
        }
      } catch (e) {
        console.error('Auth extraction error:', e);
      }
    }

    // Admin emails get unlimited access
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = userEmail ? adminEmails.includes(userEmail.toLowerCase()) : false;

    if (userId && !isAdmin) {
      try {
        const supa = createServiceClient();
        const inputWordCount = text.trim().split(/\s+/).length;
        const { data: stats, error: statsError } = await supa.rpc('get_usage_stats', { p_user_id: userId });

        if (statsError) {
          console.error('get_usage_stats RPC failed:', statsError.message, statsError.details);
        }

        // Default free-tier limits when RPC fails or missing
        let totalUsed = 0;
        let totalLimit = 1000;

        if (!statsError && stats) {
          totalUsed = (stats.words_used_fast || 0) + (stats.words_used_stealth || 0);
          const rawLimit = (stats.words_limit_fast || 0) + (stats.words_limit_stealth || 0);
          // Use DB limit if user has active subscription, otherwise free tier (1000)
          totalLimit = rawLimit > 0 ? rawLimit : 1000;
        }

        const remaining = Math.max(0, totalLimit - totalUsed);
        if (remaining < inputWordCount) {
          return new Response(
            'data: ' + JSON.stringify({ type: 'error', error: `Word limit reached. ${remaining} words remaining of ${totalLimit} daily words.` }) + '\n\n',
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
      } catch (err) {
        console.error('Quota pre-check error:', err);
        // On error, allow the request but log it
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        // ── Deadline safety: send partial results before Vercel kills the function ──
        const DEADLINE_MS = 115_000; // 115s — 5s before Vercel's 120s hard cutoff
        const startTime = Date.now();
        let deadlineReached = false;
        let latestHumanized = text; // always holds the best result so far
        let streamClosed = false;
        let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
        const finishStream = (payload: Record<string, unknown>) => {
          if (streamClosed) return;
          streamClosed = true;
          if (deadlineTimer) clearTimeout(deadlineTimer);
          try {
            sendSSE(controller, {
              type: 'done',
              humanized: latestHumanized || text,
              word_count: (latestHumanized || text).split(/\s+/).filter(Boolean).length,
              input_word_count: text.split(/\s+/).filter(Boolean).length,
              engine_used: engine ?? 'oxygen',
              ...payload,
            });
          } finally {
            try { controller.close(); } catch {}
          }
        };
        deadlineTimer = setTimeout(() => {
          deadlineReached = true;
          finishStream({
            meaning_preserved: true,
            meaning_similarity: 0.85,
            partial: true,
          });
        }, DEADLINE_MS);

        try {
          // 1. Parse & emit original sentences
          const { sentences: origSentences, paragraphBoundaries } = splitIntoIndexedSentences(text);
          sendSSE(controller, {
            type: 'init',
            sentences: origSentences,
            paragraphBoundaries,
          });
          await flushDelay(5); // let client render initial state quickly

          // 2. Heading normalization
          let normalizedText = text;
          // Add blank line AFTER heading lines (Roman numerals, markdown, Part/Section/Chapter)
          normalizedText = normalizedText.replace(
            /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.*))\n(?!\n)/gim, "$1\n\n"
          );
          // Add blank line AFTER short non-punctuation-ending lines followed by uppercase (likely headings)
          normalizedText = normalizedText.replace(
            /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm, "$1\n\n"
          );
          // Add blank line BEFORE heading lines that follow sentence-ending punctuation
          normalizedText = normalizedText.replace(
            /([.!?])\n(?!\n)(?=(?:[IVXLCDM]+\.\s|[A-Z]\.\s|#{1,6}\s|(?:Part|Section|Chapter)\s+\d))/gim, "$1\n\n"
          );

          // 3. Engine stage — the main humanization
          let humanized: string;
          const eng = engine ?? 'oxygen';

          // Engine display names for phase labels
          const ENGINE_DISPLAY: Record<string, string> = {
            ghost_pro_wiki: 'Wikipedia', ninja_1: 'Ninja', ninja: 'Ninja', undetectable: 'Ninja',
            oxygen: 'Humara 2.0', nuru_v2: 'Nuru 2.0', humara_v3_3: 'Humara 2.4',
            easy: 'Humara 2.2', ozone: 'Humara 2.1', ghost_pro: 'Ghost Pro',
            humara: 'Humara', nuru: 'Nuru', omega: 'Omega',
            ninja_2: 'Ninja 2', ninja_3: 'Ninja 3', ninja_4: 'Ninja 4', ninja_5: 'Ninja 5',
            ghost_trial_2: 'Ghost Trial', ghost_trial_2_alt: 'Ghost Trial',
            conscusion_1: 'Conscusion', conscusion_12: 'Conscusion',
            dipper: 'Dipper', humarin: 'Humarin', oxygen3: 'Oxygen 3', oxygen_t5: 'Oxygen T5',
            fast_v11: 'Fast V11', humara_v1_3: 'Humara 1.3', ghost_mini_v1_2: 'Ghost Mini',
          };
          const engineDisplayName = ENGINE_DISPLAY[eng] || eng;

          // Fast-loop engine detection (used for phase labeling + pipeline selection)
          const FAST_REHUMANIZE_ENGINES = new Set(['nuru_v2', 'ghost_pro_wiki', 'oxygen', 'humara_v3_3', 'ninja_1', 'king']);

          // Engines that use the phase pipeline (fast-loop + deep-kill)
          const PHASED_ENGINES = new Set([
            ...FAST_REHUMANIZE_ENGINES,
            'ninja_2', 'ninja_3', 'ninja_4', 'ninja_5',
            'ghost_trial_2', 'ghost_trial_2_alt',
            'conscusion_1', 'conscusion_12',
          ]);
          const usePhasePipeline = PHASED_ENGINES.has(eng);

          // Emit initial stage for non-phased engines only
          // (phased engines emit their own Phase labels inside the pipeline below)
          sendSSE(controller, { type: 'stage', stage: 'Engine Processing' });
          await flushDelay(2);

          const runGuarded = async (
            label: string,
            task: () => Promise<string>,
            fallback: string,
            timeoutMs = 10_000,
          ): Promise<string> => {
            try {
              return await withTimeout(task(), timeoutMs, label);
            } catch (err) {
              console.warn(`[HumanizeStream] ${label} failed or timed out:`, err);
              return fallback;
            }
          };

          const CHAIN_TS = 10;
          
          function contentWordOverlap(original: string, modified: string): number {
            const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','he','she','his','her','which','what','who','whom','about','also']);
            const origWords = new Set(original.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w)));
            const modWords = new Set(modified.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w)));
            if (origWords.size === 0) return 1.0;
            let matches = 0;
            for (const w of origWords) {
              if (modWords.has(w)) {
                matches++;
              } else {
                for (const m of modWords) {
                  if (w.length >= 5 && m.length >= 5 && w.slice(0, 5) === m.slice(0, 5)) {
                    matches += 0.7; break;
                  }
                }
              }
            }
            return matches / origWords.size;
          }

          function adaptiveOxygenChain(phaseOneOutput: string, _originalText: string): string {
            const MIN_TOTAL = 3;
            const MAX_ITERATIONS = 3;
            const TARGET_CHANGE = 0.25;
            const SENT_PASS_RATE = 0.60;
            let current = phaseOneOutput;
            const phase1Sentences = robustSentenceSplit(phaseOneOutput);
            for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
              const totalPasses = iter + 2;
              let passMode: string, passStrength: string;
              if (totalPasses <= 5) { passMode = 'fast'; passStrength = 'light'; }
              else if (totalPasses <= 7) { passMode = 'quality'; passStrength = 'medium'; }
              else { passMode = 'aggressive'; passStrength = 'strong'; }
              const passResult = oxygenHumanize(current, passStrength, passMode, false);
              if (passResult && passResult.trim().length > 0) current = passResult;
              if (totalPasses >= MIN_TOTAL) {
                const curSentences = robustSentenceSplit(current);
                let metCount = 0;
                for (const curSent of curSentences) {
                  let bestChange = 0;
                  for (const p1Sent of phase1Sentences) {
                    const c = measureSentenceChange(p1Sent, curSent);
                    if (c > bestChange) bestChange = c;
                  }
                  if (bestChange >= TARGET_CHANGE) metCount++;
                }
                const total = curSentences.length;
                if (total > 0 && metCount / total >= SENT_PASS_RATE) break;
              }
            }
            return current;
          }

          const runHumara20 = (input: string): string => {
            const effectiveMode = (body.oxygen_mode as string) || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
            let output = oxygenHumanize(input, effectiveStrength, effectiveMode, (body as Record<string, unknown>).oxygen_sentence_by_sentence === true);
            output = adaptiveOxygenChain(output, input);
            return output;
          };

          const runHumara24 = async (input: string): Promise<string> => {
            const inputWordCount = input.split(/\s+/).filter(Boolean).length;
            const humarinMode = strength === 'strong' ? 'quality' : strength === 'light' ? 'turbo' : 'fast';
            const humarinResult = await humarinHumanize(input, humarinMode, inputWordCount <= 220);
            let output = humarinResult.humanized;
            output = adaptiveOxygenChain(output, input);
            return output;
          };

          const runHumara22Clean = async (input: string): Promise<string> => {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence !== false;
            const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
            return easyResult.humanized;
          };

          const CITATION_PARA_RE = /^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/;
          const splitProtectedParas = (input: string): { paragraphs: string[]; protectedIdx: Set<number> } => {
            const paragraphs = input.split(/\n\s*\n/);
            const protectedIdx = new Set<number>();
            for (let i = 0; i < paragraphs.length; i++) {
              const t = paragraphs[i].trim();
              if (CITATION_PARA_RE.test(t) && t.split(/\s+/).length <= 20) protectedIdx.add(i);
            }
            return { paragraphs, protectedIdx };
          };

          const breakRepetitiveTemplates = (text: string): string => text;
          const fixHyphenSpacing = (text: string): string => text;

          const runNuruSinglePass = (input: string): string => {
            const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic', 1);
            return output && output.trim().length > 0 ? output : input;
          };

          const applySmartNuruPolish = (input: string, maxPasses = 15): string => {
            // Delegate to stealthHumanize which now inherently guarantees min 10 loops
            // and natively applies all our 6 detector specific non-LLM cleanups
            const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic', maxPasses);
            return output && output.trim().length > 0 ? output : input;
          };

          const runWikipedia = async (input: string): Promise<string> => {
            const { paragraphs, protectedIdx } = splitProtectedParas(input);
            const processableParas = paragraphs.filter((_, i) => !protectedIdx.has(i)).join('\n\n');
            let output = processableParas.trim()
              ? await ghostProHumanize(processableParas, { strength: strength ?? 'medium', tone: 'wikipedia', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false, turbo: true })
              : '';
            output = breakRepetitiveTemplates(output);
            output = fixHyphenSpacing(output);
            const wikiSents = robustSentenceSplit(output);
            for (let i = 0; i < wikiSents.length; i++) {
              try { wikiSents[i] = await restructureSentence(wikiSents[i]); } catch {}
            }
            output = wikiSents.join(' ');
            output = runHumara20(output);
            output = applySmartNuruPolish(output);
            if (protectedIdx.size > 0) {
              const outParas = output.split(/\n\s*\n/);
              const merged: string[] = [];
              let outIdx = 0;
              for (let i = 0; i < paragraphs.length; i++) {
                if (protectedIdx.has(i)) merged.push(paragraphs[i].trim());
                else if (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
              }
              while (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
              output = merged.filter(p => p).join('\n\n');
            }
            return output;
          };

          const runWikipediaClean = async (input: string): Promise<string> => {
            const { paragraphs, protectedIdx } = splitProtectedParas(input);
            const processableParas = paragraphs.filter((_, i) => !protectedIdx.has(i)).join('\n\n');
            let output = processableParas.trim()
              ? await ghostProHumanize(processableParas, { strength: strength ?? 'medium', tone: 'wikipedia', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false, turbo: true })
              : '';
            output = breakRepetitiveTemplates(output);
            output = fixHyphenSpacing(output);
            const wikiSents = robustSentenceSplit(output);
            for (let i = 0; i < wikiSents.length; i++) {
              try { wikiSents[i] = await restructureSentence(wikiSents[i]); } catch {}
            }
            output = wikiSents.join(' ');
            output = applySmartNuruPolish(output);
            if (protectedIdx.size > 0) {
              const outParas = output.split(/\n\s*\n/);
              const merged: string[] = [];
              let outIdx = 0;
              for (let i = 0; i < paragraphs.length; i++) {
                if (protectedIdx.has(i)) merged.push(paragraphs[i].trim());
                else if (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
              }
              while (outIdx < outParas.length) merged.push(outParas[outIdx++].trim());
              output = merged.filter(p => p).join('\n\n');
            }
            return output;
          };

          const runHumara22 = async (input: string): Promise<string> => {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence === true;
            const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
            return easyResult.humanized;
          };

          const runHumara21 = async (input: string): Promise<string> => {
            const ozoneSBS = (body as Record<string, unknown>).ozone_sentence_by_sentence === true;
            const ozoneResult = await ozoneHumanize(input, ozoneSBS);
            let output = ozoneResult.humanized;
            try {
              const easyPolish = await easyHumanize(output, effectiveStrength, tone ?? 'academic', false);
              output = easyPolish.humanized;
            } catch (easyErr) {
              console.warn('[Ozone] EssayWritingSupport polish failed, using raw Ozone output:', easyErr);
            }
            return output;
          };

          // ══════════════════════════════════════════════════════════════
          // ACADEMIC-GRADE CLEANING & SMOOTHING FUNCTIONS
          // All functions preserve formal academic register.
          // NO casualization — connectors stay scholarly, contractions
          // are expanded, and vocabulary remains appropriate for
          // university-level papers targeting excellent marks.
          // ══════════════════════════════════════════════════════════════

          // Academic connector variation map — replaces AI-repetitive connectors
          // with equally academic but varied alternatives. No casual speech.
          const ACADEMIC_CONNECTOR_MAP: Record<string, string[]> = {
            'Furthermore, ': ['In addition, ', 'Beyond this, ', 'Building on this, ', 'Alongside this, '],
            'Moreover, ': ['In addition, ', 'Beyond this, ', 'Equally important, ', 'What is more, '],
            'Additionally, ': ['In addition, ', 'Alongside this, ', 'On a related note, ', 'Equally, '],
            'Consequently, ': ['As a consequence, ', 'It follows that ', 'The result is that ', 'This means that '],
            'Nevertheless, ': ['Even so, ', 'That said, ', 'In spite of this, ', 'Regardless, '],
            'Nonetheless, ': ['Even so, ', 'That said, ', 'Despite this, ', 'Regardless, '],
            'In contrast, ': ['By comparison, ', 'Conversely, ', 'On the other hand, ', 'Whereas '],
            'Subsequently, ': ['Following this, ', 'After this, ', 'In the period that followed, '],
            'In conclusion, ': ['To conclude, ', 'In summary, ', 'Taken together, ', 'On balance, '],
            'Therefore, ': ['For this reason, ', 'It follows that ', 'This indicates that ', 'Accordingly, '],
            'However, ': ['That said, ', 'On the other hand, ', 'At the same time, ', 'Yet '],
            'Thus, ': ['In this way, ', 'Through this, ', 'As a result, ', 'Accordingly, '],
            'Hence, ': ['For this reason, ', 'It follows that ', 'This is why '],
            'Indeed, ': ['In fact, ', 'As expected, ', 'Certainly, ', 'To be sure, '],
            'Accordingly, ': ['In response, ', 'For this reason, ', 'Correspondingly, '],
            'Notably, ': ['It is worth noting that ', 'Significantly, ', 'Of particular note, '],
            'Specifically, ': ['In particular, ', 'More precisely, ', 'To be specific, '],
            'As a result, ': ['Owing to this, ', 'The outcome is that ', 'This led to '],
            'For example, ': ['To illustrate, ', 'As an illustration, ', 'Consider, for instance, '],
            'For instance, ': ['As one example, ', 'To illustrate, ', 'Consider the case where '],
            'On the other hand, ': ['Conversely, ', 'By contrast, ', 'From another perspective, '],
            'In other words, ': ['Put differently, ', 'That is to say, ', 'To rephrase, '],
            'In particular, ': ['Especially, ', 'More specifically, ', 'Of particular interest, '],
            'As such, ': ['Given this, ', 'On that basis, ', 'With this in mind, '],
            'To that end, ': ['With this aim, ', 'Toward this goal, ', 'For this purpose, '],
            'By contrast, ': ['Conversely, ', 'In comparison, ', 'On the contrary, '],
            'In essence, ': ['At its core, ', 'Fundamentally, ', 'In its simplest form, '],
          };

          const academicConnectorVariation = (text: string): string => {
            let result = text;
            for (const [formal, replacements] of Object.entries(ACADEMIC_CONNECTOR_MAP)) {
              while (result.includes(formal)) {
                const rep = replacements[Math.floor(Math.random() * replacements.length)];
                result = result.replace(formal, rep);
              }
            }
            return result;
          };

          // ── Deep non-LLM cleaning (per-sentence): academic-grade AI signal removal ──
          const deepNonLLMClean = (sentence: string): string => {
            // Layer 1: Kill flagged AI vocabulary (utilize→use, leverage→draw on, etc.)
            let s = applyAIWordKill(sentence);
            // Layer 2: Vary connectors with academic alternatives (NOT casual)
            s = academicConnectorVariation(s);
            // Layer 3: Phrase-level academic transforms (verb phrases, hedging, transitions)
            s = applyPhrasePatterns(s);
            // Layer 4: Collocation replacement (academic multi-word phrase variation)
            s = replaceCollocations(s);
            // Layer 5: Compress wordy AI phrases to concise academic phrasing
            s = compressPhrases(s);
            // Layer 6: Expand any contractions back to full forms (academic standard)
            s = expandAllContractions(s);
            // Layer 7: Remove em-dashes (AI detection signal) + fix punctuation
            s = removeEmDashes(s);
            s = fixPunctuation(s);
            return s;
          };

          // ── Smoothing pass (per-sentence): academic flow & grammar repair ──
          // Applied after heavy engines to fix grammar breaks and ensure
          // the text reads as coherent academic prose, not patchy transforms.
          const smoothingPass = (sentence: string): string => {
            // 1. Grammar repair: irregular verbs, subject-verb agreement, tense consistency
            let s = postCleanGrammar(sentence);
            // 2. Fix synonyms that landed in the wrong semantic context
            s = fixOutOfContextSynonyms(s);
            // 3. Validate adjective-noun collocations sound natural
            s = validateCollocations(s);
            // 4. Vary any repeated connectors with academic alternatives
            s = academicConnectorVariation(s);
            // 5. Expand contractions (academic papers should not have contractions)
            s = expandAllContractions(s);
            // 6. Punctuation + capitalization cleanup
            s = fixPunctuation(s);
            s = fixMidSentenceCapitalization(s);
            s = removeEmDashes(s);
            return s;
          };

          // ── Final smoothing & grammar (per-sentence): deep intelligent academic polish ──
          // Last phase — ensures output reads as polished university-level writing.
          // Every step uses deterministic linguistic rules; no random template shuffling.
          const finalSmoothGrammar = (sentence: string): string => {
            // 1. Full grammar repair: irregular verbs, agreement, tense, structural fixes
            let s = postCleanGrammar(sentence);
            // 2. Fix out-of-context synonyms that earlier phases introduced
            s = fixOutOfContextSynonyms(s);
            // 3. Validate that adjective-noun collocations are natural academic pairings
            s = validateCollocations(s);
            // 4. Vary any remaining AI-pattern connectors with academic alternatives
            s = academicConnectorVariation(s);
            // 5. Expand ALL contractions — must read as formal academic prose
            s = expandAllContractions(s);
            // 6. Final punctuation + capitalization pass
            s = fixPunctuation(s);
            s = fixMidSentenceCapitalization(s);
            // 7. Remove em-dashes (strong AI signal)
            s = removeEmDashes(s);
            return s;
          };

          const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          const replaceFlaggedPhrasesDeterministically = (sentence: string, flaggedPhrases: string[]): string => {
            let current = sentence;
            const uniquePhrases = [...new Set(
              flaggedPhrases
                .map((phrase) => phrase.trim())
                .filter((phrase) => phrase.length > 0)
            )].sort((left, right) => right.length - left.length);

            for (const phrase of uniquePhrases) {
              const phraseKey = phrase.toLowerCase();
              const directReplacement = AI_WORD_REPLACEMENTS[phraseKey]?.[0];
              if (directReplacement && directReplacement.toLowerCase() !== phraseKey) {
                current = current.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'), directReplacement);
                continue;
              }

              current = current.replace(new RegExp(escapeRegExp(phrase), 'gi'), (match) => {
                let cleaned = applyAIWordKill(match);
                cleaned = applyPhrasePatterns(cleaned);
                cleaned = replaceCollocations(cleaned);
                cleaned = compressPhrases(cleaned);
                return cleaned === match ? match : cleaned;
              });
            }

            return current;
          };

          const cleanFlaggedSentenceNonLLM = (
            sentence: string,
            flaggedPhrases: string[],
            baselineSentence: string,
            minChange = 0.4,
          ): string => {
            let current = sentence;

            current = replaceFlaggedPhrasesDeterministically(current, flaggedPhrases);
            current = deepNonLLMClean(current);
            current = smoothingPass(current);

            let change = measureSentenceChange(baselineSentence, current);
            let attempts = 0;
            while (change < minChange && attempts < 3) {
              current = runNuruSinglePass(current);
              current = deepNonLLMClean(current);
              current = finalSmoothGrammar(current);
              change = measureSentenceChange(baselineSentence, current);
              attempts++;
            }

            return current;
          };

          const SENTENCE_DETECTOR_PRIORITY = new Set([
            'gptzero',
            'turnitin',
            'originality_ai',
            'winston_ai',
            'copyleaks',
            'stealth_detector',
          ]);

          const HEURISTIC_AI_PHRASES = [
            'it is important to note that',
            'it is worth noting that',
            'plays a crucial role',
            'plays a vital role',
            'plays a key role',
            'in today\'s world',
            'in today\'s society',
            'cannot be overstated',
            'first and foremost',
            'at the end of the day',
            'when it comes to',
            'in the context of',
            'a wide range of',
            'due to the fact that',
            'in the realm of',
            'in order to',
            'needless to say',
            'serves as a',
            'it goes without saying',
            'with respect to',
            'for the purpose of',
            'in the event that',
            'by virtue of',
          ];

          const SENTENCE_FLAG_THRESHOLD = 20;
          const SENTENCE_RECHECK_THRESHOLD = 5;

          const normalizeSentenceAiScore = (rawScore: number): number => {
            return Math.max(0, Math.min(100, Math.round(Math.max(0, (rawScore - 45) * 1.8) * 10) / 10));
          };

          const extractFlaggedPhrasesHeuristically = (sentence: string): string[] => {
            const lowered = sentence.toLowerCase();
            const found = new Set<string>();

            for (const phrase of HEURISTIC_AI_PHRASES) {
              if (lowered.includes(phrase)) {
                found.add(phrase);
              }
            }

            for (const phrase of Object.keys(AI_WORD_REPLACEMENTS)) {
              if (!phrase || phrase.length < 4 || phrase.length > 40) continue;
              if (lowered.includes(phrase.toLowerCase())) {
                found.add(phrase);
              }
              if (found.size >= 5) break;
            }

            const starterMatch = sentence.match(/^\s*([^,]{3,32}),/);
            if (starterMatch) {
              const starter = starterMatch[1].trim().toLowerCase();
              if (HEURISTIC_AI_PHRASES.some((phrase) => phrase.startsWith(starter)) || /^(however|therefore|moreover|furthermore|notably|specifically|accordingly|thus|indeed)$/.test(starter)) {
                found.add(starter);
              }
            }

            return [...found].slice(0, 5);
          };

          const analyzeSentenceWithBuiltInDetector = (sentence: string): { ai_score: number; flagged_phrases: string[] } => {
            const analysis = getDetector().analyze(sentence);
            const priorityScores = analysis.detectors
              .filter((det) => SENTENCE_DETECTOR_PRIORITY.has(det.detector))
              .map((det) => det.ai_score);
            const detectorPeak = priorityScores.length > 0 ? Math.max(...priorityScores) : analysis.summary.overall_ai_score;
            const flaggedPhrases = extractFlaggedPhrasesHeuristically(sentence);
            const normalizedDetectorScore = normalizeSentenceAiScore(Math.max(detectorPeak, analysis.summary.overall_ai_score));
            const phrasePressure = Math.min(100, flaggedPhrases.length * 12);
            const aiScore = Math.max(normalizedDetectorScore, phrasePressure);

            return {
              ai_score: Math.round(aiScore * 10) / 10,
              flagged_phrases: flaggedPhrases,
            };
          };

          const findFlaggedSentencesWithBuiltInDetector = (
            sentences: string[],
            threshold: number,
          ): Array<{ index: number; ai_score: number; flagged_phrases: string[] }> => {
            return sentences
              .map((sentence, index) => {
                if (isHeadingSentCheck(sentence)) return null;
                const analysis = analyzeSentenceWithBuiltInDetector(sentence);
                if (analysis.ai_score < threshold) return null;
                return {
                  index,
                  ai_score: analysis.ai_score,
                  flagged_phrases: analysis.flagged_phrases,
                };
              })
              .filter((flagged): flagged is { index: number; ai_score: number; flagged_phrases: string[] } => flagged !== null);
          };

          // ══════════════════════════════════════════════════════════════
          // FULL-PIPELINE RUNNERS — called when one engine invokes another
          // within a phase. These include ALL sub-engine processing stages
          // so the output is fully processed, not raw engine output.
          // ══════════════════════════════════════════════════════════════

          /** Humara 2.0 Full: oxygen → adaptiveChain → deepClean (lightweight, no nested Nuru/LLM) */
          const runHumara20Full = async (input: string): Promise<string> => {
            let s = runHumara20(input);
            s = deepNonLLMClean(s);
            return s;
          };

          /** Humara 2.4 Full: humarin → adaptiveChain → deepClean (lightweight, no nested Nuru/LLM) */
          const runHumara24Full = async (input: string): Promise<string> => {
            let s = await runHumara24(input);
            s = deepNonLLMClean(s);
            return s;
          };

          /** Nuru 2.0 Full: restructure → nuru × 9 → deepClean → smooth */
          const runNuru20Full = async (input: string): Promise<string> => {
            let s = await restructureSentence(input);
            for (let i = 0; i < 9; i++) {
              const n = stealthHumanize(s, strength ?? 'medium', tone ?? 'academic', 1);
              if (n && n.trim().length > 0) s = n;
            }
            s = deepNonLLMClean(s);
            s = finalSmoothGrammar(s);
            return s;
          };

          // Deep Kill engine set — used to skip destructive post-processors
          const DEEP_KILL_ENGINES = new Set([
            'ninja_2', 'ninja_3', 'ninja_4', 'ninja_5',
            'ghost_trial_2', 'ghost_trial_2_alt',
            'conscusion_1', 'conscusion_12',
          ]);
          const isDeepKill = DEEP_KILL_ENGINES.has(eng);

          // ═══════════════════════════════════════════════════════════════
          // SENTENCE-PARALLEL PROCESSING
          // Each sentence goes through the engine independently in parallel,
          // then results are reassembled preserving paragraph structure.
          // ═══════════════════════════════════════════════════════════════
          const { sentences: inputSentences, paragraphBoundaries: inputParaBounds } = splitIntoIndexedSentences(normalizedText);
          const isHeadingSentCheck = (s: string) => {
            const t = s.trim();
            if (t.length < 120 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 15) return true;
            // Standalone citation references: "Author, A. B. (2012)." or "Author & Author (2012)."
            if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(t) && t.split(/\s+/).length <= 20) return true;
            return false;
          };

          const runEngineOnSentence = async (sentence: string): Promise<string> => {
            if (eng === 'easy') {
              return await runHumara22(sentence);
            } else if (eng === 'ozone') {
              return await runHumara21(sentence);
            } else if (eng === 'oxygen') {
              return runHumara20(sentence);
            } else if (eng === 'oxygen3') {
              const o3Mode = effectiveStrength === 'strong' ? 'fast' : 'turbo';
              return (await oxygen3Humanize(sentence, o3Mode)).humanized;
            } else if (eng === 'oxygen_t5') {
              const t5Mode = effectiveStrength === 'light' ? 'turbo' : effectiveStrength === 'strong' ? 'aggressive' : 'fast';
              return (await t5Humanize(sentence, t5Mode, true)).humanized;
            } else if (eng === 'dipper') {
              return (await dipperHumanize(sentence, effectiveStrength, false)).humanized;
            } else if (eng === 'humarin') {
              const humarinMode = strength === 'strong' ? 'aggressive' : strength === 'light' ? 'fast' : 'quality';
              return (await humarinHumanize(sentence, humarinMode, true)).humanized;
            } else if (eng === 'humara_v3_3') {
              return await runHumara24(sentence);
            } else 

          // ── DEEP KILL ABBREVIATION & CAPS CLEANUP ──────────────────
          if (isDeepKill) {
            humanized = humanized.replace(/\bD[,;]\s*c\b\.?/gi, 'D.C.');
            humanized = humanized.replace(/\bD[,;]\s*and\s*c\b\.?/gi, 'D.C.');
            humanized = humanized.replace(/\bD\.\s+C\./g, 'D.C.');
            humanized = humanized.replace(/\bU[,;]\s*s\b[,;.]?/gi, 'U.S.');
            humanized = humanized.replace(/\bU\.\s+S\./g, 'U.S.');
            humanized = humanized.replace(/\bU[,;]\s*k\b\.?/gi, 'U.K.');
            humanized = humanized.replace(/\bU\.\s+K\./g, 'U.K.');
            const dkLines = humanized.split('\n');
            humanized = dkLines.map(line => {
              const trimmed = line.trim();
              if (/^[IVX]+\.\s/.test(trimmed)) return line;
              if (trimmed.length < 120 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return line;
              return line.replace(/\b([A-Z]{4,})\b/g, (m) => {
                if (['HOPE', 'ACS'].includes(m)) return m;
                return m.charAt(0) + m.slice(1).toLowerCase();
              });
            }).join('\n');
            humanized = humanized.replace(/\b([a-z])([A-Z]{3,})\b/g, (_m: string, first: string, rest: string) => first.toUpperCase() + rest);
          }

          // Last-mile meaning validation (2 iterations max)
          if (!isDeepKill) {
            const { sentences: origSentsM } = splitIntoIndexedSentences(normalizedText);
            const isHeadingM = (s: string) => s.trim().length < 120 && !/[.!?]$/.test(s.trim()) && s.trim().split(/\s+/).length <= 15;
            const STOPWORDS_M = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','he','she','his','her','which','what','who','whom','about','also']);
            const getContentWordsM = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_M.has(w));
            for (let meaningIter = 0; meaningIter < 2; meaningIter++) {
              const { sentences: humanSentsM, paragraphBoundaries: humanMParaBounds } = splitIntoIndexedSentences(humanized);
              let anyFixed = false;
              for (let i = 0; i < humanSentsM.length; i++) {
                if (isHeadingM(humanSentsM[i])) continue; // Skip headings
                let bestOverlap = 0;
                let bestOrigIdx = -1;
                for (let j = 0; j < origSentsM.length; j++) {
                  if (isHeadingM(origSentsM[j])) continue; // Don't match against headings
                  const origW = new Set(getContentWordsM(origSentsM[j]));
                  const modW = new Set(getContentWordsM(humanSentsM[i]));
                  if (origW.size === 0) continue;
                  let matches = 0;
                  for (const w of origW) { if (modW.has(w)) matches++; }
                  const overlap = matches / origW.size;
                  if (overlap > bestOverlap) { bestOverlap = overlap; bestOrigIdx = j; }
                }
                if (bestOrigIdx >= 0 && bestOverlap < 0.35) {
                  let fixed = applyAIWordKill(origSentsM[bestOrigIdx]);
                  const usedW = new Set<string>();
                  fixed = synonymReplace(fixed, 0.35, usedW);
                  humanSentsM[i] = fixed;
                  anyFixed = true;
                }
              }
              if (!anyFixed) break;
              humanized = reassembleText(humanSentsM, humanMParaBounds.length ? humanMParaBounds : [0]);
              humanized = preserveInputStructure(normalizedText, humanized);
            }
          } // end !isDeepKill meaning validation guard

          // Final sentence-initial caps + mid-sentence caps fix
          humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          humanized = fixMidSentenceCapitalization(humanized, text);

          } // end: if (eng !== 'ozone') post-processing block

          // Structure preservation for ozone (runs after ozone's own dedup, restores heading placement)
          if (eng === 'ozone') {
            humanized = preserveInputStructure(normalizedText, humanized);
          }

          // ── EXTERNAL API SANITIZATION (ozone, easy, etc.) ─────────────
          // External APIs can return LLM refusals, garbled phrases, and bad synonyms.
          // This lightweight pass cleans the worst artifacts without full post-processing.
          {
            // 1. Strip LLM refusal/instruction leaks (anywhere in text)
            const REFUSAL_PATTERNS = [
              /Sorry,?\s+I\s+(?:cannot|can't|am unable to|couldn't)\s+(?:complete|do|help|assist|process|fulfill|generate|write|rewrite|paraphrase)[^.!?\n]*[.!?]?\s*/gi,
              /(?:As an AI|I'm an AI|I am an AI)[^.!?\n]*[.!?]?\s*/gi,
              /(?:Please (?:provide|deliver|give|send|share|paste))\s+(?:the|your)\s+(?:original|source|input|actual)\s+(?:text|content|paragraph|essay|assignment)[^.!?\n]*[.!?]?\s*/gi,
              /I (?:don't|do not) have (?:access to|the original)[^.!?\n]*[.!?]?\s*/gi,
              /(?:Could you (?:please )?(?:provide|share|send))[^.!?\n]*[.!?]?\s*/gi,
            ];
            for (const re of REFUSAL_PATTERNS) {
              humanized = humanized.replace(re, '');
            }

            // 2. Fix garbled transition/discourse markers from external APIs
            // These are commonly injected mid-clause in unnatural positions
            const GARBLED_TRANSITIONS: [RegExp, string][] = [
              // "upon review, " mid-sentence — remove
              [/,\s*upon review,?\s*/gi, ', '],
              [/\bupon review,?\s*/gi, ''],
              // "at this stage, " mid-sentence — remove
              [/,\s*at this stage,?\s*/gi, ', '],
              [/\bat this stage,?\s*/gi, ''],
              // "on closer inspection, " — remove
              [/,\s*on closer inspection,?\s*/gi, ', '],
              [/\bon closer inspection,?\s*/gi, ''],
              // "in broad terms, " — remove
              [/,\s*in broad terms,?\s*/gi, ', '],
              [/\bin broad terms,?\s*/gi, ''],
              // "to be specific, " — remove
              [/,\s*to be specific,?\s*/gi, ', '],
              [/\bto be specific,?\s*/gi, ''],
              // "at its core, " — remove
              [/,\s*at its core,?\s*/gi, ', '],
              [/\bat its core,?\s*/gi, ''],
              // "on this basis, " — remove
              [/,\s*on this basis,?\s*/gi, ', '],
              [/\bon this basis,?\s*/gi, ''],
              // "by comparison, " — remove when mid-sentence
              [/,\s*by comparison,?\s*/gi, ', '],
              // "by all accounts, " — remove
              [/,\s*by all accounts,?\s*/gi, ', '],
              [/\bby all accounts,?\s*/gi, ''],
              // "strikingly, " — remove
              [/\bstrikingly,?\s*/gi, ''],
              // "above all, " mid-sentence — remove
              [/,\s*above all,?\s*/gi, ', '],
              // Fix "besides" used as conjunction (should be "and also" or removed)
              [/,?\s*besides\s+/gi, ', and '],
              // Fix "coupled with" inserted between incompatible clauses
              [/,?\s*coupled with\s+/gi, ', and '],
              // Fix "paired with"
              [/,?\s*paired with\s+/gi, ', and '],
              // Fix "in tandem with"
              [/,?\s*in tandem with\s+/gi, ', and '],
              // "supplied that" → "given that"
              [/\bsupplied that\b/gi, 'given that'],
              // "presented that" → "given that"
              [/\bpresented that\b/gi, 'given that'],
              // "granted that" → "given that"
              [/\bgranted that\b/gi, 'given that'],
              // "offered that" → "given that"
              [/\boffered that\b/gi, 'given that'],
              // "provided that" is sometimes valid, but when used as a garbled "given that":
              // Leave it as-is since it can be grammatically correct
            ];
            for (const [re, rep] of GARBLED_TRANSITIONS) {
              humanized = humanized.replace(re, rep);
            }

            // 3. Fix worst synonym garbling from external APIs
            const BAD_SYNONYMS: [RegExp, string][] = [
              [/\bcrafting\s+(?=econom|countr|nation)/gi, 'developing '],
              [/\bshaping\s+(?=econom|countr|nation)/gi, 'developing '],
              [/\bbuilding\s+(?=countr|nation)/gi, 'developing '],
              [/\badvancing\s+(?=countr|nation)/gi, 'developing '],
              [/\bbackdrop\b/gi, 'environment'],
              [/\bwellspring\b/gi, 'source'],
              [/\bIt too\b/g, 'It also'],
              [/\bhas too\b/gi, 'has also'],
              [/\bhave too\b/gi, 'have also'],
              [/\bhad too\b/gi, 'had also'],
              [/\btoo (?=sparked|prompted|brought|created|caused|led|produced)/gi, 'also '],
              // "Eco-friendly progress Goals" → "Sustainable Development Goals"
              [/\bEco-friendly progress Goals\b/gi, 'Sustainable Development Goals'],
              // "protocols against's review" → "policies on"
              [/\bprotocols\s+against'?s?\s+review\b/gi, 'policies on'],
              [/\bprotocols\b/gi, 'policies'],
              // "rendering" when used for "making"
              [/\brender them\b/gi, 'make them'],
              [/\bto render\b/gi, 'to make'],
            ];
            for (const [re, rep] of BAD_SYNONYMS) {
              humanized = humanized.replace(re, rep);
            }

            // 4. Fix broken sentence starts (double commas, leading commas)
            humanized = humanized.replace(/^,\s*/gm, '');
            humanized = humanized.replace(/,\s*,/g, ',');
            humanized = humanized.replace(/ {2,}/g, ' ');

            // 5. Sentence-initial capitalization
            humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          }

          // ── OXYGEN POLISH PASS (FINAL PHASE) ──────────────────────────
          // Easy engine's output is polished through the Oxygen TS engine
          // as the LAST step after all post-processing, for final cleanup.
          if (eng === 'easy') {
            try {
              sendSSE(controller, { type: 'stage', stage: 'Oxygen Polish' });
              await flushDelay(2);
              const polished = oxygenHumanize(humanized, 'light', 'fast', false);
              if (polished && polished.trim().length > 0) {
                humanized = polished;
                const { sentences: oxygenSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, oxygenSents, 'Oxygen Polish', 2);
              }
            } catch {
              // Oxygen polish is best-effort — never block the pipeline
            }
            await flushDelay(2);
          }

          // Emit polished sentences (skip for phased engines)
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(2);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 2);
            await flushDelay(2);
          }

          // 14. Meaning check (detection disabled — coming soon)
          // Final cleanup: collapse double spaces
          humanized = humanized.replace(/ {2,}/g, ' ');
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
            await flushDelay(2);
          }
          // For engines with server-side meaning checks (oxygen3), use fast sync heuristic
          const meaningCheck = (eng === 'oxygen3')
            ? isMeaningPreservedSync(text, humanized, 0.88)
            : await isMeaningPreserved(text, humanized, 0.88);

          const inputWords = text.trim().split(/\s+/).length;
          const outputWords = humanized.trim().split(/\s+/).length;

          // Track usage + save document BEFORE sending done event so we can include updated counts
          let usageUpdate: { words_used?: number; words_limit?: number } = {};
          if (userId) {
            try {
              const supa = createServiceClient();
              const engineType = 'fast'; // unified — all engines deduct from one pool
              const toneDb = ({ neutral: 'natural', academic: 'academic', professional: 'business', simple: 'direct' } as Record<string, string>)[tone ?? 'neutral'] ?? 'natural';

              const [usageResult, docResult] = await Promise.all([
                supa.rpc('increment_usage', { p_user_id: userId, p_words: inputWords, p_engine_type: engineType }),
                supa.from('documents').insert({
                  user_id: userId, title: text.slice(0, 60).replace(/\n/g, ' ').trim() + (text.length > 60 ? '…' : ''),
                  input_text: text, output_text: humanized,
                  input_word_count: inputWords, output_word_count: outputWords,
                  engine_used: eng, strength: effectiveStrength, tone: toneDb,
                  meaning_preserved: meaningCheck.isSafe, meaning_similarity: meaningCheck.similarity,
                  input_ai_score: 0,
                  output_ai_score: 0,
                }),
              ]);

              if (usageResult.error) {
                console.error('increment_usage RPC failed:', usageResult.error.message, usageResult.error.details);
                // Fallback: direct upsert if RPC doesn't exist or fails
                try {
                  const today = new Date().toISOString().slice(0, 10);
                  const { data: existingUsage } = await supa
                    .from('usage')
                    .select('words_used_fast, words_limit_fast')
                    .eq('user_id', userId)
                    .eq('usage_date', today)
                    .maybeSingle();

                  if (existingUsage) {
                    await supa.from('usage').update({
                      words_used_fast: (existingUsage.words_used_fast || 0) + inputWords,
                      updated_at: new Date().toISOString(),
                    }).eq('user_id', userId).eq('usage_date', today);
                    usageUpdate = {
                      words_used: (existingUsage.words_used_fast || 0) + inputWords,
                      words_limit: existingUsage.words_limit_fast || 1000,
                    };
                  } else {
                    // Determine limit from subscription
                    let wordLimit = 1000;
                    const { data: subRow } = await supa
                      .from('subscriptions')
                      .select('plan_id, plans(daily_words_fast)')
                      .eq('user_id', userId)
                      .eq('status', 'active')
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (subRow?.plans && typeof (subRow.plans as any).daily_words_fast === 'number') {
                      wordLimit = (subRow.plans as any).daily_words_fast;
                    }
                    await supa.from('usage').insert({
                      user_id: userId,
                      usage_date: today,
                      words_used_fast: inputWords,
                      words_used_stealth: 0,
                      words_limit_fast: wordLimit,
                      words_limit_stealth: 0,
                      requests: 1,
                    });
                    usageUpdate = { words_used: inputWords, words_limit: wordLimit };
                  }
                } catch (fallbackErr) {
                  console.error('Usage fallback upsert failed:', fallbackErr);
                }
              } else if (usageResult.data) {
                // Extract updated totals from the RPC response
                const d = usageResult.data as Record<string, unknown>;
                const usedFast = Number(d.words_used_fast ?? 0);
                const usedStealth = Number(d.words_used_stealth ?? 0);
                const limitFast = Number(d.words_limit_fast ?? 0);
                const limitStealth = Number(d.words_limit_stealth ?? 0);
                usageUpdate = {
                  words_used: usedFast + usedStealth,
                  words_limit: (limitFast + limitStealth) || 1000,
                };
              }
              if (docResult.error) console.error('Document insert failed:', docResult.error.message, docResult.error.details);
            } catch (e) {
              console.error('Usage tracking error:', e);
            }
          }

          // Final done event — includes updated usage so frontend can reflect immediately
          finishStream({
            humanized,
            word_count: outputWords,
            input_word_count: inputWords,
            engine_used: eng,
            meaning_preserved: meaningCheck.isSafe,
            meaning_similarity: Math.round(meaningCheck.similarity * 100) / 100,
            ...(usageUpdate.words_used !== undefined ? { usage_words_used: usageUpdate.words_used, usage_words_limit: usageUpdate.words_limit } : {}),
          });
        } catch (err) {
          console.error('[HumanizeStream] Processing failed:', err);
          finishStream({
            partial: latestHumanized.trim().length > 0,
            error: err instanceof Error ? err.message : 'Processing failed',
            meaning_preserved: true,
            meaning_similarity: 0.85,
          });
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Server error' }) + '\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
