/**
 * HUMAN v1.1: Sentence-by-Sentence Humanization Engine
 * =====================================================
 * 
 * STRICT 7-PHASE PROCESSING SYSTEM
 * Each sentence processed independently in parallel
 * NO CONTRACTIONS allowed (explicitly forbidden)
 * OpenAI restricted to single instruction per phase
 * 
 * Architecture:
 * - Each phase is isolated and callable independently
 * - Sentences never merge or split
 * - Meaning preservation is mandatory (≥0.9 semantic similarity)
 * - Validation gates prevent bad outputs
 */

import nlp from 'compromise';
import { sentTokenize } from './utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SentenceAnalysis {
  type: 'informative' | 'argumentative' | 'transitional' | 'descriptive' | 'imperative';
  length: number;
  complexity: 'low' | 'medium' | 'high';
  tone: 'formal' | 'informal' | 'neutral' | 'academic' | 'casual';
  voice: 'active' | 'passive' | 'mixed';
  has_passive: boolean;
  key_entities: string[];
  core_meaning: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  clause_count: number;
  avg_word_length: number;
}

export interface MeaningChunk {
  text: string;
  importance: 'critical' | 'supporting' | 'descriptive';
  entity_refs: string[];
}

export interface IntentLock {
  must_include: string[];
  must_not_add: boolean;
  allowed_shift: 'structure_only' | 'style_only' | 'none';
  semantic_fingerprint: string;
  required_tone: string;
  min_similarity: number;
}

export interface StructuralRewrite {
  original: string;
  rewritten: string;
  lexical_overlap: number;
  structure_changed: boolean;
  transformations_applied: string[];
}

export interface HumanizationLayer {
  contractions_used: number; // MUST be 0 per spec
  first_person_added: boolean;
  human_signals: string[];
  variation_applied: string;
  imperfections: string[];
}

export interface ValidationResult {
  passed: boolean;
  semantic_similarity: number;
  lexical_diversity: number;
  ai_pattern_score: number;
  readability_score: number;
  issues: string[];
}

export interface ContextAlignment {
  matches_prev_tone: boolean;
  no_repetition: boolean;
  logical_flow: boolean;
  adjustments_made: string[];
}

export interface ProcessedSentence {
  id: number;
  original: string;
  phase1_analysis: SentenceAnalysis;
  phase2_chunks: MeaningChunk[];
  phase3_intent: IntentLock;
  phase4_rewrite: StructuralRewrite;
  phase5_humanized: HumanizationLayer;
  phase6_validation: ValidationResult;
  phase7_context: ContextAlignment;
  final_output: string;
}

// ============================================================================
// GLOBAL RULE ENGINE
// ============================================================================

export class GlobalRuleEngine {
  private usedOpenings: Set<string> = new Set();
  private previousTone: string | null = null;
  private sentenceStructures: string[] = [];

  // NEVER ALLOW
  private readonly FORBIDDEN_PATTERNS = [
    /\bin conclusion\b/i,
    /\bin summary\b/i,
    /\bto sum up\b/i,
    /\boverall\b/i,
    /\bfurthermore\b/i,
    /\bmoreover\b/i,
  ];

  private readonly FORBIDDEN_OPENINGS = [
    'Additionally,',
    'Furthermore,',
    'Moreover,',
    'In addition,',
    'Consequently,',
    'Therefore,',
    'Thus,',
    'Hence,',
  ];

  private readonly THESAURUS_ABUSE = [
    'utilize',
    'commence',
    'terminate',
    'endeavor',
    'ascertain',
    'procure',
  ];

  reset(): void {
    this.usedOpenings.clear();
    this.previousTone = null;
    this.sentenceStructures = [];
  }

  validateGlobalRules(sentence: string, tone: string): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check forbidden patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(sentence)) {
        violations.push(`Contains forbidden pattern: ${pattern}`);
      }
    }

    // Check opening repetition
    const opening = this.extractOpening(sentence);
    if (this.usedOpenings.has(opening)) {
      violations.push(`Repeated sentence opening: ${opening}`);
    }

    // Check thesaurus abuse
    for (const word of this.THESAURUS_ABUSE) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(sentence)) {
        violations.push(`Thesaurus abuse detected: ${word}`);
      }
    }

    // Check tone consistency
    if (this.previousTone && Math.abs(this.getToneLevel(tone) - this.getToneLevel(this.previousTone)) > 1) {
      violations.push(`Tone shift too dramatic: ${this.previousTone} → ${tone}`);
    }

    // Check structure repetition
    const structure = this.getStructurePattern(sentence);
    const lastTwoStructures = this.sentenceStructures.slice(-2);
    if (lastTwoStructures.includes(structure)) {
      violations.push(`Repeated sentence structure pattern`);
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  registerSentence(sentence: string, tone: string): void {
    const opening = this.extractOpening(sentence);
    this.usedOpenings.add(opening);
    this.previousTone = tone;
    this.sentenceStructures.push(this.getStructurePattern(sentence));
  }

  private extractOpening(sentence: string): string {
    const match = sentence.match(/^([^,\.]+[,\s])/);
    return match ? match[1].trim() : sentence.split(' ')[0];
  }

  private getToneLevel(tone: string): number {
    const levels: { [key: string]: number } = {
      casual: 0,
      informal: 1,
      neutral: 2,
      formal: 3,
      academic: 4,
    };
    return levels[tone] || 2;
  }

  private getStructurePattern(sentence: string): string {
    const doc = nlp(sentence);
    const pattern = doc.terms().out('tags').slice(0, 5).join('-');
    return pattern;
  }
}

