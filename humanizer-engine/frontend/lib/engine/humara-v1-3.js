// Humara V1.3 — Stealth Humanizer Engine v5 + deep pre/post processing
import { pipeline as rawPipeline } from './v1.3/humanize.js';
import { preProcess, restoreProtected, deepPostProcess } from './v1-3-processor.js';

/**
 * Full V1.3 pipeline:
 *  1. Pre-process: protect topic keywords, numbers, citations
 *  2. Core: run Stealth Humanizer Engine v5
 *  3. Post-process: 7-phase deep sentence-by-sentence humanization
 *  4. Restore: put back all protected content
 */
export function pipeline(text, style, aggr) {
  // Step 1: Protect sensitive content
  const { sanitized, map } = preProcess(text);

  // Step 2: Run core V1.3 engine
  let result = rawPipeline(sanitized, style, aggr);

  // Step 3: Deep post-processing (7 phases, sentence-by-sentence)
  result = deepPostProcess(result);

  // Step 4: Restore protected content
  result = restoreProtected(result, map);

  return result;
}
