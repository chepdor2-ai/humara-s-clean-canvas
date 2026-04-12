/**
 * Syntactic Transformer — Sentence-Level Structural Surgery
 * ==========================================================
 * Rebuilds sentences to break rigid AI structures:
 *   - Splits sentences longer than 25 words at natural breakpoints
 *   - Converts passive voice to active using rule-based algorithms
 *   - Varies sentence openings by moving adverbial phrases
 *   - Merges short consecutive sentences for natural flow
 *
 * STRICT RULES:
 *   - Does NOT create rhetorical questions
 *   - Does NOT use first person pronouns
 *   - Does NOT introduce contractions
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, Transformer, ChangeRecord } from './types';

/* ── Sentence Opening Variations ──────────────────────────────────── */

const ADVERBIAL_FRONTS = [
  'Notably,', 'Significantly,', 'Historically,', 'Generally,',
  'Typically,', 'Traditionally,', 'Practically,', 'Effectively,',
  'Increasingly,', 'Frequently,', 'Often,', 'Commonly,',
  'Occasionally,', 'Rarely,', 'Usually,', 'Sometimes,',
  'Naturally,', 'Predictably,', 'Surprisingly,', 'Remarkably,',
  'Interestingly,', 'Essentially,', 'Evidently,',
  'Admittedly,', 'Arguably,', 'Undeniably,',
  'By extension,', 'In practice,', 'In reality,',
  'At its core,', 'On balance,', 'In broad terms,',
  'To that end,', 'In this regard,', 'Along those lines,',
  'From a practical standpoint,', 'From a broader perspective,',
  'Within this framework,', 'Under these conditions,',
  'With this in mind,', 'Against this backdrop,',
];

/* ── Passive Voice Detection & Conversion ─────────────────────────── */

const PASSIVE_PATTERNS: Array<{
  pattern: RegExp;
  convert: (match: RegExpMatchArray) => string | null;
}> = [
  {
    // "X is/are/was/were [adv] VERBed by Y" → "Y VERBs X"
    pattern: /^(.+?)\s+(is|are|was|were)\s+(?:(\w+ly)\s+)?(considered|regarded|viewed|seen|perceived|deemed|known|recognized|acknowledged|treated|used|employed|adopted|applied|studied|analyzed|examined|observed|reported|described|classified|categorized|identified)\s+(?:as\s+)?(?:by\s+)?(.+?)$/i,
    convert: (m) => {
      const subject = m[1].trim();
      const verb = m[4];
      const agent = m[5]?.trim();
      if (!agent || agent.length < 2) return null;
      // Simple past tense verb
      const activeVerb = verb.endsWith('ed') ? verb : verb + 'ed';
      const simpleVerb = verb.replace(/ed$/, '').replace(/ied$/, 'y');
      // "researchers consider X as..."
      return `${agent} ${simpleVerb}s ${subject}`;
    },
  },
  {
    // "It is/was VERBed that..." → "Evidence/Research shows that..."
    pattern: /^It\s+(is|was|has been)\s+(argued|suggested|proposed|claimed|observed|noted|demonstrated|shown|found|established|believed|assumed|thought|expected|estimated|reported)\s+that\s+(.+)$/i,
    convert: (m) => {
      const verb = m[2].toLowerCase();
      const rest = m[3];
      const subjects: Record<string, string> = {
        argued: 'Scholars argue', suggested: 'Research suggests',
        proposed: 'Studies propose', claimed: 'Experts claim',
        observed: 'Observations show', noted: 'Studies note',
        demonstrated: 'Evidence demonstrates', shown: 'Research shows',
        found: 'Studies find', established: 'Evidence establishes',
        believed: 'Many believe', assumed: 'Common assumptions hold',
        thought: 'Many think', expected: 'Expectations hold',
        estimated: 'Estimates indicate', reported: 'Reports indicate',
      };
      const subj = subjects[verb] ?? 'Evidence shows';
      return `${subj} that ${rest}`;
    },
  },
  {
    // "There is/are X that..." → direct subject
    pattern: /^There\s+(is|are|was|were|has been|have been)\s+(.+?)\s+that\s+(.+)$/i,
    convert: (m) => {
      const subject = m[2].trim();
      const rest = m[3].trim();
      return `${subject.charAt(0).toUpperCase() + subject.slice(1)} ${rest}`;
    },
  },
];

