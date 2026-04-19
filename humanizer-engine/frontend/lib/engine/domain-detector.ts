/**
 * Domain Detector — classifies input text into subject domains
 * so engines can adapt protected terms, prompts, and tone.
 *
 * Domains: academic, stem, medical, legal, business, humanities, creative, technical, general
 */

export type Domain =
  | 'academic'
  | 'stem'
  | 'medical'
  | 'legal'
  | 'business'
  | 'humanities'
  | 'creative'
  | 'technical'
  | 'general';

export interface DomainResult {
  primary: Domain;
  secondary: Domain | null;
  confidence: number;          // 0–1
  scores: Record<Domain, number>;
}

// ── Keyword lists per domain ──

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  stem: [
    'algorithm', 'equation', 'variable', 'function', 'theorem', 'proof',
    'hypothesis', 'experiment', 'laboratory', 'molecule', 'atom', 'electron',
    'photosynthesis', 'mitochondria', 'chromosome', 'genome', 'dna', 'rna',
    'quantum', 'thermodynamic', 'electromagnetic', 'gravitational', 'velocity',
    'acceleration', 'kinetic', 'entropy', 'catalyst', 'reagent', 'spectroscopy',
    'polynomial', 'derivative', 'integral', 'matrix', 'vector', 'tensor',
    'neural network', 'machine learning', 'deep learning', 'regression',
    'classification', 'clustering', 'gradient', 'optimization', 'compiler',
    'semiconductor', 'transistor', 'circuit', 'wavelength', 'frequency',
    'amplitude', 'isotope', 'covalent', 'ionic', 'organic chemistry',
    'inorganic', 'biochemistry', 'microbiology', 'ecology', 'evolution',
    'natural selection', 'genetic', 'mutation', 'allele', 'phenotype', 'genotype',
    'astrophysics', 'cosmology', 'relativity', 'particle physics',
    'calculus', 'algebra', 'geometry', 'topology', 'statistics',
    'computer science', 'software engineering', 'database', 'api',
    'cryptography', 'operating system', 'data structure',
  ],
  medical: [
    'patient', 'diagnosis', 'prognosis', 'treatment', 'therapy', 'clinical',
    'symptom', 'pathology', 'epidemiology', 'etiology', 'prevalence',
    'incidence', 'morbidity', 'mortality', 'placebo', 'randomized controlled',
    'pharmaceutical', 'dosage', 'medication', 'prescription', 'surgical',
    'chronic', 'acute', 'benign', 'malignant', 'carcinoma', 'tumor',
    'metastasis', 'biopsy', 'hematology', 'oncology', 'cardiology',
    'neurology', 'psychiatry', 'pediatrics', 'geriatrics', 'orthopedic',
    'radiology', 'anesthesia', 'intensive care', 'emergency medicine',
    'nursing', 'rehabilitation', 'occupational therapy', 'physiotherapy',
    'vital signs', 'blood pressure', 'heart rate', 'respiratory',
    'immunology', 'vaccine', 'antibody', 'antigen', 'infectious disease',
    'public health', 'mental health', 'autism spectrum', 'sensory integration',
    'clinical trial', 'informed consent', 'hippocratic', 'bioethics',
    'pharmacokinetics', 'pharmacodynamics', 'adverse effect', 'contraindication',
  ],
  legal: [
    'jurisdiction', 'plaintiff', 'defendant', 'statute', 'precedent',
    'legislation', 'regulation', 'constitutional', 'amendment', 'judicial',
    'court', 'tribunal', 'litigation', 'arbitration', 'mediation',
    'contract', 'liability', 'negligence', 'tort', 'felony', 'misdemeanor',
    'indictment', 'verdict', 'sentencing', 'appeal', 'habeas corpus',
    'due process', 'civil rights', 'intellectual property', 'patent',
    'copyright', 'trademark', 'compliance', 'regulatory', 'fiduciary',
    'attorney', 'counsel', 'prosecution', 'defense', 'testimony',
    'deposition', 'affidavit', 'subpoena', 'injunction', 'restraining order',
    'criminal law', 'civil law', 'corporate law', 'international law',
    'human rights law', 'environmental law', 'tax law', 'labor law',
    'sovereignty', 'jurisprudence', 'legal doctrine', 'stare decisis',
    'mens rea', 'actus reus', 'beyond reasonable doubt', 'preponderance',
  ],
  business: [
    'revenue', 'profit', 'margin', 'stakeholder', 'shareholder', 'dividend',
    'market share', 'competitive advantage', 'supply chain', 'logistics',
    'marketing', 'branding', 'consumer', 'customer', 'segmentation',
    'roi', 'kpi', 'quarterly', 'fiscal year', 'balance sheet',
    'income statement', 'cash flow', 'accounts receivable', 'accounts payable',
    'inventory', 'depreciation', 'amortization', 'equity', 'debt',
    'merger', 'acquisition', 'ipo', 'valuation', 'venture capital',
    'startup', 'entrepreneurship', 'business model', 'scalability',
    'management', 'leadership', 'organizational', 'corporate governance',
    'human resources', 'recruitment', 'onboarding', 'performance review',
    'strategic planning', 'swot analysis', 'porter', 'bcg matrix',
    'market research', 'b2b', 'b2c', 'e-commerce', 'digital marketing',
    'brand equity', 'price elasticity', 'demand curve', 'microeconomics',
    'macroeconomics', 'inflation', 'monetary policy', 'fiscal policy',
    'gdp', 'trade deficit', 'exchange rate', 'interest rate',
  ],
  humanities: [
    'philosophy', 'epistemology', 'ontology', 'metaphysics', 'ethics',
    'aesthetics', 'phenomenology', 'hermeneutics', 'existentialism',
    'postmodernism', 'structuralism', 'deconstructionism', 'semiotics',
    'literary criticism', 'narrative', 'prose', 'poetry', 'rhetoric',
    'historiography', 'archaeology', 'anthropology', 'ethnography',
    'sociology', 'cultural studies', 'gender studies', 'postcolonial',
    'feminist theory', 'marxism', 'capitalism', 'ideology', 'hegemony',
    'discourse', 'subjectivity', 'identity', 'representation',
    'renaissance', 'enlightenment', 'romanticism', 'modernism',
    'civilization', 'empire', 'colonialism', 'imperialism', 'revolution',
    'democracy', 'republic', 'monarchy', 'theocracy', 'aristocracy',
    'theology', 'religious studies', 'sacred', 'secular', 'ritual',
    'mythology', 'folklore', 'oral tradition', 'indigenous knowledge',
    'art history', 'music theory', 'film studies', 'media studies',
    'linguistics', 'phonology', 'morphology', 'syntax', 'semantics', 'pragmatics',
  ],
  creative: [
    'character', 'protagonist', 'antagonist', 'plot', 'setting',
    'theme', 'conflict', 'resolution', 'climax', 'denouement',
    'narrator', 'point of view', 'first person', 'third person',
    'dialogue', 'monologue', 'soliloquy', 'stream of consciousness',
    'imagery', 'metaphor', 'simile', 'symbolism', 'allegory',
    'foreshadowing', 'flashback', 'irony', 'satire', 'parody',
    'genre', 'fiction', 'non-fiction', 'memoir', 'autobiography',
    'novel', 'short story', 'novella', 'screenplay', 'playwright',
    'stanza', 'verse', 'meter', 'rhyme', 'sonnet', 'haiku',
    'creative writing', 'workshop', 'draft', 'revision', 'manuscript',
    'publishing', 'literary agent', 'editorial', 'storytelling',
  ],
  technical: [
    'software', 'hardware', 'firmware', 'architecture', 'infrastructure',
    'deployment', 'scalable', 'latency', 'throughput', 'bandwidth',
    'api', 'endpoint', 'microservice', 'container', 'kubernetes',
    'docker', 'ci/cd', 'devops', 'agile', 'scrum', 'sprint',
    'repository', 'version control', 'git', 'branch', 'merge',
    'debugging', 'testing', 'unit test', 'integration test',
    'frontend', 'backend', 'full stack', 'framework', 'library',
    'encryption', 'ssl', 'tls', 'firewall', 'authentication',
    'authorization', 'cloud computing', 'saas', 'paas', 'iaas',
    'machine learning', 'artificial intelligence', 'nlp', 'computer vision',
    'cybersecurity', 'penetration testing', 'vulnerability', 'exploit',
    'tcp/ip', 'http', 'dns', 'load balancer', 'caching',
    'relational database', 'nosql', 'sql', 'orm', 'rest', 'graphql',
  ],
  academic: [
    'dissertation', 'thesis', 'abstract', 'introduction', 'conclusion',
    'literature review', 'methodology', 'findings', 'discussion',
    'citation', 'bibliography', 'reference', 'peer reviewed',
    'scholarly', 'manuscript', 'journal', 'publication',
    'research question', 'hypothesis', 'sample size', 'population',
    'qualitative', 'quantitative', 'mixed methods', 'triangulation',
    'empirical', 'theoretical framework', 'conceptual framework',
    'grounded theory', 'case study', 'ethnographic', 'phenomenological',
    'longitudinal', 'cross sectional', 'meta analysis', 'systematic review',
    'standard deviation', 'confidence interval', 'statistical significance',
    'p-value', 't-test', 'anova', 'chi-square', 'regression analysis',
    'informed consent', 'irb', 'institutional review', 'ethical approval',
    'et al', 'ibid', 'op cit', 'supra', 'cf',
  ],
  general: [],
};

