import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

/**
 * Ports Python backend rules: gram-004 through gram-012 and missing common patterns.
 */

interface PatternRule {
  id: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: RegExpExecArray) => string);
  message: string | ((match: RegExpExecArray) => string);
  severity: 'error' | 'warning' | 'style';
  confidence: number;
  category: string;
}

const COMMON_ERROR_PATTERNS: PatternRule[] = [
  // gram-004: could/would/should of → have
  {
    id: 'gram-004',
    description: 'Modal + "of" should be "have"',
    pattern: /\b(could|would|should|must|might)\s+of\b/gi,
    replacement: (m) => `${m[1]} have`,
    message: (m) => `"${m[1]} of" should be "${m[1]} have".`,
    severity: 'error',
    confidence: 0.98,
    category: 'Grammar',
  },
  // gram-005: then/than with comparatives
  {
    id: 'gram-005',
    description: 'Comparative + "then" should be "than"',
    pattern: /\b(better|worse|more|less|greater|larger|smaller|higher|lower|faster|slower|easier|harder|bigger|older|younger|taller|shorter|stronger|weaker|cheaper|richer|poorer|smarter|brighter|darker|lighter|thicker|thinner|wider|longer|newer|earlier|later|further|farther)\s+then\b/gi,
    replacement: (m) => `${m[1]} than`,
    message: () => 'Use "than" for comparisons, not "then".',
    severity: 'error',
    confidence: 0.95,
    category: 'Grammar',
  },
  // gram-006: alot → a lot
  {
    id: 'gram-006',
    description: '"alot" is not a word',
    pattern: /\balot\b/gi,
    replacement: 'a lot',
    message: () => '"alot" should be "a lot" (two words).',
    severity: 'error',
    confidence: 0.99,
    category: 'Grammar',
  },
  // gram-007: irregardless → regardless
  {
    id: 'gram-007',
    description: '"irregardless" is not standard',
    pattern: /\birregardless\b/gi,
    replacement: 'regardless',
    message: () => '"irregardless" is not standard English; use "regardless".',
    severity: 'warning',
    confidence: 0.95,
    category: 'Grammar',
  },
  // gram-008: etc without period
  {
    id: 'gram-008',
    description: '"etc" needs a period',
    pattern: /\betc(?!\.)\b/g,
    replacement: 'etc.',
    message: () => '"etc" should be followed by a period: "etc."',
    severity: 'warning',
    confidence: 0.95,
    category: 'Punctuation',
  },
  // gram-009: vs without period
  {
    id: 'gram-009',
    description: '"vs" needs a period',
    pattern: /\bvs(?!\.)\b/g,
    replacement: 'vs.',
    message: () => '"vs" should be followed by a period: "vs."',
    severity: 'warning',
    confidence: 0.90,
    category: 'Punctuation',
  },
  // gram-010: approx without period
  {
    id: 'gram-010',
    description: '"approx" should have a period',
    pattern: /\bapprox(?!\.|\w)/g,
    replacement: 'approx.',
    message: () => '"approx" should be followed by a period: "approx."',
    severity: 'style',
    confidence: 0.85,
    category: 'Punctuation',
  },
  // Additional: your/you're confusion (supplementary to confusionPairs)
  {
    id: 'gram-your-verb',
    description: '"your" before a verb should be "you\'re"',
    pattern: /\byour\s+(going|coming|being|doing|making|getting|running|looking|trying|using|saying|playing|leaving|taking|working|living|waiting|sitting|standing|walking|talking|eating|sleeping|reading|writing|driving|flying|swimming|singing)\b/gi,
    replacement: (m) => `you're ${m[1]}`,
    message: () => '"your" + verb: did you mean "you\'re" (you are)?',
    severity: 'error',
    confidence: 0.90,
    category: 'Grammar',
  },
  // there/their/they're
  {
    id: 'gram-there-verb',
    description: '"there" before a verb should be "they\'re"',
    pattern: /\bthere\s+(going|coming|doing|making|getting|running|looking|trying|saying|playing|leaving|taking|working|living|waiting)\b/gi,
    replacement: (m) => `they're ${m[1]}`,
    message: () => 'Did you mean "they\'re" (they are)?',
    severity: 'error',
    confidence: 0.88,
    category: 'Grammar',
  },
  // its/it's before verb
  {
    id: 'gram-its-verb',
    description: '"its" before certain verbs might be "it\'s"',
    pattern: /\bits\s+(been|going|not|never|always|also|the|a|very|quite|really|so)\b/gi,
    replacement: (m) => `it's ${m[1]}`,
    message: () => 'Did you mean "it\'s" (it is/it has)?',
    severity: 'warning',
    confidence: 0.80,
    category: 'Grammar',
  },
  // who's/whose
  {
    id: 'gram-whos-det',
    description: '"who\'s" before a noun should be "whose"',
    pattern: /\bwho's\s+(car|house|book|phone|dog|cat|name|idea|fault|turn|job|responsibility|decision|opinion)\b/gi,
    replacement: (m) => `whose ${m[1]}`,
    message: () => 'Did you mean "whose" (possessive)?',
    severity: 'error',
    confidence: 0.88,
    category: 'Grammar',
  },
  // affect/effect
  {
    id: 'gram-affect-effect',
    description: '"effect" as verb should be "affect"',
    pattern: /\b(will|would|could|can|may|might|does|did|doesn't|didn't)\s+effect\b/gi,
    replacement: (m) => `${m[1]} affect`,
    message: () => 'The verb form is "affect", not "effect".',
    severity: 'error',
    confidence: 0.85,
    category: 'Grammar',
  },
  // loose/lose
  {
    id: 'gram-loose-lose',
    description: '"loose" when meaning "to lose"',
    pattern: /\b(will|would|could|can|may|might|don't|doesn't|didn't|going\s+to|gonna)\s+loose\b/gi,
    replacement: (m) => `${m[1]} lose`,
    message: () => '"loose" means not tight; did you mean "lose"?',
    severity: 'error',
    confidence: 0.90,
    category: 'Grammar',
  },
  // "suppose to" → "supposed to"
  {
    id: 'gram-suppose-to',
    description: '"suppose to" should be "supposed to"',
    pattern: /\bsuppose\s+to\b/gi,
    replacement: 'supposed to',
    message: () => '"suppose to" should be "supposed to".',
    severity: 'error',
    confidence: 0.95,
    category: 'Grammar',
  },
  // "use to" → "used to"
  {
    id: 'gram-use-to',
    description: '"use to" should be "used to"',
    pattern: /\buse\s+to\s+(be|go|have|do|make|get|say|know|think|come|see|want|look|give|find|tell|ask|work|call|try|need|feel|become|leave|put|mean|keep|let|begin|seem|help|show|hear|play|run|move|live|believe)\b/gi,
    replacement: (m) => `used to ${m[1]}`,
    message: () => '"use to" should be "used to".',
    severity: 'error',
    confidence: 0.93,
    category: 'Grammar',
  },
];

export const commonErrorsRule: Rule = {
  id: 'common-errors',
  description: 'Detects common grammar errors (modal+of, comparatives, etc.)',
  apply(sentence: Sentence, _fullText: string): Issue[] {
    const issues: Issue[] = [];
    const text = sentence.text;

    for (const rule of COMMON_ERROR_PATTERNS) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const start = sentence.start + match.index;
        const end = start + match[0].length;
        const rep = typeof rule.replacement === 'function' ? rule.replacement(match) : rule.replacement;
        const msg = typeof rule.message === 'function' ? rule.message(match) : rule.message;

        issues.push({
          ruleId: rule.id,
          message: msg,
          severity: rule.severity,
          start,
          end,
          replacements: [rep],
          confidence: rule.confidence,
          category: rule.category,
          sentenceIndex: 0,
        });
      }
    }

    return issues;
  },
};
