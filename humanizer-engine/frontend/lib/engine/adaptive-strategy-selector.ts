import type { PaperProfile, ParagraphMetrics } from './paper-profiler';

export interface SentenceStrategy {
  minChangeTarget: number;
  allowContractions: boolean;
  allowRhetoricalQuestions: boolean;
  allowFirstPerson: boolean;
}

/**
 * Computes the adaptive strategy constraints for a given paragraph/sentence
 * based on the paper's overarching profile and the paragraph's specific AI metrics.
 */
export function computeSentenceStrategy(
  profile: PaperProfile,
  metrics?: ParagraphMetrics
): SentenceStrategy {
  // Hard minimum boundary requested by user: 65% change
  let target = 0.65;
  
  // 1. Adjust based on domain topic
  // Humanities/Creative can tolerate more aggressive structural variation
  if (profile.domain.primary === 'humanities' || profile.domain.primary === 'creative') {
    target += 0.05;
  } 
  // STEM/Medical/Legal require precision so we keep it closer to the minimum boundary
  else if (profile.domain.primary === 'stem' || profile.domain.primary === 'medical' || profile.domain.primary === 'legal') {
    target = 0.65; // Stay at floor
  }

  // 2. Adjust based on length
  // Short texts have high false positive rates and need more aggressive humanization
  if (profile.lengthBucket === 'short') {
    target += 0.05;
  }

  // 3. Adjust based on specific paragraph AI metrics (if provided)
  if (metrics) {
    const aiScore = metrics.compositeAiScore; // 0-100
    if (aiScore >= 80) {
      target += 0.15; // Extremely high AI signal -> aggressive rewrite needed
    } else if (aiScore >= 50) {
      target += 0.05; // Moderate AI signal 
    }
  }

  // Enforce caps
  target = Math.max(0.65, Math.min(0.95, target));

  return {
    minChangeTarget: target,
    // Strict rules: NO contractions, NO rhetorical format
    allowContractions: false,
    allowRhetoricalQuestions: false,
    // ONLY allow first person if it was in the source text
    allowFirstPerson: profile.hasFirstPerson,
  };
}
