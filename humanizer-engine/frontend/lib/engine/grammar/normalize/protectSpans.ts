export interface ProtectedSpan {
  start: number;
  end: number;
  type: 'url' | 'email' | 'number' | 'code' | 'abbreviation';
}

const PROTECTED_PATTERN = /(?:https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|\d+[,.]?\d*%?)/g;

/**
 * Find spans in text that should not be modified (URLs, emails, numbers).
 */
export function protectSpans(text: string): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  const regex = new RegExp(PROTECTED_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    let type: ProtectedSpan['type'] = 'number';
    if (/https?:\/\/|www\./.test(match[0])) type = 'url';
    else if (/@/.test(match[0])) type = 'email';
    spans.push({ start: match.index, end: match.index + match[0].length, type });
  }
  return spans;
}

/**
 * Check whether a given index falls inside a protected span.
 */
export function isProtected(index: number, spans: ProtectedSpan[]): boolean {
  return spans.some(s => index >= s.start && index < s.end);
}