// ── Domain-specific protected terms ──
// These terms must never be replaced by synonym engines for the given domain

export const DOMAIN_PROTECTED_TERMS: Record<Domain, string[]> = {
  stem: [
    'algorithm', 'algorithms', 'equation', 'equations', 'variable', 'variables',
    'function', 'functions', 'theorem', 'theorems', 'hypothesis', 'hypotheses',
    'molecule', 'molecules', 'atom', 'atoms', 'electron', 'electrons',
    'photosynthesis', 'mitochondria', 'chromosome', 'chromosomes',
    'genome', 'genomes', 'dna', 'rna', 'quantum', 'thermodynamic',
    'electromagnetic', 'gravitational', 'velocity', 'acceleration',
    'entropy', 'catalyst', 'reagent', 'spectroscopy', 'polynomial',
    'derivative', 'integral', 'matrix', 'vector', 'tensor',
    'neural', 'gradient', 'optimization', 'semiconductor', 'transistor',
    'wavelength', 'frequency', 'amplitude', 'isotope', 'covalent', 'ionic',
    'mutation', 'allele', 'phenotype', 'genotype', 'evolution',
    'compiler', 'runtime', 'binary', 'hexadecimal', 'boolean',
  ],
  medical: [
    'patient', 'patients', 'diagnosis', 'diagnoses', 'prognosis',
    'treatment', 'treatments', 'therapy', 'therapies', 'clinical',
    'symptom', 'symptoms', 'pathology', 'epidemiology', 'etiology',
    'prevalence', 'incidence', 'morbidity', 'mortality', 'placebo',
    'pharmaceutical', 'dosage', 'medication', 'medications',
    'surgical', 'chronic', 'acute', 'benign', 'malignant',
    'carcinoma', 'tumor', 'tumors', 'metastasis', 'biopsy',
    'hematology', 'oncology', 'cardiology', 'neurology', 'psychiatry',
    'vital', 'respiratory', 'immunology', 'vaccine', 'vaccines',
    'antibody', 'antibodies', 'antigen', 'antigens', 'contraindication',
    'pharmacokinetics', 'pharmacodynamics', 'bioethics',
    'autism', 'asd', 'sensory', 'occupational', 'physiotherapy',
  ],
  legal: [
    'jurisdiction', 'jurisdictions', 'plaintiff', 'plaintiffs',
    'defendant', 'defendants', 'statute', 'statutes', 'precedent',
    'precedents', 'legislation', 'regulation', 'regulations',
    'constitutional', 'amendment', 'amendments', 'judicial',
    'litigation', 'arbitration', 'mediation', 'contract', 'contracts',
    'liability', 'negligence', 'tort', 'torts', 'felony', 'misdemeanor',
    'indictment', 'verdict', 'sentencing', 'appeal', 'appeals',
    'habeas corpus', 'due process', 'fiduciary', 'attorney',
    'prosecution', 'testimony', 'deposition', 'affidavit',
    'subpoena', 'injunction', 'sovereignty', 'jurisprudence',
    'stare decisis', 'mens rea', 'actus reus',
  ],
  business: [
    'revenue', 'profit', 'margin', 'stakeholder', 'stakeholders',
    'shareholder', 'shareholders', 'dividend', 'dividends',
    'roi', 'kpi', 'quarterly', 'fiscal', 'balance sheet',
    'equity', 'debt', 'merger', 'acquisition', 'ipo', 'valuation',
    'depreciation', 'amortization', 'inventory', 'logistics',
    'gdp', 'inflation', 'microeconomics', 'macroeconomics',
    'monetary', 'fiscal policy', 'exchange rate', 'interest rate',
    'segmentation', 'branding', 'scalability', 'swot',
  ],
  humanities: [
    'epistemology', 'ontology', 'metaphysics', 'phenomenology',
    'hermeneutics', 'existentialism', 'postmodernism', 'structuralism',
    'deconstructionism', 'semiotics', 'historiography', 'ethnography',
    'anthropology', 'archaeology', 'hegemony', 'ideology',
    'postcolonial', 'colonialism', 'imperialism', 'renaissance',
    'enlightenment', 'romanticism', 'modernism', 'phonology',
    'morphology', 'syntax', 'semantics', 'pragmatics',
    'mythology', 'folklore', 'theocracy', 'aristocracy',
  ],
  creative: [
    'protagonist', 'antagonist', 'denouement', 'soliloquy',
    'allegory', 'foreshadowing', 'flashback', 'irony', 'satire',
    'stanza', 'verse', 'meter', 'rhyme', 'sonnet', 'haiku',
    'metaphor', 'simile', 'symbolism', 'imagery', 'narrator',
  ],
  technical: [
    'api', 'endpoint', 'microservice', 'kubernetes', 'docker',
    'devops', 'agile', 'scrum', 'sprint', 'repository',
    'frontend', 'backend', 'framework', 'library', 'encryption',
    'ssl', 'tls', 'firewall', 'authentication', 'authorization',
    'saas', 'paas', 'iaas', 'graphql', 'rest', 'orm',
    'tcp', 'http', 'dns', 'caching', 'latency', 'throughput',
    'bandwidth', 'deployment', 'container', 'ci/cd',
  ],
  academic: [
    'dissertation', 'thesis', 'abstract', 'methodology',
    'citation', 'bibliography', 'peer reviewed', 'scholarly',
    'hypothesis', 'hypotheses', 'qualitative', 'quantitative',
    'empirical', 'longitudinal', 'cross sectional', 'meta analysis',
    'systematic review', 'standard deviation', 'confidence interval',
    'statistical significance', 'p-value', 't-test', 'anova',
    'chi-square', 'regression', 'informed consent', 'irb',
    'et al', 'ibid', 'op cit',
  ],
  general: [],
};