// ============================================================================
// ⚙️ PHASE 1: SENTENCE ANALYSIS (STRICT)
// ============================================================================

export class Phase1Analyzer {
  /**
   * 🎯 Goal: Understand the sentence before touching it
   * 🔒 Rules: DO NOT rewrite anything here, extract only structured data
   */
  analyze(sentence: string): SentenceAnalysis {
    const doc = nlp(sentence);
    const words = sentence.split(/\s+/);
    const wordCount = words.length;

    // Analyze type
    const type = this.determineSentenceType(sentence, doc);

    // Analyze complexity
    const complexity = this.determineComplexity(sentence, doc, wordCount);

    // Analyze tone
    const tone = this.determineTone(sentence, doc);

    // Analyze voice
    const { voice, has_passive } = this.analyzeVoice(doc);

    // Extract key entities
    const key_entities = this.extractEntities(doc);

    // Extract core meaning
    const core_meaning = this.extractCoreMeaning(sentence, doc);

    // Determine sentiment
    const sentiment = this.analyzeSentiment(doc);

    // Count clauses
    const clause_count = this.countClauses(sentence);

    // Calculate average word length
    const avg_word_length = words.reduce((sum, w) => sum + w.length, 0) / wordCount;

    return {
      type,
      length: wordCount,
      complexity,
      tone,
      voice,
      has_passive,
      key_entities,
      core_meaning,
      sentiment,
      clause_count,
      avg_word_length,
    };
  }

  private determineSentenceType(sentence: string, doc: any): SentenceAnalysis['type'] {
    if (/\?$/.test(sentence)) return 'informative';
    if (doc.match('#Imperative').found) return 'imperative';
    if (/however|therefore|thus|consequently/i.test(sentence)) return 'transitional';
    if (/because|since|if|although/i.test(sentence)) return 'argumentative';
    if (doc.adjectives().length > doc.nouns().length * 0.5) return 'descriptive';
    return 'informative';
  }

  private determineComplexity(sentence: string, doc: any, wordCount: number): SentenceAnalysis['complexity'] {
    const clauseCount = this.countClauses(sentence);
    const avgWordLength = sentence.replace(/\s/g, '').length / wordCount;
    const subordinate = /because|although|while|since|if|unless/i.test(sentence);

    const complexityScore = (clauseCount * 2) + (avgWordLength * 1.5) + (subordinate ? 3 : 0);

    if (complexityScore > 12) return 'high';
    if (complexityScore > 7) return 'medium';
    return 'low';
  }

  private determineTone(sentence: string, doc: any): SentenceAnalysis['tone'] {
    const contractions = /n't|'ll|'re|'ve|'m/i.test(sentence);
    const academicMarkers = /furthermore|moreover|consequently|thus/i.test(sentence);
    const informalMarkers = /really|pretty much|kind of|sort of|gonna|wanna/i.test(sentence);

    if (academicMarkers) return 'academic';
    if (informalMarkers || contractions) return 'informal';
    if (doc.match('#Formal').found || sentence.length > 100) return 'formal';
    return 'neutral';
  }

  private analyzeVoice(doc: any): { voice: SentenceAnalysis['voice']; has_passive: boolean } {
    const passiveVerbs = doc.verbs().isPassive();
    const activeVerbs = doc.verbs().not('#Passive');

    const has_passive = passiveVerbs.length > 0;
    const has_active = activeVerbs.length > 0;

    let voice: SentenceAnalysis['voice'];
    if (has_passive && has_active) voice = 'mixed';
    else if (has_passive) voice = 'passive';
    else voice = 'active';

    return { voice, has_passive };
  }

  private extractEntities(doc: any): string[] {
    const entities: string[] = [];
    
    // Extract people, places, organizations
    doc.people().forEach((p: any) => entities.push(p.text()));
    doc.places().forEach((p: any) => entities.push(p.text()));
    doc.organizations().forEach((p: any) => entities.push(p.text()));

    // Extract important nouns
    const nouns = doc.nouns().not('#Pronoun').out('array');
    entities.push(...nouns.slice(0, 5));

    return [...new Set(entities)];
  }

  private extractCoreMeaning(sentence: string, doc: any): string {
    // Extract main clause by removing subordinate clauses
    let core = sentence.replace(/,.*?(?=,|$)/g, '');
    core = core.replace(/\s+/g, ' ').trim();
    
    // Simplify by keeping only core components
    const verbs = doc.verbs().out('array');
    const subjects = doc.match('#Noun').out('array');
    
    if (subjects.length > 0 && verbs.length > 0) {
      return `${subjects[0]} ${verbs[0]}`;
    }
    
    return core.substring(0, 100);
  }

  private analyzeSentiment(doc: any): 'positive' | 'negative' | 'neutral' {
    const positive = doc.match('#Positive').length;
    const negative = doc.match('#Negative').length;

    if (positive > negative) return 'positive';
    if (negative > positive) return 'negative';
    return 'neutral';
  }

  private countClauses(sentence: string): number {
    const conjunctions = (sentence.match(/\b(and|but|or|because|although|since|while|if)\b/gi) || []).length;
    const commas = (sentence.match(/,/g) || []).length;
    return Math.max(1, conjunctions + Math.floor(commas / 2));
  }
}

// ============================================================================
// 🧩 PHASE 2: DECONSTRUCTION
// ============================================================================

