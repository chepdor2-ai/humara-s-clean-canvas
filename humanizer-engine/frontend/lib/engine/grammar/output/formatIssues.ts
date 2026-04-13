import type { Issue, Severity } from '../core/types';

export interface FormattedIssue {
  ruleId: string;
  severity: Severity;
  message: string;
  original: string;
  replacements: string[];
  start: number;
  end: number;
  context: string; // surrounding text snippet
}

/**
 * Format raw issues into a presentation-ready shape with context snippets.
 */
export function formatIssues(issues: Issue[], fullText: string): FormattedIssue[] {
  return issues.map(issue => {
    const contextRadius = 30;
    const ctxStart = Math.max(0, issue.start - contextRadius);
    const ctxEnd = Math.min(fullText.length, issue.end + contextRadius);
    const context = (ctxStart > 0 ? '...' : '') +
      fullText.slice(ctxStart, ctxEnd) +
      (ctxEnd < fullText.length ? '...' : '');

    return {
      ruleId: issue.ruleId,
      severity: issue.severity,
      message: issue.message,
      original: fullText.slice(issue.start, issue.end),
      replacements: issue.replacements,
      start: issue.start,
      end: issue.end,
      context,
    };
  });
}
