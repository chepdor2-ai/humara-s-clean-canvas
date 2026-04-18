import { NextRequest, NextResponse } from 'next/server';
import {
  GrammarChecker,
  ALL_RULES,
  createDomainRule,
  type CorrectionResult,
  type Domain,
  type Issue,
  type Sentence,
  type SentenceAnalysis,
  type Severity,
} from '@/lib/engine/grammar';
import { resolveGroqChatModel } from '@/lib/engine/groq-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type GrammarMode = 'rules' | 'ai' | 'both' | 'full';
type Verdict = 'safe' | 'review' | 'rejected';

interface GrammarCheckRequestBody {
  text?: string;
  domain?: string;
  mode?: string;
  preserveCitations?: boolean;
  preserveQuotes?: boolean;
  strictMinimalEdits?: boolean;
  maxSentenceChangeRatio?: number;
}

interface RawAiIssue {
  text?: string;
  correction?: string;
  message?: string;
  severity?: string;
  category?: string;
}

const VALID_DOMAINS: Domain[] = ['general', 'academic', 'legal', 'medical', 'technical'];
const VALID_MODES: GrammarMode[] = ['rules', 'ai', 'both', 'full'];
const MAX_TEXT_LENGTH = 50_000;
const MAX_AI_TEXT_LENGTH = 8_000;
const ENGINE_VERSION = '2.1.0-vercel';

const AI_SYSTEM_PROMPT = `You are a precision grammar editor. Find only real grammar, spelling, punctuation, and agreement mistakes.

Rules:
1. Preserve meaning and structure.
2. Do not rewrite correct text.
3. Return issues in the same order they appear in the input.
4. Each issue must target the smallest exact text span that needs fixing.
5. If you are unsure about the exact span, skip the issue.
6. Return only a valid JSON array.

Each issue must have:
- text: exact wrong text span copied from the input
- correction: minimal replacement for that span
- message: short explanation under 15 words
- severity: error | warning | style
- category: Grammar | Spelling | Punctuation | Agreement | Clarity | Word Choice

If no issues are found, return []`;

function normalizeDomain(value: string | undefined): Domain {
  return VALID_DOMAINS.includes(value as Domain) ? (value as Domain) : 'general';
}

function normalizeMode(value: string | undefined): GrammarMode {
  return VALID_MODES.includes(value as GrammarMode) ? (value as GrammarMode) : 'both';
}

function clampRatio(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.28;
  return Math.min(0.8, Math.max(0.05, value));
}

function cloneIssue(issue: Issue): Issue {
  return {
    ...issue,
    replacements: [...issue.replacements],
  };
}

function severityWeight(severity: Severity): number {
  switch (severity) {
    case 'error':
      return 0;
    case 'warning':
      return 1;
    default:
      return 2;
  }
}

function pickSeverity(left: Severity, right: Severity): Severity {
  return severityWeight(left) <= severityWeight(right) ? left : right;
}

function issueKey(issue: Issue): string {
  return [
    issue.ruleId,
    issue.start,
    issue.end,
    issue.replacements[0] ?? '',
    issue.aiDetected ? 'ai' : 'rule',
  ].join(':');
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function overlaps(start: number, end: number, rangeStart: number, rangeEnd: number): boolean {
  return start < rangeEnd && end > rangeStart;
}

function collectProtectedRanges(
  text: string,
  preserveQuotes: boolean,
  preserveCitations: boolean,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const patterns: RegExp[] = [];

  if (preserveQuotes) {
    patterns.push(/"[^"\n]+"|'[^'\n]+'|“[^”\n]+”/g);
  }

  if (preserveCitations) {
    patterns.push(/\[[^\]\n]+\]/g);
    patterns.push(/\([A-Z][A-Za-z-]+(?:\s+et al\.)?,\s*\d{4}[a-z]?\)/g);
    patterns.push(/\b[A-Z][A-Za-z-]+(?:\s+et al\.)?\s+\(\d{4}[a-z]?\)/g);
  }

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (typeof match.index === 'number') {
        ranges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }

  return ranges
    .sort((left, right) => left.start - right.start)
    .filter((range, index, list) => {
      if (index === 0) return true;
      const previous = list[index - 1];
      return range.start !== previous.start || range.end !== previous.end;
    });
}

