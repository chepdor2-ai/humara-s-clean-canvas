import { robustSentenceSplit } from './content-protection';
import { generateCandidates } from '../candidate-generator';
import { stealthHumanizeTargeted } from './stealth';
import { synonymReplace } from './utils';

export interface DetectorStrategyProfile {
  targetDetector: string;
  action: 'structure_variation' | 'inject_imperfections' | 'reduce_academic_tone' | 'break_uniformity' | 'scramble_patterns';
  intensity: 'light' | 'medium' | 'strong';
}

/**
 * Determines which specific detector counters need to be applied based on the analysis.
 * Target detectors: GPTZero, Originality, ZeroGPT, Writer AI, Sapling, Copyleaks, Turnitin, Crossplag, Content at Scale, Hive Moderation.
 */
export function getAdaptiveDetectorStrategies(detectors: { detector: string, ai_score: number }[]): DetectorStrategyProfile[] {
  const strategies: DetectorStrategyProfile[] = [];
  
  // Sort detectors by AI score descending to target the worst offenders first
  const sorted = [...detectors].sort((a, b) => b.ai_score - a.ai_score).filter(d => d.ai_score > 15);
  
  for (const d of sorted) {
    const name = d.detector.toLowerCase();
    
    // 1. GPTZero: Very sensitive to structure + predictability, Flags academic tone heavily
    if (name.includes('gptzero')) {
      strategies.push({ targetDetector: 'gptzero', action: 'reduce_academic_tone', intensity: 'strong' });
      strategies.push({ targetDetector: 'gptzero', action: 'structure_variation', intensity: 'medium' });
    }
    
    // 2. Originality.ai: Strict scoring, Penalizes consistency hard
    if (name.includes('originality')) {
      strategies.push({ targetDetector: 'originality', action: 'break_uniformity', intensity: 'strong' });
    }
    
    // 3. ZeroGPT: Over-flags aggressively
    if (name.includes('zerogpt')) {
      strategies.push({ targetDetector: 'zerogpt', action: 'scramble_patterns', intensity: 'strong' });
    }
    
    // 4. Writer AI Content Detector: Flags polished text easily, Sensitive to grammar perfection
    if (name.includes('writer')) {
      strategies.push({ targetDetector: 'writer', action: 'inject_imperfections', intensity: 'light' });
    }
    
    // 5. Sapling AI Detector: Strong bias toward labeling AI, Picks up subtle patterns
    if (name.includes('sapling')) {
      strategies.push({ targetDetector: 'sapling', action: 'scramble_patterns', intensity: 'medium' });
    }
    
    // 6. Copyleaks: Enterprise-grade, academic
    if (name.includes('copyleaks')) {
      strategies.push({ targetDetector: 'copyleaks', action: 'reduce_academic_tone', intensity: 'medium' });
    }
    
    // 7. Turnitin: High sensitivity in essays, Known for false positives in formal writing
    if (name.includes('turnitin')) {
      strategies.push({ targetDetector: 'turnitin', action: 'reduce_academic_tone', intensity: 'strong' });
      strategies.push({ targetDetector: 'turnitin', action: 'structure_variation', intensity: 'strong' });
    }
    
    // 8. Crossplag: Flags structured writing patterns
    if (name.includes('crossplag')) {
      strategies.push({ targetDetector: 'crossplag', action: 'break_uniformity', intensity: 'medium' });
    }
    
    // 9. Content at Scale: Penalizes uniformity
    if (name.includes('content at scale') || name.includes('contentatscale')) {
      strategies.push({ targetDetector: 'content_at_scale', action: 'break_uniformity', intensity: 'strong' });
    }
    
    // 10. Hive Moderation: Good at spotting LLM patterns
    if (name.includes('hive')) {
      strategies.push({ targetDetector: 'hive', action: 'scramble_patterns', intensity: 'strong' });
    }
  }
  
  // Deduplicate actions, keeping the strongest intensity
  const uniqueActions = new Map<string, DetectorStrategyProfile>();
  for (const s of strategies) {
    if (!uniqueActions.has(s.action)) {
      uniqueActions.set(s.action, s);
    } else {
      const existing = uniqueActions.get(s.action)!;
      if (s.intensity === 'strong' && existing.intensity !== 'strong') {
        uniqueActions.set(s.action, s);
      } else if (s.intensity === 'medium' && existing.intensity === 'light') {
        uniqueActions.set(s.action, s);
      }
    }
  }
  
  return Array.from(uniqueActions.values());
}

/**
 * Applies targeted strategies to text.
 */