// ── Domain tone guidance for LLM prompts ──

export const DOMAIN_TONE_GUIDANCE: Record<Domain, string> = {
  academic: 'Maintain formal academic register. Use hedging language ("suggests", "indicates", "appears to"). Write like a university researcher composing a peer-reviewed paper.',
  stem: 'Maintain precise scientific/technical register. Preserve all formulas, units, and technical terminology exactly. Write like a STEM researcher — clear, concise, and methodical.',
  medical: 'Maintain clinical/medical register. Preserve all medical terminology, drug names, dosages, and diagnostic terms exactly. Write like a healthcare professional documenting findings.',
  legal: 'Maintain formal legal register. Preserve all legal citations, case names, statute numbers, and Latin terms exactly. Write like an attorney drafting a legal brief or opinion.',
  business: 'Maintain professional business register. Preserve all financial figures, company names, and industry terminology. Write like a business analyst composing a professional report.',
  humanities: 'Maintain scholarly humanities register. Preserve theoretical terminology and cultural references. Write like a humanities scholar presenting nuanced analysis.',
  creative: 'Maintain the author\'s creative voice and style. Preserve literary devices, intentional word choices, and stylistic flourishes. Focus on making the prose sound authentically human rather than imposing a uniform style.',
  technical: 'Maintain technical documentation register. Preserve all code references, command names, configuration values, and technical specifications exactly. Write like a senior engineer documenting a system.',
  general: 'Maintain a clear, natural writing style appropriate to the content. Write like a thoughtful person explaining ideas in their own words.',
};