function suppressProtectedIssues(
  issues: Issue[],
  ranges: Array<{ start: number; end: number }>,
): { issues: Issue[]; suppressedCount: number } {
  let suppressedCount = 0;
  const filtered: Issue[] = [];

  for (const issue of issues) {
    const blocked = ranges.some((range) => overlaps(issue.start, issue.end, range.start, range.end));
    if (blocked) {
      suppressedCount += 1;
      continue;
    }
    filtered.push(issue);
  }

  return { issues: filtered, suppressedCount };
}

function findSentenceIndex(sentences: SentenceAnalysis[], start: number, end: number): number {
  const exact = sentences.findIndex((sentence) => start >= sentence.start && end <= sentence.end);
  if (exact >= 0) return exact;
  return sentences.findIndex((sentence) => overlaps(start, end, sentence.start, sentence.end));
}

function createDomainIssues(
  text: string,
  domain: Domain,
  sentences: SentenceAnalysis[],
): Issue[] {
  if (domain === 'general') return [];

  const rule = createDomainRule(domain);
  const issues: Issue[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    const shape: Sentence = {
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      tokens: [],
      subject: null,
      mainVerb: null,
      tense:
        sentence.tense === 'past' || sentence.tense === 'present' || sentence.tense === 'future'
          ? sentence.tense
          : 'unknown',
      isPassive: sentence.isPassive,
    };

    for (const issue of rule.apply(shape, text)) {
      issues.push({ ...issue, sentenceIndex });
    }
  });

  return issues;
}

function mergeIssues(existing: Issue[], incoming: Issue[]): Issue[] {
  const merged = existing.map(cloneIssue);

  for (const candidate of incoming.map(cloneIssue)) {
    const overlapIndex = merged.findIndex(
      (issue) => Math.abs(issue.start - candidate.start) < 3 && Math.abs(issue.end - candidate.end) < 3,
    );

    if (overlapIndex === -1) {
      merged.push(candidate);
      continue;
    }

    const current = merged[overlapIndex];
    const replacements = [...current.replacements];
    for (const replacement of candidate.replacements) {
      if (!replacements.includes(replacement)) {
        replacements.push(replacement);
      }
    }

    merged[overlapIndex] = {
      ...current,
      replacements,
      severity: pickSeverity(current.severity, candidate.severity),
      confidence: Math.max(current.confidence, candidate.confidence),
      aiDetected: current.aiDetected || candidate.aiDetected,
      explanation: current.explanation ?? candidate.explanation,
      category: current.category || candidate.category,
      message: current.message.length >= candidate.message.length ? current.message : candidate.message,
    };
  }

  return merged.sort(
    (left, right) => left.start - right.start || severityWeight(left.severity) - severityWeight(right.severity),
  );
}

function estimateIssueCost(text: string, issue: Issue): number {
  const original = text.slice(issue.start, issue.end);
  const replacement = issue.replacements[0] ?? '';
  return Math.max(1, Math.max(countWords(original), countWords(replacement)));
}

function selectAutoApplyIssues(
  text: string,
  sentences: SentenceAnalysis[],
  issues: Issue[],
  strictMinimalEdits: boolean,
  maxSentenceChangeRatio: number,
): { autoApplyIds: Set<string>; rejectedIds: Set<string> } {
  const autoApplyIds = new Set<string>();
  const rejectedIds = new Set<string>();
  const confidenceThreshold = strictMinimalEdits ? 0.86 : 0.72;
  const grouped = new Map<number, Issue[]>();

  for (const issue of issues) {
    if (issue.replacements.length === 0) continue;
    const sentenceIndex = findSentenceIndex(sentences, issue.start, issue.end);
    issue.sentenceIndex = sentenceIndex >= 0 ? sentenceIndex : issue.sentenceIndex;
    const bucket = grouped.get(issue.sentenceIndex) ?? [];
    bucket.push(issue);
    grouped.set(issue.sentenceIndex, bucket);
  }

  for (const [sentenceIndex, bucket] of grouped) {
    const sentence = sentences[sentenceIndex];
    const sentenceWordCount = Math.max(sentence?.wordCount ?? 0, countWords(sentence?.text ?? text), 1);
    const wordBudget = Math.max(1, Math.ceil(sentenceWordCount * maxSentenceChangeRatio));
    let usedBudget = 0;

    bucket
      .sort(
        (left, right) =>
          severityWeight(left.severity) - severityWeight(right.severity) ||
          right.confidence - left.confidence ||
          left.start - right.start,
      )
      .forEach((issue) => {
        const key = issueKey(issue);
        const issueCost = estimateIssueCost(text, issue);
        const isDomainRule = issue.ruleId.startsWith('domain-');
        const lacksConfidence = issue.confidence < confidenceThreshold && !isDomainRule;
        const styleNeedsReview = strictMinimalEdits && issue.severity === 'style';
        const exceedsBudget = usedBudget + issueCost > wordBudget && issue.severity !== 'error';

        if (lacksConfidence || styleNeedsReview || exceedsBudget) {
          rejectedIds.add(key);
          return;
        }

        autoApplyIds.add(key);
        usedBudget += issueCost;
      });
  }

  return { autoApplyIds, rejectedIds };
}

