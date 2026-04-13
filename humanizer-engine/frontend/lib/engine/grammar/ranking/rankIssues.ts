import type { Issue } from '../core/types';
import { scoreSuggestion } from './scoreSuggestion';

const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
  info: 3,
};

/**
 * Rank and sort issues by severity then confidence.
 * Deduplicates overlapping spans for the same rule.
 */
export function rankIssues(issues: Issue[]): Issue[] {
  // Deduplicate: if two issues from the same rule overlap, keep the higher-confidence one
  const deduped = deduplicateOverlapping(issues);

  // Sort: severity first, then confidence descending
  return deduped.sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;

    const confA = scoreSuggestion(a);
    const confB = scoreSuggestion(b);
    if (confB !== confA) return confB - confA;

    // Stable: sort by position
    return a.start - b.start;
  });
}

function deduplicateOverlapping(issues: Issue[]): Issue[] {
  if (issues.length <= 1) return issues;

  // Sort by start position
  const sorted = [...issues].sort((a, b) => a.start - b.start);
  const result: Issue[] = [];

  for (const issue of sorted) {
    const existing = result.find(
      r => r.ruleId === issue.ruleId && spansOverlap(r, issue)
    );
    if (!existing) {
      result.push(issue);
    } else {
      // Keep higher confidence
      if (scoreSuggestion(issue) > scoreSuggestion(existing)) {
        const idx = result.indexOf(existing);
        result[idx] = issue;
      }
    }
  }

  return result;
}

function spansOverlap(a: Issue, b: Issue): boolean {
  return a.start < b.end && b.start < a.end;
}
