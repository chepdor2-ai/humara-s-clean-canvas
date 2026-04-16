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
            let out = input;
            let passesDone = 0;
            // Initial 5 passes
            for (let i = 0; i < 5 && passesDone < maxPasses; i++) {
              out = runNuruSinglePass(out);
              passesDone++;
            }
            
            return out; // Fast loop for streaming pipeline so it doesn't block (it has a detector loop externally)
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

          // ── Nuru 2.0 Sentence Starter Distribution Fix ──
          const applySentenceStartersDistribution = (sentences: string[]): void => {
            type StarterCategory =
              | 'article'
              | 'demonstrativeSingular'
              | 'demonstrativePlural'
              | 'pronominal'
              | 'additive'
              | 'contrast'
              | 'result'
              | 'alternative';
            type StarterDefinition = { text: string; category: StarterCategory };

            const starterDefinitions: StarterDefinition[] = [
              { text: 'The', category: 'article' },
              { text: 'This', category: 'demonstrativeSingular' },
              { text: 'These', category: 'demonstrativePlural' },
              { text: 'It', category: 'pronominal' },
              { text: 'Moreover', category: 'additive' },
              { text: 'However', category: 'contrast' },
              { text: 'Furthermore', category: 'additive' },
              { text: 'Additionally', category: 'additive' },
              { text: 'In addition', category: 'additive' },
              { text: 'Also', category: 'additive' },
              { text: 'Therefore', category: 'result' },
              { text: 'Consequently', category: 'result' },
              { text: 'As a result', category: 'result' },
              { text: 'Thus', category: 'result' },
              { text: 'Hence', category: 'result' },
              { text: 'On the other hand', category: 'contrast' },
              { text: 'On the contrary', category: 'contrast' },
              { text: 'In contrast', category: 'contrast' },
              { text: 'Alternatively', category: 'alternative' },
              { text: 'Nevertheless', category: 'contrast' },
              { text: 'Nonetheless', category: 'contrast' },
            ];

            const targetStarters = starterDefinitions.map((starter) => starter.text.toLowerCase());
            const starterCategory = Object.fromEntries(
              starterDefinitions.map((starter) => [starter.text.toLowerCase(), starter.category])
            ) as Record<string, StarterCategory>;
            const starterChoices: Record<StarterCategory, string[]> = {
              article: ['The'],
              demonstrativeSingular: ['This'],
              demonstrativePlural: ['These'],
              pronominal: ['It'],
              additive: ['Additionally', 'In addition', 'Also', 'Moreover', 'Furthermore'],
              contrast: ['However', 'Nevertheless', 'Nonetheless', 'In contrast', 'On the other hand'],
              result: ['Therefore', 'Consequently', 'As a result', 'Thus', 'Hence'],
              alternative: ['Alternatively'],
            };
            const singularReferentialNouns = new Set([
              'analysis', 'approach', 'argument', 'assessment', 'assumption', 'change', 'claim', 'comparison', 'condition', 'context',
              'development', 'difference', 'effect', 'evidence', 'example', 'factor', 'finding', 'framework', 'idea', 'issue', 'method',
              'observation', 'outcome', 'pattern', 'point', 'position', 'process', 'proposal', 'result', 'shift', 'strategy', 'study', 'theme',
              'trend', 'view'
            ]);
            const pluralReferentialNouns = new Set([
              'analyses', 'approaches', 'arguments', 'assessments', 'assumptions', 'changes', 'claims', 'comparisons', 'conditions', 'contexts',
              'developments', 'differences', 'effects', 'examples', 'factors', 'findings', 'ideas', 'issues', 'methods', 'observations',
              'outcomes', 'patterns', 'points', 'positions', 'processes', 'proposals', 'results', 'shifts', 'strategies', 'studies', 'themes',
              'trends', 'views'
            ]);
            const lightModifierWords = new Set([
              'broader', 'current', 'different', 'earlier', 'effective', 'emerging', 'final', 'key', 'later', 'main', 'major', 'modern',
              'overall', 'possible', 'practical', 'primary', 'recent', 'relevant', 'specific', 'stronger', 'wider'
            ]);
            const auxiliaryLeadWords = new Set([
              'is', 'are', 'was', 'were', 'be', 'been', 'being', 'can', 'could', 'may', 'might', 'must', 'should', 'would', 'will', 'has', 'have',
              'had', 'seems', 'appear', 'appears', 'remains', 'remain', 'became', 'becomes', 'follows'
            ]);
            const blockedLeadWords = new Set([
              'the', 'this', 'these', 'it', 'however', 'moreover', 'furthermore', 'additionally', 'also', 'therefore', 'consequently', 'thus',
              'hence', 'alternatively', 'nevertheless', 'nonetheless', 'on', 'in', 'as', 'for', 'to', 'from', 'if', 'when', 'while', 'because',
              'although', 'though', 'but', 'and', 'or', 'yet', 'so', 'he', 'she', 'they', 'we', 'you', 'i'
            ]);
            const additiveCue = /\b(additionally|also|another|further|furthermore|moreover|in addition|similarly|alongside|equally|besides)\b/i;
            const contrastCue = /\b(however|but|although|though|whereas|while|despite|instead|rather|unlike|in contrast|on the other hand|on the contrary|nevertheless|nonetheless)\b/i;
            const resultCue = /\b(therefore|thus|hence|consequently|as a result|for this reason|because of this|this means|this led|accordingly)\b/i;
            const alternativeCue = /\b(alternatively|instead|another option|either|or else)\b/i;

            const normalizeSentence = (sentence: string) => sentence.trim().replace(/^['"([\{\s]+/, '');
            const getWordList = (sentence: string) => normalizeSentence(sentence).split(/\s+/).filter(Boolean);
            const cleanWord = (word: string | undefined) => (word ?? '').replace(/[^a-z'-]/gi, '').toLowerCase();
            const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
            const capitalizeFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
            const isNounLike = (word: string) => {
              if (!word) return false;
              if (singularReferentialNouns.has(word) || pluralReferentialNouns.has(word)) return true;
              return /(?:tion|sion|ment|ness|ity|ism|ship|ance|ence|ory|ure|ing|age|acy|dom|ist|or|er|al|ics|sis|th)$/.test(word);
            };
            const getNounLeadShape = (sentence: string): 'singular' | 'plural' | 'generic' | null => {
              const words = getWordList(sentence);
              if (words.length < 4) return null;
              const firstWord = cleanWord(words[0]);
              const secondWord = cleanWord(words[1]);
              if (!firstWord) return null;
              if (pluralReferentialNouns.has(firstWord)) return 'plural';
              if (singularReferentialNouns.has(firstWord)) return 'singular';
              if (lightModifierWords.has(firstWord) && pluralReferentialNouns.has(secondWord)) return 'plural';
              if (lightModifierWords.has(firstWord) && singularReferentialNouns.has(secondWord)) return 'singular';
              if (blockedLeadWords.has(firstWord) || auxiliaryLeadWords.has(firstWord)) return null;
              if (isNounLike(firstWord) || (lightModifierWords.has(firstWord) && isNounLike(secondWord))) return 'generic';
              return null;
            };
            const getMatchedStarter = (sentence: string): string | null => {
              const words = getWordList(sentence);
              for (const starter of targetStarters) {
                const starterWords = starter.split(/\s+/);
                const prefix = words.slice(0, starterWords.length).join(' ').replace(/[^a-z0-9 ]/gi, '').toLowerCase();
                if (prefix === starter) return starter;
              }
              return null;
            };
            const applyCommaStarter = (sentence: string, starter: string) => {
              const trimmed = sentence.trim();
              if (!trimmed) return sentence;
              return `${starter}, ${lowerFirst(trimmed)}`;
            };
            const applyLeadStarter = (sentence: string, starter: string): string | null => {
              const trimmed = sentence.trim();
              if (!trimmed) return null;
              const shape = getNounLeadShape(trimmed);
              if (starter === 'the' && shape) return `The ${lowerFirst(trimmed)}`;
              if (starter === 'this' && (shape === 'singular' || shape === 'generic')) return `This ${lowerFirst(trimmed)}`;
              if (starter === 'these' && shape === 'plural') return `These ${lowerFirst(trimmed)}`;
              if (starter === 'it') {
                const firstWord = cleanWord(getWordList(trimmed)[0]);
                if (auxiliaryLeadWords.has(firstWord)) return `It ${lowerFirst(trimmed)}`;
              }
              return null;
            };
            const demoteStarter = (sentence: string, starter: string): string => {
              const words = getWordList(sentence);
              const starterLength = starter.split(/\s+/).length;
              let trimmed = words.slice(starterLength).join(' ').trim().replace(/^,\s*/, '');
              if (starter === 'this') trimmed = `That ${trimmed}`.trim();
              if (starter === 'these') trimmed = `Those ${trimmed}`.trim();
              return trimmed ? capitalizeFirst(trimmed) : sentence;
            };
            const inferConnectorCategory = (sentence: string, previousSentence: string | null): StarterCategory | null => {
              const normalized = normalizeSentence(sentence);
              const previous = previousSentence ? normalizeSentence(previousSentence) : '';
              if (alternativeCue.test(normalized)) return 'alternative';
              if (resultCue.test(normalized)) return 'result';
              if (contrastCue.test(normalized) || /\b(unlike|rather than)\b/i.test(previous)) return 'contrast';
              if (additiveCue.test(normalized) || /\b(first|second|finally|another|similarly)\b/i.test(previous)) return 'additive';
              return null;
            };
            const supportsStarter = (starter: string, sentence: string, previousSentence: string | null): boolean => {
              if (starter === 'the' || starter === 'this' || starter === 'these' || starter === 'it') {
                return Boolean(applyLeadStarter(sentence, starter));
              }
              const category = starterCategory[starter];
              const expectedCategory = inferConnectorCategory(sentence, previousSentence);
              return Boolean(category && expectedCategory === category);
            };

            const counts: Record<string, number> = {};
            targetStarters.forEach((starter) => { counts[starter] = 0; });

            for (let i = 0; i < sentences.length; i++) {
              if (isHeadingSentCheck(sentences[i])) continue;
              const matchedStarter = getMatchedStarter(sentences[i]);
              if (!matchedStarter) continue;
              const previousSentence = i > 0 ? sentences[i - 1] : null;
              const previousStarter = i > 0 ? getMatchedStarter(sentences[i - 1]) : null;
              counts[matchedStarter]++;
              if (matchedStarter === previousStarter || !supportsStarter(matchedStarter, demoteStarter(sentences[i], matchedStarter), previousSentence)) {
                sentences[i] = demoteStarter(sentences[i], matchedStarter);
                counts[matchedStarter] = Math.max(0, counts[matchedStarter] - 1);
              }
            }

            for (const starter of targetStarters) counts[starter] = 0;

            const validIndices = sentences
              .map((_, idx) => idx)
              .filter((idx) => !isHeadingSentCheck(sentences[idx]));
            if (validIndices.length === 0) return;
            for (const idx of validIndices) {
              const matchedStarter = getMatchedStarter(sentences[idx]);
              if (matchedStarter) counts[matchedStarter]++;
            }

            const eligibleCount = validIndices.length;
            const placedStarters = () => validIndices.reduce((total, idx) => total + (getMatchedStarter(sentences[idx]) ? 1 : 0), 0);
            const capacities = validIndices.reduce<Record<string, number>>((acc, idx) => {
              const previousSentence = idx > 0 ? sentences[idx - 1] : null;
              for (const starter of ['the', 'this', 'these', 'it']) {
                if (supportsStarter(starter, sentences[idx], previousSentence)) acc[starter] = (acc[starter] || 0) + 1;
              }
              return acc;
            }, { the: 0, this: 0, these: 0, it: 0 });
            const minimumTarget = (share: number, starter: string) => {
              const rounded = Math.round(eligibleCount * share);
              const floor = share >= 0.20 ? (eligibleCount >= 5 ? 1 : 0) : (eligibleCount >= 10 ? 1 : 0);
              return Math.min(capacities[starter] || 0, Math.max(floor, rounded));
            };
            const quotaTargets: Record<string, number> = {
              the: minimumTarget(0.20, 'the'),
              this: minimumTarget(0.05, 'this'),
              these: minimumTarget(0.05, 'these'),
              it: minimumTarget(0.05, 'it'),
            };
            const totalStarterTarget = Math.max(quotaTargets.the + quotaTargets.this + quotaTargets.these + quotaTargets.it, Math.min(eligibleCount, Math.round(eligibleCount * 0.40)));
            const totalStarterCap = Math.max(totalStarterTarget, Math.ceil(eligibleCount * 0.55));
            const perStarterCap: Record<string, number> = {
              the: Math.max(quotaTargets.the, Math.ceil(eligibleCount * 0.30)),
              this: Math.max(quotaTargets.this, Math.ceil(eligibleCount * 0.12)),
              these: Math.max(quotaTargets.these, Math.ceil(eligibleCount * 0.12)),
              it: Math.max(quotaTargets.it, Math.ceil(eligibleCount * 0.12)),
            };
            const findNearestSameStarterDistance = (idx: number, starter: string) => {
              let best = eligibleCount + 1;
              for (const validIdx of validIndices) {
                if (validIdx === idx || getMatchedStarter(sentences[validIdx]) !== starter) continue;
                best = Math.min(best, Math.abs(validIdx - idx));
              }
              return best;
            };
            const scorePlacement = (idx: number, starter: string) => {
              const previousStarter = idx > 0 ? getMatchedStarter(sentences[idx - 1]) : null;
              const nextStarter = idx < sentences.length - 1 ? getMatchedStarter(sentences[idx + 1]) : null;
              const sameStarterDistance = findNearestSameStarterDistance(idx, starter);
              let score = getWordList(sentences[idx]).length;
              if (previousStarter === starter) score -= 100;
              if (nextStarter === starter) score -= 30;
              if (previousStarter) score -= 8;
              if (nextStarter) score -= 4;
              score += Math.min(sameStarterDistance, 6) * 6;
              score -= counts[starter] * 5;
              return score;
            };
            const tryPlaceStarter = (starter: string): boolean => {
              if ((counts[starter] || 0) >= (perStarterCap[starter] || Number.MAX_SAFE_INTEGER)) return false;
              const candidateIndices = validIndices.filter((idx) => !getMatchedStarter(sentences[idx]) && supportsStarter(starter, sentences[idx], idx > 0 ? sentences[idx - 1] : null));
              if (candidateIndices.length === 0) return false;
              candidateIndices.sort((left, right) => scorePlacement(right, starter) - scorePlacement(left, starter));
              const chosenIdx = candidateIndices[0];
              const updated = starter === 'the' || starter === 'this' || starter === 'these' || starter === 'it'
                ? applyLeadStarter(sentences[chosenIdx], starter)
                : applyCommaStarter(sentences[chosenIdx], capitalizeFirst(starter));
              if (!updated) return false;
              sentences[chosenIdx] = updated;
              counts[starter] = (counts[starter] || 0) + 1;
              return true;
            };

            for (const starter of ['the', 'this', 'these', 'it']) {
              while ((counts[starter] || 0) < quotaTargets[starter]) {
                if (!tryPlaceStarter(starter)) break;
              }
            }

            const connectorPriority: StarterCategory[] = ['additive', 'contrast', 'result', 'alternative'];
            while (placedStarters() < totalStarterTarget && placedStarters() < totalStarterCap) {
              let placed = false;
              for (const category of connectorPriority) {
                const starterPool = starterChoices[category].map((starter) => starter.toLowerCase()).sort((left, right) => counts[left] - counts[right] || left.localeCompare(right));
                for (const starter of starterPool) {
                  if (tryPlaceStarter(starter)) {
                    placed = true;
                    break;
                  }
                }
                if (placed) break;
              }
              if (!placed) break;
            }

            while (placedStarters() > totalStarterCap) {
              let trimmed = false;
              for (let i = validIndices.length - 1; i >= 0; i--) {
                const idx = validIndices[i];
                const matchedStarter = getMatchedStarter(sentences[idx]);
                if (!matchedStarter) continue;
                if ((counts[matchedStarter] || 0) <= (quotaTargets[matchedStarter] || 0)) continue;
                sentences[idx] = demoteStarter(sentences[idx], matchedStarter);
                counts[matchedStarter] = Math.max(0, (counts[matchedStarter] || 0) - 1);
                trimmed = true;
                break;
              }
              if (!trimmed) break;
            }
          };

          const applyNuruDocumentFlowCalibration = (
            sentences: string[],
            paragraphBoundaries: number[],
            sourceSentences: string[],
          ): void => {
            const validIndices = sentences
              .map((_, idx) => idx)
              .filter((idx) => !isHeadingSentCheck(sentences[idx]));
            if (validIndices.length < 2) return;

            const normalizeSentence = (sentence: string) => sentence.trim().replace(/^['"([\{\s]+/, '');
            const cleanWord = (word: string | undefined) => (word ?? '').replace(/[^a-z0-9'-]/gi, '').toLowerCase();
            const getWordList = (sentence: string) => normalizeSentence(sentence).split(/\s+/).filter(Boolean);
            const capitalizeFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
            const FLOW_STOPWORDS = new Set([
              'the', 'a', 'an', 'and', 'or', 'but', 'if', 'while', 'because', 'as', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by',
              'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over', 'again', 'further', 'then',
              'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
              'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'could', 'may', 'might', 'must', 'should', 'would', 'will',
              'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'this', 'these', 'those', 'that', 'it',
              'however', 'therefore', 'thus', 'hence', 'also', 'additionally', 'moreover', 'furthermore'
            ]);
            const getContentWords = (sentence: string) => getWordList(sentence)
              .map((word) => cleanWord(word))
              .filter((word) => word.length > 2 && !FLOW_STOPWORDS.has(word));
            const leadStarters = [
              'on the other hand', 'on the contrary', 'as a result', 'in addition', 'in contrast',
              'nevertheless', 'nonetheless', 'alternatively', 'additionally', 'furthermore', 'consequently', 'therefore', 'moreover', 'however', 'thus', 'hence', 'also', 'these', 'this', 'the', 'it'
            ];
            const getLeadStarter = (sentence: string): string | null => {
              const normalized = getWordList(sentence).join(' ').replace(/[^a-z0-9 ]/gi, '').toLowerCase();
              return leadStarters.find((starter) => normalized.startsWith(starter)) ?? null;
            };
            const getStarterFamily = (sentence: string) => {
              const starter = getLeadStarter(sentence);
              if (!starter) return 'none';
              if (starter === 'the') return 'article';
              if (starter === 'this' || starter === 'these') return 'demonstrative';
              if (starter === 'it') return 'pronominal';
              if (['also', 'moreover', 'furthermore', 'additionally', 'in addition'].includes(starter)) return 'additive';
              if (['however', 'nevertheless', 'nonetheless', 'in contrast', 'on the other hand', 'on the contrary'].includes(starter)) return 'contrast';
              if (['therefore', 'consequently', 'as a result', 'thus', 'hence'].includes(starter)) return 'result';
              if (starter === 'alternatively') return 'alternative';
              return starter;
            };
            const demoteLeadStarter = (sentence: string): string => {
              const starter = getLeadStarter(sentence);
              if (!starter) return sentence;
              const words = getWordList(sentence);
              const starterLength = starter.split(/\s+/).length;
              let trimmed = words.slice(starterLength).join(' ').trim().replace(/^,\s*/, '');
              if (starter === 'this') trimmed = `That ${trimmed}`.trim();
              if (starter === 'these') trimmed = `Those ${trimmed}`.trim();
              return trimmed ? capitalizeFirst(trimmed) : sentence;
            };
            const buildParagraphGroups = (bounds: number[], total: number) => {
              const groups: number[][] = [];
              for (let i = 0; i < bounds.length; i++) {
                const start = bounds[i];
                const end = i < bounds.length - 1 ? bounds[i + 1] : total;
                groups.push(Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset));
              }
              return groups;
            };
            const paragraphGroups = buildParagraphGroups(paragraphBoundaries.length ? paragraphBoundaries : [0], sentences.length);
            const sourceGroups = buildParagraphGroups(paragraphBoundaries.length ? paragraphBoundaries : [0], sourceSentences.length);
            const paragraphKeywordSets = sourceGroups.map((indices) => {
              const paragraphText = indices.map((idx) => sourceSentences[idx]).join(' ');
              const paragraphContext = analyzeContext(paragraphText);
              const rankedTerms = Array.from(paragraphContext.wordFreq.entries())
                .filter(([word]) => paragraphContext.protectedTerms.has(word) && word.length > 3)
                .sort((left, right) => right[1] - left[1])
                .map(([word]) => word)
                .slice(0, 3);
              return [...Array.from(paragraphContext.domainBigrams).slice(0, 2), ...rankedTerms];
            });
            const linguistic = analyzeLinguisticText(validIndices.map((idx) => sentences[idx]));
            const analysisByIndex = new Map<number, ReturnType<typeof analyzeLinguisticText>['sentences'][number]>();
            validIndices.forEach((idx, position) => {
              analysisByIndex.set(idx, linguistic.sentences[position]);
            });
            const collectAnchorTerms = (idx: number): Set<string> => {
              const analysis = analysisByIndex.get(idx);
              const terms = new Set<string>();
              if (!analysis) return terms;
              const subjectWords = analysis.subject?.text.split(/\s+/) ?? [];
              const objectWords = analysis.object?.text.split(/\s+/) ?? [];
              const entityWords = analysis.entities.flatMap((entity) => entity.text.split(/\s+/));
              for (const word of [...subjectWords, ...objectWords, ...entityWords]) {
                const cleaned = cleanWord(word);
                if (cleaned.length > 2 && !FLOW_STOPWORDS.has(cleaned)) terms.add(cleaned);
              }
              return terms;
            };
            const overlapScore = (leftIdx: number, rightIdx: number) => {
              const leftTerms = new Set([...getContentWords(sentences[leftIdx]), ...collectAnchorTerms(leftIdx)]);
              const rightTerms = new Set([...getContentWords(sentences[rightIdx]), ...collectAnchorTerms(rightIdx)]);
              let score = 0;
              for (const term of leftTerms) {
                if (rightTerms.has(term)) score++;
              }
              return score;
            };

            for (const paragraphIndex in paragraphGroups) {
              const group = paragraphGroups[paragraphIndex].filter((idx) => !isHeadingSentCheck(sentences[idx]));
              if (group.length < 2) continue;

              const anchorKeywords = paragraphKeywordSets[Number(paragraphIndex)] ?? [];
              if (anchorKeywords.length > 0) {
                const firstSentence = sentences[group[0]].toLowerCase();
                const hasOpeningAnchor = anchorKeywords.some((keyword) => firstSentence.includes(keyword.toLowerCase()));
                if (!hasOpeningAnchor) {
                  let bestIdx = -1;
                  let bestScore = 0;
                  for (const candidateIdx of group.slice(1)) {
                    const sentenceLower = sentences[candidateIdx].toLowerCase();
                    const keywordScore = anchorKeywords.reduce((score, keyword) => score + (sentenceLower.includes(keyword.toLowerCase()) ? 2 : 0), 0);
                    const cohesionScore = overlapScore(group[0], candidateIdx);
                    if (keywordScore + cohesionScore > bestScore) {
                      bestScore = keywordScore + cohesionScore;
                      bestIdx = candidateIdx;
                    }
                  }
                  if (bestIdx !== -1) {
                    [sentences[group[0]], sentences[bestIdx]] = [sentences[bestIdx], sentences[group[0]]];
                  }
                }
              }

              for (let offset = 1; offset < group.length - 1; offset++) {
                const previousIdx = group[offset - 1];
                const currentIdx = group[offset];
                const nextIdx = group[offset + 1];
                const currentFlow = overlapScore(previousIdx, currentIdx);
                const nextFlow = overlapScore(previousIdx, nextIdx);
                const bridgeFlow = overlapScore(currentIdx, nextIdx);
                if (currentFlow === 0 && nextFlow > currentFlow && bridgeFlow > 0) {
                  [sentences[currentIdx], sentences[nextIdx]] = [sentences[nextIdx], sentences[currentIdx]];
                }
              }
            }

            const paragraphStarts = new Set(paragraphBoundaries.length ? paragraphBoundaries : [0]);
            for (const idx of validIndices) {
              const starter = getLeadStarter(sentences[idx]);
              if (!starter) continue;
              if ((starter === 'this' || starter === 'these' || starter === 'it') && paragraphStarts.has(idx)) {
                sentences[idx] = demoteLeadStarter(sentences[idx]);
                continue;
              }
              if (starter === 'this' || starter === 'these' || starter === 'it' || starter === 'the') {
                const priorAnchors = new Set<string>();
                for (const previousIdx of [idx - 1, idx - 2]) {
                  if (previousIdx >= 0) {
                    for (const term of collectAnchorTerms(previousIdx)) priorAnchors.add(term);
                  }
                }
                if (priorAnchors.size === 0) {
                  sentences[idx] = demoteLeadStarter(sentences[idx]);
                }
              }
            }

            const recentFamilies: string[] = [];
            const recentPrefixes: string[] = [];
            for (const idx of validIndices) {
              const family = getStarterFamily(sentences[idx]);
              const prefix = getWordList(sentences[idx]).slice(0, 2).map((word) => cleanWord(word)).filter(Boolean).join(' ');
              if ((family !== 'none' && recentFamilies.includes(family)) || (prefix.length > 4 && recentPrefixes.includes(prefix))) {
                let revised = demoteLeadStarter(sentences[idx]);
                revised = compressPhrases(revised);
                revised = fixMidSentenceCapitalization(fixPunctuation(removeEmDashes(revised)));
                sentences[idx] = revised;
              }
              recentFamilies.push(family);
              recentPrefixes.push(prefix);
              if (recentFamilies.length > 3) recentFamilies.shift();
              if (recentPrefixes.length > 4) recentPrefixes.shift();
            }

            for (const group of paragraphGroups) {
              const sentenceGroup = group.filter((idx) => !isHeadingSentCheck(sentences[idx]));
              for (let offset = 1; offset < sentenceGroup.length - 1; offset++) {
                const leftWords = getWordList(sentences[sentenceGroup[offset - 1]]).length;
                const middleWords = getWordList(sentences[sentenceGroup[offset]]).length;
                const rightWords = getWordList(sentences[sentenceGroup[offset + 1]]).length;
                const range = Math.max(leftWords, middleWords, rightWords) - Math.min(leftWords, middleWords, rightWords);
                if (range <= 3) {
                  const idx = sentenceGroup[offset];
                  let revised = demoteLeadStarter(sentences[idx]);
                  revised = compressPhrases(revised);
                  sentences[idx] = fixMidSentenceCapitalization(fixPunctuation(revised));
                }
              }
            }
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
            } else if (eng === 'nuru_v2') {
              return runNuruSinglePass(sentence);
            } else if (eng === 'ghost_pro_wiki') {
              return await runWikipedia(sentence);
            } else if (eng === 'ninja_3') {
              // Phase 1 only: Humara 2.0 — remaining phases handled in pipeline
              return runHumara20(sentence);
            } else if (eng === 'ninja_2') {
              // Phase 1 only: Humara 2.1 — remaining phases handled in pipeline
              return await runGuarded('ninja_2_s1', () => runHumara21(sentence), sentence, 10_000);
            } else if (eng === 'ninja_4') {
              // Phase 1 only: Humara 2.1 — remaining phases handled in pipeline
              return await runGuarded('ninja_4_s1', () => runHumara21(sentence), sentence, 10_000);
            } else if (eng === 'ninja_5') {
              // Phase 1 only: Humara 2.2 — remaining phases handled in pipeline
              return await runGuarded('ninja_5_s1', () => runHumara22(sentence), sentence, 10_000);
            } else if (eng === 'ghost_trial_2') {
              // Phase 1 only: Wikipedia — remaining phases handled in pipeline
              return await runGuarded('gt2_s1', () => runWikipediaClean(sentence), sentence);
            } else if (eng === 'ghost_trial_2_alt') {
              // Phase 1 only: Wikipedia — remaining phases handled in pipeline
              return await runGuarded('gt2a_s1', () => runWikipediaClean(sentence), sentence);
            } else if (eng === 'conscusion_1') {
              // Phase 1 only: Humara 2.2 — remaining phases handled in pipeline
              return await runGuarded('con1_s1', () => runHumara22Clean(sentence), sentence, 10_000);
            } else if (eng === 'conscusion_12') {
              // Phase 1 only: Humara 2.1 — remaining phases handled in pipeline
              return await runGuarded('con12_s1', () => runHumara21(sentence), sentence, 10_000);
            } else if (eng === 'humara_v1_3') {
              const { pipeline } = await import('@/lib/engine/humara-v1-3');
              return await pipeline(sentence, (tone ?? 'academic') as string, strength === 'strong' ? 10 : strength === 'light' ? 4 : 7);
            } else if (eng === 'omega') {
              return await omegaHumanize(sentence, strength ?? 'medium', tone ?? 'academic');
            } else if (eng === 'nuru') {
              return nuruHumanize(sentence, strength ?? 'medium', tone ?? 'academic');
            } else if (eng === 'humara') {
              return humaraHumanize(sentence, {
                strength: strength === 'high' ? 'heavy' : strength === 'low' ? 'light' : (strength ?? 'medium') as 'light' | 'medium' | 'heavy',
                tone: (tone ?? 'neutral') as 'neutral' | 'academic' | 'professional' | 'casual',
                strictMeaning: (strict_meaning ?? false) as boolean,
              });
            } else if (premium) {
              return await premiumHumanize(sentence, eng, (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone ?? 'neutral', strict_meaning ?? true);
            } else if (eng === 'ninja_1') {
              // Ninja 1 Phase 1: LLM only — Humara 2.0 and Nuru 2.0 handled in pipeline phases
              return await runGuarded('ninja1_s1', () => llmHumanize(sentence, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false), sentence);
            } else if (eng === 'undetectable' || eng === 'ninja') {
              return await llmHumanize(sentence, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false);
            } else if (eng === 'fast_v11') {
              return (await humanizeV11(sentence, { strength: (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false })).humanized;
            } else if (eng === 'ghost_mini_v1_2') {
              const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
              return ghostMiniV1_2(sentence);
            } else if (eng === 'ghost_pro') {
              return await ghostProHumanize(sentence, { strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false });
            } else {
              return humanize(sentence, { mode: 'ghost_mini', strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false, stealth: true });
            }
          };

          // ── Full-text engines (Ozone / Humara 2.1, Easy / Humara 2.2) ──
          // These LLM APIs work best on the entire text, not sentence-by-sentence.
          const FULL_TEXT_ENGINES = new Set(['easy', 'ozone', 'king', 'ghost_pro_wiki', 'humara_v3_3']);
          let sentenceResults: string[];

          if (FULL_TEXT_ENGINES.has(eng)) {
            console.log(`[FullText] Processing entire text via '${eng}'`);
            let fullResult: string;
            if (eng === 'king') {
              const kingResult = await kingHumanize(normalizedText);
              fullResult = kingResult.humanized;
            } else if (eng === 'ghost_pro_wiki') {
              fullResult = await runWikipedia(normalizedText);
            } else if (eng === 'humara_v3_3') {
              fullResult = await runHumara24(normalizedText);
            } else if (eng === 'easy') {
              fullResult = (await runHumara22(normalizedText));
            } else {
              fullResult = (await runHumara21(normalizedText));
            }
            if (!fullResult || fullResult.trim().length === 0) fullResult = normalizedText;
            const { sentences: resultSents, paragraphBoundaries: resultBounds } = splitIntoIndexedSentences(fullResult);
            sentenceResults = resultSents;
            // Stream each sentence to the client
            for (let i = 0; i < sentenceResults.length; i++) {
              sendSSE(controller, { type: 'sentence', index: i, text: sentenceResults[i], stage: 'Engine' });
            }
            humanized = fullResult;
            latestHumanized = humanized;
            console.log(`[FullText] Engine complete: ${humanized.split(/\s+/).length} words`);
          } else {
            // Determine if this engine uses async/LLM calls (can parallelize)
            const LLM_ENGINES = new Set([
              'oxygen3', 'oxygen_t5', 'dipper', 'humarin', 'humara_v3_3',
              'ghost_pro_wiki', 'ninja_1', 'ninja_4', 'ninja_5',
              'ghost_trial_2', 'ghost_trial_2_alt', 'conscusion_1', 'conscusion_12',
              'undetectable', 'ninja', 'fast_v11', 'ghost_pro',
              'humara_v1_3', 'omega',
            ]);
            const useParallel = LLM_ENGINES.has(eng);

            if (useParallel) {
              // Parallel sentence processing for LLM/async engines
              console.log(`[SentencePar] Processing ${inputSentences.length} sentences in parallel via '${eng}'`);
              sentenceResults = await Promise.all(
                inputSentences.map(async (sentence, i) => {
                  if (isHeadingSentCheck(sentence)) return sentence;
                  try {
                    let result = await runEngineOnSentence(sentence);
                    let final = result && result.trim().length > 0 ? result : sentence;
                    // LLM engines: max 1 retry (each call is expensive)
                    let change = measureSentenceChange(sentence, final);
                    if (change < minChangeThreshold) {
                      const retried = await runEngineOnSentence(final);
                      if (retried && retried.trim().length > 0) final = retried;
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: final, stage: 'Engine' });
                    return final;
                  } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    console.warn(`[SentencePar] Sentence ${i} failed:`, errMsg);
                    // Surface a non-fatal warning; keep streaming partial results.
                    if (i === 0) {
                      sendSSE(controller, { type: 'warning', message: `Engine '${eng}' degraded: ${errMsg}` });
                    }
                    return sentence;
                  }
                })
              );
            } else {
              // Sequential sentence processing for sync/local engines
              console.log(`[SentenceSeq] Processing ${inputSentences.length} sentences via '${eng}'`);
              sentenceResults = [];
              for (let i = 0; i < inputSentences.length; i++) {
                const sentence = inputSentences[i];
                if (isHeadingSentCheck(sentence)) {
                  sentenceResults.push(sentence);
                  continue;
                }
                try {
                  let result = await runEngineOnSentence(sentence);
                  let final = result && result.trim().length > 0 ? result : sentence;
                  let change = measureSentenceChange(sentence, final);
                  let retry = 0;
                  const maxRetries = Math.max(3, hRate - 3);
                  while (change < minChangeThreshold && retry < maxRetries) {
                    const retried = await runEngineOnSentence(final);
                    if (retried && retried.trim().length > 0) final = retried;
                    change = measureSentenceChange(sentence, final);
                    retry++;
                  }
                  sentenceResults.push(final);
                  sendSSE(controller, { type: 'sentence', index: i, text: final, stage: 'Engine' });
                } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  console.warn(`[SentenceSeq] Sentence ${i} failed:`, errMsg);
                  if (i === 0) {
                    sendSSE(controller, { type: 'warning', message: `Engine '${eng}' degraded: ${errMsg}` });
                  }
                  sentenceResults.push(sentence);
                }
              }
            }
            humanized = reassembleText(sentenceResults, inputParaBounds.length ? inputParaBounds : [0]);
            latestHumanized = humanized;
            console.log(`[Sentence${useParallel ? 'Par' : 'Seq'}] Engine complete: ${humanized.split(/\s+/).length} words`);
          }

          // ═══════════════════════════════════════════════════════════════
          // PHASE-BASED PIPELINE
          // Every engine defines named phases; the water fills 0→100% per phase.
          // Phase 1 = runEngineOnSentence output (already computed above).
          // Subsequent phases process currentSentences through additional engines.
          // ═══════════════════════════════════════════════════════════════
          if (usePhasePipeline) {
            const phaseStart = Date.now();
            let currentSentences = [...sentenceResults];

            // Phase definitions per engine
            type PhaseSpec =
              | { name: string; type: 'emit' }
              | { name: string; type: 'sync'; fn: (s: string) => string }
              | { name: string; type: 'async'; fn: (s: string) => Promise<string> }
              | { name: string; type: 'nuru'; passes: number };

            let phases: PhaseSpec[];
            switch (eng) {
              case 'ghost_pro_wiki':
                phases = [
                  { name: 'Restructuring', type: 'async', fn: (s) => restructureSentence(s) },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_1':
                phases = [
                  { name: 'Restructuring', type: 'async', fn: (s) => restructureSentence(s) },     // Phase 1: LLM deep sentence restructuring
                  { name: 'Deep AI Clean', type: 'async', fn: (s) => deepAICleanOneSentence(s) }, // Phase 2: LLM residual AI signal strip
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },    // Phase 3: Rule-based AI vocabulary/phrase kill
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },    // Phase 4: Full Humara 2.0 pipeline
                  { name: 'Smoothing', type: 'sync', fn: (s) => smoothingPass(s) },               // Phase 5: Grammar + flow repair
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },                           // Phase 6: 10-pass stealth humanization
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) }, // Phase 7: Final polish
                ];
                break;
              case 'oxygen':
                phases = [
                  { name: 'Restructuring', type: 'async', fn: (s) => restructureSentence(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'nuru_v2':
                phases = [
                  { name: 'Restructuring', type: 'async', fn: (s) => restructureSentence(s) },
                  { name: 'Deep Clean', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'king':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'humara_v3_3':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              // Deep Kill engines — multi-step pipelines with visible phases
              case 'ninja_2':
                // Humara 2.1 → Wikipedia → Nuru 2.0
                phases = [
                  { name: 'Humara 2.1', type: 'emit' },
                  { name: 'Wikipedia', type: 'async', fn: (s) => runWikipediaClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'ninja_3':
                // Humara 2.0 → Wikipedia → Nuru 2.0
                phases = [
                  { name: 'Humara 2.0', type: 'emit' },
                  { name: 'Wikipedia', type: 'async', fn: (s) => runWikipediaClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'ninja_4':
                // Humara 2.1 → Humara 2.4 (Full) → Nuru 2.0
                phases = [
                  { name: 'Humara 2.1', type: 'emit' },
                  { name: 'Humara 2.4 (Full)', type: 'async', fn: (s) => runHumara24Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'ninja_5':
                // Humara 2.2 → Humara 2.4 (Full) → Nuru 2.0
                phases = [
                  { name: 'Humara 2.2', type: 'emit' },
                  { name: 'Humara 2.4 (Full)', type: 'async', fn: (s) => runHumara24Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'ghost_trial_2':
                // Wikipedia → Humara 2.4 (Full) → Nuru 2.0
                phases = [
                  { name: 'Wikipedia', type: 'emit' },
                  { name: 'Humara 2.4 (Full)', type: 'async', fn: (s) => runHumara24Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'ghost_trial_2_alt':
                // Wikipedia → Humara 2.0 (Full) → Nuru 2.0
                phases = [
                  { name: 'Wikipedia', type: 'emit' },
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'conscusion_1':
                // Humara 2.2 → Wikipedia → Nuru 2.0
                phases = [
                  { name: 'Humara 2.2', type: 'emit' },
                  { name: 'Wikipedia', type: 'async', fn: (s) => runWikipediaClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              case 'conscusion_12':
                // Humara 2.1 → Humara 2.4 (Full) → Wikipedia → Nuru 2.0
                phases = [
                  { name: 'Humara 2.1', type: 'emit' },
                  { name: 'Humara 2.4 (Full)', type: 'async', fn: (s) => runHumara24Full(s) },
                  { name: 'Wikipedia', type: 'async', fn: (s) => runWikipediaClean(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                ];
                break;
              default:
                phases = [{ name: engineDisplayName, type: 'emit' }];
            }

            const totalPhases = phases.length;

            for (let pi = 0; pi < phases.length; pi++) {
              const phase = phases[pi];
              const phaseLabel = `Phase ${pi + 1}/${totalPhases} – ${phase.name}`;
              const phaseOps = phase.type === 'nuru'
                ? (Math.max(10, phase.passes) + 5) * currentSentences.length
                : currentSentences.length;
              sendSSE(controller, { type: 'stage', stage: phaseLabel, phaseOps });
              await flushDelay(1);

              // ── Minimum change enforcement (driven by humanization rate) ──
              // For sync/async/nuru phases, each sentence must achieve ≥minChangeThreshold
              // word change from its state BEFORE this phase started.
              const MIN_CHANGE = minChangeThreshold;
              const MAX_RETRIES = 1; // LLM async phases: 1 retry max (each call is expensive)
              const phaseInputSentences = [...currentSentences]; // snapshot before this phase

              if (phase.type === 'emit') {
                for (let i = 0; i < currentSentences.length; i++) {
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'sync') {
                for (let i = 0; i < currentSentences.length; i++) {
                  if (!isHeadingSentCheck(currentSentences[i])) {
                    const original = phaseInputSentences[i];
                    let result = phase.fn(currentSentences[i]);
                    let change = measureSentenceChange(original, result);
                    let retry = 0;
                    while (change < MIN_CHANGE && retry < MAX_RETRIES) {
                      result = phase.fn(result);
                      change = measureSentenceChange(original, result);
                      retry++;
                    }
                    currentSentences[i] = result;
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'async') {
                // Parallel processing for async/LLM phases
                const asyncResults = await Promise.all(
                  currentSentences.map(async (sent, i) => {
                    if (isHeadingSentCheck(sent)) return sent;
                    const original = phaseInputSentences[i];
                    let result = await phase.fn(sent);
                    let change = measureSentenceChange(original, result);
                    let retry = 0;
                    while (change < MIN_CHANGE && retry < MAX_RETRIES) {
                      result = await phase.fn(result);
                      change = measureSentenceChange(original, result);
                      retry++;
                    }
                    return result;
                  })
                );
                for (let i = 0; i < asyncResults.length; i++) {
                  currentSentences[i] = asyncResults[i];
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'nuru') {
                // ═══════════════════════════════════════════════════════
                // NURU 2.0 PIPELINE: 10 passes → GPT detect → non-LLM targeted clean
                // → extra cleanup cycles → flagged-only re-detect/re-clean loop
                // 1. 10 baseline Nuru passes on ALL sentences
                // 2. GPT-4o-mini forensic detection (flagged sentences + phrases)
                // 3. Deterministic non-LLM replacement of flagged words/phrases
                // 4. 5 targeted cleanup cycles to remove remaining AI traces
                // 5. Fast micro-loops on flagged sentences only until they drop <5
                // ═══════════════════════════════════════════════════════
                const BASELINE_PASSES = 10;
                const CLEANUP_PASSES = 10;
                const FAST_RECHECK_PASSES = 10;
                const TARGET_AI_SCORE = 5;
                const MAX_FAST_LOOPS = 10;
                const POST_DETECTION_MIN_CHANGE = Math.max(0.4, MIN_CHANGE);

                // ── Step 1: 10 baseline Nuru 2.0 passes on ALL sentences ──
                for (let pass = 0; pass < BASELINE_PASSES; pass++) {
                  sendStage(controller, phaseLabel, {
                    phaseOps: currentSentences.length,
                    cycleCurrent: pass + 1,
                    cycleTotal: BASELINE_PASSES,
                    cycleLabel: 'Nuru cycle',
                  });
                  await flushDelay(1);
                  for (let i = 0; i < currentSentences.length; i++) {
                    if (!isHeadingSentCheck(currentSentences[i])) {
                      currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                  }
                  await flushDelay(1);
                  if (deadlineReached) break;
                }

                // ── Step 2: GPT-4o-mini forensic detection ──
                interface FlaggedSentence {
                  index: number;
                  ai_score: number;
                  flagged_phrases: string[];
                }
                let flaggedSentences: FlaggedSentence[] = [];

                try {
                  const apiKey = process.env.OPENAI_API_KEY?.trim();
                  if (apiKey && !deadlineReached) {
                    const oai = new OpenAI({ apiKey });
                    const sentenceList = currentSentences
                      .map((s, i) => isHeadingSentCheck(s) ? null : `[${i}] ${s}`)
                      .filter(Boolean)
                      .join('\n');

                    const resp = await oai.chat.completions.create({
                      model: 'gpt-4o-mini',
                      messages: [
                        {
                          role: 'system',
                          content: `You are a forensic AI text analyzer. Analyze EACH sentence for AI generation signals.

For each sentence:
- Assign AI likelihood (0-100%)
- Identify exact phrases or words (1-10 words) that sound AI-generated
- Flag unnatural phrasing, generic academic filler, repetitive transitions, predictable patterns

Be strict. Do not assume the text is human.

Respond with ONLY valid JSON, no markdown:
{
  "flagged": [
    { "index": <sentence_index>, "ai_score": <0-100>, "phrases": ["flagged phrase 1", "flagged word"] }
  ]
}

Only include sentences with ai_score >= 55 in the flagged array.
List ALL suspicious words and phrases (up to 5 per sentence).`,
                        },
                        { role: 'user', content: sentenceList.slice(0, 4000) },
                      ],
                      temperature: 0,
                      max_tokens: 1500,
                    });

                    const raw = resp.choices[0]?.message?.content?.trim() ?? '';
                    try {
                      const parsed = JSON.parse(raw);
                      if (Array.isArray(parsed.flagged)) {
                        flaggedSentences = parsed.flagged
                          .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < currentSentences.length)
                          .map((f: any) => ({
                            index: f.index,
                            ai_score: typeof f.ai_score === 'number' ? f.ai_score : 80,
                            flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                          }));
                      }
                    } catch { /* ignore parse errors */ }
                    console.log(`[Nuru GPT] Flagged ${flaggedSentences.length}/${currentSentences.length} sentences`);
                  }
                } catch (e: any) {
                  console.warn(`[Nuru GPT] Detection failed: ${e.message}`);
                }

                // ── Step 3: Deterministic non-LLM cleanup of flagged words/phrases ──
                if (flaggedSentences.length > 0 && !deadlineReached) {
                  for (const flagged of flaggedSentences) {
                    if (isHeadingSentCheck(currentSentences[flagged.index])) continue;
                    currentSentences[flagged.index] = cleanFlaggedSentenceNonLLM(
                      currentSentences[flagged.index],
                      flagged.flagged_phrases,
                      phaseInputSentences[flagged.index],
                      POST_DETECTION_MIN_CHANGE,
                    );
                    sendSSE(controller, {
                      type: 'sentence',
                      index: flagged.index,
                      text: currentSentences[flagged.index],
                      stage: `${phaseLabel} (targeted clean)`,
                    });
                  }
                }

                // ── Step 4: 5 targeted cleanup cycles to remove remaining traces ──
                if (!deadlineReached) {
                  for (let pass = 0; pass < CLEANUP_PASSES; pass++) {
                    sendStage(controller, phaseLabel, {
                      phaseOps: currentSentences.length,
                      cycleCurrent: pass + 1,
                      cycleTotal: CLEANUP_PASSES,
                      cycleLabel: 'Cleanup cycle',
                    });
                    await flushDelay(1);
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (!isHeadingSentCheck(currentSentences[i])) {
                        currentSentences[i] = deepNonLLMClean(runNuruSinglePass(currentSentences[i]));
                        currentSentences[i] = smoothingPass(currentSentences[i]);
                      }
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: `${phaseLabel} (cleanup)` });
                    }
                    await flushDelay(1);
                    if (deadlineReached) break;
                  }
                }

                // ── Step 5: fast flagged-only re-detect/re-clean loop until <5 AI score ──
                let activeFlagged = [...flaggedSentences];
                let fastLoop = 0;
                while (
                  activeFlagged.length > 0 &&
                  fastLoop < MAX_FAST_LOOPS &&
                  !deadlineReached
                ) {
                  fastLoop++;
                  try {
                    const apiKey = process.env.OPENAI_API_KEY?.trim();
                    if (!apiKey) break;
                    const oai = new OpenAI({ apiKey });
                    const flaggedSubset = activeFlagged
                      .filter((f: any) => !isHeadingSentCheck(currentSentences[f.index]))
                      .map((f: any) => ({ index: f.index, sentence: currentSentences[f.index] }));
                    if (flaggedSubset.length === 0) break;

                    const recheckResp = await Promise.race([
                      oai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                          {
                            role: 'system',
                            content: `You are a forensic AI text analyzer. Re-check ONLY these already-flagged sentences.

For each sentence:
- Assign AI likelihood (0-100%)
- List the exact remaining suspicious words/phrases

Respond with ONLY valid JSON:
{ "flagged": [{ "index": <original_index>, "ai_score": <0-100>, "phrases": ["phrase1", "word1"] }] }

Include EVERY sentence with ai_score >= 5.
If all sentences are below 5, return { "flagged": [] }.`,
                          },
                          { role: 'user', content: JSON.stringify(flaggedSubset).slice(0, 3000) },
                        ],
                        temperature: 0,
                        max_tokens: 900,
                      }),
                      new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('GPT recheck timed out')), 2000)
                      ),
                    ]);

                    const recheckRaw = recheckResp.choices[0]?.message?.content?.trim() ?? '';
                    let reflagged: FlaggedSentence[] = [];
                    try {
                      const parsed = JSON.parse(recheckRaw);
                      if (Array.isArray(parsed.flagged)) {
                        reflagged = parsed.flagged
                          .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < currentSentences.length)
                          .map((f: any) => ({
                            index: f.index,
                            ai_score: typeof f.ai_score === 'number' ? f.ai_score : 0,
                            flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                          }))
                          .filter((f: any) => f.ai_score >= TARGET_AI_SCORE);
                      }
                    } catch { /* ignore parse errors */ }

                    if (reflagged.length === 0) {
                      activeFlagged = [];
                      break;
                    }

                    for (const flagged of reflagged) {
                      if (isHeadingSentCheck(currentSentences[flagged.index])) continue;
                      currentSentences[flagged.index] = cleanFlaggedSentenceNonLLM(
                        currentSentences[flagged.index],
                        flagged.flagged_phrases,
                        phaseInputSentences[flagged.index],
                        POST_DETECTION_MIN_CHANGE,
                      );
                      sendSSE(controller, {
                        type: 'sentence',
                        index: flagged.index,
                        text: currentSentences[flagged.index],
                        stage: `${phaseLabel} (recheck clean)`,
                      });
                    }

                    for (let pass = 0; pass < FAST_RECHECK_PASSES; pass++) {
                      sendStage(controller, phaseLabel, {
                        phaseOps: Math.max(1, reflagged.length),
                        cycleCurrent: pass + 1,
                        cycleTotal: FAST_RECHECK_PASSES,
                        cycleLabel: 'Recheck cycle',
                      });
                      await flushDelay(1);
                      for (const flagged of reflagged) {
                        if (isHeadingSentCheck(currentSentences[flagged.index])) continue;
                        currentSentences[flagged.index] = cleanFlaggedSentenceNonLLM(
                          runNuruSinglePass(currentSentences[flagged.index]),
                          flagged.flagged_phrases,
                          phaseInputSentences[flagged.index],
                          POST_DETECTION_MIN_CHANGE,
                        );
                        sendSSE(controller, { type: 'sentence', index: flagged.index, text: currentSentences[flagged.index], stage: `${phaseLabel} (recheck cleanup)` });
                      }
                      await flushDelay(1);
                    }

                    activeFlagged = reflagged;
                  } catch (e: any) {
                    console.warn(`[Nuru GPT Loop] Fast recheck failed: ${e.message}`);
                    break;
                  }
                }

                // ── Enforce 40% minimum change on any under-performing sentences ──
                for (let i = 0; i < currentSentences.length; i++) {
                  if (isHeadingSentCheck(currentSentences[i])) continue;
                  const original = phaseInputSentences[i];
                  let change = measureSentenceChange(original, currentSentences[i]);
                  let retry = 0;
                  while (change < POST_DETECTION_MIN_CHANGE && retry < 3) {
                    currentSentences[i] = cleanFlaggedSentenceNonLLM(currentSentences[i], [], original, POST_DETECTION_MIN_CHANGE);
                    change = measureSentenceChange(original, currentSentences[i]);
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                    retry++;
                  }
                }
              }

              humanized = reassembleText(currentSentences, inputParaBounds.length ? inputParaBounds : [0]);
              latestHumanized = humanized;
              await flushDelay(1);
              console.log(`[Pipeline] ${phaseLabel}: ${humanized.split(/\s+/).length} words (${Date.now() - phaseStart}ms)`);
              // Bail out only on hard deadline
              if (deadlineReached) break;
            }

            if (eng === 'nuru_v2' && !deadlineReached) {
              applySentenceStartersDistribution(currentSentences);
              humanized = reassembleText(currentSentences, inputParaBounds.length ? inputParaBounds : [0]);
              latestHumanized = humanized;
              sendSSE(controller, { type: 'stage', stage: 'Nuru 2.0 Sentence Starters', phaseOps: currentSentences.length });
              for (let i = 0; i < currentSentences.length; i++) {
                sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: 'Nuru 2.0 Sentence Starters' });
              }
            }

            console.log(`[Pipeline] Complete: ${humanized.split(/\s+/).length} words in ${Date.now() - phaseStart}ms`);
          }

          // Emit final engine sentences for non-phased engines
          if (!usePhasePipeline) {
            const { sentences: engineSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, engineSentences, 'Engine', 2);
            await flushDelay(2);
          }

          // Detector + input analysis — needed for both post-processing and final detection
          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);

          // ═══════════════════════════════════════════════════════════════
          // UNIVERSAL NURU POST-PROCESSING: 10 passes → GPT detect → Nuru cleanup
          // → fast flagged-only re-detect/re-clean loop until <5 AI score
          // Applies to ALL engines EXCEPT ozone (Humara 2.1).
          // Engines that already ran Nuru in their phase pipeline skip baseline.
          // Runs all phases until hard deadline (deadlineReached).
          // ═══════════════════════════════════════════════════════════════
          if (eng !== 'ozone' && !deadlineReached) {
            const nuruPostStart = Date.now();
            const nuruPostTimeOk = () => !deadlineReached;

            const { sentences: postSentences, paragraphBoundaries: postParaBounds } = splitIntoIndexedSentences(humanized);
            const postSents = [...postSentences];
            const postBaselineSentences = [...postSentences];
            const FLAGGED_CLEANUP_PASSES = 10;
            const FAST_RECHECK_PASSES = 10;
            const TARGET_AI_SCORE = 5;
            const MAX_FAST_LOOPS = 10;
            const POST_DETECTION_MIN_CHANGE = 0.4;

            const nuruPostOps = (usePhasePipeline ? 5 : 15) * postSents.length;
            sendStage(controller, 'Nuru 2.0 Post-Processing', { phaseOps: Math.max(1, nuruPostOps) });
            await flushDelay(1);

            // ── Step 1: 10 baseline Nuru passes (skip if engine already ran Nuru in pipeline) ──
            if (!usePhasePipeline && nuruPostTimeOk()) {
              for (let pass = 0; pass < 10; pass++) {
                sendStage(controller, 'Nuru 2.0 Post-Processing', {
                  phaseOps: postSents.length,
                  cycleCurrent: pass + 1,
                  cycleTotal: 10,
                  cycleLabel: 'Post cycle',
                });
                await flushDelay(1);
                for (let i = 0; i < postSents.length; i++) {
                  if (!isHeadingSentCheck(postSents[i])) {
                    postSents[i] = runNuruSinglePass(postSents[i]);
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: 'Nuru 2.0 Post-Processing' });
                }
                await flushDelay(1);
                if (!nuruPostTimeOk()) break;
              }
              console.log(`[Nuru Post] 10 baseline passes done (${Date.now() - nuruPostStart}ms)`);
            }

            // ── Step 2: GPT-4o-mini forensic detection ──
            interface PostFlagged { index: number; ai_score: number; flagged_phrases: string[]; }
            let postFlagged: PostFlagged[] = [];

            if (nuruPostTimeOk()) {
              try {
                const gptApiKey = process.env.OPENAI_API_KEY?.trim();
                if (gptApiKey) {
                  const oai = new OpenAI({ apiKey: gptApiKey });
                  const sentList = postSents
                    .map((s, i) => isHeadingSentCheck(s) ? null : `[${i}] ${s}`)
                    .filter(Boolean)
                    .join('\n');

                  const gptResp = await Promise.race([
                    oai.chat.completions.create({
                      model: 'gpt-4o-mini',
                      messages: [
                        {
                          role: 'system',
                          content: `You are a forensic AI text analyzer. Analyze EACH sentence for AI generation signals.
For each sentence: assign AI likelihood (0-100%), identify ALL suspicious words and phrases (up to 5).
Respond with ONLY valid JSON: { "flagged": [{ "index": <int>, "ai_score": <0-100>, "phrases": ["phrase1", "word1"] }] }
Only include sentences with ai_score >= 55.`,
                        },
                        { role: 'user', content: sentList.slice(0, 4000) },
                      ],
                      temperature: 0,
                      max_tokens: 1500,
                    }),
                    new Promise<never>((_, reject) =>
                      setTimeout(() => reject(new Error('GPT detection timed out')), 4000)
                    ),
                  ]);

                  const raw = gptResp.choices[0]?.message?.content?.trim() ?? '';
                  try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.flagged)) {
                      postFlagged = parsed.flagged
                        .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < postSents.length)
                        .map((f: any) => ({
                          index: f.index,
                          ai_score: typeof f.ai_score === 'number' ? f.ai_score : 80,
                          flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                        }));
                    }
                  } catch { /* ignore parse errors */ }
                  console.log(`[Nuru Post GPT] Flagged ${postFlagged.length}/${postSents.length} sentences (${Date.now() - nuruPostStart}ms)`);
                }
              } catch (e: any) {
                console.warn(`[Nuru Post GPT] Detection failed: ${e.message}`);
              }
            }

            // ── Step 3: targeted non-LLM cleanup of flagged sentences ──
            if (postFlagged.length > 0 && nuruPostTimeOk()) {
              for (const flagged of postFlagged) {
                if (isHeadingSentCheck(postSents[flagged.index])) continue;
                postSents[flagged.index] = cleanFlaggedSentenceNonLLM(
                  postSents[flagged.index],
                  flagged.flagged_phrases,
                  postBaselineSentences[flagged.index],
                  POST_DETECTION_MIN_CHANGE,
                );
                sendSSE(controller, {
                  type: 'sentence',
                  index: flagged.index,
                  text: postSents[flagged.index],
                  stage: 'Nuru 2.0 Post-Processing (targeted clean)',
                });
              }
            }

            // ── Step 4: 5 final Nuru 2.0 cleanup passes ──
            if (nuruPostTimeOk()) {
              for (let pass = 0; pass < 10; pass++) {
                sendStage(controller, 'Nuru 2.0 Post-Processing', {
                  phaseOps: postSents.length,
                  cycleCurrent: pass + 1,
                  cycleTotal: 10,
                  cycleLabel: 'Cleanup cycle',
                });
                await flushDelay(1);
                for (let i = 0; i < postSents.length; i++) {
                  if (!isHeadingSentCheck(postSents[i])) {
                    postSents[i] = deepNonLLMClean(runNuruSinglePass(postSents[i]));
                    postSents[i] = smoothingPass(postSents[i]);
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: 'Nuru 2.0 (cleanup)' });
                }
                await flushDelay(1);
                if (!nuruPostTimeOk()) break;
              }
            }

            // ── Step 5: extra flagged-sentence Nuru cleanup ──
            if (postFlagged.length > 0 && nuruPostTimeOk()) {
              for (let pass = 0; pass < FLAGGED_CLEANUP_PASSES && nuruPostTimeOk(); pass++) {
                sendStage(controller, 'Nuru 2.0 Post-Processing', {
                  phaseOps: Math.max(1, postFlagged.length),
                  cycleCurrent: pass + 1,
                  cycleTotal: FLAGGED_CLEANUP_PASSES,
                  cycleLabel: 'Flagged cycle',
                });
                await flushDelay(1);
                for (const flagged of postFlagged) {
                  if (isHeadingSentCheck(postSents[flagged.index])) continue;
                  postSents[flagged.index] = cleanFlaggedSentenceNonLLM(
                    postSents[flagged.index],
                    flagged.flagged_phrases,
                    postBaselineSentences[flagged.index],
                    POST_DETECTION_MIN_CHANGE,
                  );
                  sendSSE(controller, { type: 'sentence', index: flagged.index, text: postSents[flagged.index], stage: 'Nuru 2.0 (flagged cleanup)' });
                }
                await flushDelay(1);
              }
            }

            // ── Step 6: fast flagged-only re-detect/re-clean loop until <5 AI score ──
            let activePostFlagged = [...postFlagged];
            let fastLoop = 0;
            while (activePostFlagged.length > 0 && fastLoop < MAX_FAST_LOOPS && nuruPostTimeOk()) {
              fastLoop++;
              try {
                const gptApiKey = process.env.OPENAI_API_KEY?.trim();
                if (!gptApiKey) break;
                const oai = new OpenAI({ apiKey: gptApiKey });
                const flaggedSubset = activePostFlagged
                  .filter((f: any) => !isHeadingSentCheck(postSents[f.index]))
                  .map((f: any) => ({ index: f.index, sentence: postSents[f.index] }));
                if (flaggedSubset.length === 0) break;

                const recheckResp = await Promise.race([
                  oai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                      {
                        role: 'system',
                        content: `You are a forensic AI text analyzer. Re-check ONLY these already-flagged sentences.

For each sentence:
- Assign AI likelihood (0-100%)
- List the exact remaining suspicious words/phrases

Respond with ONLY valid JSON:
{ "flagged": [{ "index": <original_index>, "ai_score": <0-100>, "phrases": ["phrase1", "word1"] }] }

Include EVERY sentence with ai_score >= 5.
If all sentences are below 5, return { "flagged": [] }.`,
                      },
                      { role: 'user', content: JSON.stringify(flaggedSubset).slice(0, 3000) },
                    ],
                    temperature: 0,
                    max_tokens: 900,
                  }),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('GPT recheck timed out')), 2000)
                  ),
                ]);

                const recheckRaw = recheckResp.choices[0]?.message?.content?.trim() ?? '';
                let reflagged: PostFlagged[] = [];
                try {
                  const parsed = JSON.parse(recheckRaw);
                  if (Array.isArray(parsed.flagged)) {
                    reflagged = parsed.flagged
                      .filter((f: any) => typeof f.index === 'number' && f.index >= 0 && f.index < postSents.length)
                      .map((f: any) => ({
                        index: f.index,
                        ai_score: typeof f.ai_score === 'number' ? f.ai_score : 0,
                        flagged_phrases: Array.isArray(f.phrases) ? f.phrases.filter((p: any) => typeof p === 'string') : [],
                      }))
                      .filter((f: any) => f.ai_score >= TARGET_AI_SCORE);
                  }
                } catch { /* ignore parse errors */ }

                if (reflagged.length === 0) {
                  activePostFlagged = [];
                  break;
                }

                for (const flagged of reflagged) {
                  if (isHeadingSentCheck(postSents[flagged.index])) continue;
                  postSents[flagged.index] = cleanFlaggedSentenceNonLLM(
                    postSents[flagged.index],
                    flagged.flagged_phrases,
                    postBaselineSentences[flagged.index],
                    POST_DETECTION_MIN_CHANGE,
                  );
                  sendSSE(controller, { type: 'sentence', index: flagged.index, text: postSents[flagged.index], stage: 'Nuru 2.0 (recheck clean)' });
                }

                for (let pass = 0; pass < FAST_RECHECK_PASSES && nuruPostTimeOk(); pass++) {
                  sendStage(controller, 'Nuru 2.0 Post-Processing', {
                    phaseOps: Math.max(1, reflagged.length),
                    cycleCurrent: pass + 1,
                    cycleTotal: FAST_RECHECK_PASSES,
                    cycleLabel: 'Recheck cycle',
                  });
                  await flushDelay(1);
                  for (const flagged of reflagged) {
                    if (isHeadingSentCheck(postSents[flagged.index])) continue;
                    postSents[flagged.index] = cleanFlaggedSentenceNonLLM(
                      runNuruSinglePass(postSents[flagged.index]),
                      flagged.flagged_phrases,
                      postBaselineSentences[flagged.index],
                      POST_DETECTION_MIN_CHANGE,
                    );
                    sendSSE(controller, { type: 'sentence', index: flagged.index, text: postSents[flagged.index], stage: 'Nuru 2.0 (recheck cleanup)' });
                  }
                  await flushDelay(1);
                }

                activePostFlagged = reflagged;
              } catch (e: any) {
                console.warn(`[Nuru Post GPT Loop] Fast recheck failed: ${e.message}`);
                break;
              }
            }

            for (let i = 0; i < postSents.length; i++) {
              if (isHeadingSentCheck(postSents[i])) continue;
              let change = measureSentenceChange(postBaselineSentences[i], postSents[i]);
              let retry = 0;
              while (change < POST_DETECTION_MIN_CHANGE && retry < 3) {
                postSents[i] = cleanFlaggedSentenceNonLLM(postSents[i], [], postBaselineSentences[i], POST_DETECTION_MIN_CHANGE);
                change = measureSentenceChange(postBaselineSentences[i], postSents[i]);
                sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: 'Nuru 2.0 Post-Processing' });
                retry++;
              }
            }

            humanized = reassembleText(postSents, postParaBounds.length ? postParaBounds : [0]);
            latestHumanized = humanized;
            console.log(`[Nuru Post] Complete in ${Date.now() - nuruPostStart}ms`);
          }

          // ── POST-PROCESSING (skip for ozone — it handles its own full pipeline) ──
          if (eng !== 'ozone') {

          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'oxygen' && eng !== 'ozone' && !isDeepKill) {
            humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            if (!usePhasePipeline) {
              sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
              await flushDelay(2);
              const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 2);
              await flushDelay(2);
            }
          }

          // 5. 40% Restructuring enforcement
          if (!isDeepKill) {
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Restructuring' });
            await flushDelay(2);
          }
          {
            const { sentences: origSents } = splitIntoIndexedSentences(normalizedText);
            const { sentences: humanizedSents, paragraphBoundaries: humanParaBounds } = splitIntoIndexedSentences(humanized);
            const isHeadingSent = (s: string) => s.trim().length < 120 && !/[.!?]$/.test(s.trim()) && s.trim().split(/\s+/).length <= 15;
            const RESTRUCTURE_MIN = 0.40;
            const usedWords = new Set<string>();
            let changed = false;
            for (let i = 0; i < humanizedSents.length; i++) {
              if (isHeadingSent(humanizedSents[i])) continue; // Skip headings
              // Only compare against non-heading original sentences
              let bestOrigIdx = -1;
              let bestScore = Infinity;
              for (let j = 0; j < origSents.length; j++) {
                if (isHeadingSent(origSents[j])) continue;
                const r = measureSentenceChange(origSents[j], humanizedSents[i]);
                if (r < bestScore) { bestScore = r; bestOrigIdx = j; }
              }
              if (bestOrigIdx >= 0 && bestScore < RESTRUCTURE_MIN) {
                let s = humanizedSents[i];
                s = applyAIWordKill(s);
                s = synonymReplace(s, 0.85, usedWords);
                // Re-check after synonym pass; apply more aggressive pass if still below
                const recheck = measureSentenceChange(origSents[bestOrigIdx], s);
                if (recheck < RESTRUCTURE_MIN) {
                  s = synonymReplace(s, 1.0, usedWords);
                }
                if (s !== humanizedSents[i]) { humanizedSents[i] = s; changed = true; }
              }
            }
            if (changed) {
              humanized = reassembleText(humanizedSents, humanParaBounds.length ? humanParaBounds : [0]);
              if (!usePhasePipeline) {
                const { sentences: restructuredSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, restructuredSents, 'Restructuring', 2);
              }
            }
          }
          await flushDelay(2);
          } // end !isDeepKill restructuring guard

          // 6. Capitalization fix
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && !isDeepKill) {
            humanized = fixCapitalization(humanized, text);
          }

          // 7. AI capitalization
          humanized = humanized
            .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
            .replace(/\bai\b/g, 'AI');

          // 8. Repetition cleanup
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ozone' && !isDeepKill) {
            humanized = deduplicateRepeatedPhrases(humanized);
          }

          // 9. Structural post-processing
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ninja' && eng !== 'undetectable' && eng !== 'ozone' && !isDeepKill) {
            humanized = structuralPostProcess(humanized);
          }

          // 10. Structure preservation — skip for engines that preserve structure internally
          if (!isDeepKill) humanized = preserveInputStructure(normalizedText, humanized);

          // 11. Contraction & em-dash enforcement
          humanized = expandContractions(humanized);
          humanized = removeEmDashes(humanized);

          // 12. Grammar sanitizer
          const CONSONANT_SOUND_VOWELS = new Set(['uni', 'use', 'usa', 'usu', 'uti', 'ure', 'uro', 'one', 'once']);
          const VOWEL_SOUND_CONSONANTS = new Set(['hour', 'honest', 'honor', 'honour', 'heir', 'herb']);
          humanized = humanized.replace(/\ban (more|less|much|most|very|quite|rather|fairly|too|so)\b/gi, (m, w) => (m[0] === 'A' ? 'A ' : 'a ') + w);
          humanized = humanized.replace(/\ba (increasingly|ever|each|every|eight|eleven|eighteen|important|interesting|independent|innovative|intelligent|upper)\b/gi, (m, w) => (m[0] === 'A' ? 'An ' : 'an ') + w);
          humanized = humanized.replace(/\b(a|an)\s+(\w+)/gi, (full, art, word) => {
            const lower = word.toLowerCase();
            const firstChar = lower[0];
            const first3 = lower.slice(0, 3);
            const isVowelSound = 'aeiou'.includes(firstChar) ? !CONSONANT_SOUND_VOWELS.has(first3) : VOWEL_SOUND_CONSONANTS.has(lower);
            const correctArt = isVowelSound ? 'an' : 'a';
            if (art.toLowerCase() === correctArt) return full;
            const fixed = art[0] === art[0].toUpperCase() ? (correctArt === 'an' ? 'An' : 'A') : correctArt;
            return fixed + ' ' + word;
          });
          humanized = humanized.replace(/\b(\w+)\s+ons\b/g, '$1s on');
          humanized = humanized.replace(/\b(the|a|an)\s+\1\b/gi, '$1');
          humanized = humanized.replace(/,\s+And\s+/g, ', and ');
          humanized = humanized.replace(/([a-z,])\.\s+And\s+/g, '$1 and ');

          // 13. Safety nets
          humanized = humanized.replace(/\b(when|since|though|although|because|while|if|unless|after|before|until|once)\s+\1\b/gi, "$1");
          humanized = humanized.replace(/\b(on|in|at|to|of|by|or|and|for|nor|the|with|from|into|onto|upon|over|that|this|than)\s+\1\b/gi, "$1");
          humanized = humanized.replace(/\b(eas(?:y|ier))\s+(?:for\s+\w+\s+)?to\s+(entry|availability)\b/gi, "$1 to access");
          humanized = humanized.replace(/\bto entry\b/gi, "to access");
          humanized = humanized.replace(/\bto availability\b/gi, "to access");
          humanized = humanized.replace(/\bHealthcare care\b/g, "Healthcare");
          humanized = humanized.replace(/\bquislingism\b/gi, "collaboration");
          humanized = humanized.replace(/\bquisling\b/gi, "collaborator");

          // Post-clean grammar check (universal for ALL engines)
          humanized = postCleanGrammar(humanized);

          if (eng === 'nuru_v2') {
            const { sentences: calibratedSentences, paragraphBoundaries: calibratedBounds } = splitIntoIndexedSentences(humanized);
            const { sentences: sourceSentences } = splitIntoIndexedSentences(normalizedText);
            applyNuruDocumentFlowCalibration(calibratedSentences, calibratedBounds, sourceSentences);
            humanized = reassembleText(calibratedSentences, calibratedBounds.length ? calibratedBounds : [0]);
            latestHumanized = humanized;
            sendStage(controller, 'Nuru 2.0 Flow Calibration', { phaseOps: Math.max(1, calibratedSentences.length) });
            for (let i = 0; i < calibratedSentences.length; i++) {
              sendSSE(controller, { type: 'sentence', index: i, text: calibratedSentences[i], stage: 'Nuru 2.0 Flow Calibration' });
            }
            await flushDelay(1);
          }

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
