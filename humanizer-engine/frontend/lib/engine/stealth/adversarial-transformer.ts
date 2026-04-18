/**
 * Adversarial Learning Transformer — Self-Optimizing Weights
 * ============================================================
 * Maintains and adjusts transformation weights based on detection results.
 *   - Tracks which transformations are most effective at reducing AI scores
 *   - Updates weights after each run to minimize Ghost Score
 *   - Persists weights to a JSON file for cross-session learning
 *   - Applies weighted selection of transformation intensity
 *
 * The feedback loop:
 *   1. Process text through all transformers
 *   2. Score the output against AI detectors (mock or real)
 *   3. If score is too high, increase weights for under-performing transforms
 *   4. If score is good, lock in current weights
 *   5. Persist updated weights
 *
 * NO contractions. NO first person. NO rhetorical questions.
 */

import type { TextContext, Transformer, TransformWeights, AdversarialResult, ChangeRecord } from './types';
import { rescoreText } from './ghost-analyzer';
import * as fs from 'fs';
import * as path from 'path';

/* ── Default Weights ──────────────────────────────────────────────── */

const DEFAULT_WEIGHTS: TransformWeights = {
  lexical: 1.0,
  syntactic: 1.0,
  semantic: 1.0,
  phraseReplacement: 1.0,
  passiveConversion: 1.0,
  hedgingRemoval: 1.0,
  starterVariation: 1.0,
  sentenceSplitting: 1.0,
  listBreaking: 1.0,
  clicheRemoval: 1.0,
};

/* ── Weight Persistence ───────────────────────────────────────────── */

let currentWeights: TransformWeights = { ...DEFAULT_WEIGHTS };
let weightsLoaded = false;

function getWeightsPath(): string {
  const candidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'stealth', 'adversarial_weights.json'),
    path.join(/* turbopackIgnore: true */ process.cwd(), 'humanizer-engine', 'data', 'stealth', 'adversarial_weights.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function loadWeights(): TransformWeights {
  if (weightsLoaded) return currentWeights;
  try {
    const filePath = getWeightsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.weights) {
        currentWeights = { ...DEFAULT_WEIGHTS, ...data.weights };
        console.log('[Adversarial] Loaded persisted weights');
      }
    }
  } catch {
    console.warn('[Adversarial] Could not load weights — using defaults');
  }
  weightsLoaded = true;
  return currentWeights;
}

function saveWeights(weights: TransformWeights): void {
  try {
    const filePath = getWeightsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      weights,
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    console.warn('[Adversarial] Could not save weights');
  }
}

/* ── Learning History ─────────────────────────────────────────────── */

const learningHistory: AdversarialResult[] = [];
const MAX_HISTORY = 100;

function recordResult(result: AdversarialResult): void {
  learningHistory.push(result);
  if (learningHistory.length > MAX_HISTORY) {
    learningHistory.shift();
  }
}

/* ── Weight Update Algorithm ──────────────────────────────────────── */

const LEARNING_RATE = 0.05;
const MIN_WEIGHT = 0.3;
const MAX_WEIGHT = 2.0;

function updateWeights(ghostScore: number, targetScore: number): TransformWeights {
  const weights = loadWeights();
  const error = ghostScore - targetScore; // Positive = need more transformation

  if (Math.abs(error) < 0.05) {
    // Score is within acceptable range — do not adjust
    return weights;
  }

  // Increase weights if ghost score is too high (text still looks AI-like)
  // Decrease weights if ghost score is too low (over-processing)
  const adjustment = error * LEARNING_RATE;

  for (const key of Object.keys(weights)) {
    weights[key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weights[key] + adjustment));
  }

  // Adaptive specialization: if certain transforms are consistently
  // associated with good results, boost them more
  if (learningHistory.length >= 5) {
    const recentResults = learningHistory.slice(-5);
    const avgScore = recentResults.reduce((sum, r) => sum + r.ghostScore, 0) / recentResults.length;

    if (avgScore > targetScore) {
      // Not enough transformation — boost underperformers
      weights.phraseReplacement = Math.min(MAX_WEIGHT, weights.phraseReplacement + LEARNING_RATE * 2);
      weights.hedgingRemoval = Math.min(MAX_WEIGHT, weights.hedgingRemoval + LEARNING_RATE * 2);
      weights.clicheRemoval = Math.min(MAX_WEIGHT, weights.clicheRemoval + LEARNING_RATE * 2);
    } else if (avgScore < targetScore * 0.5) {
      // Over-transforming — pull back
      weights.syntactic = Math.max(MIN_WEIGHT, weights.syntactic - LEARNING_RATE);
      weights.starterVariation = Math.max(MIN_WEIGHT, weights.starterVariation - LEARNING_RATE);
      weights.sentenceSplitting = Math.max(MIN_WEIGHT, weights.sentenceSplitting - LEARNING_RATE);
    }
  }

  currentWeights = weights;
  saveWeights(weights);
  return weights;
}

