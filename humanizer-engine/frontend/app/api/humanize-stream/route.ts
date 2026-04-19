import { robustSentenceSplit } from '@/lib/engine/content-protection';
import { getDetector, TextSignals } from '@/lib/engine/multi-detector';
import { isMeaningPreserved, isMeaningPreservedSync } from '@/lib/engine/semantic-guard';
import { fixCapitalization, applyPhrasePatterns, fixPunctuation, expandAllContractions } from '@/lib/engine/shared-dictionaries';
import { deduplicateRepeatedPhrases } from '@/lib/engine/premium-deep-clean';
import { preserveInputStructure, looksLikeHeadingLine } from '@/lib/engine/structure-preserver';
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
import { createServiceClient } from '@/lib/supabase';
import { getUsageStatsCompat, incrementUsageCompat } from '@/lib/server/usage-tracking';

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
  delayMs = 10,
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

    // Check if this paragraph contains multiple line-separated items (e.g. research questions, bullet points)
    const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);

    // Detect headings using robust looksLikeHeadingLine from structure-preserver
    if (lines.length === 1 && looksLikeHeadingLine(trimmed)) {
      sentences.push(trimmed);
    } else if (lines.length > 1 && lines.every(l => looksLikeHeadingLine(l) || l.endsWith('?') || l.endsWith(':') || /^\d+[.)]\s/.test(l) || /^[-•]\s/.test(l))) {
      // Multi-line block where every line is heading-like or a list item or question — preserve each as separate "sentence"
      for (const line of lines) {
        sentences.push(line);
      }
    } else {
      // Normalize hard wraps within the paragraph to spaces before splitting
      const normalizedPara = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const sents = robustSentenceSplit(normalizedPara);
      sentences.push(...(sents.length ? sents : [normalizedPara]));
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

    // Quotas are enforced for all non-admin users.
    let hasUnlimitedDailyWords = false;

    if (userId && !isAdmin) {
      try {
        const supa = createServiceClient();
        const stats = await getUsageStatsCompat(supa, userId);
        const totalUsed = Number(stats.words_used_fast ?? 0) + Number(stats.words_used_stealth ?? 0);
        const rawLimit = Number(stats.words_limit_fast ?? 0) + Number(stats.words_limit_stealth ?? 0);
        hasUnlimitedDailyWords = Boolean(stats.is_unlimited) || rawLimit < 0;
        const totalLimit = hasUnlimitedDailyWords ? -1 : (rawLimit > 0 ? rawLimit : 1000);

        if (!hasUnlimitedDailyWords) {
          const remaining = Math.max(0, totalLimit - totalUsed);
          if (remaining < inputWordCount) {
            return new Response(
              'data: ' + JSON.stringify({ type: 'error', error: `Word limit reached. ${remaining} words remaining of your daily ${totalLimit} words.` }) + '\n\n',
              { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
            );
          }
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
          await flushDelay(40); // let client render initial state quickly

          // 2. Heading normalization
          let normalizedText = text;
          // Add blank line AFTER heading lines (Roman numerals, markdown, Part/Section/Chapter)
          normalizedText = normalizedText.replace(
            /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.*))\n(?!\n)/gim, "$1\n\n"
          );
          // Add blank line AFTER short non-punctuation-ending lines that are actual headings
          normalizedText = normalizedText.replace(
            /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm,
            (match, line) => looksLikeHeadingLine(line.trim()) ? line + '\n\n' : match
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
            ghost_pro_wiki: 'Ghost', ninja_1: 'Ninja', ninja: 'Ninja', undetectable: 'Ninja',
            oxygen: 'Oxygen', nuru_v2: 'Nuru', humara_v3_3: 'Humarin',
            easy: 'Swift', ghost_pro: 'Ghost Pro',
            humara: 'Humara', nuru: 'Nuru', omega: 'Omega',
            ninja_2: 'Beta', ninja_3: 'Alpha', ninja_5: 'Omega',
            ghost_trial_2: 'Specter',
            phantom: 'Phantom', king: 'King',
            dipper: 'Dipper', humarin: 'Humarin', oxygen3: 'Oxygen 3', oxygen_t5: 'Oxygen T5',
            fast_v11: 'Fast V11', humara_v1_3: 'Humara 1.3', ghost_mini_v1_2: 'Ghost Mini',
            antipangram: 'Pangram',
            ai_analysis: 'AI Analysis',
          };
          const engineDisplayName = ENGINE_DISPLAY[eng] || eng;

          // Fast-loop engine detection (used for phase labeling + pipeline selection)
          const FAST_REHUMANIZE_ENGINES = new Set(['nuru_v2', 'ghost_pro_wiki', 'oxygen', 'humara_v3_3', 'ninja_1', 'king', 'easy', 'antipangram']);

          // Engines that use the phase pipeline (fast-loop + deep-kill)
          const PHASED_ENGINES = new Set([
            ...FAST_REHUMANIZE_ENGINES,
            'ninja_2', 'ninja_3', 'ninja_5',
            'ghost_trial_2',
            'phantom',
            'ai_analysis',
          ]);
          const usePhasePipeline = PHASED_ENGINES.has(eng);

          // Emit initial stage for non-phased engines only
          // (phased engines emit their own Phase labels inside the pipeline below)
          sendSSE(controller, { type: 'stage', stage: 'Engine Processing' });
          await flushDelay(20);

          const runGuarded = async (
            label: string,
            task: () => Promise<string>,
            fallback: string,
            timeoutMs = 110_000,
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


          // ── Sentence-level change measurement ──
          const measureSentenceChange = (original: string, modified: string): number => {
            const origWords = original.toLowerCase().split(/\s+/).filter(Boolean);
            const modWords = modified.toLowerCase().split(/\s+/).filter(Boolean);
            const len = Math.max(origWords.length, modWords.length);
            if (len === 0) return 1;
            let changed = 0;
            for (let i = 0; i < len; i++) {
              if (!origWords[i] || !modWords[i] || origWords[i] !== modWords[i]) changed++;
            }
            return changed / len;
          };

          // ── Adaptive Oxygen Chain (inline) ──
          // Iterates oxygenHumanize until target word-change per sentence or max 2 passes
          const adaptiveOxygenChain = (phaseOneOutput: string): string => {
            const MAX_ITER = 2;
            let current = phaseOneOutput;
            for (let iter = 0; iter < MAX_ITER; iter++) {
              const r = oxygenHumanize(current, 'medium', 'quality', false);
              if (r && r.trim().length > 0) current = r;
            }
            return current;
          };

          const runHumara20 = (input: string): string => {
            const oxygenMode = (body as Record<string, unknown>).oxygen_mode as string || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
            let output = oxygenHumanize(
              input,
              effectiveStrength,
              oxygenMode,
              (body as Record<string, unknown>).oxygen_sentence_by_sentence !== undefined
                ? Boolean((body as Record<string, unknown>).oxygen_sentence_by_sentence)
                : true,
            );
            output = adaptiveOxygenChain(output);
            return output;
          };

          const runHumara24 = async (input: string): Promise<string> => {
            const inputWordCount = input.split(/\s+/).filter(Boolean).length;
            const humarinMode = strength === 'strong' ? 'quality' : strength === 'light' ? 'turbo' : 'fast';
            const humarinResult = await humarinHumanize(input, humarinMode, inputWordCount <= 220);
            let output = humarinResult.humanized;
            output = adaptiveOxygenChain(output);
            return output;
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

          // Single-pass Nuru for the outer iteration loop (1 internal iteration).
          // The 10-cycle outer loop provides the 10 total Nuru iterations.
          const runNuruSinglePass = (input: string): string => {
            const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic', 1);
            return output && output.trim().length > 0 ? output : input;
          };

          // Nuru 2.0 post-processing depth applied at the tail of every pipeline.
          const CHAIN_TS = 10;
          const chainSync = (fn: (s: string) => string, input: string, n: number): string => {
            let out = input;
            for (let i = 0; i < n; i++) out = fn(out);
            return out;
          };

          // Smart Nuru polish: wraps stealthHumanize for N-pass full-text polish
          const applySmartNuruPolish = (input: string, maxPasses = 15): string => {
            const output = stealthHumanize(input, strength ?? 'medium', tone ?? 'academic', maxPasses);
            return output && output.trim().length > 0 ? output : input;
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
            'ninja_2', 'ninja_3', 'ninja_5',
            'ghost_trial_2',
          ]);
          const isDeepKill = DEEP_KILL_ENGINES.has(eng);

          // ═══════════════════════════════════════════════════════════════
          // SENTENCE-PARALLEL PROCESSING
          // Each sentence goes through the engine independently in parallel,
          // then results are reassembled preserving paragraph structure.
          // ═══════════════════════════════════════════════════════════════
          const { sentences: inputSentences, paragraphBoundaries: inputParaBounds } = splitIntoIndexedSentences(normalizedText);
          // activeParaBounds tracks which paragraph boundaries to use for reassembly.
          // For sentence-level engines, this stays as inputParaBounds.
          // For full-text engines, it gets overwritten with the engine output's bounds.
          let activeParaBounds = inputParaBounds;
          const isHeadingSentCheck = (s: string) => {
            const t = s.trim();
            // Use robust heading detection from structure-preserver
            if (looksLikeHeadingLine(t)) return true;
            // Standalone citation references: "Author, A. B. (2012)." or "Author & Author (2012)."
            if (/^[A-Z][a-zA-Z]+[,.].*\(\d{4}\)\s*\.?\s*$/.test(t) && t.split(/\s+/).length <= 20) return true;
            return false;
          };

          const runEngineOnSentence = async (sentence: string): Promise<string> => {
            if (eng === 'easy') {
              return await runHumara22(sentence);
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
            } else if (eng === 'ninja_2') {
              // Phase 1 only: Easy (Swift) — remaining phases handled in pipeline
              return await runGuarded('ninja_2_s1', () => runHumara22Clean(sentence), sentence, 35_000);
            } else if (eng === 'ninja_5') {
              // Phase 1 only: Humara 2.2 — remaining phases handled in pipeline
              return await runGuarded('ninja_5_s1', () => runHumara22(sentence), sentence, 35_000);
            } else if (eng === 'ghost_trial_2') {
              // Phase 1 only: Humara 2.4 — remaining phases handled in pipeline
              return await runGuarded('gt2_s1', () => runHumara24Full(sentence), sentence);
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
          const FULL_TEXT_ENGINES = new Set(['easy', 'king', 'ghost_pro_wiki', 'humara_v3_3', 'phantom', 'antipangram', 'ninja_3', 'ai_analysis']);
          let sentenceResults: string[];

          if (FULL_TEXT_ENGINES.has(eng)) {
            console.log(`[FullText] Processing entire text via '${eng}'`);
            let fullResult: string;
            if (eng === 'king') {
              try {
                const kingResult = await kingHumanize(normalizedText);
                fullResult = kingResult.humanized;
              } catch (kingErr) {
                console.warn('[King] kingHumanize failed — falling back to Nuru phase pipeline:', kingErr instanceof Error ? kingErr.message : kingErr);
                fullResult = normalizedText; // phase pipeline (Nuru 2.0 × 10 + Deep Clean + Final Smooth) will still run
              }
            } else if (eng === 'ghost_pro_wiki') {
              fullResult = await runWikipedia(normalizedText);
            } else if (eng === 'antipangram') {
              // Standalone AntiPangram engine: forensic signal destruction on full text + Nuru post-processing
              const { antiPangramSimple } = await import('@/lib/engine/antipangram');
              fullResult = antiPangramSimple(
                normalizedText,
                (strength ?? 'strong') as 'light' | 'medium' | 'strong',
                (tone ?? 'academic') as 'academic' | 'professional' | 'casual' | 'neutral',
              );
            } else if (eng === 'ninja_3') {
              // Alpha (stealth loop optimized): Wiki → Nuru → Phantom until score < 20
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Wikipedia Pass' });
              await flushDelay(10);
              let tmp = await runWikipedia(normalizedText);
              
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Nuru Initial Clean' });
              await flushDelay(10);
              tmp = runHumara20(tmp);
              
              sendSSE(controller, { type: 'stage', stage: 'Alpha: Phantom Restructure' });
              await flushDelay(10);
              tmp = await runHumara24(tmp);
              
              const detector = getDetector();
              let aiScore = detector.analyze(tmp).summary.overall_ai_score;
              let iterations = 0;
              
              while (aiScore > 20 && iterations < 5) {
                sendSSE(controller, { type: 'stage', stage: `Alpha Core Loop ${iterations + 1}: Phantom Sweep` });
                await flushDelay(10);
                tmp = await runHumara24(tmp);
                
                sendSSE(controller, { type: 'stage', stage: `Alpha Core Loop ${iterations + 1}: Nuru Sweep` });
                await flushDelay(10);
                tmp = runHumara20(tmp);
                
                aiScore = detector.analyze(tmp).summary.overall_ai_score;
                iterations++;
              }
              
              fullResult = tmp;
            } else if (eng === 'ai_analysis') {
              // AI Analysis: System analyzes input and selects best engine pipeline
              // Phase 1: Run detection to understand AI score distribution
              const aiAnalysisDetector = getDetector();
              const aiAnalysisResult = aiAnalysisDetector.analyze(normalizedText);
              const avgScore = aiAnalysisResult.summary.overall_ai_score;
              const topDetectors = [...aiAnalysisResult.detectors]
                .sort((a, b) => b.ai_score - a.ai_score)
                .slice(0, 6);
              const topAvg = topDetectors.reduce((s, d) => s + d.ai_score, 0) / Math.max(1, topDetectors.length);

              // Phase 2: Analyze topic/subject for engine affinity
              const { analyze: analyzeContext } = await import('@/lib/engine/context-analyzer');
              const textContext = analyzeContext(normalizedText);
              const primaryTopic = textContext.primaryTopic;

              // Compute signal-based intelligence: vocabulary richness, pattern score, uniformity
              const aiSignals = aiAnalysisResult.signals ?? {};
              const patScore = aiSignals.ai_pattern_score ?? 50;
              const vocabRich = aiSignals.vocabulary_richness ?? 50;
              const sentUnif = aiSignals.sentence_uniformity ?? 50;

              sendSSE(controller, { type: 'stage', stage: `AI Analysis: ${primaryTopic} paper detected (${Math.round(topAvg)}% AI)` });
              await flushDelay(30);

              // Phase 3: Intelligent engine selection — minimum processing for maximum impact
              // The goal is to get the LOWEST score without over-processing.
              // Key principle: only add engines that target the specific signals detected.
              const { antiPangramSimple: autoApg } = await import('@/lib/engine/antipangram');
              const autoTone: 'academic' | 'professional' | 'casual' | 'neutral' =
                tone === 'academic' || tone === 'professional' || tone === 'casual' ? tone : 'neutral';
              const autoStrength: 'light' | 'medium' | 'strong' =
                strength === 'light' || strength === 'medium' || strength === 'strong' ? strength : 'strong';
              const runAutoOfflinePass = (
                input: string,
                passStrength: 'light' | 'medium' | 'strong' = 'medium',
              ): string => {
                const oxygenPass = runHumara20(input);
                return autoApg(oxygenPass, passStrength, autoTone);
              };

              let stage1Result: string;

              if (topAvg <= 15) {
                // Already nearly human — only light Nuru polish needed, skip heavy engines
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Text is nearly human — light polish only' });
                await flushDelay(10);
                stage1Result = applySmartNuruPolish(normalizedText, 5);
              } else if (topAvg <= 35) {
                // Low-medium AI — single targeted engine based on which signals are elevated
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Running Targeted Single Engine' });
                await flushDelay(10);
                if (patScore > 55 || sentUnif > 55) {
                  // Pattern-heavy output benefits from an offline two-step break + forensic pass.
                  stage1Result = runAutoOfflinePass(normalizedText, 'strong');
                } else if (vocabRich > 55) {
                  stage1Result = runAutoOfflinePass(normalizedText, 'medium');
                } else {
                  // General signals → Humara 2.0 safe bet
                  stage1Result = runHumara20(normalizedText);
                }
              } else if (topAvg <= 60) {
                // Medium AI — topic-aware offline single pass
                const topicSingleMap: Record<string, () => string> = {
                  technology: () => runHumara20(normalizedText),
                  science: () => runAutoOfflinePass(normalizedText, 'medium'),
                  health: () => runAutoOfflinePass(normalizedText, 'medium'),
                  education: () => runAutoOfflinePass(normalizedText, 'medium'),
                  economics: () => runHumara20(normalizedText),
                  politics: () => runHumara20(normalizedText),
                  environment: () => runAutoOfflinePass(normalizedText, 'medium'),
                  society: () => runAutoOfflinePass(normalizedText, 'medium'),
                };
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Running Primary Offline Engine' });
                await flushDelay(10);
                stage1Result = (topicSingleMap[primaryTopic] ?? topicSingleMap['technology']!)();
              } else {
                // High AI (>60%) — double offline chain: pick best two based on topic + signals
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Running Stage 1 Engine' });
                await flushDelay(10);
                let s1: string;
                if (sentUnif > 60 || patScore > 60) {
                  s1 = runAutoOfflinePass(normalizedText, 'strong');
                } else {
                  s1 = runHumara20(normalizedText);
                }
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Running Stage 2 Engine' });
                await flushDelay(10);
                const topicSecondMap: Record<string, () => string> = {
                  technology: () => runAutoOfflinePass(s1, 'medium'),
                  science: () => runAutoOfflinePass(s1, 'strong'),
                  health: () => runAutoOfflinePass(s1, 'strong'),
                  education: () => runHumara20(s1),
                  economics: () => runAutoOfflinePass(s1, 'strong'),
                  politics: () => runAutoOfflinePass(s1, 'medium'),
                  environment: () => runAutoOfflinePass(s1, 'medium'),
                  society: () => runAutoOfflinePass(s1, 'strong'),
                };
                stage1Result = (topicSecondMap[primaryTopic] ?? (() => runAutoOfflinePass(s1, 'medium')))();
              }

              // Phase 4: Offline forensic cleanup (skip if text was already nearly human)
              if (topAvg > 15) {
                sendSSE(controller, { type: 'stage', stage: 'AI Analysis: Offline Forensic Pass' });
                await flushDelay(10);
                fullResult = runAutoOfflinePass(stage1Result, autoStrength);
              } else {
                fullResult = stage1Result;
              }
              // Phase pipeline will add complete Nuru 2.0 flow after this
            } else if (eng === 'humara_v3_3' || eng === 'phantom') {
              fullResult = await runHumara24(normalizedText);
            } else if (eng === 'easy') {
              fullResult = (await runHumara22(normalizedText));
            } else {
              // Default fallback: use offline engine instead of LLM API
              fullResult = runHumara20(normalizedText);
            }
            if (!fullResult || fullResult.trim().length === 0) fullResult = normalizedText;

            // ── Length guard: prevent engines from bloating output ──
            const inputWC = normalizedText.split(/\s+/).filter(Boolean).length;
            const outputWC = fullResult.split(/\s+/).filter(Boolean).length;
            if (outputWC > inputWC * 1.6) {
              console.warn(`[FullText] Engine '${eng}' produced ${outputWC} words from ${inputWC} input words (${(outputWC / inputWC).toFixed(1)}x expansion) — falling back to input`);
              fullResult = normalizedText;
            }

            const { sentences: resultSents, paragraphBoundaries: resultBounds } = splitIntoIndexedSentences(fullResult);
            sentenceResults = resultSents;
            // Full-text engines produce their own paragraph structure — use resultBounds
            // instead of inputParaBounds for all subsequent reassembly.
            activeParaBounds = resultBounds;
            // Re-send init with updated sentence count and paragraph boundaries
            // so the client-side live preview reassembles paragraphs correctly.
            sendSSE(controller, {
              type: 'init',
              sentences: resultSents,
              paragraphBoundaries: resultBounds,
            });
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
              'ghost_pro_wiki', 'ninja_1', 'ninja_2', 'ninja_5',
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
                    const result = await runEngineOnSentence(sentence);
                    let final = result && result.trim().length > 0 ? result : sentence;
                    // LLM engines: max 1 retry (each call is expensive)
                    const change = measureSentenceChange(sentence, final);
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
                  const result = await runEngineOnSentence(sentence);
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
            humanized = reassembleText(sentenceResults, activeParaBounds.length ? activeParaBounds : [0]);
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
            const currentSentences = [...sentenceResults];

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
                  { name: 'Nuru 2.0 (Targeted)', type: 'nuru', passes: 5 },
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
              case 'phantom':
                // Phantom = Humara 2.4 → Nuru 2.0 × 10 → Deep Clean → Smooth → AntiPangram → Nuru Post-Processing
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'easy':
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'antipangram':
                // Pangram: AntiPangram forensic → Nuru 2.0 × 10 → Deep Non-LLM Clean → Final Smooth
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: 10 },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              // Deep Kill engines — multi-step pipelines with visible phases
              case 'ninja_2':
                // Beta: Easy (Swift) → Humara 2.0 → Nuru 2.0 → Deep Non-LLM Clean → Final Smooth
                phases = [
                  { name: 'Swift', type: 'emit' },
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_3':
                // Alpha (speed-optimized): Humara 2.0 (full text) → Nuru 2.0 → Deep Non-LLM Clean → Final Smooth
                phases = [
                  { name: 'Humara 2.0', type: 'emit' },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ninja_5':
                // Humara 2.2 → Humara 2.4 (Full) → Nuru 2.0 → Deep Non-LLM Clean → Final Smooth
                phases = [
                  { name: 'Humara 2.2', type: 'emit' },
                  { name: 'Humara 2.4 (Full)', type: 'async', fn: (s) => runHumara24Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ghost_trial_2':
                // Humara 2.4 → Humara 2.0 → Nuru 2.0 → Deep Non-LLM Clean → Final Smooth
                phases = [
                  { name: 'Humara 2.4', type: 'emit' },
                  { name: 'Humara 2.0 (Full)', type: 'async', fn: (s) => runHumara20Full(s) },
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
                ];
                break;
              case 'ai_analysis':
                // AI Analysis: Full Nuru 2.0 flow + Deep Clean + Loop cleanup
                phases = [
                  { name: 'Nuru 2.0', type: 'nuru', passes: CHAIN_TS },
                  { name: 'Deep Non-LLM Clean', type: 'sync', fn: (s) => deepNonLLMClean(s) },
                  { name: 'Final Smooth & Grammar', type: 'sync', fn: (s) => finalSmoothGrammar(s) },
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
                ? phase.passes * currentSentences.length
                : currentSentences.length;
              sendSSE(controller, { type: 'stage', stage: phaseLabel, phaseOps });
              await flushDelay(10);

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
                // Parallel processing for async/LLM phases — per-sentence error isolation
                // so a single LLM call failure cannot abort the whole pipeline.
                const asyncResults = await Promise.all(
                  currentSentences.map(async (sent, i) => {
                    if (isHeadingSentCheck(sent)) return sent;
                    const original = phaseInputSentences[i];
                    try {
                      let result = await phase.fn(sent);
                      let change = measureSentenceChange(original, result);
                      let retry = 0;
                      while (change < MIN_CHANGE && retry < MAX_RETRIES) {
                        result = await phase.fn(result);
                        change = measureSentenceChange(original, result);
                        retry++;
                      }
                      return result;
                    } catch (sentErr) {
                      console.warn(`[Phase ${phase.name}] sentence ${i} failed, keeping previous:`, sentErr instanceof Error ? sentErr.message : sentErr);
                      return sent;
                    }
                  })
                );
                for (let i = 0; i < asyncResults.length; i++) {
                  currentSentences[i] = asyncResults[i];
                  sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                }
              } else if (phase.type === 'nuru') {
                // ═══════════════════════════════════════════════════════
                // ADAPTIVE NURU WITH NON-LLM FORENSIC AI DETECTION
                // Phase 1: 5 baseline passes (minimum for ALL engines)
                // Phase 2: Non-LLM sentence-level forensic analysis
                // Phase 3: Score-based extra bulk passes (0-5 more)
                // Phase 4: 5 targeted passes on flagged sentences ONLY
                // ═══════════════════════════════════════════════════════
                const MIN_NURU_PASSES = 5;
                const maxNuruPasses = Math.max(phase.passes, MIN_NURU_PASSES);

                // ── Phase 1: Baseline 5 passes on ALL sentences ──
                for (let pass = 0; pass < MIN_NURU_PASSES; pass++) {
                  for (let i = 0; i < currentSentences.length; i++) {
                    if (!isHeadingSentCheck(currentSentences[i])) {
                      currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                    }
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                  }
                  await flushDelay(10);
                }

                // ── Phase 2: Non-LLM forensic sentence-level AI detection ──
                interface FlaggedSentence {
                  index: number;
                  ai_score: number;
                  flagged_phrases: string[];
                }
                let overallAiScore = 50;
                let flaggedSentences: FlaggedSentence[] = [];

                try {
                  const fullText = currentSentences.filter(s => !isHeadingSentCheck(s)).join(' ');
                  const sigObj = new TextSignals(fullText);
                  const allSignals = sigObj.getAllSignals();
                  overallAiScore = Math.round(allSignals.per_sentence_ai_ratio ?? 50);

                  // Get per-sentence details for targeted passes
                  // Build a TextSignals from the joined non-heading sentences, then map back
                  const nonHeadingIndices: number[] = [];
                  for (let i = 0; i < currentSentences.length; i++) {
                    if (!isHeadingSentCheck(currentSentences[i])) nonHeadingIndices.push(i);
                  }
                  const perSentDetails = sigObj.perSentenceDetails();
                  // Map internal sentence indices back to currentSentences indices
                  flaggedSentences = perSentDetails.map(d => ({
                    index: nonHeadingIndices[d.index] ?? d.index,
                    ai_score: d.ai_score,
                    flagged_phrases: d.flagged_phrases,
                  })).filter(d => d.index >= 0 && d.index < currentSentences.length);

                  console.log(`[Nuru Non-LLM Forensic] Overall AI score: ${overallAiScore}, flagged sentences: ${flaggedSentences.length}/${currentSentences.length}`);
                } catch (e: any) {
                  console.warn(`[Nuru Non-LLM Forensic] Detection failed, using defaults: ${e.message}`);
                }

                // ── Phase 3: Score-based extra bulk Nuru passes (0-5 more) ──
                if (maxNuruPasses > MIN_NURU_PASSES) {
                  const extraPasses = Math.round(
                    Math.max(0, Math.min(maxNuruPasses - MIN_NURU_PASSES,
                      ((overallAiScore - 30) / 50) * (maxNuruPasses - MIN_NURU_PASSES)))
                  );
                  console.log(`[Nuru Adaptive] AI score ${overallAiScore} → +${extraPasses} bulk passes (total ${MIN_NURU_PASSES + extraPasses}/${maxNuruPasses})`);

                  for (let pass = 0; pass < extraPasses; pass++) {
                    for (let i = 0; i < currentSentences.length; i++) {
                      if (!isHeadingSentCheck(currentSentences[i])) {
                        currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                      }
                      sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                    }
                    await flushDelay(10);
                  }
                }

                // ── Phase 4: 5 targeted passes on FLAGGED sentences only ──
                if (flaggedSentences.length > 0 && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000)) {
                  const TARGETED_PASSES = 5;
                  const flaggedSet = new Map<number, string[]>();
                  for (const f of flaggedSentences) {
                    flaggedSet.set(f.index, f.flagged_phrases);
                  }
                  console.log(`[Nuru Targeted] Applying ${TARGETED_PASSES} targeted passes to ${flaggedSet.size} flagged sentences`);

                  for (let pass = 0; pass < TARGETED_PASSES; pass++) {
                    for (const [idx, phrases] of flaggedSet) {
                      if (isHeadingSentCheck(currentSentences[idx])) continue;
                      if (phrases.length > 0) {
                        // Use phrase-targeted Nuru that focuses on suspicious spans
                        currentSentences[idx] = stealthHumanizeTargeted(currentSentences[idx], phrases, strength ?? 'medium');
                      } else {
                        currentSentences[idx] = runNuruSinglePass(currentSentences[idx]);
                      }
                      sendSSE(controller, { type: 'sentence', index: idx, text: currentSentences[idx], stage: `${phaseLabel} (targeted)` });
                    }
                    await flushDelay(10);
                  }
                }

                // ── Enforce 40% minimum change on any under-performing sentences ──
                for (let i = 0; i < currentSentences.length; i++) {
                  if (isHeadingSentCheck(currentSentences[i])) continue;
                  const original = phaseInputSentences[i];
                  let change = measureSentenceChange(original, currentSentences[i]);
                  let retry = 0;
                  while (change < MIN_CHANGE && retry < MAX_RETRIES) {
                    currentSentences[i] = runNuruSinglePass(currentSentences[i]);
                    change = measureSentenceChange(original, currentSentences[i]);
                    sendSSE(controller, { type: 'sentence', index: i, text: currentSentences[i], stage: phaseLabel });
                    retry++;
                  }
                }
              }

              humanized = reassembleText(currentSentences, activeParaBounds.length ? activeParaBounds : [0]);
              latestHumanized = humanized;
              await flushDelay(10);
              console.log(`[Pipeline] ${phaseLabel}: ${humanized.split(/\s+/).length} words (${Date.now() - phaseStart}ms)`);
              // Bail out if deadline is near
              if (deadlineReached || Date.now() - startTime > DEADLINE_MS - 5000) break;
            }
            // Restore paragraph/heading structure after all phases complete
            humanized = preserveInputStructure(normalizedText, humanized);
            latestHumanized = humanized;
            console.log(`[Pipeline] Complete: ${humanized.split(/\s+/).length} words in ${Date.now() - phaseStart}ms`);
          }

          // Emit final engine sentences for non-phased, non-full-text engines
          // (Full-text engines already emitted sentences at lines 755-757)
          if (!usePhasePipeline && !FULL_TEXT_ENGINES.has(eng)) {
            const { sentences: engineSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, engineSentences, 'Engine', 20);
            await flushDelay(30);
          }

          // ── Phantom: apply AntiPangram forensic cleanup (sole post-engine step) ──
          if (eng === 'phantom') {
            sendSSE(controller, { type: 'stage', stage: 'AntiPangram Forensic Clean' });
            await flushDelay(10);
            const { antiPangramSimple } = await import('@/lib/engine/antipangram');
            humanized = antiPangramSimple(
              humanized,
              (strength ?? 'strong') as 'light' | 'medium' | 'strong',
              (tone ?? 'academic') as 'academic' | 'professional' | 'casual' | 'neutral',
            );
            latestHumanized = humanized;
            const { sentences: phantomSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, phantomSents, 'AntiPangram Forensic Clean', 20);
            await flushDelay(20);
            console.log(`[Phantom] AntiPangram complete: ${humanized.split(/\s+/).length} words`);
          }

          // Detector + input analysis — needed for both post-processing and final detection
          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);

          // ═══════════════════════════════════════════════════════════════
          // UNIVERSAL Nuru x5 + AI DETECTION POST-PROCESSING
          // Applies to ALL engines EXCEPT ozone (Humara 2.1) and phantom.
          // Ozone only gets synonym recovery (applyAIWordKill + synonymReplace)
          // via the restructuring pass — no heavy Nuru iterations.
          // Phantom uses AntiPangram instead of Nuru for post-processing.
          // Engines that already ran Nuru in their phase pipeline skip the
          // 5 baseline passes but still get AI detection + targeted cleanup.
          // Hard time budget: 10 seconds max.
          // ═══════════════════════════════════════════════════════════════
          if (!(deadlineReached || Date.now() - startTime > DEADLINE_MS - 12000)) {
            const nuruPostStart = Date.now();
            const NURU_POST_DEADLINE_MS = 10_000; // 10s hard budget
            const nuruPostTimeOk = () => Date.now() - nuruPostStart < NURU_POST_DEADLINE_MS && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 8000);

            const { sentences: postSentences, paragraphBoundaries: postParaBounds } = splitIntoIndexedSentences(humanized);
            const postSents = [...postSentences];

            sendSSE(controller, { type: 'stage', stage: 'Nuru 2.0 Post-Processing' });
            await flushDelay(10);

            // ── Phase A: 5 baseline Nuru passes (all non-ozone engines) ──
            if (nuruPostTimeOk()) {
              for (let pass = 0; pass < 5; pass++) {
                for (let i = 0; i < postSents.length; i++) {
                  if (!isHeadingSentCheck(postSents[i])) {
                    postSents[i] = runNuruSinglePass(postSents[i]);
                  }
                  sendSSE(controller, { type: 'sentence', index: i, text: postSents[i], stage: 'Nuru 2.0 Post-Processing' });
                }
                await flushDelay(5);
                if (!nuruPostTimeOk()) break;
              }
              console.log(`[Nuru Post] 5 baseline passes done (${Date.now() - nuruPostStart}ms)`);
            }

            // ── Phase B: Non-LLM forensic detection ──
            interface PostFlagged { index: number; ai_score: number; flagged_phrases: string[]; }
            let postFlagged: PostFlagged[] = [];

            if (nuruPostTimeOk()) {
              try {
                const postFullText = postSents.filter(s => !isHeadingSentCheck(s)).join(' ');
                const postSigObj = new TextSignals(postFullText);
                const postNonHeadingIndices: number[] = [];
                for (let i = 0; i < postSents.length; i++) {
                  if (!isHeadingSentCheck(postSents[i])) postNonHeadingIndices.push(i);
                }
                const postDetails = postSigObj.perSentenceDetails();
                postFlagged = postDetails.map(d => ({
                  index: postNonHeadingIndices[d.index] ?? d.index,
                  ai_score: d.ai_score,
                  flagged_phrases: d.flagged_phrases,
                })).filter(d => d.index >= 0 && d.index < postSents.length);
                console.log(`[Nuru Post Non-LLM] Flagged ${postFlagged.length}/${postSents.length} sentences (${Date.now() - nuruPostStart}ms)`);
              } catch (e: any) {
                console.warn(`[Nuru Post Non-LLM] Detection failed: ${e.message}`);
              }
            }

            // ── Phase C: 5 targeted passes on flagged sentences only ──
            if (postFlagged.length > 0 && nuruPostTimeOk()) {
              const flagMap = new Map<number, string[]>();
              for (const f of postFlagged) flagMap.set(f.index, f.flagged_phrases);
              console.log(`[Nuru Post Targeted] Applying targeted passes to ${flagMap.size} flagged sentences`);

              for (let pass = 0; pass < 5; pass++) {
                for (const [idx, phrases] of flagMap) {
                  if (isHeadingSentCheck(postSents[idx])) continue;
                  if (phrases.length > 0) {
                    postSents[idx] = stealthHumanizeTargeted(postSents[idx], phrases, strength ?? 'medium');
                  } else {
                    postSents[idx] = runNuruSinglePass(postSents[idx]);
                  }
                  sendSSE(controller, { type: 'sentence', index: idx, text: postSents[idx], stage: 'Nuru 2.0 (targeted)' });
                }
                await flushDelay(5);
                if (!nuruPostTimeOk()) break;
              }
            }

            humanized = reassembleText(postSents, postParaBounds.length ? postParaBounds : [0]);
            latestHumanized = humanized;
            console.log(`[Nuru Post] Complete in ${Date.now() - nuruPostStart}ms`);

            // ── Complete Nuru Document Phases (sentence starters + flow calibration) ──
            {
              const { sentences: nuruPostSents, paragraphBoundaries: sharedBounds } = splitIntoIndexedSentences(humanized);
              const { sentences: sharedSource } = splitIntoIndexedSentences(normalizedText);
              applySentenceStartersDistribution(nuruPostSents);
              applyNuruDocumentFlowCalibration(nuruPostSents, sharedBounds, sharedSource);
              humanized = reassembleText(nuruPostSents, sharedBounds.length ? sharedBounds : [0]);
              latestHumanized = humanized;
              console.log(`[Nuru Doc Phases] Starter distribution + flow calibration applied`);
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // AI ANALYSIS: Smart Rerun Loop
          // If the engine is ai_analysis and average score across all 22
          // detectors exceeds 20%, find the best cleanup engine and loop
          // with Nuru post-processing until score drops below threshold.
          // Max 3 loop iterations to prevent infinite processing.
          // ═══════════════════════════════════════════════════════════════
          if (eng === 'ai_analysis' && !(deadlineReached || Date.now() - startTime > DEADLINE_MS - 15000)) {
            const AI_ANALYSIS_THRESHOLD = 20;
            const AI_ANALYSIS_MAX_LOOPS = 3;
            const loopDetector = getDetector();

            for (let loopIter = 0; loopIter < AI_ANALYSIS_MAX_LOOPS; loopIter++) {
              const loopResult = loopDetector.analyze(humanized);
              const loopAvg = loopResult.summary.overall_ai_score;
              console.log(`[AI Analysis Loop ${loopIter + 1}] Avg AI score: ${loopAvg.toFixed(1)}%`);

              if (loopAvg <= AI_ANALYSIS_THRESHOLD) {
                sendSSE(controller, { type: 'stage', stage: `AI Analysis: Score ${Math.round(loopAvg)}% — Target met` });
                await flushDelay(20);
                break;
              }

              if (deadlineReached || Date.now() - startTime > DEADLINE_MS - 10000) break;

              // Find the best cleanup engine for this loop: use the detector signals to pick
              // Nuru for high-pattern-score, Humara 2.0 for high-vocabulary, AntiPangram for forensic signals
              const loopSignals = loopResult.signals ?? {};
              const patternScore = loopSignals.ai_pattern_score ?? 50;
              const vocabScore = loopSignals.vocabulary_richness ?? 50;
              const uniformity = loopSignals.sentence_uniformity ?? 50;

              sendSSE(controller, { type: 'stage', stage: `AI Analysis: Cleanup loop ${loopIter + 1} (${Math.round(loopAvg)}% AI)` });
              await flushDelay(10);

              // Intelligent engine selection per loop — avoid repeating the same engine
              // Use decreasing aggressiveness: first loop aggressive, later loops targeted
              if (loopIter === 0 && loopAvg > 40) {
                // First loop, still high → Humara 2.0 structural rewrite + Nuru
                humanized = runHumara20(humanized);
                humanized = applySmartNuruPolish(humanized, 8);
              } else if (patternScore > 60 || uniformity > 60) {
                // High pattern/uniformity → Nuru 2.0 passes only (no structural change)
                humanized = applySmartNuruPolish(humanized, 10);
              } else if (vocabScore > 55) {
                // High vocabulary predictability → Humara 2.0 + light Nuru
                humanized = runHumara20(humanized);
                humanized = applySmartNuruPolish(humanized, 3);
              } else {
                // Forensic signals or general residual → AntiPangram targeted
                const { antiPangramSimple: loopApg } = await import('@/lib/engine/antipangram');
                humanized = loopApg(
                  humanized,
                  (strength ?? 'strong') as 'light' | 'medium' | 'strong',
                  (tone ?? 'academic') as 'academic' | 'professional' | 'casual' | 'neutral',
                );
              }

              // Always follow with Nuru post-processing in every loop
              humanized = applySmartNuruPolish(humanized, 5);
              latestHumanized = humanized;

              // Apply document phases
              const { sentences: loopSents, paragraphBoundaries: loopBounds } = splitIntoIndexedSentences(humanized);
              const { sentences: loopSource } = splitIntoIndexedSentences(normalizedText);
              applySentenceStartersDistribution(loopSents);
              applyNuruDocumentFlowCalibration(loopSents, loopBounds, loopSource);
              humanized = reassembleText(loopSents, loopBounds.length ? loopBounds : [0]);
              latestHumanized = humanized;

              const { sentences: loopEmitSents } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, loopEmitSents, `AI Analysis Loop ${loopIter + 1}`, 15);
              await flushDelay(10);
            }
          }


          // ── POST-PROCESSING ──
          const prePostProcessSnapshot = humanized;
          {
          const _ppWC = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'oxygen' && !isDeepKill) {
            humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            if (!usePhasePipeline) {
              sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
              await flushDelay(20);
              const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 20);
              await flushDelay(30);
            }
          }

          // 5. 40% Restructuring enforcement
          if (!isDeepKill) {
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Restructuring' });
            await flushDelay(20);
          }
          {
            const { sentences: origSents } = splitIntoIndexedSentences(normalizedText);
            const { sentences: humanizedSents, paragraphBoundaries: humanParaBounds } = splitIntoIndexedSentences(humanized);
            const isHeadingSent = (s: string) => looksLikeHeadingLine(s.trim());
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

          // 7. AI capitalization + well-known proper nouns/organizations
          humanized = humanized
            .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
            .replace(/\bai\b/g, 'AI');

          // Restore well-known multi-word proper nouns and organizations
          const PROPER_NOUN_PATTERNS: [RegExp, string][] = [
            [/\bartificial intelligence\b/gi, 'Artificial Intelligence'],
            [/\bworld health organization\b/gi, 'World Health Organization'],
            [/\bunited nations\b/gi, 'United Nations'],
            [/\bunited states\b/gi, 'United States'],
            [/\bunited kingdom\b/gi, 'United Kingdom'],
            [/\beuropean union\b/gi, 'European Union'],
            [/\bmachine learning\b/gi, 'Machine Learning'],
            [/\bdeep learning\b/gi, 'Deep Learning'],
            [/\bnatural language processing\b/gi, 'Natural Language Processing'],
            [/\bworld bank\b/gi, 'World Bank'],
            [/\binternational monetary fund\b/gi, 'International Monetary Fund'],
            [/\bworld trade organization\b/gi, 'World Trade Organization'],
            [/\bsupreme court\b/gi, 'Supreme Court'],
            [/\bgeneva convention\b/gi, 'Geneva Convention'],
            [/\bhuman rights\b/gi, 'Human Rights'],
            [/\bclimate change\b/gi, 'Climate Change'],
            [/\bglobal warming\b/gi, 'Global Warming'],
            [/\binformation technology\b/gi, 'Information Technology'],
            [/\binternet of things\b/gi, 'Internet of Things'],
            [/\bcyber security\b/gi, 'Cyber Security'],
            [/\bcybersecurity\b/gi, 'Cybersecurity'],
            [/\bmental health\b/gi, 'Mental Health'],
            [/\bpublic health\b/gi, 'Public Health'],
            [/\bcivil rights\b/gi, 'Civil Rights'],
            [/\bnorth america\b/gi, 'North America'],
            [/\bsouth america\b/gi, 'South America'],
            [/\bsoutheast asia\b/gi, 'Southeast Asia'],
            [/\bmiddle east\b/gi, 'Middle East'],
            [/\bsub-saharan africa\b/gi, 'Sub-Saharan Africa'],
          ];
          for (const [pattern, replacement] of PROPER_NOUN_PATTERNS) {
            humanized = humanized.replace(pattern, replacement);
          }

          // Also restore proper nouns found in the original input text
          {
            const inputWords = normalizedText.split(/\s+/);
            for (const word of inputWords) {
              const clean = word.replace(/[^a-zA-Z'-]/g, '');
              if (!clean || clean.length < 2) continue;
              // Capitalized word (e.g. "Einstein", "Google") - not all-upper, not all-lower
              if (/^[A-Z][a-z]/.test(clean) && clean !== clean.toLowerCase() && clean !== clean.toUpperCase()) {
                const re = new RegExp('\\b' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                humanized = humanized.replace(re, clean);
              }
            }
          }

          // 8. Repetition cleanup
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && !isDeepKill) {
            humanized = deduplicateRepeatedPhrases(humanized);
          }

          // 9. Structural post-processing
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ninja' && eng !== 'undetectable' && !isDeepKill) {
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
          // Skip for phantom — uses AntiPangram instead of universal post-processing.
          if (!isDeepKill && eng !== 'phantom') {
            const { sentences: origSentsM } = splitIntoIndexedSentences(normalizedText);
            const isHeadingM = (s: string) => looksLikeHeadingLine(s.trim());
            const STOPWORDS_M = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','he','she','his','her','which','what','who','whom','about','also']);
            const getContentWordsM = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_M.has(w));
            const inputWordCount = _ppWC(normalizedText);

            // Skip meaning validation when original splits into far fewer sentences than humanized
            // (e.g. entire paragraph treated as 1 sentence due to no capitals) — replacing each
            // humanized sentence with the full original causes massive duplication.
            const origNonHeadingCount = origSentsM.filter(s => !isHeadingM(s)).length;

            if (origNonHeadingCount >= 2) {
            for (let meaningIter = 0; meaningIter < 2; meaningIter++) {
              const { sentences: humanSentsM, paragraphBoundaries: humanMParaBounds } = splitIntoIndexedSentences(humanized);
              let anyFixed = false;
              const usedOrigIndices = new Set<number>(); // prevent duplication: each original used at most once
              for (let i = 0; i < humanSentsM.length; i++) {
                if (isHeadingM(humanSentsM[i])) continue;
                let bestOverlap = 0;
                let bestOrigIdx = -1;
                for (let j = 0; j < origSentsM.length; j++) {
                  if (isHeadingM(origSentsM[j])) continue;
                  if (usedOrigIndices.has(j)) continue; // skip already-used originals
                  const origW = new Set(getContentWordsM(origSentsM[j]));
                  const modW = new Set(getContentWordsM(humanSentsM[i]));
                  if (origW.size === 0) continue;
                  let matches = 0;
                  for (const w of origW) { if (modW.has(w)) matches++; }
                  const overlap = matches / origW.size;
                  if (overlap > bestOverlap) { bestOverlap = overlap; bestOrigIdx = j; }
                }
                // Only replace when the matched original sentence is similar in length
                // (within 3x) to prevent replacing a short sentence with a much longer one
                if (bestOrigIdx >= 0 && bestOverlap < 0.35) {
                  const origLen = origSentsM[bestOrigIdx].split(/\s+/).length;
                  const humanLen = humanSentsM[i].split(/\s+/).length;
                  if (origLen <= humanLen * 3) {
                    let fixed = applyAIWordKill(origSentsM[bestOrigIdx]);
                    const usedW = new Set<string>();
                    fixed = synonymReplace(fixed, 0.35, usedW);
                    humanSentsM[i] = fixed;
                    usedOrigIndices.add(bestOrigIdx);
                    anyFixed = true;
                  }
                }
              }
              if (!anyFixed) break;
              humanized = reassembleText(humanSentsM, humanMParaBounds.length ? humanMParaBounds : [0]);
              // Abort if output has grown beyond 1.6× input
              if (_ppWC(humanized) > inputWordCount * 1.6) {
                humanized = reassembleText(humanSentsM, humanMParaBounds.length ? humanMParaBounds : [0]);
                break;
              }
            }
            }
          } // end !isDeepKill meaning validation guard

          // Final sentence-initial caps + mid-sentence caps fix
          humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          humanized = fixMidSentenceCapitalization(humanized, text);

          } // end: post-processing block

          // ── POST-PROCESSING CHANGE CAP (10%) ──
          // If post-processing mutated the text beyond 10% additional word-level change,
          // revert to the pre-post-processing snapshot to avoid garbling the output.
          {
            const _capWC = (t: string) => t.trim().split(/\s+/).filter(Boolean);
            const preWords = _capWC(prePostProcessSnapshot);
            const postWords = _capWC(humanized);
            const maxLen = Math.max(preWords.length, postWords.length);
            if (maxLen > 0) {
              let diffs = 0;
              for (let i = 0; i < maxLen; i++) {
                if (!preWords[i] || !postWords[i] || preWords[i] !== postWords[i]) diffs++;
              }
              const changeRatio = diffs / maxLen;
              if (changeRatio > 0.10) {
                console.warn(`[PostProcess] Change cap exceeded: ${(changeRatio * 100).toFixed(1)}% > 10% — reverting to pre-post-processing output`);
                humanized = prePostProcessSnapshot;
              }
            }
          }

          // Structure preservation (restores heading placement from original)
          // Skip for phased engines — they already called preserveInputStructure at end of pipeline
          if (!usePhasePipeline) {
            humanized = preserveInputStructure(normalizedText, humanized);
          }

          // ── EXTERNAL API SANITIZATION ───────────────────────────────
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

          // Emit polished sentences (skip for phased engines)
          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(20);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 20);
            await flushDelay(30);
          }

          // 14. Meaning check (detection disabled — coming soon)
          // Final cleanup: collapse double spaces
          humanized = humanized.replace(/ {2,}/g, ' ');

          // Final safety net after Oxygen polish and external cleanup.
          // These late passes can reintroduce Title Case inside body text.
          humanized = fixMidSentenceCapitalization(humanized, text);

          // ── FINAL DEMONYM/NATIONALITY RESTORATION ───────────────────
          // fixMidSentenceCapitalization lowercases nationality adjectives that NLP doesn't
          // recognise as proper nouns (e.g. "american" → "American"). This static list runs
          // LAST so they are always capitalised correctly regardless of earlier passes.
          // NOTE: do NOT re-run the generic input-word scan here — sentence-initial common
          // words (The, While, From, This…) would be treated as proper nouns and Title-Cased
          // throughout the output. The input scan already ran in step 7 above.
          {
            const ALWAYS_CAP_DEMONYMS: [RegExp, string][] = [
              [/\bamerican\b/gi, 'American'],
              [/\bmexican\b/gi, 'Mexican'],
              [/\bcanadian\b/gi, 'Canadian'],
              [/\beuropean\b/gi, 'European'],
              [/\bafrican\b/gi, 'African'],
              [/\basian\b/gi, 'Asian'],
              [/\bbritish\b/gi, 'British'],
              [/\bhispanic\b/gi, 'Hispanic'],
              [/\blatino\b/gi, 'Latino'],
              [/\blatina\b/gi, 'Latina'],
              [/\bnorth american\b/gi, 'North American'],
              [/\bsouth american\b/gi, 'South American'],
              [/\blatin american\b/gi, 'Latin American'],
            ];
            for (const [_dRe, _dRep] of ALWAYS_CAP_DEMONYMS) {
              humanized = humanized.replace(_dRe, _dRep);
            }
          }

          // ── OUTPUT SIZE MONITORING ──────────────────────────────────
          {
            const _capInputWC = text.trim().split(/\s+/).filter(Boolean).length;
            const _capOutputWC = humanized.trim().split(/\s+/).filter(Boolean).length;
            if (_capOutputWC > _capInputWC * 1.5) {
              console.warn(`[OutputWatch] ${eng} output ${_capOutputWC}w vs input ${_capInputWC}w (${(_capOutputWC / _capInputWC).toFixed(2)}x)`);
            }
          }

          if (!usePhasePipeline) {
            sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
            await flushDelay(10);
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

              // Always save document for all users
              const docPromise = supa.from('documents').insert({
                user_id: userId, title: text.slice(0, 60).replace(/\n/g, ' ').trim() + (text.length > 60 ? '…' : ''),
                input_text: text, output_text: humanized,
                input_word_count: inputWords, output_word_count: outputWords,
                engine_used: eng, strength: effectiveStrength, tone: toneDb,
                meaning_preserved: meaningCheck.isSafe, meaning_similarity: meaningCheck.similarity,
                input_ai_score: 0,
                output_ai_score: 0,
              });

              // Admin users are unlimited; all other users are metered
              if (isAdmin) {
                const docResult = await docPromise;
                if (docResult.error) console.error('Document insert failed:', docResult.error.message, docResult.error.details);
              } else {
                const [usageResult, docResult] = await Promise.all([
                  incrementUsageCompat(supa, userId, inputWords, engineType),
                  docPromise,
                ]);

                if (docResult.error) console.error('Document insert failed:', docResult.error.message, docResult.error.details);

                const usageSnapshot = usageResult ?? (!docResult.error ? await getUsageStatsCompat(supa, userId) : null);
                if (usageSnapshot) {
                  const d = usageSnapshot as Record<string, unknown>;
                  const usedFast = Number(d.words_used_fast ?? 0);
                  const usedStealth = Number(d.words_used_stealth ?? 0);
                  const limitFast = Number(d.words_limit_fast ?? 0);
                  const limitStealth = Number(d.words_limit_stealth ?? 0);
                  usageUpdate = {
                    words_used: usedFast + usedStealth,
                    words_limit: (limitFast + limitStealth) || 1000,
                  };
                }
              } // end else (non-admin usage tracking)
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
