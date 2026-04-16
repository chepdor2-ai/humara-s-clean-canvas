import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';

/**
 * Domain-specific rules ported from Python backend.
 * Academic, legal, medical, and technical domains.
 */

export type Domain = 'general' | 'academic' | 'legal' | 'medical' | 'technical';

interface DomainPattern {
  id: string;
  domain: Domain;
  pattern: RegExp;
  replacement: string | ((m: RegExpExecArray) => string);
  message: string;
  severity: 'error' | 'warning' | 'style';
  confidence: number;
  category: string;
}

const DOMAIN_RULES: DomainPattern[] = [
  // ── Academic ──────────────────────────────────────────
  {
    id: 'acad-001',
    domain: 'academic',
    pattern: /\bet\s+al(?!\.)/g,
    replacement: 'et al.',
    message: '"et al." needs a period.',
    severity: 'warning',
    confidence: 0.95,
    category: 'Academic',
  },
  {
    id: 'acad-002',
    domain: 'academic',
    pattern: /\beg\b(?!\.)/g,
    replacement: 'e.g.',
    message: 'Use "e.g." with periods.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-003',
    domain: 'academic',
    pattern: /\bie\b(?!\.)/g,
    replacement: 'i.e.',
    message: 'Use "i.e." with periods.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-004',
    domain: 'academic',
    pattern: /\bfigure\s+(\d)/gi,
    replacement: (m) => `Figure ${m[1]}`,
    message: '"Figure" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-005',
    domain: 'academic',
    pattern: /\btable\s+(\d)/gi,
    replacement: (m) => `Table ${m[1]}`,
    message: '"Table" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-008',
    domain: 'academic',
    pattern: /\bsection\s+(\d)/gi,
    replacement: (m) => `Section ${m[1]}`,
    message: '"Section" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-009',
    domain: 'academic',
    pattern: /\bchapter\s+(\d)/gi,
    replacement: (m) => `Chapter ${m[1]}`,
    message: '"Chapter" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },
  {
    id: 'acad-010',
    domain: 'academic',
    pattern: /\bappendix\s+([A-Z\d])/gi,
    replacement: (m) => `Appendix ${m[1]}`,
    message: '"Appendix" should be capitalized.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Academic',
  },

  // ── Legal ─────────────────────────────────────────────
  {
    id: 'legal-001',
    domain: 'legal',
    pattern: /§\s{2,}/g,
    replacement: '§ ',
    message: 'Use a single space after §.',
    severity: 'style',
    confidence: 0.90,
    category: 'Legal',
  },
  {
    id: 'legal-007',
    domain: 'legal',
    pattern: /\barticle\s+(\d+|[IVX]+)/gi,
    replacement: (m) => `Article ${m[1]}`,
    message: '"Article" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Legal',
  },
  {
    id: 'legal-008',
    domain: 'legal',
    pattern: /\bclause\s+(\d+|[IVX]+)/gi,
    replacement: (m) => `Clause ${m[1]}`,
    message: '"Clause" should be capitalized before a number.',
    severity: 'warning',
    confidence: 0.90,
    category: 'Legal',
  },

  // ── Medical ───────────────────────────────────────────
  {
    id: 'med-001',
    domain: 'medical',
    pattern: /\bpatience\b(?=\s+(?:was|were|is|are|has|have|had|will|should|could|would|may|might|must|presented|complained|reported|exhibited|displayed|showed|developed|experienced|underwent|received|diagnosed))/gi,
    replacement: 'patient',
    message: 'Did you mean "patient" (a person receiving medical care)?',
    severity: 'error',
    confidence: 0.88,
    category: 'Medical',
  },
  {
    id: 'med-002',
    domain: 'medical',
    pattern: /(\d)\s*mg\b/g,
    replacement: (m) => `${m[1]} mg`,
    message: 'Add a space between the number and "mg".',
    severity: 'style',
    confidence: 0.90,
    category: 'Medical',
  },
  {
    id: 'med-003',
    domain: 'medical',
    pattern: /(\d)\s*ml\b/g,
    replacement: (m) => `${m[1]} ml`,
    message: 'Add a space between the number and "ml".',
    severity: 'style',
    confidence: 0.90,
    category: 'Medical',
  },
  {
    id: 'med-004',
    domain: 'medical',
    pattern: /(\d)\s*kg\b/g,
    replacement: (m) => `${m[1]} kg`,
    message: 'Add a space between the number and "kg".',
    severity: 'style',
    confidence: 0.90,
    category: 'Medical',
  },
  {
    id: 'med-005',
    domain: 'medical',
    pattern: /\bdiagnosises\b/gi,
    replacement: 'diagnoses',
    message: 'The plural of "diagnosis" is "diagnoses".',
    severity: 'error',
    confidence: 0.98,
    category: 'Medical',
  },
  {
    id: 'med-006',
    domain: 'medical',
    pattern: /\bprostrate\b(?=\s+(?:cancer|gland|exam|biopsy|surgery|specific|enlargement|hypertrophy|screening))/gi,
    replacement: 'prostate',
    message: 'Did you mean "prostate" (the gland)?',
    severity: 'error',
    confidence: 0.92,
    category: 'Medical',
  },

  // ── Technical ─────────────────────────────────────────
  {
    id: 'tech-001',
    domain: 'technical',
    pattern: /(\d)\s*%/g,
    replacement: (m) => `${m[1]}%`,
    message: 'No space before percent sign in technical writing.',
    severity: 'style',
    confidence: 0.80,
    category: 'Technical',
  },
  {
    id: 'tech-002',
    domain: 'technical',
    pattern: /\bapi\b(?!['.])/g,
    replacement: 'API',
    message: '"API" should be uppercase.',
    severity: 'warning',
    confidence: 0.95,
    category: 'Technical',
  },
  {
    id: 'tech-003',
    domain: 'technical',
    pattern: /\burl\b(?!['.])/g,
    replacement: 'URL',
    message: '"URL" should be uppercase.',
    severity: 'warning',
    confidence: 0.95,
    category: 'Technical',
  },
  {
    id: 'tech-004',
    domain: 'technical',
    pattern: /\bhtml\b(?!['.])/g,
    replacement: 'HTML',
    message: '"HTML" should be uppercase.',
    severity: 'warning',
    confidence: 0.95,
    category: 'Technical',
  },
  {
    id: 'tech-005',
    domain: 'technical',
    pattern: /\bcss\b(?!['.])/g,
    replacement: 'CSS',
    message: '"CSS" should be uppercase.',
    severity: 'warning',
    confidence: 0.95,
    category: 'Technical',
  },
];

/**
 * Creates a domain-rules Rule for a given domain.
 */
export function createDomainRule(domain: Domain): Rule {
  const filtered = DOMAIN_RULES.filter(r => r.domain === domain);

  return {
    id: `domain-${domain}`,
    description: `Domain-specific rules for ${domain} writing`,
    apply(sentence: Sentence, _fullText: string): Issue[] {
      const issues: Issue[] = [];
      const text = sentence.text;

      for (const rule of filtered) {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const start = sentence.start + match.index;
          const end = start + match[0].length;
          const rep = typeof rule.replacement === 'function' ? rule.replacement(match) : rule.replacement;

          issues.push({
            ruleId: rule.id,
            message: rule.message,
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
}

/** All domain rules combined (for "general" mode — only non-domain-specific issues) */
export const allDomainRules = {
  academic: createDomainRule('academic'),
  legal: createDomainRule('legal'),
  medical: createDomainRule('medical'),
  technical: createDomainRule('technical'),
};