function buildCorrectedText(text: string, issues: Issue[], autoApplyIds: Set<string>): string {
  const applicable = issues
    .filter((issue) => issue.replacements.length > 0 && autoApplyIds.has(issueKey(issue)))
    .sort((left, right) => right.start - left.start);

  let corrected = text;
  let appliedBoundary = Number.POSITIVE_INFINITY;

  for (const issue of applicable) {
    if (issue.end > appliedBoundary) continue;
    corrected = corrected.slice(0, issue.start) + issue.replacements[0] + corrected.slice(issue.end);
    appliedBoundary = issue.start;
  }

  return corrected;
}

function computeClarity(sentences: SentenceAnalysis[], issues: Issue[]): number {
  if (sentences.length === 0) return 100;

  let score = 100;
  const passiveCount = sentences.filter((sentence) => sentence.isPassive).length;
  const passiveRatio = passiveCount / sentences.length;

  if (passiveRatio > 0.5) score -= 20;
  else if (passiveRatio > 0.3) score -= 10;

  for (const sentence of sentences) {
    if (sentence.wordCount > 40) score -= 8;
    else if (sentence.wordCount > 30) score -= 4;
  }

  score -= issues.filter((issue) => issue.severity === 'error').length * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeScores(baseResult: CorrectionResult, issues: Issue[]) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const style = issues.filter((issue) => issue.severity === 'style').length;
  const grammar = Math.max(0, Math.min(100, 100 - errors * 8 - warnings * 4 - style));
  const naturalness = baseResult.scores.naturalness;
  const clarity = computeClarity(baseResult.sentences, issues);
  const flow = baseResult.scores.flow;
  const overall = Math.round(grammar * 0.4 + naturalness * 0.2 + clarity * 0.2 + flow * 0.2);

  return {
    grammar,
    naturalness,
    clarity,
    flow,
    overall,
  };
}

function buildSentenceResponse(sentences: SentenceAnalysis[], issues: Issue[]) {
  return sentences.map((sentence, index) => {
    const sentenceIssues = issues.filter((issue) => issue.sentenceIndex === index);
    const hasErrors = sentenceIssues.some((issue) => issue.severity === 'error');
    const hasWarnings = sentenceIssues.some((issue) => issue.severity === 'warning');
    const confidencePenalty = sentenceIssues.reduce((sum, issue) => {
      if (issue.severity === 'error') return sum + 0.16;
      if (issue.severity === 'warning') return sum + 0.1;
      return sum + 0.04;
    }, 0);

    return {
      index,
      original: sentence.text,
      corrected: sentence.text,
      verdict: (hasErrors || hasWarnings ? 'review' : 'safe') as Verdict,
      confidence: sentenceIssues.length ? Math.max(0.35, Math.min(0.99, 1 - confidencePenalty)) : 0.99,
      scoring_signals: {
        wordCount: sentence.wordCount,
        isFragment: sentence.isFragment,
        isRunOn: sentence.isRunOn,
        isPassive: sentence.isPassive,
        tense: sentence.tense,
      },
    };
  });
}

function parseJsonArray(content: string): RawAiIssue[] {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

async function callGroq(text: string, apiKey: string): Promise<RawAiIssue[]> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolveGroqChatModel(process.env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
        temperature: 0.1,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: `Review this text for grammar issues only:\n\n${text}` },
        ],
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '[]';
    return parseJsonArray(content);
  } catch {
    return [];
  }
}

function findAvailableSpan(
  text: string,
  needle: string,
  reserved: Array<{ start: number; end: number }>,
  preferredStart: number,
): { start: number; end: number } | null {
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const searchStarts = [preferredStart, 0];

  for (const searchStart of searchStarts) {
    let index = haystack.indexOf(target, searchStart);
    while (index !== -1) {
      const span = { start: index, end: index + needle.length };
      const taken = reserved.some((range) => overlaps(span.start, span.end, range.start, range.end));
      if (!taken) return span;
      index = haystack.indexOf(target, index + 1);
    }
  }

  return null;
}