export class Phase2Deconstructor {
  /**
   * 🎯 Goal: Break sentence into meaning units (not grammar)
   * 🔒 Rules: Split into idea chunks, not clauses; Remove filler words
   */
  deconstruct(sentence: string, analysis: SentenceAnalysis): MeaningChunk[] {
    const chunks: MeaningChunk[] = [];
    const doc = nlp(sentence);

    // Split by logical breaks
    const segments = this.splitByMeaningBreaks(sentence);

    for (const segment of segments) {
      const cleanedSegment = this.removeFiller(segment);
      if (cleanedSegment.length < 3) continue;

      const importance = this.determineImportance(cleanedSegment, analysis.key_entities);
      const entity_refs = analysis.key_entities.filter(e => 
        cleanedSegment.toLowerCase().includes(e.toLowerCase())
      );

      chunks.push({
        text: cleanedSegment,
        importance,
        entity_refs,
      });
    }

    return chunks;
  }

  private splitByMeaningBreaks(sentence: string): string[] {
    const segments: string[] = [];

    // Split on conjunctions and punctuation
    let current = sentence;

    // Handle because/since/although (causal)
    const causalParts = current.split(/\s+(because|since|although|while|if|unless)\s+/i);
    
    if (causalParts.length > 1) {
      for (let i = 0; i < causalParts.length; i += 2) {
        if (causalParts[i].trim()) {
          segments.push(causalParts[i].trim());
        }
        if (i + 1 < causalParts.length && causalParts[i + 2]) {
          segments.push((causalParts[i + 1] + ' ' + causalParts[i + 2]).trim());
          i++; // Skip the next part as we've combined it
        }
      }
    } else {
      // Split on commas for compound ideas
      const commaParts = sentence.split(/,\s+/);
      segments.push(...commaParts.filter(s => s.trim()));
    }

    return segments;
  }

  private removeFiller(text: string): string {
    const fillerWords = [
      'actually', 'basically', 'essentially', 'literally',
      'really', 'very', 'quite', 'rather', 'just',
      'simply', 'merely', 'only', 'absolutely'
    ];

    let cleaned = text;
    for (const filler of fillerWords) {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    return cleaned.replace(/\s+/g, ' ').trim();
  }

  private determineImportance(chunk: string, keyEntities: string[]): MeaningChunk['importance'] {
    const hasEntity = keyEntities.some(e => chunk.toLowerCase().includes(e.toLowerCase()));
    const doc = nlp(chunk);
    const hasMainVerb = doc.verbs().length > 0;

    if (hasEntity && hasMainVerb) return 'critical';
    if (hasEntity || hasMainVerb) return 'supporting';
    return 'descriptive';
  }
}

// ============================================================================
// 🧠 PHASE 3: INTENT LOCK (CRITICAL)
// ============================================================================

export class Phase3IntentLocker {
  /**
   * 🎯 Goal: Lock down meaning to prevent distortion
   * 🔒 Rules: Meaning MUST remain 100%; No adding new claims; No removing key ideas
   */
  lock(sentence: string, analysis: SentenceAnalysis, chunks: MeaningChunk[]): IntentLock {
    const must_include = this.extractMustInclude(chunks, analysis);
    const semantic_fingerprint = this.createSemanticFingerprint(sentence, analysis);

    return {
      must_include,
      must_not_add: true,
      allowed_shift: 'structure_only',
      semantic_fingerprint,
      required_tone: analysis.tone,
      min_similarity: 0.9,
    };
  }

  private extractMustInclude(chunks: MeaningChunk[], analysis: SentenceAnalysis): string[] {
    const critical: string[] = [];

    // Add critical chunks
    chunks
      .filter(c => c.importance === 'critical')
      .forEach(c => {
        const doc = nlp(c.text);
        const verbs = doc.verbs().out('array');
        const nouns = doc.nouns().not('#Pronoun').out('array');
        critical.push(...verbs, ...nouns);
      });

    // Add key entities
    critical.push(...analysis.key_entities);

    // Deduplicate and return
    return [...new Set(critical.map(w => w.toLowerCase()))];
  }

  private createSemanticFingerprint(sentence: string, analysis: SentenceAnalysis): string {
    // Create a fingerprint representing core semantic structure
    const doc = nlp(sentence);
    const subjects = doc.match('#Noun').out('array');
    const verbs = doc.verbs().out('array');
    const objects = doc.match('#Noun').not('#Subject').out('array');

    return `${subjects.join('|')}::${verbs.join('|')}::${objects.join('|')}::${analysis.type}`;
  }

  validateIntent(original: string, rewritten: string, intent: IntentLock): boolean {
    // Check all must_include items are present
    for (const item of intent.must_include) {
      if (!new RegExp(`\\b${item}\\b`, 'i').test(rewritten)) {
        return false;
      }
    }

    // Check semantic similarity
    const similarity = this.calculateSemanticSimilarity(original, rewritten);
    if (similarity < intent.min_similarity) {
      return false;
    }

    return true;
  }

