import { robustSentenceSplit } from '@/lib/engine/content-protection';
import { getDetector } from '@/lib/engine/multi-detector';
import { isMeaningPreserved, isMeaningPreservedSync } from '@/lib/engine/semantic-guard';
import { fixCapitalization } from '@/lib/engine/shared-dictionaries';
import { deduplicateRepeatedPhrases } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure } from '@/lib/engine/structure-preserver';
import { structuralPostProcess } from '@/lib/engine/structural-post-processor';
import { unifiedSentenceProcess } from '@/lib/sentence-processor';
import { expandContractions } from '@/lib/humanize-transforms';
import { removeEmDashes } from '@/lib/engine/v13-shared-techniques';
import { humanize } from '@/lib/engine/humanizer';
import { ghostProHumanize } from '@/lib/engine/ghost-pro';
import { llmHumanize } from '@/lib/engine/llm-humanizer';
import { premiumHumanize } from '@/lib/engine/premium-humanizer';
import { humanizeV11 } from '@/lib/engine/v11';
import { humaraHumanize } from '@/lib/humara';
import { nuruHumanize } from '@/lib/engine/nuru-humanizer';
import { stealthHumanize } from '@/lib/engine/stealth';
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

/** Small delay to allow the stream to flush so the browser can render intermediate states */
function flushDelay(ms = 8): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  delayMs = 60,
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

    const { text, engine, strength, tone, strict_meaning, no_contractions, enable_post_processing, premium } = body as {
      text: string; engine?: string; strength?: string; tone?: string;
      strict_meaning?: boolean; no_contractions?: boolean;
      enable_post_processing?: boolean; premium?: boolean;
    };

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
        const { data: { user: authUser } } = await supa.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authUser) {
          userId = authUser.id;
          userEmail = authUser.email ?? null;
        }
      } catch { /* auth optional */ }
    }

    // Admin emails get unlimited access
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = userEmail ? adminEmails.includes(userEmail.toLowerCase()) : false;

    if (userId && !isAdmin) {
      try {
        const supa = createServiceClient();
        const inputWordCount = text.trim().split(/\s+/).length;
        const { data: stats, error: statsError } = await supa.rpc('get_usage_stats', { p_user_id: userId });

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
        try {
          // 1. Parse & emit original sentences
          const { sentences: origSentences, paragraphBoundaries } = splitIntoIndexedSentences(text);
          sendSSE(controller, {
            type: 'init',
            sentences: origSentences,
            paragraphBoundaries,
          });
          await flushDelay(40); // let client render initial state quickly

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
          sendSSE(controller, { type: 'stage', stage: 'Engine Processing' });
          await flushDelay(20);

          let humanized: string;
          const eng = engine ?? 'oxygen';

          const runGuarded = async (
            label: string,
            task: () => Promise<string>,
            fallback: string,
            timeoutMs = 45_000,
          ): Promise<string> => {
            try {
              return await withTimeout(task(), timeoutMs, label);
            } catch (err) {
              console.warn(`[HumanizeStream] ${label} failed or timed out:`, err);
              return fallback;
            }
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

          const runHumara20 = (input: string): string => {
            const oxygenMode = (body as Record<string, unknown>).oxygen_mode as string || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
            return oxygenHumanize(
              input,
              effectiveStrength,
              oxygenMode,
              (body as Record<string, unknown>).oxygen_sentence_by_sentence !== undefined
                ? Boolean((body as Record<string, unknown>).oxygen_sentence_by_sentence)
                : true,
            );
          };

          const runHumara24 = async (input: string): Promise<string> => {
            const humarinMode = strength === 'strong' ? 'aggressive' : strength === 'light' ? 'fast' : 'quality';
            const humarinResult = await humarinHumanize(input, humarinMode, true);
            return humarinResult.humanized;
          };

          const runWikipedia = async (input: string): Promise<string> => {
            return await ghostProHumanize(input, {
              strength: strength ?? 'medium',
              tone: 'wikipedia',
              strictMeaning: strict_meaning ?? false,
              enablePostProcessing: enable_post_processing !== false,
              turbo: true,
            });
          };

          // Clean helpers for Deep Kill — NO Nuru tail (Nuru runs once at the very end)
          const runWikipediaClean = runWikipedia; // Stream route's runWikipedia is already clean
          const runHumara22Clean = async (input: string): Promise<string> => {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence === true;
            const easyResult = await easyHumanize(input, effectiveStrength, tone ?? 'academic', easySBS);
            return easyResult.humanized;
          };

          const runNuru = (input: string): string => {
            const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic');
            return output && output.trim().length > 0 ? output : input;
          };

          // Nuru 2.0 post-processing depth applied at the tail of every pipeline.
          const CHAIN_TS = 10;
          const chainSync = (fn: (s: string) => string, input: string, n: number): string => {
            let out = input;
            for (let i = 0; i < n; i++) out = fn(out);
            return out;
          };

          // Deep Kill engine set — used to skip destructive post-processors
          const DEEP_KILL_ENGINES = new Set([
            'ninja_2', 'ninja_3', 'ninja_4', 'ninja_5',
            'ghost_trial_2', 'ghost_trial_2_alt',
            'conscusion_1', 'conscusion_12',
          ]);
          const isDeepKill = DEEP_KILL_ENGINES.has(eng);

          if (eng === 'easy') {
            humanized = await runHumara22(normalizedText);
          } else if (eng === 'ozone') {
            humanized = await runHumara21(normalizedText);
          } else if (eng === 'oxygen') {
            humanized = runHumara20(normalizedText);
          } else if (eng === 'oxygen3') {
            // Oxygen 3.0: Fine-tuned T5 model (strict sentence-by-sentence, first-person guard)
            const o3Mode = effectiveStrength === 'strong' ? 'fast' : 'turbo';
            const o3Result = await oxygen3Humanize(normalizedText, o3Mode);
            humanized = o3Result.humanized;
          } else if (eng === 'oxygen_t5') {
            // Oxygen T5: Remote T5 model server (HF Space or self-hosted)
            const t5Mode = effectiveStrength === 'light' ? 'turbo' : effectiveStrength === 'strong' ? 'aggressive' : 'fast';
            const t5Result = await t5Humanize(normalizedText, t5Mode, true);
            humanized = t5Result.humanized;
          } else if (eng === 'dipper') {
            // DIPPER: 1B T5 paraphraser trained to evade AI detectors (HF Space)
            const dipperSBS = (body as Record<string, unknown>).dipper_sentence_by_sentence !== undefined
              ? Boolean((body as Record<string, unknown>).dipper_sentence_by_sentence)
              : false;
            const dipperResult = await dipperHumanize(normalizedText, effectiveStrength, dipperSBS);
            humanized = dipperResult.humanized;
          } else if (eng === 'humarin') {
            // Humarin: ChatGPT-trained T5-base paraphraser (222M, HF Space)
            const humarinMode = strength === 'strong' ? 'aggressive' : strength === 'light' ? 'fast' : 'quality';
            const humarinResult = await humarinHumanize(normalizedText, humarinMode, true);
            humanized = humarinResult.humanized;
          } else if (eng === 'humara_v3_3') {
            humanized = await runHumara24(normalizedText);
          } else if (eng === 'nuru_v2') {
            humanized = runNuru(normalizedText);
          } else if (eng === 'ghost_pro_wiki') {
            humanized = await runWikipedia(normalizedText);
          } else if (eng === 'ninja_3') {
            // Ninja 3: Oxygen×1 → Wikipedia×1 → Nuru×10
            const stage1 = runHumara20(normalizedText);
            const stage2 = await runGuarded('ninja_3_stage_2', () => runWikipediaClean(stage1), stage1);
            humanized = chainSync(runNuru, stage2, CHAIN_TS);
          } else if (eng === 'ninja_2') {
            // Ninja 2: Oxygen×1 → Nuru×10
            const stage1 = runHumara20(normalizedText);
            humanized = chainSync(runNuru, stage1, CHAIN_TS);
          } else if (eng === 'ninja_4') {
            // Ninja 4: Humara 2.4×1 → Wikipedia×1 → Nuru×10
            const stage1 = await runGuarded('ninja_4_stage_1', () => runHumara24(normalizedText), normalizedText);
            const stage2 = await runGuarded('ninja_4_stage_2', () => runWikipediaClean(stage1), stage1);
            humanized = chainSync(runNuru, stage2, CHAIN_TS);
          } else if (eng === 'ninja_5') {
            // Ninja 5: Humara 2.4×1 → Nuru×10
            const stage1 = await runGuarded('ninja_5_stage_1', () => runHumara24(normalizedText), normalizedText);
            humanized = chainSync(runNuru, stage1, CHAIN_TS);
          } else if (eng === 'ghost_trial_2') {
            // Ghost Trial 2: Wikipedia×1 → Humara 2.4×1 → Nuru×10
            const stage1 = await runGuarded('ghost_trial_2_stage_1', () => runWikipediaClean(normalizedText), normalizedText);
            const stage2 = await runGuarded('ghost_trial_2_stage_2', () => runHumara24(stage1), stage1);
            humanized = chainSync(runNuru, stage2, CHAIN_TS);
          } else if (eng === 'ghost_trial_2_alt') {
            // Ghost Trial 2 Alt: Wikipedia×1 → Oxygen×1 → Nuru×10
            const stage1 = await runGuarded('ghost_trial_2_alt_stage_1', () => runWikipediaClean(normalizedText), normalizedText);
            const stage2 = runHumara20(stage1);
            humanized = chainSync(runNuru, stage2, CHAIN_TS);
          } else if (eng === 'conscusion_1') {
            // Conscusion 1: Easy×1 → Wikipedia×1 → Nuru×10
            const stage1 = await runGuarded('conscusion_1_stage_1', () => runHumara22Clean(normalizedText), normalizedText, 35_000);
            const stage2 = await runGuarded('conscusion_1_stage_2', () => runWikipediaClean(stage1), stage1);
            humanized = chainSync(runNuru, stage2, CHAIN_TS);
          } else if (eng === 'conscusion_12') {
            // Conscusion 12: Ozone×1 → Humara 2.4×1 → Wikipedia×1 → Nuru×10
            const stage1 = await runGuarded('conscusion_12_stage_1', () => runHumara21(normalizedText), normalizedText, 35_000);
            const stage2 = await runGuarded('conscusion_12_stage_2', () => runHumara24(stage1), stage1);
            const stage3 = await runGuarded('conscusion_12_stage_3', () => runWikipediaClean(stage2), stage2);
            humanized = chainSync(runNuru, stage3, CHAIN_TS);
          } else if (eng === 'humara_v1_3') {
            const { pipeline } = await import('@/lib/engine/humara-v1-3');
            humanized = await pipeline(normalizedText, (tone ?? 'academic') as string, strength === 'strong' ? 10 : strength === 'light' ? 4 : 7);
          } else if (eng === 'omega') {
            humanized = await omegaHumanize(normalizedText, strength ?? 'medium', tone ?? 'academic');
          } else if (eng === 'nuru') {
            humanized = nuruHumanize(normalizedText, strength ?? 'medium', tone ?? 'academic');
          } else if (eng === 'humara') {
            humanized = humaraHumanize(normalizedText, {
              strength: strength === 'high' ? 'heavy' : strength === 'low' ? 'light' : (strength ?? 'medium') as 'light' | 'medium' | 'heavy',
              tone: (tone ?? 'neutral') as 'neutral' | 'academic' | 'professional' | 'casual',
              strictMeaning: (strict_meaning ?? false) as boolean,
            });
          } else if (premium) {
            humanized = await premiumHumanize(normalizedText, eng, (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone ?? 'neutral', strict_meaning ?? true);
          } else if (eng === 'undetectable' || eng === 'ninja') {
            humanized = await llmHumanize(normalizedText, strength ?? 'medium', true, strict_meaning ?? true, tone ?? 'academic', no_contractions !== false, enable_post_processing !== false);
          } else if (eng === 'fast_v11') {
            const v11Result = await humanizeV11(normalizedText, { strength: (strength ?? 'medium') as 'light' | 'medium' | 'strong', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false });
            humanized = v11Result.humanized;
          } else if (eng === 'ghost_mini_v1_2') {
            const { ghostMiniV1_2 } = await import('@/lib/engine/ghost-mini-v1-2');
            humanized = ghostMiniV1_2(normalizedText);
          } else if (eng === 'ghost_pro') {
            humanized = await ghostProHumanize(normalizedText, { strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false });
          } else {
            humanized = humanize(normalizedText, { mode: 'ghost_mini', strength: strength ?? 'medium', tone: tone ?? 'neutral', strictMeaning: strict_meaning ?? false, enablePostProcessing: enable_post_processing !== false, stealth: true });
          }

          // ═══════════════════════════════════════════════════════════════
          // 11-PHASE PIPELINE: Main engine × 1 → Nuru 2.0 × 10
          //
          // For Oxygen, Humara 2.4, and Wikipedia: the engine runs once to
          // produce a strong first-pass rewrite (Cycle 1/11), then Nuru 2.0
          // acts as a post-processing stealth engine for 10 further passes
          // (Cycles 2/11 – 11/11), each feeding the previous output as input.
          //
          // For Nuru 2.0 directly: Cycle 1 uses the already-computed Nuru
          // output, then 10 more Nuru passes follow (11 total).
          //
          // Total visible phases = 11. Total Nuru depth = 10.
          // ═══════════════════════════════════════════════════════════════
          const FAST_REHUMANIZE_ENGINES = new Set(['nuru_v2', 'ghost_pro_wiki', 'oxygen', 'humara_v3_3']);
          const fastLoopEnabled = FAST_REHUMANIZE_ENGINES.has(eng);
          if (fastLoopEnabled) {
            const TOTAL_PHASES = 11;      // 1 main engine pass + 10 Nuru passes
            const INTER_CYCLE_PAUSE_MS = 600;
            const cycleStart = Date.now();
            let cycleInput = humanized;

            for (let cycle = 1; cycle <= TOTAL_PHASES; cycle++) {
              // Cycle 1: already-computed main engine output — emit as-is.
              // Cycles 2–11: Nuru 2.0 post-processing pass on previous output.
              const cycleOutput = cycle === 1
                ? cycleInput
                : runNuru(cycleInput);
              humanized = cycleOutput;
              cycleInput = cycleOutput;

              const cycleStage = `Cycle ${cycle}/${TOTAL_PHASES}`;
              sendSSE(controller, { type: 'stage', stage: cycleStage });
              await flushDelay(10);

              // Emit the full cycle output at once — no per-sentence stagger
              const { sentences: cycleSentences } = splitIntoIndexedSentences(cycleOutput);
              for (let i = 0; i < cycleSentences.length; i++) {
                sendSSE(controller, { type: 'sentence', index: i, text: cycleSentences[i], stage: cycleStage });
              }
              await flushDelay(10);

              if (cycle < TOTAL_PHASES) {
                await flushDelay(INTER_CYCLE_PAUSE_MS);
              }
              console.log(`[Pipeline-11] Cycle ${cycle}/${TOTAL_PHASES} (${cycle === 1 ? eng : 'nuru'}): ${cycleOutput.split(/\s+/).length} words (${Date.now() - cycleStart}ms)`);
            }

            console.log(`[Pipeline-11] Complete: ${humanized.split(/\s+/).length} words in ${Date.now() - cycleStart}ms`);
          }

          // For fast-loop engines the cycles ARE the output stages — skip Engine re-emit
          if (!fastLoopEnabled) {
            const { sentences: engineSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, engineSentences, 'Engine', 20);
            await flushDelay(30); // small stage pause
          }

          // Detector + input analysis — needed for both post-processing and final detection
          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);

          // ── POST-PROCESSING (skip for ozone and oxygen_t5 — they handle their own full pipelines) ──
          if (eng !== 'ozone' && eng !== 'oxygen_t5' && eng !== 'oxygen3' && eng !== 'dipper' && eng !== 'humarin') {

          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'oxygen' && eng !== 'ozone' && !isDeepKill) {
            humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            if (!fastLoopEnabled) {
              sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
              await flushDelay(20);
              const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 20);
              await flushDelay(30);
            }
          }

          // 5. 40% Restructuring enforcement
          if (!isDeepKill) {
          if (!fastLoopEnabled) {
            sendSSE(controller, { type: 'stage', stage: 'Restructuring' });
            await flushDelay(20);
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
              if (!fastLoopEnabled) {
                const { sentences: restructuredSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, restructuredSents, 'Restructuring', 20);
              }
            }
          }
          await flushDelay(30);
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

          } // end: if (eng !== 'ozone' && eng !== 'oxygen_t5' && eng !== 'dipper' && eng !== 'humarin') post-processing block

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
              await flushDelay(20);
              const polished = oxygenHumanize(humanized, 'light', 'fast', false);
              if (polished && polished.trim().length > 0) {
                humanized = polished;
                const { sentences: oxygenSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, oxygenSents, 'Oxygen Polish', 20);
              }
            } catch {
              // Oxygen polish is best-effort — never block the pipeline
            }
            await flushDelay(30);
          }

          // Emit polished sentences (skip visible stage for fast-loop engines)
          if (!fastLoopEnabled) {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(20);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 20);
            await flushDelay(30);
          }

          // 14. Meaning check (detection disabled — coming soon)
          // Final cleanup: collapse double spaces
          humanized = humanized.replace(/ {2,}/g, ' ');
          if (!fastLoopEnabled) {
            sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
            await flushDelay(10);
          }
          // For engines with server-side meaning checks (oxygen3), use fast sync heuristic
          const meaningCheck = (eng === 'oxygen3')
            ? isMeaningPreservedSync(text, humanized, 0.88)
            : await isMeaningPreserved(text, humanized, 0.88);

          const inputWords = text.trim().split(/\s+/).length;
          const outputWords = humanized.trim().split(/\s+/).length;

          // Final done event — detection results omitted (coming soon)
          sendSSE(controller, {
            type: 'done',
            humanized,
            word_count: outputWords,
            input_word_count: inputWords,
            engine_used: eng,
            meaning_preserved: meaningCheck.isSafe,
            meaning_similarity: Math.round(meaningCheck.similarity * 100) / 100,
          });

          // Track usage + save document
          if (userId) {
            void (async () => {
              try {
                const supa = createServiceClient();
                const engineType = 'fast'; // unified — all engines deduct from one pool
                const toneDb = ({ neutral: 'natural', academic: 'academic', professional: 'business', simple: 'direct' } as Record<string, string>)[tone ?? 'neutral'] ?? 'natural';
                await withTimeout(
                  Promise.all([
                    supa.rpc('increment_usage', { p_user_id: userId, p_words: outputWords, p_engine_type: engineType }),
                    supa.from('documents').insert({
                      user_id: userId, title: text.slice(0, 60).replace(/\n/g, ' ').trim() + (text.length > 60 ? '…' : ''),
                      input_text: text, output_text: humanized,
                      input_word_count: inputWords, output_word_count: outputWords,
                      engine_used: eng, strength: effectiveStrength, tone: toneDb,
                      meaning_preserved: meaningCheck.isSafe, meaning_similarity: meaningCheck.similarity,
                      input_ai_score: 0,
                      output_ai_score: 0,
                    }),
                  ]),
                  10_000,
                  'usage_tracking',
                );
              } catch (e) {
                console.error('Usage tracking error:', e);
              }
            })();
          }

          controller.close();
        } catch (err) {
          sendSSE(controller, { type: 'error', error: err instanceof Error ? err.message : 'Processing failed' });
          controller.close();
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
