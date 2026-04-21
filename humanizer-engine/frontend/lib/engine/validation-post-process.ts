/**
 * Post-Processing Validation Module
 * ==================================
 * Ensures sentence integrity, prevents truncation, and validates content preservation
 * after humanization. Used across all humanizer engines.
 */

import nlp from 'compromise';

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  stats: {
    originalSentences: number;
    humanizedSentences: number;
    originalWords: number;
    humanizedWords: number;
    truncatedSentences: number;
    missingSentences: number;
    wordPreservationRatio: number;
  };
}

interface SentenceValidation {
  index: number;
  original: string;
  humanized: string;
  isTruncated: boolean;
  isMissing: boolean;
  wordChangeRatio: number;
}

type ProperNounSignals = {
  properNouns: Set<string>;
  properPhrases: string[];
};

/**
 * Split text into sentences with robust handling.
 */
function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  // Split on sentence boundaries
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z])/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // If no sentences found, return the whole text as one sentence
  return sentences.length > 0 ? sentences : [normalized];
}

/**
 * Count words in text (excluding punctuation).
 */
function countWords(text: string): number {
  return text
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

/**
 * Check if a sentence appears truncated (ends abruptly without proper punctuation).
 */
function isSentenceTruncated(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  
  // Check if ends with sentence-ending punctuation
  if (/[.!?]$/.test(trimmed)) return false;
  
  // Check if it's a title/heading (acceptable to have no punctuation)
  const words = trimmed.split(/\s+/);
  if (words.length <= 12) {
    const capitalWords = words.filter(w => w.length > 0 && /^[A-Z]/.test(w)).length;
    const titleRatio = capitalWords / Math.max(words.length, 1);
    if (titleRatio >= 0.6) return false; // It's a title, not truncated
  }
  
  // Check if ends mid-word (letter followed by nothing)
  if (/[a-z]$/.test(trimmed) && words.length > 3) {
    const lastWord = words[words.length - 1];
    // If last word is very short and no punctuation, likely truncated
    if (lastWord.length <= 3 && countWords(trimmed) >= 5) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate that a humanized sentence corresponds to its original.
 */
function validateSentencePair(
  original: string, 
  humanized: string, 
  index: number
): SentenceValidation {
  const origWords = countWords(original);
  const humWords = countWords(humanized);
  
  const wordChangeRatio = origWords > 0 
    ? Math.abs(origWords - humWords) / origWords 
    : 0;
  
  return {
    index,
    original,
    humanized,
    isTruncated: isSentenceTruncated(humanized),
    isMissing: !humanized || humanized.trim().length === 0,
    wordChangeRatio,
  };
}

/**
 * Main validation function - validates entire humanized output.
 */
export function validateHumanizedOutput(
  originalText: string,
  humanizedText: string,
  options: {
    allowWordChangeBound?: number; // Max word change ratio per sentence (default: 0.5 = 50%)
    minSentenceWords?: number; // Min words to not be considered truncated (default: 3)
    strictMode?: boolean; // Fail on any issue (default: false)
  } = {}
): ValidationResult {
  const {
    allowWordChangeBound = 0.7,
    minSentenceWords = 3,
    strictMode = false,
  } = options;
  
  const issues: string[] = [];
  
  // Split into sentences
  const originalSentences = splitIntoSentences(originalText);
  const humanizedSentences = splitIntoSentences(humanizedText);
  
  // Count words
  const originalWords = countWords(originalText);
  const humanizedWords = countWords(humanizedText);
  
  // Validate sentence count
  const sentenceCountDiff = Math.abs(originalSentences.length - humanizedSentences.length);
  if (sentenceCountDiff > Math.ceil(originalSentences.length * 0.2)) {
    issues.push(
      `Sentence count mismatch: original has ${originalSentences.length}, ` +
      `humanized has ${humanizedSentences.length} (diff: ${sentenceCountDiff})`
    );
  }
  
  // Validate word preservation
  const wordPreservationRatio = originalWords > 0 
    ? humanizedWords / originalWords 
    : 1;
  
  if (wordPreservationRatio < 0.5 || wordPreservationRatio > 1.8) {
    issues.push(
      `Word count out of bounds: original has ${originalWords}, ` +
      `humanized has ${humanizedWords} (ratio: ${wordPreservationRatio.toFixed(2)})`
    );
  }
  
  // Validate each sentence
  let truncatedCount = 0;
  let missingCount = 0;
  
  const sentenceValidations: SentenceValidation[] = [];
  const maxIndex = Math.max(originalSentences.length, humanizedSentences.length);
  
  for (let i = 0; i < maxIndex; i++) {
    const orig = originalSentences[i] || '';
    const hum = humanizedSentences[i] || '';
    
    const validation = validateSentencePair(orig, hum, i);
    sentenceValidations.push(validation);
    
    if (validation.isTruncated) {
      truncatedCount++;
      issues.push(
        `Sentence ${i + 1} appears truncated: "${validation.humanized.substring(0, 80)}..."`
      );
    }
    
    if (validation.isMissing && orig.trim().length > 0) {
      missingCount++;
      issues.push(
        `Sentence ${i + 1} is missing in humanized output: "${orig.substring(0, 80)}..."`
      );
    }
    
    // Check for excessive word count change in individual sentences
    if (orig && hum && validation.wordChangeRatio > allowWordChangeBound) {
      issues.push(
        `Sentence ${i + 1} has excessive word change (${(validation.wordChangeRatio * 100).toFixed(0)}%): ` +
        `"${orig.substring(0, 60)}..." vs "${hum.substring(0, 60)}..."`
      );
    }
    
    // Check for very short humanized sentences (possible truncation)
    if (hum && !validation.isMissing) {
      const humWordCount = countWords(hum);
      const origWordCount = countWords(orig);
      if (humWordCount < minSentenceWords && origWordCount >= minSentenceWords) {
        issues.push(
          `Sentence ${i + 1} too short (${humWordCount} words): possibly truncated`
        );
      }
    }
  }
  
  const isValid = strictMode ? issues.length === 0 : truncatedCount === 0 && missingCount === 0;
  
  return {
    isValid,
    issues,
    stats: {
      originalSentences: originalSentences.length,
      humanizedSentences: humanizedSentences.length,
      originalWords,
      humanizedWords,
      truncatedSentences: truncatedCount,
      missingSentences: missingCount,
      wordPreservationRatio,
    },
  };
}

/**
 * Attempt to repair common issues in humanized output.
 */
export function repairHumanizedOutput(
  originalText: string,
  humanizedText: string
): { repaired: string; repairs: string[] } {
  const repairs: string[] = [];
  let repaired = humanizedText;
  
  const originalSentences = splitIntoSentences(originalText);
  const humanizedSentences = splitIntoSentences(repaired);
  
  // If humanized has fewer sentences, append missing originals
  if (humanizedSentences.length < originalSentences.length) {
    const missing = originalSentences.slice(humanizedSentences.length);
    if (missing.length > 0) {
      repaired = repaired.trim() + ' ' + missing.join(' ');
      repairs.push(`Appended ${missing.length} missing sentences from original`);
    }
  }
  
  // Fix truncated last sentence
  const lastHumanized = humanizedSentences[humanizedSentences.length - 1] || '';
  if (isSentenceTruncated(lastHumanized) && originalSentences.length > 0) {
    const lastOriginal = originalSentences[originalSentences.length - 1];
    // Replace truncated ending with original ending
    const repairedSentences = [...humanizedSentences];
    repairedSentences[repairedSentences.length - 1] = lastOriginal;
    repaired = repairedSentences.join(' ');
    repairs.push('Repaired truncated last sentence');
  }
  
  // Fix missing ending punctuation
  if (repaired && !/[.!?]$/.test(repaired.trim())) {
    const lastChar = originalText.trim().slice(-1);
    if (/[.!?]/.test(lastChar)) {
      repaired = repaired.trim() + lastChar;
      repairs.push('Added missing ending punctuation');
    } else {
      repaired = repaired.trim() + '.';
      repairs.push('Added default ending period');
    }
  }
  
  return { repaired, repairs };
}

// ═══════════════════════════════════════════════════════════════════
// Capitalization Fixer — Mid-Sentence Capitals
// ═══════════════════════════════════════════════════════════════════

/** Known abbreviations / acronyms that must STAY uppercase */
const ABBREVIATIONS = new Set([
  'AI', 'US', 'USA', 'UK', 'EU', 'UN', 'NASA', 'FBI', 'CIA', 'CEO', 'CFO',
  'CTO', 'COO', 'PhD', 'MBA', 'MD', 'JD', 'BS', 'BA', 'MA', 'MS', 'DNA',
  'RNA', 'HIV', 'AIDS', 'GDP', 'GPA', 'SAT', 'ACT', 'GRE', 'GMAT', 'LSAT',
  'MCAT', 'STEM', 'NATO', 'WHO', 'IMF', 'WTO', 'UNICEF', 'UNESCO', 'OECD',
  'OPEC', 'API', 'URL', 'HTML', 'CSS', 'SQL', 'IT', 'IoT', 'SaaS', 'PaaS',
  'IaaS', 'VPN', 'HTTP', 'HTTPS', 'FTP', 'TCP', 'IP', 'CPU', 'GPU', 'RAM',
  'ROM', 'SSD', 'HDD', 'USB', 'HDMI', 'LED', 'LCD', 'PDF', 'CSV', 'JSON',
  'XML', 'ASAP', 'FAQ', 'DIY', 'RSVP', 'ETA', 'FYI', 'TBD', 'TBA', 'ROI',
  'KPI', 'B2B', 'B2C', 'PR', 'HR', 'QA', 'R&D', 'P&L', 'LLC', 'Inc',
  'Corp', 'Ltd', 'AM', 'PM', 'BC', 'AD', 'BCE', 'CE', 'ADHD', 'PTSD',
  'OCD', 'APA', 'MLA', 'IEEE', 'ACM', 'HVAC', 'SWOT', 'SEO', 'CRM', 'ERP',
  'MVP', 'UX', 'UI', 'ML', 'NLP', 'LLM', 'GPT', 'AWS', 'GCP', 'IBM',
  'FPE', 'FDSE', 'KCPE', 'KCSE', 'NGO', 'NGOs', 'CBE', 'ECDE', 'TVET',
  'TVETs', 'TSC', 'KNEC', 'KICD', 'BOM', 'CDF', 'SDGs', 'MDGs', 'EFA',
  'ICT', 'STEM',
]);

/**
 * Common English words that should NEVER be capitalized mid-sentence.
 * Comprehensive list covering articles, prepositions, conjunctions,
 * common nouns, adjectives, verbs, and adverbs that engines wrongly capitalize.
 */
const ALWAYS_LOWERCASE_MID_SENTENCE = new Set([
  // Articles & determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'some', 'any', 'all',
  'each', 'every', 'both', 'few', 'several', 'such', 'many', 'much', 'more',
  'most', 'other', 'another',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'over', 'about', 'against', 'among', 'around', 'behind', 'beyond', 'down',
  'near', 'off', 'out', 'past', 'toward', 'towards', 'up', 'upon', 'within',
  'without', 'across', 'along', 'beside', 'besides', 'despite', 'except',
  'like', 'unlike', 'until', 'onto',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'yet', 'so', 'if', 'then', 'than', 'when',
  'while', 'where', 'whether', 'although', 'because', 'since', 'unless',
  'though', 'whereas',
  // Pronouns
  'it', 'its', 'they', 'them', 'their', 'theirs', 'he', 'she', 'him', 'her',
  'his', 'hers', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'my',
  'me', 'mine', 'who', 'whom', 'whose', 'which', 'what',
  // Common verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'must', 'need', 'get', 'got', 'make', 'made', 'take',
  'took', 'taken', 'give', 'gave', 'given', 'come', 'came', 'go', 'went',
  'gone', 'know', 'knew', 'known', 'think', 'thought', 'see', 'saw', 'seen',
  'find', 'found', 'say', 'said', 'tell', 'told', 'keep', 'kept', 'let',
  'put', 'run', 'set', 'show', 'showed', 'shown', 'try', 'tried', 'use',
  'used', 'work', 'worked', 'call', 'called', 'become', 'became', 'leave',
  'left', 'play', 'played', 'move', 'moved', 'live', 'lived', 'believe',
  'bring', 'brought', 'happen', 'happened', 'write', 'wrote', 'written',
  'provide', 'provided', 'sit', 'sat', 'stand', 'stood', 'lose', 'lost',
  'pay', 'paid', 'meet', 'met', 'include', 'included', 'continue', 'continued',
  'learn', 'learned', 'change', 'changed', 'lead', 'led', 'understand',
  'understood', 'watch', 'watched', 'follow', 'followed', 'stop', 'stopped',
  'create', 'created', 'speak', 'spoke', 'spoken', 'read', 'allow', 'allowed',
  'add', 'added', 'grow', 'grew', 'grown', 'open', 'opened', 'walk', 'walked',
  'win', 'won', 'offer', 'offered', 'remember', 'love', 'consider', 'considered',
  'appear', 'appeared', 'buy', 'bought', 'wait', 'waited', 'serve', 'served',
  'die', 'died', 'send', 'sent', 'expect', 'expected', 'build', 'built',
  'stay', 'stayed', 'fall', 'fell', 'fallen', 'cut', 'reach', 'reached',
  'kill', 'killed', 'remain', 'remained', 'suggest', 'suggested', 'raise',
  'raised', 'pass', 'passed', 'sell', 'sold', 'require', 'required', 'report',
  'reported', 'decide', 'decided', 'pull', 'pulled', 'develop', 'developed',
  'argues', 'argue', 'argued', 'describes', 'describe', 'described',
  'explains', 'explain', 'explained', 'notes', 'noted', 'states', 'stated',
  'suggests', 'claims', 'claimed', 'indicates', 'indicated', 'shows',
  'reveals', 'revealed', 'demonstrates', 'demonstrated', 'highlights',
  'highlighted', 'emphasizes', 'emphasized', 'acknowledges', 'acknowledged',
  'recognizes', 'recognized', 'identifies', 'identified', 'supports',
  'supported', 'contributes', 'contributed', 'influences', 'influenced',
  'affects', 'affected', 'impacts', 'impacted', 'generates', 'generated',
  'strengthened', 'strengthens', 'transforms', 'transformed', 'expands',
  'expanded', 'reduces', 'reduced', 'increases', 'increased', 'improves',
  'improved', 'enhances', 'enhanced', 'promotes', 'promoted', 'ensures',
  'ensured', 'enables', 'enabled', 'encourages', 'encouraged', 'establishes',
  'established', 'maintains', 'maintained', 'addresses', 'addressed',
  'involves', 'involved', 'compelled', 'motivated', 'invested', 'allocated',
  'subsidizing', 'formulation',
  // Common nouns — education/academic
  'education', 'training', 'teaching', 'instruction', 'learning', 'school',
  'schools', 'university', 'universities', 'college', 'colleges', 'student',
  'students', 'teacher', 'teachers', 'classroom', 'classrooms', 'curriculum',
  'enrolment', 'enrollment', 'tuition', 'graduate', 'graduates', 'pupil',
  'pupils', 'lesson', 'lessons', 'course', 'courses', 'degree', 'degrees',
  'examination', 'examinations', 'exam', 'exams', 'certificate', 'qualification',
  'qualifications', 'literacy', 'numeracy', 'pedagogy', 'scholarship',
  // Common nouns — government/policy
  'government', 'policy', 'policies', 'legislation', 'regulation', 'regulations',
  'law', 'laws', 'governance', 'administration', 'authority', 'authorities',
  'parliament', 'congress', 'senate', 'ministry', 'department', 'bureau',
  'agency', 'commission', 'committee', 'council', 'directive', 'directives',
  'initiative', 'initiatives', 'reform', 'reforms', 'mandate', 'mandates',
  'sector', 'sectors',
  // Common nouns — society/economy
  'development', 'growth', 'demand', 'population', 'community', 'communities',
  'society', 'economy', 'economic', 'market', 'markets', 'labor', 'labour',
  'employment', 'workforce', 'industry', 'industries', 'commerce', 'trade',
  'investment', 'infrastructure', 'technology', 'innovation', 'progress',
  'poverty', 'wealth', 'income', 'budget', 'expenditure', 'assets', 'resources',
  'capacity', 'productivity', 'sustainability', 'equality', 'equity', 'access',
  'opportunity', 'opportunities', 'mobility', 'urbanization',
  // Common nouns — general
  'introduction', 'commitment', 'participation', 'responsibility', 'expansion',
  'movement', 'spirit', 'tradition', 'culture', 'practice', 'practices',
  'approach', 'method', 'methods', 'strategy', 'strategies', 'system',
  'systems', 'process', 'processes', 'structure', 'structures', 'framework',
  'model', 'models', 'factor', 'factors', 'element', 'elements', 'aspect',
  'aspects', 'feature', 'features', 'concept', 'concepts', 'principle',
  'principles', 'role', 'roles', 'impact', 'effect', 'effects', 'result',
  'results', 'outcome', 'outcomes', 'consequence', 'consequences', 'benefit',
  'benefits', 'challenge', 'challenges', 'problem', 'problems', 'issue',
  'issues', 'solution', 'solutions', 'response', 'effort', 'efforts',
  'measure', 'measures', 'level', 'levels', 'rate', 'rates', 'number',
  'numbers', 'area', 'areas', 'region', 'regions', 'country', 'countries',
  'part', 'parts', 'place', 'places', 'group', 'groups', 'member', 'members',
  'parent', 'parents', 'child', 'children', 'family', 'families', 'people',
  'person', 'individual', 'individuals', 'citizen', 'citizens', 'leader',
  'leaders', 'worker', 'workers', 'candidate', 'candidates', 'investor',
  'investors', 'planner', 'planners', 'stakeholder', 'stakeholders',
  'management', 'accountability', 'ownership', 'performance', 'achievement',
  'success', 'failure', 'improvement', 'quality', 'standard', 'standards',
  'value', 'values', 'need', 'needs', 'goal', 'goals', 'objective',
  'objectives', 'purpose', 'target', 'targets', 'priority', 'priorities',
  'basis', 'foundation', 'context', 'situation', 'condition', 'conditions',
  'environment', 'circumstances', 'case', 'cases', 'example', 'examples',
  'evidence', 'data', 'information', 'knowledge', 'research', 'study',
  'studies', 'analysis', 'findings', 'report', 'reports', 'review', 'reviews',
  'perception', 'consciousness', 'mindset', 'notion', 'idea', 'ideas',
  'thought', 'thoughts', 'belief', 'beliefs', 'view', 'views', 'opinion',
  'opinions', 'attitude', 'attitudes', 'position', 'positions',
  'land', 'building', 'materials', 'laboratories', 'cost', 'costs',
  'price', 'prices', 'fee', 'fees', 'space', 'spaces', 'provision',
  // Adjectives
  'secondary', 'primary', 'key', 'main', 'central', 'major', 'critical',
  'essential', 'important', 'significant', 'considerable', 'substantial',
  'fundamental', 'basic', 'general', 'specific', 'particular', 'various',
  'different', 'similar', 'other', 'new', 'old', 'good', 'better', 'best',
  'great', 'large', 'small', 'long', 'short', 'high', 'low', 'early',
  'late', 'next', 'last', 'first', 'second', 'third', 'whole', 'entire',
  'full', 'complete', 'total', 'overall', 'direct', 'indirect', 'rapid',
  'steady', 'sharp', 'clear', 'strong', 'powerful', 'effective', 'active',
  'responsible', 'available', 'limited', 'adequate', 'sufficient', 'growing',
  'increasing', 'ongoing', 'consistent', 'radical', 'unique', 'private',
  'public', 'national', 'local', 'rural', 'urban', 'modern', 'current',
  'recent', 'existing', 'skilled', 'educated', 'financial', 'social',
  'political', 'cultural', 'academic', 'professional', 'practical',
  'technical', 'industrial', 'agricultural', 'environmental', 'demographic',
  'successive', 'collective', 'underserved', 'remote', 'broad',
  // Adverbs
  'also', 'just', 'only', 'very', 'still', 'again', 'even', 'not', 'no',
  'here', 'there', 'now', 'then', 'often', 'always', 'never', 'sometimes',
  'usually', 'perhaps', 'likely', 'probably', 'certainly', 'clearly',
  'simply', 'merely', 'effectively', 'essentially', 'particularly',
  'especially', 'specifically', 'generally', 'typically', 'primarily',
  'largely', 'mainly', 'heavily', 'deeply', 'directly', 'steadily',
  'dramatically', 'increasingly', 'previously', 'further', 'furthermore',
  'moreover', 'therefore', 'thus', 'hence', 'however', 'nevertheless',
  'nonetheless', 'meanwhile', 'subsequently', 'consequently', 'additionally',
  'equally', 'besides', 'accordingly', 'overall',
  // Transition words/phrases
  'according', 'regarding', 'concerning', 'including', 'following', 'given',
  'based', 'rather', 'instead', 'answering', 'responding',
  // Commonly mis-capitalized mid-sentence words
  'spurious', 'dubious', 'specious', 'plausible', 'logical', 'causal',
  'correlational', 'coincidental', 'statistical', 'foundational', 'observational',
  'experimental', 'empirical', 'anecdotal', 'hypothetical', 'theoretical',
  'methodological', 'analytical', 'computational', 'quantitative', 'qualitative',
  'nominal', 'marginal', 'incremental', 'exponential', 'proportional',
  'tangential', 'peripheral', 'supplementary', 'complementary', 'preliminary',
  'dietary', 'nutritional', 'behavioral', 'cognitive', 'psychological',
  'physiological', 'biological', 'ecological', 'geographical', 'historical',
  'philosophical', 'sociological', 'anthropological', 'economic', 'fiscal',
  'monetary', 'legislative', 'judicial', 'constitutional', 'regulatory',
  // Commonly mis-capitalized domain words (from proper noun phrases)
  'health', 'women', 'crime', 'sustainable', 'violence', 'gender',
  'drugs', 'prevention', 'intervention', 'justice', 'enforcement',
  'organization', 'nations', 'development', 'goals', 'rights',
]);

/**
 * Detect if a line looks like a heading/title that should preserve capitalization.
 */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Markdown headings
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Numbered headings like "1." or "1.1" or "A."
  if (/^[\d]+[.):]\s/.test(trimmed) || /^[A-Za-z][.):]\s/.test(trimmed)) return true;
  // Roman numeral headings
  if (/^[IVXLCDM]+[.):]\s/i.test(trimmed)) return true;
  // Short lines without ending punctuation (typical heading)
  const words = trimmed.split(/\s+/);
  if (words.length <= 12 && !/[.!?:;]$/.test(trimmed)) return true;
  return false;
}

