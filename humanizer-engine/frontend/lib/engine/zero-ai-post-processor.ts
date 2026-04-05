/**
 * Zero-AI Post-Processor — Aggressive Anti-Detection Layer
 * ==========================================================
 * 
 * Attacks ALL known AI detection signals:
 * 1. Perfect grammar/punctuation → inject natural errors
 * 2. Uniform sentence length → force high variance
 * 3. Academic hedging → remove/vary hedging patterns
 * 4. Predictable vocabulary → inject uncommon synonyms
 * 5. Perfect structure → introduce natural fragments
 * 6. Overly formal tone → contextual informality
 * 7. Zero typos → strategic typo injection
 * 8. Consistent style → deliberate style breaks
 */

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: INJECT NATURAL ERRORS (typos, grammar variance, punctuation)
// ═══════════════════════════════════════════════════════════════════════════

const COMMON_TYPOS: [RegExp, string][] = [
  [/\bthe\b/gi, 'teh'],
  [/\breceive\b/gi, 'recieve'],
  [/\boccur\b/gi, 'occurr'],
  [/\bseparate\b/gi, 'seperate'],
  [/\bdefinitely\b/gi, 'definately'],
  [/\benvironment\b/gi, 'enviroment'],
  [/\boccasionally\b/gi, 'ocasionally'],
  [/\bbeginning\b/gi, 'begining'],
  [/\bcommittee\b/gi, 'commitee'],
  [/\bacross\b/gi, 'accross'],
];

function injectTypos(text: string, density: number = 0.015): string {
  // Inject typos at ~1.5% rate (1-2 per 100 words)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const rng = seedRandom(text.length);
  
  return sentences.map(sent => {
    if (rng() < density && sent.split(/\s+/).length > 10) {
      const [pattern, replacement] = COMMON_TYPOS[Math.floor(rng() * COMMON_TYPOS.length)];
      // Only apply if pattern matches
      if (pattern.test(sent)) {
        sent = sent.replace(pattern, (_match) => {
          // 50% chance to apply typo
          return rng() < 0.5 ? replacement : _match;
        });
      }
    }
    return sent;
  }).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: BREAK SENTENCE LENGTH UNIFORMITY
// ═══════════════════════════════════════════════════════════════════════════

function breakUniformity(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  if (sentences.length < 3) return text;

  const rng = seedRandom(text.length);
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sent = sentences[i];
    const wordCount = sent.split(/\s+/).length;

    // Every ~3rd sentence: apply fragmentation or merge
    if (i % 3 === 0 && rng() < 0.4) {
      if (wordCount > 15 && sent.includes(',')) {
        // Fragment long sentence at comma
        const parts = sent.split(',');
        if (parts.length >= 2) {
          result.push(parts[0].trim() + '.');
          result.push(parts.slice(1).join(',').trim());
          continue;
        }
      }
    }

    // Every ~4th sentence: merge short sentences
    if (i > 0 && i % 4 === 0 && wordCount < 8 && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.split(/\s+/).length < 12) {
        result[result.length - 1] = prev.replace(/\.\s*$/, ', ') + sent;
        continue;
      }
    }

    result.push(sent);
  }

  return result.join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: REMOVE ACADEMIC HEDGING & AI MARKERS
// ═══════════════════════════════════════════════════════════════════════════

const AI_HEDGING_KILL = [
  [/\b(notably|significantly|substantially|considerably)\b/gi, ''],
  [/\b(it is important to note that|it should be noted that|it is worth noting that)\b/gi, ''],
  [/\b(in terms of|with respect to|in relation to|with regard to)\b/gi, ''],
  [/\b(furthermore|moreover|additionally|in addition)\b/gi, 'Also'],
  [/\b(thus|hence|therefore|consequently)\b/gi, 'So'],
  [/\b(utilize|utilization)\b/gi, 'use'],
  [/\b(implement|implementation)\b/gi, 'apply'],
  [/\b(demonstrate|demonstration)\b/gi, 'show'],
  [/\b(facilitate)\b/gi, 'help'],
  [/\b(endeavor)\b/gi, 'try'],
  [/\b(commence)\b/gi, 'start'],
  [/\b(terminate)\b/gi, 'end'],
  [/\b(optimal|optimally)\b/gi, 'best'],
  [/\b(subsequent to)\b/gi, 'after'],
  [/\b(prior to)\b/gi, 'before'],
  [/\bIt is (clear|evident|apparent|obvious) that\b/gi, ''],
  [/\bThe fact that\b/gi, ''],
  [/\bDue to the fact that\b/gi, 'Because'],
  [/\bIn order to\b/gi, 'To'],
  [/\bFor the purpose of\b/gi, 'To'],
];

