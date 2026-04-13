import type { Issue } from '../core/types';

/**
 * Apply a single fix to text at the given issue's span.
 */
export function applySingleFix(text: string, issue: Issue): string {
  if (issue.replacements.length === 0) return text;
  const before = text.slice(0, issue.start);
  const after = text.slice(issue.end);
  return before + issue.replacements[0] + after;
}

/**
 * Apply multiple fixes to text, processing from end-to-start so offsets stay valid.
 */
export function applyFixes(text: string, issues: Issue[]): string {
  // Sort by start descending so we patch from end first
  const sorted = [...issues]
    .filter(i => i.replacements.length > 0 && i.confidence >= 0.85)
    .sort((a, b) => b.start - a.start);

  let result = text;
  for (const issue of sorted) {
    result = applySingleFix(result, issue);
  }
  return result;
}