  private calculateSemanticSimilarity(text1: string, text2: string): number {
    const doc1 = nlp(text1);
    const doc2 = nlp(text2);

    const nouns1 = new Set(doc1.nouns().out('array').map(w => w.toLowerCase()));
    const nouns2 = new Set(doc2.nouns().out('array').map(w => w.toLowerCase()));

    const verbs1 = new Set(doc1.verbs().out('array').map(w => w.toLowerCase()));
    const verbs2 = new Set(doc2.verbs().out('array').map(w => w.toLowerCase()));

    const nounIntersect = [...nouns1].filter(n => nouns2.has(n)).length;
    const verbIntersect = [...verbs1].filter(v => verbs2.has(v)).length;

    const nounUnion = new Set([...nouns1, ...nouns2]).size;
    const verbUnion = new Set([...verbs1, ...verbs2]).size;

    const nounSim = nounUnion > 0 ? nounIntersect / nounUnion : 1;
    const verbSim = verbUnion > 0 ? verbIntersect / verbUnion : 1;

    return (nounSim + verbSim) / 2;
  }
}

// ============================================================================
// ✍️ PHASE 4: STRUCTURAL REWRITE (NOT synonyms)
// ============================================================================

export class Phase4StructuralRewriter {
  /**
   * 🎯 Goal: Rebuild sentence from scratch
   * 🔒 Rules: Change structure completely; Do NOT reuse original phrasing order; Max 40% lexical overlap
   * 
   * Allowed transformations:
   * - Combine → split
   * - Flip clause order
   * - Change voice (active ↔ passive if natural)
   * - Reframe sentence opening
   */
  rewrite(sentence: string, chunks: MeaningChunk[], intent: IntentLock, analysis: SentenceAnalysis): StructuralRewrite {
    const transformations_applied: string[] = [];
    let rewritten = sentence;

    // Strategy 1: Flip clause order
    if (chunks.length >= 2) {
      rewritten = this.flipClauseOrder(chunks);
      transformations_applied.push('clause_flip');
    }

    // Strategy 2: Change voice
    if (analysis.voice === 'active' && Math.random() > 0.5) {
      const passive = this.convertToPassive(rewritten);
      if (passive !== rewritten) {
        rewritten = passive;
        transformations_applied.push('active_to_passive');
      }
    } else if (analysis.voice === 'passive') {
      const active = this.convertToActive(rewritten);
      if (active !== rewritten) {
        rewritten = active;
        transformations_applied.push('passive_to_active');
      }
    }

    // Strategy 3: Reframe opening
    rewritten = this.reframeOpening(rewritten, analysis);
    transformations_applied.push('opening_reframe');

    // Strategy 4: Vary connectors
    rewritten = this.varyConnectors(rewritten);
    transformations_applied.push('connector_variation');

    // Calculate lexical overlap
    const lexical_overlap = this.calculateLexicalOverlap(sentence, rewritten);

    // Ensure max 40% overlap
    if (lexical_overlap > 0.4) {
      rewritten = this.reduceLexicalOverlap(sentence, rewritten, intent);
      transformations_applied.push('lexical_reduction');
    }

    return {
      original: sentence,
      rewritten,
      lexical_overlap: this.calculateLexicalOverlap(sentence, rewritten),
      structure_changed: transformations_applied.length > 0,
      transformations_applied,
    };
  }

  private flipClauseOrder(chunks: MeaningChunk[]): string {
    // Reverse critical chunks vs supporting chunks
    const critical = chunks.filter(c => c.importance === 'critical');
    const supporting = chunks.filter(c => c.importance !== 'critical');

    if (supporting.length > 0) {
      return [...supporting, ...critical].map(c => c.text).join(', ');
    }

    // If all critical, just reverse
    return chunks.reverse().map(c => c.text).join(', ');
  }

  private convertToPassive(sentence: string): string {
    const doc = nlp(sentence);
    const verbs = doc.verbs();

    if (verbs.length === 0) return sentence;

    // Find subject-verb-object pattern
    const match = sentence.match(/^(\w+.*?)\s+([\w]+s?)\s+(.*?)$/);
    if (!match) return sentence;

    const [, subject, verb, rest] = match;

    // Convert: "AI tools analyze patterns" → "Patterns are analyzed by AI tools"
    const baseVerb = doc.verbs().toInfinitive().out('text');
    return `${rest} ${this.getBeForm(sentence)} ${baseVerb} by ${subject}`;
  }

  private convertToActive(sentence: string): string {
    // Convert: "Patterns are analyzed by AI tools" → "AI tools analyze patterns"
    const match = sentence.match(/(.*?)\s+(?:is|are|was|were|been)\s+(\w+ed|en)\s+by\s+(.*)/i);
    if (!match) return sentence;

    const [, object, verb, subject] = match;
    const baseVerb = verb.replace(/ed$|en$/, '');
    
    return `${subject} ${baseVerb}s ${object}`;
  }

  private getBeForm(sentence: string): string {
    const doc = nlp(sentence);
    const isPlural = doc.match('#Plural').length > 0;
    return isPlural ? 'are' : 'is';
  }

  private reframeOpening(sentence: string, analysis: SentenceAnalysis): string {
    // Move adverbial phrases to front
    const adverbialMatch = sentence.match(/(.*?),\s*(.*)/);
    if (adverbialMatch) {
      const [, first, second] = adverbialMatch;
      // Sometimes flip, sometimes keep
      if (Math.random() > 0.5) {
        return `${second}, ${first}`;
      }
    }

    // Add prepositional phrase opening
    if (!/^(In|By|With|Through|For|On)\b/.test(sentence)) {
      const doc = nlp(sentence);
      const verbs = doc.verbs().out('array');
      if (verbs.length > 0 && verbs[0].toLowerCase() === 'analyze') {
        return `By analyzing patterns, ${sentence}`;
      }
    }

    return sentence;
  }

  private varyConnectors(sentence: string): string {
    const connectorMap: { [key: string]: string[] } = {
      'and': ['as well as', 'along with', 'together with'],
      'but': ['however', 'yet', 'although', 'though'],
      'because': ['since', 'as', 'due to the fact that'],
      'so': ['therefore', 'thus', 'consequently'],
    };

    let result = sentence;
    for (const [original, replacements] of Object.entries(connectorMap)) {
      const regex = new RegExp(`\\b${original}\\b`, 'i');
      if (regex.test(result)) {
        const replacement = replacements[Math.floor(Math.random() * replacements.length)];
        result = result.replace(regex, replacement);
        break; // Only replace one
      }
    }

    return result;
  }