/* ── Adversarial Transformer Implementation ──────────────────────── */

export const adversarialTransformer: Transformer = {
  name: 'AdversarialTransformer',
  priority: 40,

  transform(ctx: TextContext): TextContext {
    const weights = loadWeights();
    const targetScore = ctx.config.targetGhostScore;

    // Phase 1: Score current state
    const currentText = ctx.sentences
      .filter(s => !s.reverted)
      .map(s => s.transformed)
      .join(' ');
    const preScore = rescoreText(currentText);

    // Phase 2: Apply weighted additional transformations if score is still high
    if (preScore.ghostScore > targetScore) {
      const deficit = preScore.ghostScore - targetScore;

      for (const sentence of ctx.sentences) {
        if (sentence.reverted) continue;

        const changes: ChangeRecord[] = [];
        let text = sentence.transformed;

        // Weighted phrase replacement (additional pass)
        if (weights.phraseReplacement > 1.2 && deficit > 0.2) {
          // Extra aggressive AI word removal
          const aiWords = /\b(utilize|leverage|facilitate|comprehensive|multifaceted|paramount|robust|holistic|pivotal|nuanced|paradigm|landscape|ecosystem|discourse|trajectory|intersection)\b/gi;
          const replacements: Record<string, string> = {
            utilize: 'use', leverage: 'apply', facilitate: 'help',
            comprehensive: 'thorough', multifaceted: 'complex', paramount: 'critical',
            robust: 'strong', holistic: 'complete', pivotal: 'key',
            nuanced: 'subtle', paradigm: 'model', landscape: 'field',
            ecosystem: 'network', discourse: 'discussion', trajectory: 'path',
            intersection: 'overlap',
          };

          text = text.replace(aiWords, (match) => {
            const lower = match.toLowerCase();
            const rep = replacements[lower];
            if (rep) {
              changes.push({
                type: 'lexical',
                original: match,
                replacement: rep,
                reason: 'adversarial weight-boosted AI word removal',
              });
              return match[0] === match[0].toUpperCase()
                ? rep.charAt(0).toUpperCase() + rep.slice(1)
                : rep;
            }
            return match;
          });
        }

        // Weighted hedging removal (additional pass)
        if (weights.hedgingRemoval > 1.2) {
          const extraHedges = [
            /\bto a (?:large |great |certain |significant )?degree,?\s*/gi,
            /\bin a (?:sense|way|manner),?\s*/gi,
            /\bas it were,?\s*/gi,
            /\bso to speak,?\s*/gi,
            /\bif you will,?\s*/gi,
          ];
          for (const hedge of extraHedges) {
            if (hedge.test(text)) {
              const before = text;
              text = text.replace(hedge, '');
              if (text !== before) {
                text = text.replace(/\s{2,}/g, ' ').trim();
                if (text.length > 0) {
                  text = text.charAt(0).toUpperCase() + text.slice(1);
                }
                changes.push({
                  type: 'semantic',
                  original: before,
                  replacement: text,
                  reason: 'adversarial weight-boosted hedging removal',
                });
              }
            }
          }
        }

        sentence.transformed = text;
        sentence.changes.push(...changes);
      }
    }

    // Phase 3: Score after adversarial pass
    const postText = ctx.sentences
      .filter(s => !s.reverted)
      .map(s => s.transformed)
      .join(' ');
    const postScore = rescoreText(postText);

    // Phase 4: Update weights based on results
    const newWeights = updateWeights(postScore.ghostScore, targetScore);

    // Phase 5: Record result for learning
    recordResult({
      ghostScore: postScore.ghostScore,
      detectorScores: {},
      weightsUsed: { ...newWeights },
      timestamp: Date.now(),
    });

    // Store scores in metadata
    ctx.metadata.ghostScore = postScore.ghostScore;
    ctx.metadata.perplexity = postScore.perplexity;
    ctx.metadata.burstiness = postScore.burstiness;

    return ctx;
  },
};

/* ── Public API ───────────────────────────────────────────────────── */

export function getWeights(): TransformWeights {
  return loadWeights();
}

export function resetWeights(): void {
  currentWeights = { ...DEFAULT_WEIGHTS };
  weightsLoaded = true;
  saveWeights(currentWeights);
}

export function getLearningHistory(): AdversarialResult[] {
  return [...learningHistory];
}
