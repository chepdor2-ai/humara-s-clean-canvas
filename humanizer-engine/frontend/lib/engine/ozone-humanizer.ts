import { restoreOzoneKeywords } from './ozone-keyword-restore';

// Deduplicate repetitive AI sentences from the API
export function deduplicateSentences(txt: string): string {
    const paragraphs = txt.split(/\n\n+/);
    const uniqueParagraphs = paragraphs.map(p => {
         const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z])/);
         const uniqueSentences: string[] = [];
         const history: Set<string> = new Set();
         
         for (const sent of sentences) {
             const normalized = sent.toLowerCase().replace(/[^a-z0-9]/g, '');
             if (normalized.length < 15) {
                 uniqueSentences.push(sent);
                 continue;
             }
             
             let isDuplicate = false;
             for (const prev of history) {
                 const prevNormalized = prev.toLowerCase().replace(/[^a-z0-9]/g, '');
                 if (normalized.includes(prevNormalized) || prevNormalized.includes(normalized)) {
                     isDuplicate = true; break;
                 }
                 const w1 = new Set(sent.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
                 const w2 = new Set(prev.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
                 if (w1.size > 0 && w2.size > 0) {
                     const overlap = [...w1].filter(w => w2.has(w)).length;
                     if (overlap / w1.size > 0.8 && overlap / w2.size > 0.8) {
                         isDuplicate = true; break;
                     }
                 }
             }
             if (!isDuplicate) {
                 uniqueSentences.push(sent);
                 history.add(sent);
             }
         }
         return uniqueSentences.join(' ');
    });
    return uniqueParagraphs.join('\n\n');
}

/**
 * Extract content words (4+ chars, no stopwords) from text for fingerprinting.
 */
function contentFingerprint(text: string): Set<string> {
  const STOP = new Set([
    'that','this','these','those','their','there','them','they','have','been','from',
    'with','were','also','much','more','most','many','some','such','very','just',
    'about','after','before','between','both','each','even','into','like','only',
    'other','over','same','than','then','through','under','when','where','while',
    'which','what','would','could','should','does','will','being',
  ]);
  return new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w))
  );
}

/**
 * Aggressive paragraph-level dedup: drops paragraphs whose content-word
 * fingerprint overlaps 50%+ with any earlier paragraph. Also strips
 * meta-messages and hallucinated content from the API.
 */
function deduplicateParagraphs(txt: string, inputText: string): string {
  const paragraphs = txt.split(/\n\n+/).filter(p => p.trim());
  const inputFP = contentFingerprint(inputText);

  // Strip meta messages from the API (e.g. "Sorry, but I call for the actual text")
  const META_RE = /\b(sorry|please provide|please deliver|I (?:call for|need|require)|cannot rewrite|no (?:text|content) provided)\b/i;

  const kept: string[] = [];
  const fingerprints: Set<string>[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Skip meta-messages
    if (META_RE.test(trimmed) && trimmed.split(/\s+/).length < 30) {
      console.log('[Ozone] Stripped meta-message from API output');
      continue;
    }

    // Check if heading — always keep headings
    const isHeading = trimmed.length < 80 && !/[.!?]$/.test(trimmed) &&
      trimmed.split(/\s+/).length <= 12 && /^[A-Z]/.test(trimmed);
    if (isHeading) {
      kept.push(trimmed);
      continue;
    }

    const fp = contentFingerprint(trimmed);
    if (fp.size < 3) { kept.push(trimmed); fingerprints.push(fp); continue; }

    // Check if this paragraph is a near-duplicate of any earlier kept paragraph
    let isDupe = false;
    for (const prevFP of fingerprints) {
      if (prevFP.size < 3) continue;
      const overlap = [...fp].filter(w => prevFP.has(w)).length;
      const overlapRatioA = overlap / fp.size;
      const overlapRatioB = overlap / prevFP.size;
      // If 50%+ of content words overlap in both directions, it's a paraphrased dupe
      if (overlapRatioA > 0.50 && overlapRatioB > 0.40) {
        isDupe = true;
        break;
      }
    }

    // Check if paragraph content is completely off-topic (hallucinated)
    // If <15% of content words appear in the input, likely hallucinated
    if (!isDupe && fp.size > 5) {
      const inputOverlap = [...fp].filter(w => inputFP.has(w)).length;
      if (inputOverlap / fp.size < 0.15) {
        console.log(`[Ozone] Stripped hallucinated paragraph (${(inputOverlap/fp.size*100).toFixed(0)}% overlap with input)`);
        isDupe = true;
      }
    }

    if (!isDupe) {
      kept.push(trimmed);
      fingerprints.push(fp);
    } else {
      console.log(`[Ozone] Dropped duplicate paragraph (${trimmed.substring(0, 60)}...)`);
    }
  }

  return kept.join('\n\n');
}
/**
 * Ozone Humanizer Engine — Ozone API Proxy
 * Calls the external Ozone humanizer API.
 * Uses standard mode (no 'undetectable') — EssayWritingSupport is called
 * separately as a post-processing step in route.ts for better control.
 * Supports sentence-by-sentence processing with paragraph/title preservation.
 */