/* ── Sentence Splitting ───────────────────────────────────────────── */

const SPLIT_CONJUNCTIONS = /\b(,\s*and\b|,\s*but\b|;\s*however\b|;\s*therefore\b|;\s*moreover\b|;\s*furthermore\b|,\s*which\s+(?:means|suggests|indicates|shows|demonstrates))\b/i;

function splitLongSentence(sentence: string): string[] {
  const words = sentence.split(/\s+/);
  if (words.length <= 25) return [sentence];

  // Try splitting at conjunctions
  const conjMatch = sentence.match(SPLIT_CONJUNCTIONS);
  if (conjMatch && conjMatch.index !== undefined) {
    const splitPoint = conjMatch.index;
    const part1 = sentence.substring(0, splitPoint).trim();
    let part2 = sentence.substring(splitPoint + conjMatch[0].length).trim();

    // Ensure part2 starts with capital letter
    if (part2.length > 0) {
      part2 = part2.charAt(0).toUpperCase() + part2.slice(1);
    }

    // Ensure part1 ends with period
    if (part1.length > 0 && !/[.!?]$/.test(part1)) {
      return [part1 + '.', part2];
    }
    return [part1, part2];
  }

  // Try splitting at relative clauses
  const relativeMatch = sentence.match(/,\s*(which|where|when|while)\s+/i);
  if (relativeMatch && relativeMatch.index !== undefined && relativeMatch.index > 15) {
    const part1 = sentence.substring(0, relativeMatch.index).trim();
    let part2 = sentence.substring(relativeMatch.index + relativeMatch[0].length).trim();
    part2 = 'This ' + part2;
    if (!/[.!?]$/.test(part1)) {
      return [part1 + '.', part2];
    }
    return [part1, part2];
  }

  return [sentence];
}

/* ── Sentence Merging ─────────────────────────────────────────────── */

function mergeShortSentences(s1: string, s2: string): string | null {
  const w1 = s1.split(/\s+/).length;
  const w2 = s2.split(/\s+/).length;

  // Only merge if both are short and combined is reasonable
  if (w1 > 10 || w2 > 10 || w1 + w2 > 22) return null;

  // Remove period from first sentence, join with comma
  const cleaned1 = s1.replace(/\.\s*$/, '');
  const cleaned2 = s2.charAt(0).toLowerCase() + s2.slice(1);

  // Simple conjunction join
  const connectors = ['and', 'while', 'as', 'with'];
  const connector = connectors[Math.floor(Math.random() * connectors.length)];
  return `${cleaned1}, ${connector} ${cleaned2}`;
}

/* ── Syntactic Transformer Implementation ─────────────────────────── */