function resolveAiIssues(text: string, sentences: SentenceAnalysis[], rawIssues: RawAiIssue[]): Issue[] {
  const reserved: Array<{ start: number; end: number }> = [];
  const resolved: Issue[] = [];
  let searchCursor = 0;

  for (const rawIssue of rawIssues) {
    const rawText = typeof rawIssue.text === 'string' ? rawIssue.text.trim() : '';
    const message = typeof rawIssue.message === 'string' ? rawIssue.message.trim() : '';
    const correction = typeof rawIssue.correction === 'string' ? rawIssue.correction.trim() : '';

    if (!rawText || !message) continue;

    const span = findAvailableSpan(text, rawText, reserved, searchCursor);
    if (!span) continue;

    reserved.push(span);
    searchCursor = span.end;

    resolved.push({
      ruleId: 'ai_detected',
      message,
      severity:
        rawIssue.severity === 'error'
          ? 'error'
          : rawIssue.severity === 'style'
            ? 'style'
            : 'warning',
      start: span.start,
      end: span.end,
      replacements: correction ? [correction] : [],
      confidence: correction ? 0.78 : 0.74,
      category:
        typeof rawIssue.category === 'string' && rawIssue.category.trim()
          ? rawIssue.category.trim()
          : 'AI Assist',
      sentenceIndex: Math.max(0, findSentenceIndex(sentences, span.start, span.end)),
      aiDetected: true,
      explanation: correction ? `AI suggestion: ${correction}` : undefined,
    });
  }

  return resolved;
}

async function collectAiIssues(text: string, sentences: SentenceAnalysis[]) {
  const groqKey = process.env.GROQ_API_KEY;
  const available = Boolean(groqKey);

  if (!available) {
    return {
      issues: [] as Issue[],
      available: false,
      used: false,
      provider: null as string | null,
      warning: 'Groq AI assist is not configured on this deployment. Using the Vercel rules engine only.',
    };
  }

  if (text.length > MAX_AI_TEXT_LENGTH) {
    return {
      issues: [] as Issue[],
      available: true,
      used: false,
      provider: null as string | null,
      warning: 'AI assist is limited to 8,000 characters on Vercel. Rules still cover the full document.',
    };
  }

  let rawIssues: RawAiIssue[] = [];
  let provider: string | null = null;

  if (groqKey) {
    rawIssues = await callGroq(text, groqKey);
    provider = rawIssues.length > 0 ? 'groq' : null;
  }

  const issues = resolveAiIssues(text, sentences, rawIssues);

  return {
    issues,
    available: true,
    used: issues.length > 0,
    provider,
    warning: issues.length === 0 ? 'AI assist returned no position-safe suggestions for this text.' : undefined,
  };
}