/**
 * Check if a word is an abbreviation, acronym, or known proper pattern.
 */
function isAbbreviationOrProper(word: string): boolean {
  const stripped = word.replace(/[^a-zA-Z&.''-]/g, '');
  if (!stripped) return false;
  if (ABBREVIATIONS.has(stripped)) return true;
  // All caps (2+ letters)
  if (stripped.length >= 2 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped)) return true;
  // Mixed case like "iPhone", "JavaScript", "McCoy"
  if (/[a-z][A-Z]/.test(stripped) || /^Mc[A-Z]/.test(stripped)) return true;
  // Dotted abbreviations like "U.S.", "e.g."
  if (/^([A-Za-z]\.){2,}$/.test(word)) return true;
  return false;
}

function isSimpleTitleCaseWord(word: string): boolean {
  const stripped = word.replace(/[^a-zA-Z'-]/g, '');
  if (!stripped) return false;
  return /^[A-Z][a-z]+(?:['-][A-Za-z]+)*$/.test(stripped);
}

const PROPER_NOUN_CONNECTORS = new Set([
  'on', 'and', 'of', 'for', 'the', 'in', 'at', 'to', 'de', 'la', 'le', 'du', 'des'
]);

const PROPER_NOUN_HINT_WORDS = new Set([
  'academy', 'agency', 'association', 'authority', 'bank', 'bureau', 'center',
  'centre', 'college', 'committee', 'commission', 'conference', 'council',
  'court', 'department', 'directorate', 'division', 'foundation', 'fund',
  'government', 'group', 'institute', 'ministry', 'office', 'organization',
  'programme', 'program', 'republic', 'school', 'society', 'states', 'union',
  'university'
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanEntityWord(word: string): string {
  return word.replace(/[^a-zA-Z'-]/g, '');
}

function normalizeExtractedPhrase(phrase: string): string {
  return phrase
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/g, '');
}

function getSignificantPhraseWords(phrase: string): string[] {
  return normalizeExtractedPhrase(phrase)
    .split(/\s+/)
    .map(cleanEntityWord)
    .filter(Boolean)
    .filter(word => !PROPER_NOUN_CONNECTORS.has(word.toLowerCase()));
}

function isAcronymWord(word: string): boolean {
  const stripped = word.replace(/[^A-Z0-9&/-]/g, '');
  return stripped.length >= 2 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped);
}

function buildFlexiblePhrasePattern(phrase: string): string {
  return normalizeExtractedPhrase(phrase)
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
}

function isCitationNamePhrase(phrase: string): boolean {
  const normalized = normalizeExtractedPhrase(phrase);
  if (!normalized) return false;

  return /^[A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)+$/.test(normalized)
    || /^[A-Z][a-z]+\s+et\s+al\.?$/i.test(normalized);
}

function isPhraseFollowedByAcronym(originalText: string, phrase: string): boolean {
  const normalized = normalizeExtractedPhrase(phrase);
  if (!normalized) return false;

  return new RegExp(`${buildFlexiblePhrasePattern(normalized)}\\s*\\([A-Z][A-Z0-9&/-]{2,}\\)`).test(originalText);
}

function extractCitationPhrases(originalText: string): string[] {
  const citations = new Set<string>();
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)+)(?=\s*\(\d{4}\))/g,
    /\b([A-Z][a-z]+\s+et\s+al\.?)(?=\s*\(\d{4}\))/gi,
  ];

  for (const pattern of patterns) {
    for (const match of originalText.matchAll(pattern)) {
      const phrase = normalizeExtractedPhrase(match[1] || '');
      if (phrase) citations.add(phrase);
    }
  }

  return [...citations];
}

function collectCapitalizedPhraseCandidates(originalText: string): string[] {
  const phrases: string[] = [];
  if (!originalText) return phrases;

  const paragraphs = originalText.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const lines = para.split(/\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (isHeadingLine(line)) continue;

      const sentences = line.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const words = sentence.split(/\s+/);
        if (words.length < 2) continue;

        let index = 0;
        while (index < words.length) {
          const isCapitalized = (word: string) => {
            const cleaned = cleanEntityWord(word);
            return cleaned.length > 0 && /^[A-Z]/.test(cleaned);
          };
          const isConnector = (word: string) => PROPER_NOUN_CONNECTORS.has(cleanEntityWord(word).toLowerCase());

          if (!isCapitalized(words[index])) {
            index++;
            continue;
          }

          const phraseWords = [words[index]];
          let nextIndex = index + 1;

          while (nextIndex < words.length) {
            if (isCapitalized(words[nextIndex])) {
              phraseWords.push(words[nextIndex]);
              nextIndex++;
              continue;
            }

            if (isConnector(words[nextIndex]) && nextIndex + 1 < words.length && isCapitalized(words[nextIndex + 1])) {
              phraseWords.push(words[nextIndex]);
              phraseWords.push(words[nextIndex + 1]);
              nextIndex += 2;
              continue;
            }

            break;
          }

          const capitalizedWordCount = phraseWords.filter(word => isCapitalized(word)).length;
          const firstWord = cleanEntityWord(phraseWords[0]);
          const firstIsAcronym = firstWord.length >= 2 && firstWord === firstWord.toUpperCase();

          if (capitalizedWordCount >= 2 && (index > 0 || firstIsAcronym || capitalizedWordCount >= 3)) {
            const phrase = normalizeExtractedPhrase(phraseWords.join(' '));
            if (phrase) phrases.push(phrase);
          }

          index = nextIndex;
        }
      }
    }
  }

  return [...new Set(phrases)];
}

function isHighConfidenceProperNounPhrase(
  phrase: string,
  anchorWords: Set<string>,
  originalText: string,
): boolean {
  const significantWords = getSignificantPhraseWords(phrase);
  if (significantWords.length < 2) return false;

  if (isCitationNamePhrase(phrase)) return true;
  if (isPhraseFollowedByAcronym(originalText, phrase)) return true;
  if (significantWords.some(word => isAcronymWord(word))) return true;
  if (significantWords.some(word => PROPER_NOUN_HINT_WORDS.has(word.toLowerCase()))) return true;
  if (significantWords.some(word => anchorWords.has(word.toLowerCase()))) return true;

  return false;
}

function getTokenCore(token: string): string {
  const lead = token.match(/^([^a-zA-Z0-9]*)/)?.[1] || '';
  const trail = token.match(/([^a-zA-Z0-9]*)$/)?.[1] || '';
  return token.slice(lead.length, token.length - (trail.length || 0));
}

function getNeighborToken(tokens: string[], startIndex: number, step: -1 | 1): string {
  for (let index = startIndex + step; index >= 0 && index < tokens.length; index += step) {
    const token = tokens[index];
    if (!token || /^\s+$/.test(token)) continue;
    return token;
  }
  return '';
}

/**
 * Extract only high-confidence proper-noun signals from the original text.
 * This intentionally rejects arbitrary title-cased input so contaminated source
 * text does not poison the cleanup pass.
 */
function extractProperNounSignals(originalText: string): ProperNounSignals {
  const properNouns = new Set<string>();
  const candidatePhrases = new Set<string>();
  if (!originalText) {
    return { properNouns, properPhrases: [] };
  }

  const placeOrPersonAnchors = new Set<string>();
  const doc = nlp(originalText);

  const addSingleWordCandidate = (word: string, anchor = false) => {
    const cleaned = cleanEntityWord(word);
    if (!cleaned || cleaned.length < 2) return;
    if (ALWAYS_LOWERCASE_MID_SENTENCE.has(cleaned.toLowerCase())) return;

    properNouns.add(cleaned);
    if (anchor) placeOrPersonAnchors.add(cleaned.toLowerCase());
  };

  const addEntityPhraseCandidate = (phrase: string, anchor = false) => {
    const normalized = normalizeExtractedPhrase(phrase);
    if (!normalized) return;

    const significantWords = getSignificantPhraseWords(normalized);
    if (significantWords.length === 0) return;

    if (significantWords.length === 1) {
      addSingleWordCandidate(significantWords[0], anchor);
      return;
    }

    candidatePhrases.add(normalized);

    if (anchor) {
      for (const word of significantWords) {
        placeOrPersonAnchors.add(word.toLowerCase());
      }
    }
  };

  for (const phrase of doc.people().out('array') as string[]) {
    addEntityPhraseCandidate(phrase, true);
  }

  for (const phrase of doc.places().out('array') as string[]) {
    addEntityPhraseCandidate(phrase, true);
  }

  for (const phrase of doc.organizations().out('array') as string[]) {
    addEntityPhraseCandidate(phrase);
  }

  for (const phrase of extractCitationPhrases(originalText)) {
    candidatePhrases.add(phrase);
  }

  for (const phrase of collectCapitalizedPhraseCandidates(originalText)) {
    candidatePhrases.add(phrase);
  }

  const properPhrases = [...candidatePhrases]
    .filter(phrase => isHighConfidenceProperNounPhrase(phrase, placeOrPersonAnchors, originalText))
    .sort((left, right) => right.length - left.length);

  return { properNouns, properPhrases };
}

/**
 * Fix mid-sentence capitalization across the entire text.
 * Ensures only proper nouns, acronyms, and sentence-initial words are capitalized.
 * Preserves heading/title lines exactly as they are.
 */
export function fixMidSentenceCapitalization(text: string, originalText?: string): string {
  if (!text || !text.trim()) return text;

  // Fix missing commas in parenthetical citations: (Author et al. YEAR) → (Author et al., YEAR)
  // Only adds the comma when one is not already present before the year.
  text = text.replace(/\(([^)]+?[^,\s])(\s+)(\d{4})\)/g, '($1, $3)');

  // Fix sentence-starting "Which" used as a determiner (not a relative pronoun)
  // "Which main goal is to guarantee safety" → "The main goal is to guarantee safety"
  // Only fires at sentence boundaries (after .!? or at text start), not mid-sentence relative clauses.
  text = text.replace(/([.!?]\s+)Which\b/g, '$1The');
  text = text.replace(/^Which\b/, 'The');

  // Fix missing article "The" before subject noun phrases that commonly lose it via LLM paraphrasing:
  // "Control model focuses on..." → "The control model focuses on..."
  // "Responsibility model..." → "The responsibility model..."
  // "Primary/Main goal is to..." → "The primary/main goal is to..."
  const ARTICLE_DROP_PATTERN = /([.!?]\s+|^)((?:Control|Responsibility|Consensual|Primary|Main|Key|Core|Initial|Final|Overall)\s+(?:model|goal|aim|purpose|objective|approach|framework|strategy|method)\s+(?:is|was|are|were|focuses|centers|highlights|emphasizes|operates|stresses|promotes|advances|requires|generates|props up|extends|advocates))/g;
  text = text.replace(ARTICLE_DROP_PATTERN, (_, prefix, phrase) => `${prefix}The ${phrase[0].toLowerCase()}${phrase.slice(1)}`);

  const { properNouns, properPhrases } = originalText
    ? extractProperNounSignals(originalText)
    : { properNouns: new Set<string>(), properPhrases: [] };

  // Also always preserve "I" as a word
  properNouns.add('I');

  // Process paragraph by paragraph
  const paragraphs = text.split(/(\n\s*\n)/);
  
  let result = paragraphs.map(segment => {
    // Preserve paragraph break whitespace
    if (/^\n\s*\n$/.test(segment)) return segment;
    if (!segment.trim()) return segment;

    // Process line by line within each paragraph
    const lines = segment.split(/(\n)/);
    return lines.map(line => {
      if (line === '\n') return line;
      if (!line.trim()) return line;

      // Skip heading lines - preserve their casing
      if (isHeadingLine(line)) return line;

      // Fix capitalization within this body-text line
      return fixLineCapitalization(line, properNouns);
    }).join('');
  }).join('');

  // Re-apply proper noun phrase capitalizations.
  // After lowercasing common words, multi-word proper names like
  // "World Health Organization" may have become "World health organization".
  // This step restores them.
  for (const phrase of properPhrases) {
    const regex = new RegExp(buildFlexiblePhrasePattern(phrase), 'gi');
    result = result.replace(regex, phrase);
  }

  return result;
}