const OZONE_API_URL = 'https://www.ozone3.site/api/humanize';

export interface OzoneResult {
  humanized: string;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
}

/**
 * Split text into paragraphs, detect titles/headings, and split body
 * paragraphs into sentences — preserving structure for reassembly.
 */
interface TextSegment {
  type: 'title' | 'sentence' | 'blank';
  text: string;
  paragraphIndex: number;
}

function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const paragraphs = text.split(/\n\n+/);

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para.trim()) {
      segments.push({ type: 'blank', text: '', paragraphIndex: pIdx });
      continue;
    }

    const lines = para.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect titles/headings: markdown headings, short lines without ending
      // punctuation, all-caps lines, numbered headings
      const isTitle =
        /^#{1,6}\s/.test(trimmed) ||
        /^[IVXLCDM]+\.\s/.test(trimmed) ||
        /^\d+(?:[.):]|(?:\.\d+)+)\s+[A-Z]/.test(trimmed) ||
        /^[A-Za-z][.):]\s/.test(trimmed) ||
        /^(?:Part|Section|Chapter|Abstract|Introduction|Conclusion|References|Bibliography|Appendix)\b/i.test(trimmed) ||
        (trimmed.length < 80 && !/[.!;]$/.test(trimmed) && /^[A-Z]/.test(trimmed) && trimmed.split(/\s+/).length <= 12 && !/[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}/.test(trimmed));

      if (isTitle) {
        segments.push({ type: 'title', text: trimmed, paragraphIndex: pIdx });
      } else {
        // Split into sentences
        const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [trimmed];
        for (const sent of sentences) {
          const s = sent.trim();
          if (s) segments.push({ type: 'sentence', text: s, paragraphIndex: pIdx });
        }
      }
    }
  }

  return segments;
}

/**
 * Reassemble segments back into properly formatted text.
 */
function reassembleSegments(segments: TextSegment[]): string {
  const paragraphGroups: Map<number, TextSegment[]> = new Map();

  for (const seg of segments) {
    if (!paragraphGroups.has(seg.paragraphIndex)) {
      paragraphGroups.set(seg.paragraphIndex, []);
    }
    paragraphGroups.get(seg.paragraphIndex)!.push(seg);
  }

  const paragraphs: string[] = [];
  const sortedKeys = [...paragraphGroups.keys()].sort((a, b) => a - b);

  for (const key of sortedKeys) {
    const segs = paragraphGroups.get(key)!;
    const titleParts: string[] = [];
    const bodyParts: string[] = [];

    for (const seg of segs) {
      if (seg.type === 'title') {
        titleParts.push(seg.text);
      } else if (seg.type === 'sentence') {
        bodyParts.push(seg.text);
      }
    }

    // Titles get their own paragraph block, body text joins separately
    // Using \n\n ensures post-processors detect titles as headings
    if (titleParts.length > 0) {
      paragraphs.push(titleParts.join('\n'));
    }
    if (bodyParts.length > 0) {
      paragraphs.push(bodyParts.join(' '));
    }
  }

  return paragraphs.join('\n\n');
}