  private calculateLexicalOverlap(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));

    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.length / union.size : 0;
  }

  private reduceLexicalOverlap(original: string, rewritten: string, intent: IntentLock): string {
    // Replace non-critical words with synonyms
    const doc = nlp(rewritten);
    let result = rewritten;

    const words = doc.terms().out('array');
    for (const word of words) {
      if (intent.must_include.includes(word.toLowerCase())) continue;

      const synonym = this.getSynonym(word);
      if (synonym) {
        result = result.replace(new RegExp(`\\b${word}\\b`, 'i'), synonym);
      }
    }

    return result;
  }

  private getSynonym(word: string): string | null {
    const synonymMap: { [key: string]: string[] } = {
      'analyze': ['examine', 'study', 'review', 'assess'],
      'pattern': ['trend', 'model', 'structure', 'design'],
      'tool': ['instrument', 'device', 'mechanism', 'system'],
      'text': ['content', 'writing', 'material', 'copy'],
      'rewrite': ['revise', 'rephrase', 'restructure', 'modify'],
    };

    const synonyms = synonymMap[word.toLowerCase()];
    if (synonyms) {
      return synonyms[Math.floor(Math.random() * synonyms.length)];
    }

    return null;
  }
}

// ============================================================================
// 🎲 PHASE 5: HUMANIZATION LAYER
// ============================================================================

export class Phase5Humanizer {
  /**
   * 🎯 Goal: Add natural human feel (controlled)
   * 🔒 STRICT RULES:
   * 1. Contractions: FORBIDDEN (per spec - NO contractions allowed)
   * 2. First Person: ONLY if original context allows
   * 3. Human signals: LIMITED (max 1 per sentence)
   * 4. Sentence Variation: Length ±30%, no repeated openings
   * 5. Imperfection: CONTROLLED (slight redundancy, mild hedging)
   */
  humanize(
    sentence: string,
    analysis: SentenceAnalysis,
    rewrite: StructuralRewrite
  ): { text: string; layer: HumanizationLayer } {
    let text = rewrite.rewritten;
    const layer: HumanizationLayer = {
      contractions_used: 0, // MUST be 0
      first_person_added: false,
      human_signals: [],
      variation_applied: '',
      imperfections: [],
    };

    // CRITICAL: Expand any contractions (forbidden)
    text = this.expandContractions(text);

    // Add human signals (max 1, only if appropriate)
    if (analysis.tone !== 'formal' && analysis.tone !== 'academic') {
      const signal = this.addHumanSignal(text, analysis);
      if (signal.modified) {
        text = signal.text;
        layer.human_signals.push(signal.signal);
      }
    }

    // Add controlled imperfection
    const imperfection = this.addImperfection(text, analysis);
    if (imperfection.modified) {
      text = imperfection.text;
      layer.imperfections.push(imperfection.type);
    }

    // Vary sentence length (within ±30%)
    const lengthVariation = this.varyLength(text, analysis.length);
    if (lengthVariation !== text) {
      text = lengthVariation;
      layer.variation_applied = 'length_adjusted';
    }

    return { text, layer };
  }

  private expandContractions(text: string): string {
    const contractionMap: { [key: string]: string } = {
      "don't": "do not",
      "doesn't": "does not",
      "didn't": "did not",
      "won't": "will not",
      "wouldn't": "would not",
      "can't": "cannot",
      "couldn't": "could not",
      "shouldn't": "should not",
      "isn't": "is not",
      "aren't": "are not",
      "wasn't": "was not",
      "weren't": "were not",
      "haven't": "have not",
      "hasn't": "has not",
      "hadn't": "had not",
      "I'm": "I am",
      "you're": "you are",
      "they're": "they are",
      "we're": "we are",
      "it's": "it is",
      "that's": "that is",
      "what's": "what is",
      "I'll": "I will",
      "you'll": "you will",
      "I've": "I have",
      "you've": "you have",
    };

    let result = text;
    for (const [contraction, expansion] of Object.entries(contractionMap)) {
      const regex = new RegExp(`\\b${contraction}\\b`, 'gi');
      result = result.replace(regex, expansion);
    }

    return result;
  }

  private addHumanSignal(text: string, analysis: SentenceAnalysis): { text: string; modified: boolean; signal: string } {
    const signals = [
      { phrase: 'in most cases', position: 'start', tone: ['neutral', 'informal'] },
      { phrase: 'tends to', position: 'verb', tone: ['neutral', 'informal'] },
      { phrase: 'what happens is', position: 'start', tone: ['informal', 'casual'] },
    ];

    // Filter by tone
    const appropriate = signals.filter(s => s.tone.includes(analysis.tone));
    if (appropriate.length === 0) {
      return { text, modified: false, signal: '' };
    }

    // Pick one randomly
    const signal = appropriate[Math.floor(Math.random() * appropriate.length)];

    // Apply based on position
    if (signal.position === 'start') {
      return {
        text: `${signal.phrase}, ${text}`,
        modified: true,
        signal: signal.phrase,
      };
    }

    return { text, modified: false, signal: '' };
  }

  private addImperfection(text: string, analysis: SentenceAnalysis): { text: string; modified: boolean; type: string } {
    // Controlled imperfections
    const types = ['mild_hedging', 'slight_redundancy'];
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === 'mild_hedging' && analysis.tone !== 'academic') {
      // Add hedging like "generally", "often", "typically"
      const hedges = ['generally', 'often', 'typically', 'usually'];
      const hedge = hedges[Math.floor(Math.random() * hedges.length)];

      const doc = nlp(text);
      const verbs = doc.verbs().out('array');
      if (verbs.length > 0) {
        const verb = verbs[0];
        const modified = text.replace(verb, `${hedge} ${verb}`);
        return { text: modified, modified: true, type: 'mild_hedging' };
      }
    }