export function applyAdaptiveStrategies(text: string, strategies: DetectorStrategyProfile[]): string {
  let modified = text;
  
  for (const strategy of strategies) {
    switch (strategy.action) {
      case 'reduce_academic_tone':
        modified = reduceAcademicTone(modified, strategy.intensity);
        break;
      case 'structure_variation':
        modified = applyStructureVariation(modified, strategy.intensity);
        break;
      case 'break_uniformity':
        modified = breakUniformity(modified, strategy.intensity);
        break;
      case 'inject_imperfections':
        modified = injectImperfections(modified, strategy.intensity);
        break;
      case 'scramble_patterns':
        modified = scramblePatterns(modified, strategy.intensity);
        break;
    }
  }
  
  return modified;
}

// ── Strategy Implementations ──

function reduceAcademicTone(text: string, intensity: string): string {
  // Replace highly academic connectors and transitions
  let result = text;
  const replacements: [RegExp, string][] = [
    [/\b(?:Furthermore|Moreover|Additionally)\b,?/gi, 'Also,'],
    [/\b(?:Nevertheless|Nonetheless)\b,?/gi, 'Still,'],
    [/\b(?:Consequently|Accordingly|Hence|Thus)\b,?/gi, 'So,'],
    [/\b(?:In conclusion|To summarize)\b,?/gi, 'Overall,'],
    [/\b(?:It is imperative to note that|It is crucial to recognize that)\b/gi, 'Notably,'],
    [/\b(?:utilize|utilise)\b/gi, 'use'],
    [/\b(?:facilitate)\b/gi, 'help'],
    [/\b(?:substantiate|corroborate)\b/gi, 'support'],
    [/\b(?:elucidate|delineate)\b/gi, 'explain']
  ];
  
  for (const [pattern, rep] of replacements) {
    result = result.replace(pattern, rep);
  }
  return result;
}

function applyStructureVariation(text: string, intensity: string): string {
  // Break predictability by alternating short and long sentences
  const sents = robustSentenceSplit(text);
  if (sents.length < 3) return text;
  
  const result: string[] = [];
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i].trim();
    if (!s) continue;
    
    // GPTZero checks for uniform perplexity. We inject coordinating conjunctions to merge short sentences
    if (intensity === 'strong' && i < sents.length - 1 && s.split(' ').length < 10 && sents[i+1].split(' ').length < 12) {
       // Merge them
       const s2 = sents[i+1].trim();
       if (/^[A-Z]/.test(s2) && !s2.startsWith('However') && !s2.startsWith('Therefore')) {
         const merged = s.replace(/[.!?]$/, '') + ' and ' + s2.charAt(0).toLowerCase() + s2.slice(1);
         result.push(merged);
         i++; // skip next
         continue;
       }
    }
    result.push(s);
  }
  return result.join(' ');
}

function breakUniformity(text: string, intensity: string): string {
  // Originality and Content at Scale hate consistency. We vary comma usage and inject parentheticals.
  const sents = robustSentenceSplit(text);
  return sents.map((s, idx) => {
    if (idx % 3 === 0 && s.length > 40 && !s.includes('(') && !s.includes('—')) {
       // Attempt to inject a dash for burstiness if 'which' or 'that' is present
       if (s.includes(' which ')) {
         return s.replace(' which ', ' — which ');
       } else if (s.includes(' that ')) {
         return s.replace(' that ', ' — that ');
       }
    }
    return s;
  }).join(' ');
}

function injectImperfections(text: string, intensity: string): string {
  // Writer AI flags polished text. Add natural human cadence: double contractions, colloquial shifts
  let result = text;
  // Naturalize "do not" -> "don't" (if not already expanded)
  result = result.replace(/\bdo not\b/gi, "don't");
  result = result.replace(/\bcannot\b/gi, "can't");
  result = result.replace(/\bis not\b/gi, "isn't");
  result = result.replace(/\bare not\b/gi, "aren't");
  
  // Add mild colloquialisms if it's light/medium intensity (Writer AI specific)
  if (intensity === 'light' || intensity === 'medium') {
      result = result.replace(/\bVery\b/g, 'Really');
      result = result.replace(/\bvery\b/g, 'really');
      result = result.replace(/\bMany\b/g, 'A lot of');
      result = result.replace(/\bmany\b/g, 'a lot of');
  }
  return result;
}

function scramblePatterns(text: string, intensity: string): string {
  // Sapling, ZeroGPT, Hive spot n-gram sequences. We swap safe synonyms randomly.
  const scrambleDict: Record<string, string[]> = {
    'important': ['key', 'vital', 'crucial'],
    'significant': ['major', 'notable'],
    'effective': ['useful', 'successful'],
    'develop': ['build', 'create'],
    'increase': ['grow', 'rise']
  };
  
  let result = text;
  for (const [word, synonyms] of Object.entries(scrambleDict)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    result = result.replace(regex, () => {
      // 50% chance to swap
      if (Math.random() > 0.5) {
        return synonyms[Math.floor(Math.random() * synonyms.length)];
      }
      return word;
    });
  }
  return result;
}