function killAIMarkers(text: string): string {
  let result = text;
  for (const [pattern, replacement] of AI_HEDGING_KILL) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces
  result = result.replace(/\s{2,}/g, ' ');
  // Clean up stray commas/periods
  result = result.replace(/\s+,/g, ',').replace(/\s+\./g, '.');
  result = result.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');
  return result.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: INJECT UNCOMMON VOCABULARY (anti-predictability)
// ═══════════════════════════════════════════════════════════════════════════

const VOCAB_SWAPS: [RegExp, string[]][] = [
  [/\bvery important\b/gi, ['crucial', 'key', 'vital', 'pivotal']],
  [/\bvery good\b/gi, ['solid', 'strong', 'excellent', 'impressive']],
  [/\bvery bad\b/gi, ['poor', 'weak', 'flawed', 'problematic']],
  [/\bvery large\b/gi, ['massive', 'substantial', 'considerable', 'extensive']],
  [/\bvery small\b/gi, ['minimal', 'slight', 'modest', 'limited']],
  [/\bshow\b/gi, ['reveal', 'indicate', 'suggest', 'demonstrate']],
  [/\bsaid\b/gi, ['noted', 'stated', 'mentioned', 'remarked']],
  [/\bthink\b/gi, ['believe', 'feel', 'consider', 'suspect']],
  [/\bmany\b/gi, ['numerous', 'various', 'multiple', 'several']],
  [/\bget\b/gi, ['obtain', 'acquire', 'gain', 'secure']],
];

function diversifyVocab(text: string): string {
  const rng = seedRandom(text.length);
  let result = text;
  
  for (const [pattern, alternatives] of VOCAB_SWAPS) {
    if (pattern.test(result) && rng() < 0.6) {
      const replacement = alternatives[Math.floor(rng() * alternatives.length)];
      // Replace first occurrence only
      result = result.replace(pattern, replacement);
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: ATTACK PERPLEXITY/BURSTINESS SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

function attackPerplexity(text: string): string {
  // Introduce sentence length variance (burstiness)
  // AI text has uniform sentence lengths (low burstiness = high AI probability)
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const rng = seedRandom(text.length);
  
  return sentences.map((sent, idx) => {
    const words = sent.split(/\s+/);
    
    // Every 5th sentence: add fragment or extension
    if (idx % 5 === 0 && rng() < 0.3) {
      if (words.length > 12) {
        // Contract: remove middle words
        const keep = Math.floor(words.length * 0.7);
        return words.slice(0, keep).join(' ') + '.';
      } else if (words.length < 8 && idx > 0) {
        // Extend: add filler
        const fillers = ['though', 'still', 'actually', 'really', 'just'];
        const filler = fillers[Math.floor(rng() * fillers.length)];
        return words.slice(0, 2).join(' ') + ' ' + filler + ' ' + words.slice(2).join(' ');
      }
    }
    
    return sent;
  }).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: BREAK PARAGRAPH UNIFORMITY
// ═══════════════════════════════════════════════════════════════════════════

function breakParagraphUniformity(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length < 2) return text;
  
  const rng = seedRandom(text.length);
  const result: string[] = [];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    
    // Vary paragraph length dramatically
    if (sentences.length > 3 && rng() < 0.3) {
      // Split long paragraph
      const mid = Math.floor(sentences.length / 2);
      result.push(sentences.slice(0, mid).join(' '));
      result.push(sentences.slice(mid).join(' '));
    } else {
      result.push(para);
    }
  }
  
  return result.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: REMOVE PERFECT PUNCTUATION
// ═══════════════════════════════════════════════════════════════════════════

function imperfectPunctuation(text: string): string {
  const rng = seedRandom(text.length);
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  return sentences.map(sent => {
    // 10% chance: drop oxford comma
    if (rng() < 0.1 && /, and\b/.test(sent)) {
      sent = sent.replace(/, and\b/g, ' and');
    }
    
    // 5% chance: replace semicolon with period (informal)
    if (rng() < 0.05 && sent.includes(';')) {
      sent = sent.replace(/;\s*/g, '. ');
    }
    
    // 8% chance: remove comma before "which" (common error)
    if (rng() < 0.08 && /, which\b/.test(sent)) {
      sent = sent.replace(/, which\b/g, ' which');
    }
    
    return sent;
  }).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function seedRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

export function applyZeroAIProcessing(
  text: string,
  options: {
    aggressiveness?: 'light' | 'medium' | 'heavy';
    preserveProperNouns?: boolean;
    allowTypos?: boolean;
  } = {}
): string {
  const { aggressiveness = 'heavy', allowTypos = true } = options;
  
  let output = text;
  
  // Phase 1: Remove AI markers (always)
  output = killAIMarkers(output);
  
  // Phase 2: Diversify vocabulary
  output = diversifyVocab(output);
  
  // Phase 3: Break uniformity (sentence & paragraph)
  output = breakUniformity(output);
  output = breakParagraphUniformity(output);
  
  // Phase 4: Attack perplexity
  output = attackPerplexity(output);
  
  // Phase 5: Imperfect punctuation
  if (aggressiveness === 'medium' || aggressiveness === 'heavy') {
    output = imperfectPunctuation(output);
  }
  
  // Phase 6: Inject typos (heavy mode only, and if allowed)
  if (aggressiveness === 'heavy' && allowTypos) {
    output = injectTypos(output, 0.01); // 1% typo rate
  }
  
  return output;
}

export function applyLightZeroAI(text: string): string {
  return applyZeroAIProcessing(text, { aggressiveness: 'light', allowTypos: false });
}

export function applyMediumZeroAI(text: string): string {
  return applyZeroAIProcessing(text, { aggressiveness: 'medium', allowTypos: false });
}

export function applyHeavyZeroAI(text: string): string {
  return applyZeroAIProcessing(text, { aggressiveness: 'heavy', allowTypos: true });
}