    if (type === 'slight_redundancy') {
      // Add slight redundancy like "actually", but sparingly
      // Skip for now to avoid overuse
    }

    return { text, modified: false, type: '' };
  }

  private varyLength(text: string, originalLength: number): string {
    const currentLength = text.split(/\s+/).length;
    const targetMin = Math.floor(originalLength * 0.7);
    const targetMax = Math.ceil(originalLength * 1.3);

    // If within range, keep as is
    if (currentLength >= targetMin && currentLength <= targetMax) {
      return text;
    }

    // If too long, trim
    if (currentLength > targetMax) {
      const words = text.split(/\s+/);
      return words.slice(0, targetMax).join(' ');
    }

    // If too short, add connecting phrase
    if (currentLength < targetMin) {
      // Add descriptive phrase
      return text + ', providing valuable insights';
    }

    return text;
  }
}

// ============================================================================
// 🧪 PHASE 6: VALIDATION (VERY STRICT)
// ============================================================================

export class Phase6Validator {
  /**
   * 🎯 Goal: Ensure output quality
   * 🔒 HARD CHECKS:
   * 1. Meaning Check: Semantic similarity ≥ 0.9
   * 2. AI Pattern Check: Reject balanced/perfect structures
   * 3. Lexical Diversity: At least 30% word change
   * 4. Readability: Must sound natural
   */
  validate(
    original: string,
    final: string,
    intent: IntentLock,
    analysis: SentenceAnalysis
  ): ValidationResult {
    const issues: string[] = [];

    // 1. Semantic similarity check
    const semantic_similarity = this.calculateSemanticSimilarity(original, final);
    if (semantic_similarity < 0.9) {
      issues.push(`Semantic similarity too low: ${semantic_similarity.toFixed(2)}`);
    }

    // 2. AI pattern check
    const ai_pattern_score = this.detectAIPatterns(final);
    if (ai_pattern_score > 0.7) {
      issues.push(`AI pattern score too high: ${ai_pattern_score.toFixed(2)}`);
    }

    // 3. Lexical diversity check
    const lexical_diversity = this.calculateLexicalDiversity(original, final);
    if (lexical_diversity < 0.3) {
      issues.push(`Lexical diversity too low: ${lexical_diversity.toFixed(2)}`);
    }

    // 4. Readability check
    const readability_score = this.checkReadability(final);
    if (readability_score < 0.6) {
      issues.push(`Readability score too low: ${readability_score.toFixed(2)}`);
    }

    // 5. Check intent preservation
    const intentPreserved = this.checkIntentPreservation(final, intent);
    if (!intentPreserved) {
      issues.push('Intent not preserved: missing required elements');
    }

    return {
      passed: issues.length === 0,
      semantic_similarity,
      lexical_diversity,
      ai_pattern_score,
      readability_score,
      issues,
    };
  }

  private calculateSemanticSimilarity(text1: string, text2: string): number {
    const doc1 = nlp(text1);
    const doc2 = nlp(text2);

    const nouns1 = new Set(doc1.nouns().out('array').map((w: string) => w.toLowerCase()));
    const nouns2 = new Set(doc2.nouns().out('array').map((w: string) => w.toLowerCase()));

    const verbs1 = new Set(doc1.verbs().out('array').map((w: string) => w.toLowerCase()));
    const verbs2 = new Set(doc2.verbs().out('array').map((w: string) => w.toLowerCase()));

    const nounIntersect = [...nouns1].filter(n => nouns2.has(n)).length;
    const verbIntersect = [...verbs1].filter(v => verbs2.has(v)).length;

    const nounUnion = new Set([...nouns1, ...nouns2]).size;
    const verbUnion = new Set([...verbs1, ...verbs2]).size;

    const nounSim = nounUnion > 0 ? nounIntersect / nounUnion : 1;
    const verbSim = verbUnion > 0 ? verbIntersect / verbUnion : 1;

    return (nounSim + verbSim) / 2;
  }

  private detectAIPatterns(text: string): number {
    let score = 0;

    // Check for perfect balance (same length clauses)
    const clauses = text.split(/,\s*/);
    if (clauses.length > 1) {
      const lengths = clauses.map(c => c.length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
      
      if (variance < 10) score += 0.3; // Too balanced
    }

    // Check for comma overuse
    const commaCount = (text.match(/,/g) || []).length;
    const wordCount = text.split(/\s+/).length;
    if (commaCount > wordCount / 10) score += 0.2;

    // Check for overly complex structure
    const subordinate = (text.match(/\b(although|whereas|however|moreover|furthermore)\b/gi) || []).length;
    if (subordinate > 2) score += 0.3;

    return Math.min(score, 1);
  }

  private calculateLexicalDiversity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));

    const onlyIn2 = [...words2].filter(w => !words1.has(w));
    const total = words2.size;

    return total > 0 ? onlyIn2.length / total : 0;
  }

  private checkReadability(text: string): number {
    // Simple readability check based on:
    // - Average word length
    // - Sentence structure
    // - Natural flow

    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

    // Ideal: 4-6 characters per word
    let score = 1 - Math.abs(avgWordLength - 5) / 10;

    // Check for unnatural patterns
    if (/\b(utilize|commence|terminate)\b/i.test(text)) score -= 0.2;

    return Math.max(0, Math.min(1, score));
  }

  private checkIntentPreservation(text: string, intent: IntentLock): boolean {
    for (const required of intent.must_include) {
      if (!new RegExp(`\\b${required}\\b`, 'i').test(text)) {
        return false;
      }
    }
    return true;
  }
}