export const syntacticTransformer: Transformer = {
  name: 'SyntacticTransformer',
  priority: 20,

  transform(ctx: TextContext): TextContext {
    const aggressive = ctx.config.aggressive;
    const starterCounts = new Map<string, number>();
    const newSentences: typeof ctx.sentences = [];

    for (let i = 0; i < ctx.sentences.length; i++) {
      const sentence = ctx.sentences[i];
      if (sentence.reverted) {
        newSentences.push(sentence);
        continue;
      }

      let text = sentence.transformed;
      const changes: ChangeRecord[] = [];

      // Phase 1: Passive voice conversion — only high-pattern sentences, very selective
      if (sentence.patternCount > 2) {
        for (const { pattern, convert } of PASSIVE_PATTERNS) {
          const match = text.match(pattern);
          if (match) {
            const converted = convert(match);
            if (converted && converted.length > 10
                && converted.split(/\s+/).length >= 4
                && /[.!?]$/.test(converted) === false ? converted + '.' : converted) {
              // Verify no first person introduced
              if (!/\b(I|we|my|our|me|us)\b/i.test(converted) || ctx.metadata.hasFirstPerson) {
                // Verify the conversion didn't lose too many words
                const origWords = text.split(/\s+/).length;
                const newWords = converted.split(/\s+/).length;
                if (newWords >= origWords * 0.5) {
                  changes.push({
                    type: 'syntactic',
                    original: text,
                    replacement: converted,
                    reason: 'passive to active voice conversion',
                  });
                  text = converted;
                  if (!/[.!?]$/.test(text)) text += '.';
                  break;
                }
              }
            }
          }
        }
      }

      // Phase 2: Sentence splitting (long sentences)
      const words = text.split(/\s+/);
      if (words.length > 25) {
        const parts = splitLongSentence(text);
        if (parts.length > 1) {
          changes.push({
            type: 'syntactic',
            original: text,
            replacement: parts.join(' '),
            reason: `split long sentence (${words.length} words)`,
          });
          // First part stays in current sentence, additional parts become new sentences
          text = parts[0];
          for (let p = 1; p < parts.length; p++) {
            newSentences.push({
              ...sentence,
              index: -1, // Will be re-indexed
              paragraphIndex: sentence.paragraphIndex,
              original: sentence.original,
              transformed: parts[p],
              changes: [{
                type: 'syntactic',
                original: '',
                replacement: parts[p],
                reason: 'split fragment from long sentence',
              }],
              reverted: false,
            });
          }
        }
      }

      // Phase 3: Sentence merging (short consecutive sentences)
      if (i < ctx.sentences.length - 1 && words.length <= 8) {
        const nextSentence = ctx.sentences[i + 1];
        if (!nextSentence.reverted) {
          const merged = mergeShortSentences(text, nextSentence.transformed);
          if (merged) {
            changes.push({
              type: 'syntactic',
              original: `${text} ${nextSentence.transformed}`,
              replacement: merged,
              reason: 'merged short consecutive sentences',
            });
            text = merged;
            nextSentence.reverted = true; // Skip next sentence
          }
        }
      }

      // Phase 4: Vary sentence openings (avoid repetitive starters)
      const starterMatch = text.match(/^(\w+)/);
      if (starterMatch) {
        const starter = starterMatch[1].toLowerCase();
        const count = (starterCounts.get(starter) ?? 0) + 1;
        starterCounts.set(starter, count);
        const isRepetitive = count > 1;

        // If repetitive starter appears 3+ times, vary it (sparingly)
        if (isRepetitive && starterCounts.get(starter)! > 2) {
          // Only vary ~15% to avoid over-processing
          if (Math.random() < 0.15) {
            // Move adverbial phrase to front ONLY if one already exists in the sentence
            const adverbMatch = text.match(/,\s*(however|therefore|consequently|meanwhile|similarly|conversely|nonetheless|accordingly)\b/i);
            if (adverbMatch && adverbMatch.index !== undefined && adverbMatch.index > 10) {
              const adverb = adverbMatch[1];
              const before = text.substring(0, adverbMatch.index).trim();
              const after = text.substring(adverbMatch.index + adverbMatch[0].length).trim();
              const newText = `${adverb.charAt(0).toUpperCase() + adverb.slice(1)}, ${before.charAt(0).toLowerCase() + before.slice(1)}${after ? ' ' + after : ''}`;
              changes.push({
                type: 'syntactic',
                original: text,
                replacement: newText,
                reason: 'adverbial fronting for variety',
              });
              text = newText;
            }
            // Do NOT add random adverbial fronts — they create unnatural text
          }
        }
      }

      sentence.transformed = text;
      sentence.changes.push(...changes);
      newSentences.push(sentence);
    }

    // Re-index sentences
    ctx.sentences = newSentences.map((s, i) => ({ ...s, index: i }));
    return ctx;
  },
};