export async function POST(req: NextRequest) {
  const startedAt = performance.now();

  try {
    const body = (await req.json()) as GrammarCheckRequestBody;
    const text = typeof body.text === 'string' ? body.text : '';

    if (!text.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text too long (max ${MAX_TEXT_LENGTH.toLocaleString()} chars)` },
        { status: 400 },
      );
    }

    const domain = normalizeDomain(body.domain);
    const mode = normalizeMode(body.mode);
    const preserveQuotes = body.preserveQuotes !== false;
    const preserveCitations = body.preserveCitations !== false;
    const strictMinimalEdits = Boolean(body.strictMinimalEdits);
    const maxSentenceChangeRatio = clampRatio(body.maxSentenceChangeRatio);

    const checker = new GrammarChecker();
    const baseResult = checker.check(text);
    const domainIssues = createDomainIssues(text, domain, baseResult.sentences);
    const warnings: string[] = [];

    let issues = mode === 'ai' ? [] : baseResult.issues.map(cloneIssue);
    issues = mergeIssues(issues, domainIssues);

    let aiProvider: string | null = null;
    let aiAvailable = Boolean(process.env.GROQ_API_KEY);
    let aiUsed = false;

    if (mode !== 'rules') {
      const aiResult = await collectAiIssues(text, baseResult.sentences);
      aiProvider = aiResult.provider;
      aiAvailable = aiResult.available;
      if (aiResult.warning) warnings.push(aiResult.warning);

      if (aiResult.issues.length > 0) {
        aiUsed = true;
        issues = mode === 'ai' ? mergeIssues(domainIssues, aiResult.issues) : mergeIssues(issues, aiResult.issues);
      } else if (mode === 'ai') {
        warnings.push('AI-only mode fell back to the local grammar engine for complete coverage.');
        issues = mergeIssues(baseResult.issues.map(cloneIssue), domainIssues);
      }
    }

    if (mode === 'ai' && issues.length === 0) {
      warnings.push('No AI suggestions could be mapped safely. Showing rules-based suggestions instead.');
      issues = mergeIssues(baseResult.issues.map(cloneIssue), domainIssues);
    }

    const protectionResult = suppressProtectedIssues(
      issues,
      collectProtectedRanges(text, preserveQuotes, preserveCitations),
    );
    issues = protectionResult.issues;
    if (protectionResult.suppressedCount > 0) {
      warnings.push(
        `Protected ${protectionResult.suppressedCount} suggestion${protectionResult.suppressedCount === 1 ? '' : 's'} inside quotes or citations.`,
      );
    }

    const { autoApplyIds, rejectedIds } = selectAutoApplyIssues(
      text,
      baseResult.sentences,
      issues,
      strictMinimalEdits,
      maxSentenceChangeRatio,
    );

    const scores = computeScores(baseResult, issues);
    const editorResult: CorrectionResult = {
      input: text,
      output: buildCorrectedText(text, issues, autoApplyIds),
      issues,
      sentences: baseResult.sentences,
      scores,
      stats: {
        errors: issues.filter((issue) => issue.severity === 'error').length,
        warnings: issues.filter((issue) => issue.severity === 'warning').length,
        style: issues.filter((issue) => issue.severity === 'style').length,
      },
    };

    const processingTimeMs = Math.round((performance.now() - startedAt) * 100) / 100;

    return NextResponse.json({
      editor_result: editorResult,
      corrected_text: editorResult.output,
      issues: issues.map((issue) => {
        const key = issueKey(issue);
        const verdict: Verdict = rejectedIds.has(key) ? 'rejected' : autoApplyIds.has(key) ? 'safe' : 'review';

        return {
          ruleId: issue.ruleId,
          message: issue.message,
          severity: issue.severity,
          start: issue.start,
          end: issue.end,
          replacements: issue.replacements,
          confidence: issue.confidence,
          category: issue.category,
          sentenceIndex: issue.sentenceIndex,
          source: issue.aiDetected ? 'ai' : issue.ruleId.startsWith('domain-') ? 'domain' : 'rule',
          verdict,
          aiDetected: Boolean(issue.aiDetected),
          explanation: issue.explanation,
        };
      }),
      stats: {
        total_edits: issues.length,
        applied_edits: Array.from(autoApplyIds).length,
        rejected: issues.filter((issue) => rejectedIds.has(issueKey(issue))).length,
        sentences: baseResult.sentences.length,
      },
      meta: {
        request_id: crypto.randomUUID(),
        engine_version: ENGINE_VERSION,
        backend: 'typescript-vercel',
        backend_label: 'Vercel TypeScript Grammar API',
        deployment: 'vercel',
        mode,
        domain,
        ai_provider: aiProvider,
        ai_used: aiUsed,
        ai_available: aiAvailable,
        processing_time_ms: processingTimeMs,
        rules_version: `${ALL_RULES.length}${domain !== 'general' ? '+domain' : ''}`,
        strict_minimal_edits: strictMinimalEdits,
        max_sentence_change_ratio: maxSentenceChangeRatio,
        preserve_quotes: preserveQuotes,
        preserve_citations: preserveCitations,
        warnings,
      },
      sentences: buildSentenceResponse(baseResult.sentences, issues),
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Grammar check failed', detail },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    backend: {
      engine: 'typescript',
      deployment: 'vercel',
      version: ENGINE_VERSION,
      rules_count: ALL_RULES.length,
      ai_available: Boolean(process.env.GROQ_API_KEY),
      domains: VALID_DOMAINS,
      features: [
        'deterministic rules',
        'domain packs',
        'protected quotes and citations',
        'strict minimal edits',
        'sentence change budget',
        'optional groq ai assist',
      ],
      limits: {
        max_text_length: MAX_TEXT_LENGTH,
        ai_text_length: MAX_AI_TEXT_LENGTH,
      },
      preferred_mode: 'both',
    },
  });
}