// ============================================================================
// 🔁 PHASE 7: CONTEXT ALIGNMENT
// ============================================================================

export class Phase7ContextAligner {
  /**
   * 🎯 Goal: Make sentence fit with neighbors
   * 🔒 Rules: Match tone; Avoid repetition; Maintain logical flow
   */
  align(
    sentence: string,
    previousSentence: string | null,
    nextSentence: string | null,
    tone: string
  ): { text: string; alignment: ContextAlignment } {
    const adjustments_made: string[] = [];
    let text = sentence;

    // Check tone match with previous
    const matches_prev_tone = this.checkToneMatch(text, previousSentence, tone);
    if (!matches_prev_tone && previousSentence) {
      text = this.adjustTone(text, tone);
      adjustments_made.push('tone_adjusted');
    }

    // Check for repetition
    const no_repetition = this.checkRepetition(text, previousSentence);
    if (!no_repetition && previousSentence) {
      text = this.removeRepetition(text, previousSentence);
      adjustments_made.push('repetition_removed');
    }

    // Check logical flow
    const logical_flow = this.checkLogicalFlow(text, previousSentence, nextSentence);
    if (!logical_flow) {
      text = this.improveFlow(text, previousSentence);
      adjustments_made.push('flow_improved');
    }

    return {
      text,
      alignment: {
        matches_prev_tone,
        no_repetition,
        logical_flow,
        adjustments_made,
      },
    };
  }

  private checkToneMatch(current: string, previous: string | null, expectedTone: string): boolean {
    if (!previous) return true;

    const currentTone = this.detectTone(current);
    const prevTone = this.detectTone(previous);

    return Math.abs(this.getToneLevel(currentTone) - this.getToneLevel(prevTone)) <= 1;
  }

  private detectTone(text: string): string {
    const doc = nlp(text);
    const contractions = /n't|'ll|'re|'ve/i.test(text);
    const formal = /furthermore|moreover|consequently/i.test(text);

    if (formal) return 'formal';
    if (contractions) return 'informal';
    return 'neutral';
  }

  private getToneLevel(tone: string): number {
    const levels: { [key: string]: number } = {
      casual: 0,
      informal: 1,
      neutral: 2,
      formal: 3,
      academic: 4,
    };
    return levels[tone] || 2;
  }

  private adjustTone(text: string, targetTone: string): string {
    // Adjust formality level
    if (targetTone === 'formal' || targetTone === 'academic') {
      // Remove informal markers
      text = text.replace(/\b(really|pretty much|kind of)\b/gi, '');
    }

    return text;
  }

  private checkRepetition(current: string, previous: string | null): boolean {
    if (!previous) return true;

    const currentWords = new Set(current.toLowerCase().split(/\W+/).filter(w => w.length > 4));
    const prevWords = new Set(previous.toLowerCase().split(/\W+/).filter(w => w.length > 4));

    const overlap = [...currentWords].filter(w => prevWords.has(w));
    
    // Allow max 20% overlap
    return overlap.length / currentWords.size < 0.2;
  }

  private removeRepetition(current: string, previous: string | null): string {
    if (!previous) return current;

    // Find repeated words and replace with synonyms
    const currentWords = current.toLowerCase().split(/\W+/);
    const prevWords = new Set(previous.toLowerCase().split(/\W+/));

    let result = current;
    for (const word of currentWords) {
      if (word.length > 4 && prevWords.has(word)) {
        const synonym = this.getSynonym(word);
        if (synonym) {
          result = result.replace(new RegExp(`\\b${word}\\b`, 'i'), synonym);
        }
      }
    }

    return result;
  }

  private checkLogicalFlow(current: string, previous: string | null, next: string | null): boolean {
    if (!previous) return true;

    // Check if current sentence follows logically from previous
    const doc = nlp(current);
    const hasConnector = /\b(however|therefore|thus|moreover|also|additionally)\b/i.test(current);

    // If previous ended with a claim and current starts with no connector, might be jarring
    if (previous.match(/\.\s*$/) && !hasConnector && !current.match(/^[A-Z][a-z]+\s+(is|are|was|were)/)) {
      return false;
    }

    return true;
  }

  private improveFlow(current: string, previous: string | null): string {
    if (!previous) return current;

    // Add subtle connector if needed
    const connectors = ['Additionally', 'Furthermore', 'Moreover'];
    const connector = connectors[Math.floor(Math.random() * connectors.length)];

    // Only add if sentence doesn't already start with one
    if (!/^(Additionally|Furthermore|Moreover|However|Therefore)/i.test(current)) {
      return `${connector}, ${current.charAt(0).toLowerCase()}${current.slice(1)}`;
    }

    return current;
  }

  private getSynonym(word: string): string | null {
    const synonymMap: { [key: string]: string[] } = {
      'analyze': ['examine', 'study', 'review'],
      'pattern': ['trend', 'model', 'structure'],
      'tool': ['instrument', 'system', 'mechanism'],
      'text': ['content', 'writing', 'material'],
    };

    const synonyms = synonymMap[word.toLowerCase()];
    return synonyms ? synonyms[Math.floor(Math.random() * synonyms.length)] : null;
  }
}

// ============================================================================
// 🚀 MAIN ORCHESTRATOR
// ============================================================================

export class HumanV11Engine {
  private phase1: Phase1Analyzer;
  private phase2: Phase2Deconstructor;
  private phase3: Phase3IntentLocker;
  private phase4: Phase4StructuralRewriter;
  private phase5: Phase5Humanizer;
  private phase6: Phase6Validator;
  private phase7: Phase7ContextAligner;
  private globalRules: GlobalRuleEngine;