/**
 * Detect the primary domain of the input text.
 * Uses keyword frequency analysis across all domains.
 */
export function detectDomain(text: string): DomainResult {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const totalWords = words.length || 1;

  const scores: Record<Domain, number> = {
    academic: 0, stem: 0, medical: 0, legal: 0,
    business: 0, humanities: 0, creative: 0, technical: 0, general: 0,
  };

  // Score each domain by keyword hits, weighted by term specificity
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [Domain, string[]][]) {
    if (domain === 'general') continue;
    for (const kw of keywords) {
      // Multi-word terms get a higher weight
      const weight = kw.includes(' ') ? 2.5 : 1;
      // Count occurrences (capped at 5 to avoid a single repeated term dominating)
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = lower.match(new RegExp(`\\b${escaped}\\b`, 'g'));
      if (matches) {
        scores[domain] += Math.min(matches.length, 5) * weight;
      }
    }
    // Normalize by keyword list size to make domains comparable
    scores[domain] = scores[domain] / (keywords.length || 1) * 100;
  }

  // Sort domains by score
  const sorted = (Object.entries(scores) as [Domain, number][])
    .filter(([d]) => d !== 'general')
    .sort((a, b) => b[1] - a[1]);

  const topScore = sorted[0]?.[1] ?? 0;
  const secondScore = sorted[1]?.[1] ?? 0;

  // Minimum threshold — below this, classify as general
  if (topScore < 1.5) {
    return {
      primary: 'general',
      secondary: null,
      confidence: 0.3,
      scores,
    };
  }

  const primary = sorted[0][0];
  const secondary = secondScore > topScore * 0.5 ? sorted[1][0] : null;
  const confidence = Math.min(1, topScore / 15);

  return { primary, secondary, confidence, scores };
}

