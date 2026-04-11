import { robustSentenceSplit } from '@/lib/engine/content-protection';
import { getDetector } from '@/lib/engine/multi-detector';
import { isMeaningPreserved } from '@/lib/engine/semantic-guard';
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
import { omegaHumanize } from '@/lib/engine/omega-humanizer';
import { easyHumanize } from '@/lib/engine/easy-humanizer';
import { ozoneHumanize } from '@/lib/engine/ozone-humanizer';
import { oxygenHumanize } from '@/lib/engine/oxygen-humanizer';
import { dipperHumanize } from '@/lib/engine/dipper-humanizer';
import { humarinHumanize } from '@/lib/engine/humarin-humanizer';
import { t5Humanize } from '@/lib/engine/t5-humanizer';
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
function flushDelay(ms = 30): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
          await flushDelay(150); // let client render original text in red

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
          await flushDelay(80);

          let humanized: string;
          const eng = engine ?? 'oxygen';

          if (eng === 'easy') {
            const easySBS = (body as Record<string, unknown>).easy_sentence_by_sentence === true;
            const easyResult = await easyHumanize(normalizedText, effectiveStrength, tone ?? 'academic', easySBS);
            humanized = easyResult.humanized;
          } else if (eng === 'ozone') {
            // Ozone: Call Ozone API (standard mode) → then EssayWritingSupport as undetectability polish
            // No further post-processing — Ozone + Easy combo handles everything
            const ozoneSBS = (body as Record<string, unknown>).ozone_sentence_by_sentence === true;
            const ozoneResult = await ozoneHumanize(normalizedText, ozoneSBS);
            humanized = ozoneResult.humanized;

            // Post-pass: run through EssayWritingSupport for undetectability
            sendSSE(controller, { type: 'stage', stage: 'Undetectability Polish' });
            await flushDelay(80);
            try {
              const easyPolish = await easyHumanize(humanized, effectiveStrength, tone ?? 'academic', false);
              humanized = easyPolish.humanized;
            } catch (easyErr) {
              // If Easy API fails, continue with Ozone output — don't break the pipeline
              console.warn('[Ozone] EssayWritingSupport polish failed, using raw Ozone output:', easyErr);
            }
          } else if (eng === 'oxygen') {
            // Oxygen: Pure TypeScript multi-phase humanizer (runs serverless in Vercel)
            const oxygenMode = (body as Record<string, unknown>).oxygen_mode as string || (effectiveStrength === 'light' ? 'fast' : effectiveStrength === 'strong' ? 'aggressive' : 'quality');
            humanized = oxygenHumanize(
              normalizedText,
              effectiveStrength,
              oxygenMode,
              (body as Record<string, unknown>).oxygen_sentence_by_sentence !== undefined
                ? Boolean((body as Record<string, unknown>).oxygen_sentence_by_sentence)
                : true,
            );
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
            // Humara 3.3: Triple-engine fallback (Humarin → Dipper → Oxygen TS)
            // Uses same Humarin engine but flows through full post-processing below
            const humarinMode = strength === 'strong' ? 'aggressive' : strength === 'light' ? 'fast' : 'quality';
            const humarinResult = await humarinHumanize(normalizedText, humarinMode, true);
            humanized = humarinResult.humanized;
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

          // Emit engine output — sentence-by-sentence with stagger
          const { sentences: engineSentences } = splitIntoIndexedSentences(humanized);
          await emitSentencesStaggered(controller, engineSentences, 'Engine', 80);
          await flushDelay(200); // pause between stages

          // Detector + input analysis — needed for both post-processing and final detection
          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);

          // ── POST-PROCESSING (skip for ozone and oxygen_t5 — they handle their own full pipelines) ──
          if (eng !== 'ozone' && eng !== 'oxygen_t5' && eng !== 'dipper' && eng !== 'humarin') {

          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'oxygen') {
            sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
            await flushDelay(80);
            humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 80);
            await flushDelay(200);
          }

          // 5. 40% Restructuring enforcement
          sendSSE(controller, { type: 'stage', stage: 'Restructuring' });
          await flushDelay(80);
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
              const { sentences: restructuredSents } = splitIntoIndexedSentences(humanized);
              await emitSentencesStaggered(controller, restructuredSents, 'Restructuring', 80);
            }
          }
          await flushDelay(200);

          // 6. Capitalization fix
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega') {
            humanized = fixCapitalization(humanized, text);
          }

          // 7. AI capitalization
          humanized = humanized
            .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)
            .replace(/\bai\b/g, 'AI');

          // 8. Repetition cleanup
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega') {
            humanized = deduplicateRepeatedPhrases(humanized);
          }

          // 9. Structural post-processing
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ninja' && eng !== 'undetectable') {
            humanized = structuralPostProcess(humanized);
          }

          // 10. Structure preservation — apply to ALL engines
          humanized = preserveInputStructure(normalizedText, humanized);

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

          // Last-mile meaning validation (2 iterations max)
          {
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
          }

          // Final sentence-initial caps + mid-sentence caps fix
          humanized = humanized.replace(/(^|[.!?]\s+)([a-z])/g, (_m: string, pre: string, ch: string) => pre + ch.toUpperCase());
          humanized = fixMidSentenceCapitalization(humanized, text);

          } // end: if (eng !== 'ozone' && eng !== 'oxygen_t5' && eng !== 'dipper' && eng !== 'humarin') post-processing block

          // ── OXYGEN POLISH PASS (FINAL PHASE) ──────────────────────────
          // Easy engine's output is polished through the Oxygen TS engine
          // as the LAST step after all post-processing, for final cleanup.
          if (eng === 'easy') {
            try {
              sendSSE(controller, { type: 'stage', stage: 'Oxygen Polish' });
              await flushDelay(80);
              const polished = oxygenHumanize(humanized, 'light', 'fast', false);
              if (polished && polished.trim().length > 0) {
                humanized = polished;
                const { sentences: oxygenSents } = splitIntoIndexedSentences(humanized);
                await emitSentencesStaggered(controller, oxygenSents, 'Oxygen Polish', 80);
              }
            } catch {
              // Oxygen polish is best-effort — never block the pipeline
            }
            await flushDelay(200);
          }

          // Emit polished sentences
          {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(80);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 80);
            await flushDelay(200);
          }

          // 14. Meaning check (detection disabled — coming soon)
          // Final cleanup: collapse double spaces
          humanized = humanized.replace(/ {2,}/g, ' ');
          sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
          await flushDelay(50);
          const meaningCheck = await isMeaningPreserved(text, humanized, 0.88);

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
            try {
              const supa = createServiceClient();
              const engineType = 'fast'; // unified — all engines deduct from one pool
              const toneDb = ({ neutral: 'natural', academic: 'academic', professional: 'business', simple: 'direct' } as Record<string, string>)[tone ?? 'neutral'] ?? 'natural';
              await Promise.all([
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
              ]);
            } catch (e) { console.error('Usage tracking error:', e); }
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
  } catch (err) {
    return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Server error' }) + '\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