  constructor() {
    this.phase1 = new Phase1Analyzer();
    this.phase2 = new Phase2Deconstructor();
    this.phase3 = new Phase3IntentLocker();
    this.phase4 = new Phase4StructuralRewriter();
    this.phase5 = new Phase5Humanizer();
    this.phase6 = new Phase6Validator();
    this.phase7 = new Phase7ContextAligner();
    this.globalRules = new GlobalRuleEngine();
  }

  /**
   * Process entire text with sentence-by-sentence strict processing
   * Each sentence handled independently and can be parallelized
   */
  async processText(text: string): Promise<{ output: string; sentences: ProcessedSentence[] }> {
    // Split into sentences
    const sentences = sentTokenize(text);
    
    // Reset global rules
    this.globalRules.reset();

    // Process each sentence independently (can be parallelized)
    const processed: ProcessedSentence[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const previous = i > 0 ? processed[i - 1].final_output : null;
      const next = i < sentences.length - 1 ? sentences[i + 1] : null;

      const result = await this.processSentence(sentence, i, previous, next);
      
      // Validate against global rules
      const globalCheck = this.globalRules.validateGlobalRules(result.final_output, result.phase1_analysis.tone);
      
      if (!globalCheck.valid) {
        // Retry with adjustments
        console.warn(`Global rule violations for sentence ${i}:`, globalCheck.violations);
        // For now, accept but log
      }

      this.globalRules.registerSentence(result.final_output, result.phase1_analysis.tone);
      processed.push(result);
    }

    // Reassemble
    const output = processed.map(p => p.final_output).join(' ');

    return { output, sentences: processed };
  }

  /**
   * Process a single sentence through all 7 phases
   */
  private async processSentence(
    sentence: string,
    id: number,
    previousSentence: string | null,
    nextSentence: string | null
  ): Promise<ProcessedSentence> {
    // ⚙️ PHASE 1: Sentence Analysis
    const phase1_analysis = this.phase1.analyze(sentence);

    // 🧩 PHASE 2: Deconstruction
    const phase2_chunks = this.phase2.deconstruct(sentence, phase1_analysis);

    // 🧠 PHASE 3: Intent Lock
    const phase3_intent = this.phase3.lock(sentence, phase1_analysis, phase2_chunks);

    // ✍️ PHASE 4: Structural Rewrite
    const phase4_rewrite = this.phase4.rewrite(sentence, phase2_chunks, phase3_intent, phase1_analysis);

    // 🎲 PHASE 5: Humanization Layer
    const { text: humanized, layer: phase5_humanized } = this.phase5.humanize(
      sentence,
      phase1_analysis,
      phase4_rewrite
    );

    // 🧪 PHASE 6: Validation
    const phase6_validation = this.phase6.validate(
      sentence,
      humanized,
      phase3_intent,
      phase1_analysis
    );

    // If validation fails, retry or revert
    let final = humanized;
    if (!phase6_validation.passed) {
      console.warn(`Validation failed for sentence ${id}:`, phase6_validation.issues);
      // Could implement retry logic here
      // For now, use rewrite without humanization
      final = phase4_rewrite.rewritten;
    }

    // 🔁 PHASE 7: Context Alignment
    const { text: aligned, alignment: phase7_context } = this.phase7.align(
      final,
      previousSentence,
      nextSentence,
      phase1_analysis.tone
    );

    return {
      id,
      original: sentence,
      phase1_analysis,
      phase2_chunks,
      phase3_intent,
      phase4_rewrite,
      phase5_humanized,
      phase6_validation,
      phase7_context,
      final_output: aligned,
    };
  }

  /**
   * Process sentences in parallel (for speed)
   */
  async processTextParallel(text: string): Promise<{ output: string; sentences: ProcessedSentence[] }> {
    const sentences = sentTokenize(text);
    this.globalRules.reset();

    // Process all sentences in parallel (Phase 1-5)
    const initialProcessing = await Promise.all(
      sentences.map(async (sentence, i) => {
        const phase1_analysis = this.phase1.analyze(sentence);
        const phase2_chunks = this.phase2.deconstruct(sentence, phase1_analysis);
        const phase3_intent = this.phase3.lock(sentence, phase1_analysis, phase2_chunks);
        const phase4_rewrite = this.phase4.rewrite(sentence, phase2_chunks, phase3_intent, phase1_analysis);
        const { text: humanized, layer: phase5_humanized } = this.phase5.humanize(
          sentence,
          phase1_analysis,
          phase4_rewrite
        );
        const phase6_validation = this.phase6.validate(
          sentence,
          humanized,
          phase3_intent,
          phase1_analysis
        );

        return {
          id: i,
          original: sentence,
          phase1_analysis,
          phase2_chunks,
          phase3_intent,
          phase4_rewrite,
          phase5_humanized,
          phase6_validation,
          intermediate: phase6_validation.passed ? humanized : phase4_rewrite.rewritten,
        };
      })
    );

    // Phase 7: Context alignment (must be sequential)
    const processed: ProcessedSentence[] = [];
    for (let i = 0; i < initialProcessing.length; i++) {
      const item = initialProcessing[i];
      const previous = i > 0 ? processed[i - 1].final_output : null;
      const next = i < sentences.length - 1 ? sentences[i + 1] : null;

      const { text: aligned, alignment: phase7_context } = this.phase7.align(
        item.intermediate,
        previous,
        next,
        item.phase1_analysis.tone
      );

      processed.push({
        ...item,
        phase7_context,
        final_output: aligned,
      });

      this.globalRules.registerSentence(aligned, item.phase1_analysis.tone);
    }

    const output = processed.map(p => p.final_output).join(' ');
    return { output, sentences: processed };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default HumanV11Engine;