/**
 * Get the combined set of protected terms for the detected domain(s).
 */
export function getProtectedTermsForDomain(result: DomainResult): Set<string> {
  const terms = new Set<string>();
  // Always include academic base terms
  for (const t of DOMAIN_PROTECTED_TERMS.academic) terms.add(t);
  // Add primary domain terms
  for (const t of DOMAIN_PROTECTED_TERMS[result.primary] ?? []) terms.add(t);
  // Add secondary domain terms if present
  if (result.secondary) {
    for (const t of DOMAIN_PROTECTED_TERMS[result.secondary] ?? []) terms.add(t);
  }
  return terms;
}

/**
 * Get LLM tone guidance string for the detected domain.
 */
export function getToneGuidance(result: DomainResult, userTone?: string): string {
  // If user explicitly set a tone, respect it
  if (userTone && userTone !== 'neutral') {
    const toneMap: Record<string, string> = {
      academic: DOMAIN_TONE_GUIDANCE.academic,
      professional: DOMAIN_TONE_GUIDANCE.business,
      simple: 'Write in clear, simple language. Avoid jargon and complex vocabulary. Explain ideas as you would to a general audience.',
      creative: DOMAIN_TONE_GUIDANCE.creative,
      technical: DOMAIN_TONE_GUIDANCE.technical,
      wikipedia: 'Write in an encyclopedic tone — neutral, factual, well-sourced. Avoid first-person and opinion. Follow Wikipedia style conventions.',
    };
    return toneMap[userTone] ?? DOMAIN_TONE_GUIDANCE[result.primary];
  }
  // Otherwise, use domain-detected tone
  return DOMAIN_TONE_GUIDANCE[result.primary];
}