/**
 * Call the Ozone API for a single piece of text.
 */
async function callOzoneAPI(text: string, apiKey: string): Promise<{ text: string; input_words: number; output_words: number; latency_ms: number; quota: { used: number; limit: number; remaining: number } }> {
  const response = await fetch(OZONE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    const errMsg = errBody?.error || `HTTP ${response.status}`;
    throw new Error(`Ozone API error: ${errMsg}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Ozone API error: ${data.error || 'Unknown error'}`);
  }

  return data;
}

/**
 * Main entry: humanize text via Ozone API.
 * @param sentenceBySentence If true, processes each sentence independently while preserving titles and paragraph structure.
 */
export async function ozoneHumanize(
  text: string,
  sentenceBySentence: boolean = false,
): Promise<OzoneResult> {
  const apiKey = process.env.OZONE_API_KEY;
  if (!apiKey) {
    // No API key — fall through to Oxygen directly
    console.log('[Ozone] No OZONE_API_KEY, falling back to Oxygen TS engine');
    const { oxygenHumanize } = await import('@/lib/engine/oxygen-humanizer');
    const humanized = oxygenHumanize(text, 'medium', 'quality', sentenceBySentence);
    const inputWords = text.trim().split(/\s+/).length;
    return { humanized, inputWords, outputWords: humanized.trim().split(/\s+/).length, latencyMs: 0, quotaUsed: 0, quotaLimit: 0, quotaRemaining: 0 };
  }

  try {
  if (!sentenceBySentence) {
    // Whole-paper mode: send entire text in one API call
    const data = await callOzoneAPI(text, apiKey);

    // Sentence-level dedup first, then paragraph-level dedup
    let humanized = deduplicateSentences(data.text);
    humanized = deduplicateParagraphs(humanized, text);

    // Length guard: if output is >1.4x input word count after dedup,
    // the API returned garbled/duplicated content — log warning
    const inputWords = text.trim().split(/\s+/).length;
    const outputWords = humanized.trim().split(/\s+/).length;
    if (outputWords > inputWords * 1.4) {
      console.warn(`[Ozone] Output still ${outputWords} words vs ${inputWords} input after dedup — possible API issue`);
    }

    humanized = await restoreOzoneKeywords(text, humanized);

    return {
      humanized,
      inputWords: data.input_words,
      outputWords: humanized.trim().split(/\s+/).length,
      latencyMs: data.latency_ms,
      quotaUsed: data.quota?.used ?? 0,
      quotaLimit: data.quota?.limit ?? 0,
      quotaRemaining: data.quota?.remaining ?? 0,
    };
  }

  // Sentence-by-sentence mode: preserve titles and paragraph structure
  // Process all sentences CONCURRENTLY for speed
  const segments = segmentText(text);
  const sentenceSegments = segments.filter(seg => seg.type === 'sentence');

  // Fire all sentence API calls in parallel (batches of 10 to avoid rate limits)
  const BATCH_SIZE = 10;
  const results: { index: number; data: Awaited<ReturnType<typeof callOzoneAPI>> | null }[] = [];

  for (let batchStart = 0; batchStart < sentenceSegments.length; batchStart += BATCH_SIZE) {
    const batch = sentenceSegments.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((seg, i) =>
        callOzoneAPI(seg.text, apiKey).then(data => ({ index: batchStart + i, data }))
      )
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    }
  }

  // Apply results back to segments — with content-drift guard.
  // If a sentence comes back with < 15% word overlap vs the original,
  // the API rewrote it into unrelated content → keep the original sentence.
  let totalInputWords = 0;
  let totalOutputWords = 0;
  let totalLatency = 0;
  let lastQuota = { used: 0, limit: 0, remaining: 0 };

  const wordSet = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));

  for (const r of results) {
    if (r.data) {
      const origWords = wordSet(sentenceSegments[r.index].text);
      const outWords = wordSet(r.data.text);
      const overlap = origWords.size > 0
        ? [...origWords].filter(w => outWords.has(w)).length / origWords.size
        : 1;
      if (overlap >= 0.15) {
        sentenceSegments[r.index].text = r.data.text;
      } else {
        console.warn(`[Ozone SBS] Sentence ${r.index} drifted (${(overlap * 100).toFixed(0)}% overlap) — keeping original`);
      }
      totalInputWords += r.data.input_words;
      totalOutputWords += r.data.output_words;
      totalLatency += r.data.latency_ms;
      lastQuota = r.data.quota ?? lastQuota;
    }
  }

    let humanized = reassembleSegments(segments);

    function deduplicateSentences(txt: string): string {
        const paragraphs = txt.split(/\n\n+/);
        const uniqueParagraphs = paragraphs.map(p => {
             const sentences = p.split(/(?<=[.!?])\s+(?=[A-Z])/);
             const uniqueSentences: string[] = [];
             const history: Set<string> = new Set();
             
             for (const sent of sentences) {
                 const normalized = sent.toLowerCase().replace(/[^a-z0-9]/g, '');
                 if (normalized.length < 15) {
                     uniqueSentences.push(sent);
                     continue;
                 }
                 
                 let isDuplicate = false;
                 for (const prev of history) {
                     const prevNormalized = prev.toLowerCase().replace(/[^a-z0-9]/g, '');
                     // Check if one string is a 80%+ substring of another
                     if (normalized.includes(prevNormalized) || prevNormalized.includes(normalized)) {
                         isDuplicate = true; break;
                     }
                     // Or check for high character overlap sequence
                     const w1 = new Set(sent.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
                     const w2 = new Set(prev.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3));
                     if (w1.size > 0 && w2.size > 0) {
                         const overlap = [...w1].filter(w => w2.has(w)).length;
                         if (overlap / w1.size > 0.8 && overlap / w2.size > 0.8) {
                             isDuplicate = true; break;
                         }
                     }
                 }
                 if (!isDuplicate) {
                     uniqueSentences.push(sent);
                     history.add(sent); // store original for history
                 }
             }
             return uniqueSentences.join(' ');
        });
        return uniqueParagraphs.join('\n\n');
    }

    humanized = deduplicateSentences(humanized);
    humanized = deduplicateParagraphs(humanized, text);

    // Length guard for sentence-by-sentence path too
    const inW = text.trim().split(/\s+/).length;
    const outW = humanized.trim().split(/\s+/).length;
    if (outW > inW * 1.4) {
      console.warn(`[Ozone] Sentence-by-sentence output still ${outW} words vs ${inW} input after dedup — possible API issue`);
    }

    humanized = await restoreOzoneKeywords(text, humanized);

    return {
      humanized,
      inputWords: totalInputWords,
      outputWords: totalOutputWords,
      latencyMs: totalLatency,
      quotaUsed: lastQuota.used,
      quotaLimit: lastQuota.limit,
      quotaRemaining: lastQuota.remaining,
    };
  } catch (err) {
    // Oxygen TS fallback — instant, serverless, always available
    console.warn(`[Ozone] API failed, falling back to Oxygen TS: ${err instanceof Error ? err.message : err}`);
    const { oxygenHumanize } = await import('@/lib/engine/oxygen-humanizer');
    const humanized = oxygenHumanize(text, 'medium', 'quality', sentenceBySentence);
    const inputWords = text.trim().split(/\s+/).length;
    return { humanized, inputWords, outputWords: humanized.trim().split(/\s+/).length, latencyMs: 0, quotaUsed: 0, quotaLimit: 0, quotaRemaining: 0 };
  }
}
