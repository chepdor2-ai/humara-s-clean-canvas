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
import { deepRestructure, voiceShift, tenseVariation } from '@/lib/engine/advanced-transforms';
import { synonymReplace } from '@/lib/engine/utils';
import { applyAIWordKill } from '@/lib/engine/shared-dictionaries';

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

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response('data: ' + JSON.stringify({ type: 'error', error: 'Text is required' }) + '\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      });
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
          normalizedText = normalizedText.replace(
            /^((?:#{1,6}\s.+|[IVXLCDM]+\.\s.+|(?:Part|Section|Chapter)\s+\d+.*))\n(?!\n)/gim, "$1\n\n"
          );
          normalizedText = normalizedText.replace(
            /^([^\n]{1,80}[^.!?\n])\n(?!\n)(?=[A-Z])/gm, "$1\n\n"
          );

          // 3. Engine stage — the main humanization
          sendSSE(controller, { type: 'stage', stage: 'Engine Processing' });
          await flushDelay(80);

          let humanized: string;
          const eng = engine ?? 'ghost_mini';

          if (eng === 'humara_v1_3') {
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

          // 4. Unified Sentence Process
          const FIRST_PERSON_RE_EARLY = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
          const earlyFirstPerson = FIRST_PERSON_RE_EARLY.test(text);
          const detector = getDetector();
          const inputAnalysis = detector.analyze(text);
          const inputAiScore = inputAnalysis.summary.overall_ai_score;

          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega') {
            sendSSE(controller, { type: 'stage', stage: 'Sentence Processing' });
            await flushDelay(80);
            humanized = unifiedSentenceProcess(humanized, earlyFirstPerson, inputAiScore);
            const { sentences: uspSentences } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, uspSentences, 'Sentence Processing', 80);
            await flushDelay(200);
          }

          // 5. 60% Restructuring enforcement
          sendSSE(controller, { type: 'stage', stage: 'Restructuring' });
          await flushDelay(80);
          {
            const origSents = robustSentenceSplit(text);
            const humanizedSents = robustSentenceSplit(humanized);
            const RESTRUCTURE_MIN = 0.25;
            const usedWords = new Set<string>();
            let changed = false;
            for (let i = 0; i < humanizedSents.length; i++) {
              const bestOrigIdx = origSents.reduce((best, _, j) => {
                const r = measureSentenceChange(origSents[j], humanizedSents[i]);
                return r < measureSentenceChange(origSents[best], humanizedSents[i]) ? j : best;
              }, 0);
              if (measureSentenceChange(origSents[bestOrigIdx], humanizedSents[i]) < RESTRUCTURE_MIN) {
                let s = humanizedSents[i];
                s = applyAIWordKill(s);
                s = synonymReplace(s, 0.5, usedWords);
                if (measureSentenceChange(origSents[bestOrigIdx], s) < RESTRUCTURE_MIN) s = deepRestructure(s, 0.4);
                if (measureSentenceChange(origSents[bestOrigIdx], s) < RESTRUCTURE_MIN) s = voiceShift(s, 0.5);
                if (measureSentenceChange(origSents[bestOrigIdx], s) < RESTRUCTURE_MIN) s = tenseVariation(s, 0.2);
                if (s !== humanizedSents[i]) { humanizedSents[i] = s; changed = true; }
              }
            }
            if (changed) {
              humanized = reassembleText(humanizedSents, paragraphBoundaries.length ? paragraphBoundaries : [0]);
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

          // 10. Structure preservation
          if (eng !== 'humara' && eng !== 'humara_v1_3' && eng !== 'nuru' && eng !== 'omega' && eng !== 'ghost_pro') {
            humanized = preserveInputStructure(text, humanized);
          }

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

          // Emit polished sentences
          {
            sendSSE(controller, { type: 'stage', stage: 'Polishing' });
            await flushDelay(80);
            const { sentences: polishedSents } = splitIntoIndexedSentences(humanized);
            await emitSentencesStaggered(controller, polishedSents, 'Polishing', 80);
            await flushDelay(200);
          }

          // 14. Detection & meaning check
          sendSSE(controller, { type: 'stage', stage: 'Analyzing' });
          await flushDelay(50);
          const [outputAnalysis, meaningCheck] = await Promise.all([
            Promise.resolve(detector.analyze(humanized)),
            isMeaningPreserved(text, humanized, 0.88),
          ]);

          const inputWords = text.trim().split(/\s+/).length;
          const outputWords = humanized.trim().split(/\s+/).length;

          // Final done event
          sendSSE(controller, {
            type: 'done',
            humanized,
            word_count: outputWords,
            input_word_count: inputWords,
            engine_used: eng,
            meaning_preserved: meaningCheck.isSafe,
            meaning_similarity: Math.round(meaningCheck.similarity * 100) / 100,
            input_detector_results: {
              overall: Math.round(inputAnalysis.summary.overall_ai_score * 10) / 10,
              detectors: inputAnalysis.detectors.map(d => ({
                detector: d.detector,
                ai_score: Math.round(d.ai_score * 10) / 10,
                human_score: Math.round(d.human_score * 10) / 10,
              })),
            },
            output_detector_results: {
              overall: Math.round(outputAnalysis.summary.overall_ai_score * 10) / 10,
              detectors: outputAnalysis.detectors.map(d => ({
                detector: d.detector,
                ai_score: Math.round(d.ai_score * 10) / 10,
                human_score: Math.round(d.human_score * 10) / 10,
              })),
            },
          });

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