/**
 * Fix capitalization within a single body-text line.
 */
function fixLineCapitalization(line: string, properNouns: Set<string>): string {
  // Split into sentences at . ! ? followed by space+uppercase
  // But also handle sentences starting at the beginning of the line
  const rawParts = line.split(/(?<=[.!?])\s+/);
  
  // Merge parts that were incorrectly split inside abbreviations (e.g. "D.C." → "D.C." + "has...")
  const parts: string[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i];
    // If previous part ends with abbreviation pattern (single uppercase letter + period),
    // and this part starts lowercase, it wasn't a real sentence boundary
    if (parts.length > 0 && /[A-Z]\.$/.test(parts[parts.length - 1]) && /^[a-z]/.test(p)) {
      parts[parts.length - 1] += ' ' + p;
    } else {
      parts.push(p);
    }
  }
  
  return parts.map((sentence) => {
    if (!sentence.trim()) return sentence;

    const tokens = sentence.split(/(\s+)/);
    let isFirstWord = true;

    return tokens.map((token, tokenIndex) => {
      // Preserve whitespace tokens
      if (/^\s+$/.test(token)) return token;

      // Split punctuation from core word
      const leadPunc = token.match(/^([^a-zA-Z0-9]*)/)?.[1] || '';
      const trailPunc = token.match(/([^a-zA-Z0-9]*)$/)?.[1] || '';
      const core = token.slice(leadPunc.length, token.length - (trailPunc.length || 0));

      if (!core || !/[a-zA-Z]/.test(core)) return token;

      // Always preserve abbreviations/acronyms
      if (isAbbreviationOrProper(core)) {
        isFirstWord = false;
        return token;
      }

      // Always preserve proper nouns from original text
      const properMatch = [...properNouns].find(pn => pn.toLowerCase() === core.toLowerCase());
      if (properMatch) {
        isFirstWord = false;
        return leadPunc + properMatch + trailPunc;
      }

      // Preserve "I" as standalone word
      if (core === 'I') {
        isFirstWord = false;
        return token;
      }

      // First word of sentence: capitalize first letter, lowercase rest
      if (isFirstWord) {
        isFirstWord = false;
        // Handle quoted starts like ("The → preserve quote, capitalize "the"
        if (core.length > 0) {
          const fixed = core[0].toUpperCase() + core.slice(1).toLowerCase();
          return leadPunc + fixed + trailPunc;
        }
        return token;
      }

      // Mid-sentence: lowercase if it's a common word
      isFirstWord = false;
      const lower = core.toLowerCase();
      if (ALWAYS_LOWERCASE_MID_SENTENCE.has(lower)) {
        return leadPunc + lower + trailPunc;
      }

      // Lower isolated Title Case words that were not protected above.
      // Genuine proper nouns from the original text are restored earlier,
      // and multi-word proper noun phrases are re-applied after line fixing.
      if (isSimpleTitleCaseWord(core)) {
        const prevToken = getNeighborToken(tokens, tokenIndex, -1).trim();
        const nextToken = getNeighborToken(tokens, tokenIndex, 1).trim();
        const prevCore = getTokenCore(prevToken).toLowerCase();
        const nextCore = getTokenCore(nextToken).toLowerCase();

        // Detect patterns where this title-case word is an author/proper noun:
        // - "Stojkovic & Lovell" (& connector)
        // - "Stojkovic et al." (et al.)
        // - "Stojkovic along with Lovell" (conjunction after proper noun)
        // - "Stojkovic plus Lovell" (plus as conjunction)
        // - "Stojkovic and Lovell" (and as conjunction between proper nouns)
        const isInlineNamePattern = prevToken === '&'
          || nextToken === '&'
          || nextCore === 'et'
          || prevCore === 'et'
          || nextCore === 'al'
          || prevCore === 'al'
          || prevCore === 'plus'
          || prevCore === 'along'
          || prevCore === 'alongside'
          || prevCore === 'together'
          || prevCore === 'and';

        if (isInlineNamePattern) {
          return token;
        }

        return leadPunc + lower + trailPunc;
      }

      // Preserve unusual mixed-case or symbol-bearing tokens.
      return token;
    }).join('');
  }).join(' ');
}

/**
 * Validate and repair humanized output in one step.
 */
export function validateAndRepairOutput(
  originalText: string,
  humanizedText: string,
  options: {
    allowWordChangeBound?: number;
    minSentenceWords?: number;
    autoRepair?: boolean; // Auto-repair if validation fails (default: true)
  } = {}
): {
  text: string;
  validation: ValidationResult;
  wasRepaired: boolean;
  repairs: string[];
} {
  const { autoRepair = true, ...validationOptions } = options;
  
  let finalText = humanizedText;
  let wasRepaired = false;
  let repairs: string[] = [];
  
  // ── STEP 1: Fix mid-sentence capitalization (always applied) ──
  const beforeCaps = finalText;
  finalText = fixMidSentenceCapitalization(finalText, originalText);
  if (finalText !== beforeCaps) {
    wasRepaired = true;
    repairs.push('Fixed mid-sentence capitalization');
  }
  
  // ── STEP 2: Validate sentence integrity ──
  let validation = validateHumanizedOutput(originalText, finalText, validationOptions);
  
  // ── STEP 3: If invalid and auto-repair enabled, attempt repair ──
  if (!validation.isValid && autoRepair) {
    const repairResult = repairHumanizedOutput(originalText, finalText);
    finalText = repairResult.repaired;
    repairs = repairResult.repairs;
    wasRepaired = repairs.length > 0;
    
    // Re-validate after repair
    validation = validateHumanizedOutput(originalText, finalText, validationOptions);
  }
  
  return {
    text: finalText,
    validation,
    wasRepaired,
    repairs,
  };
}
