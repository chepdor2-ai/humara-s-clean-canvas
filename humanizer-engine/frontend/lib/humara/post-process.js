/**
 * Humara Post-Processing — Enhancement layer from v2 engine
 * 
 * Provides three quality layers that wrap the v5 pipeline:
 * 1. ContentProtection (pre-processing) — shield sensitive content before humanization
 * 2. Grammar Repair (post-processing) — fix artifacts from word/phrase replacement
 * 3. Coherence (post-processing) — fix repetitive starters, dedup, transition variation
 */

// ═══════════════════════════════════════════════════════════════════
// CONTENT PROTECTION — Pre-processing
// Shields citations, brackets, formulas, emails, URLs, amounts, etc.
// ═══════════════════════════════════════════════════════════════════

const PROT_PREFIX = '\u27E6p';
const PROT_SUFFIX = '\u27E7';

function makePlaceholder(index) {
  return `${PROT_PREFIX}${index}${PROT_SUFFIX}`;  // produces ⟦p0⟧, ⟦p1⟧, etc.
}

/**
 * Protect sensitive content before humanization.
 * Returns { sanitized, map } where map is used to restore later.
 */
export function protectContent(text) {
  const map = [];
  let sanitized = text;
  let idx = 0;

  function protect(pattern) {
    sanitized = sanitized.replace(pattern, (match) => {
      const placeholder = makePlaceholder(idx);
      map.push({ placeholder, original: match });
      idx++;
      return placeholder;
    });
  }

  // Order matters: protect larger/more specific patterns first

  // 1. Citations: (Author et al., YYYY), (Author, YYYY), (Author, n.d.)
  protect(/\([A-Z][a-zA-Z]*(?:\s+(?:et\s+al\.|&\s+[A-Z][a-zA-Z]*))*,\s*(?:\d{4}[a-z]?|n\.d\.)\)/g);

  // 2. Bracketed content: [Client Name], [Appendix A], [Figure 1]
  protect(/\[[^\]]+\]/g);

  // 3. Quoted strings: "exact phrase"
  protect(/"[^"]{2,}"/g);

  // 4. Mathematical formulas with superscripts/subscripts
  protect(/[A-Za-z0-9]+[\u00B2\u00B3\u2074-\u2079\u2080-\u2089]+(?:\s*[+\-\u00D7\u00F7=]\s*[A-Za-z0-9\u00B2\u00B3\u2074-\u2079\u2080-\u2089]+)*/g);

  // 4a. Hypothesis notation: H₀, H₁, H₀₁, etc.
  protect(/[A-Za-z][\u2080-\u2089]+/g);

  // 5. Email addresses
  protect(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);

  // 6. URLs
  protect(/https?:\/\/[^\s,)]+/g);

  // 7. Dollar amounts: $500,000, $3,500.00
  protect(/\$[\d,]+(?:\.\d+)?/g);

  // 8. Percentages: 20%, 6.5%
  protect(/\d+(?:\.\d+)?%/g);

  // 9. Decimal numbers: 3.14, 5.56
  protect(/\b\d+\.\d+\b/g);

  // 9a. Statistical p-values: p < .05, p less than .05
  protect(/\bp\s+less\s+than\s+\.?\d+/g);

  // 10. Large numbers with commas: 100,000
  protect(/\b\d{1,3}(?:,\d{3})+\b/g);

  // 11. Ordinals: 1st, 2nd, 3rd
  protect(/\b\d+(?:st|nd|rd|th)\b/gi);

  // 12. Dates: Q1 2024, standalone years
  protect(/\b(?:Q[1-4]\s+)?\d{4}\b(?=\s*[),.\s])/g);

  // 13. Abbreviations: GDP, WHO, AI, USA (2+ uppercase)
  protect(/\b[A-Z]{2,}\b/g);

  // 14. Significant standalone numbers (2+ digits)
  protect(/\b\d{2,}\b/g);

  return { sanitized, map };
}

/**
 * Restore all protected content from placeholders.
 */
export function restoreContent(text, map) {
  let restored = text;
  // Restore in reverse order for nested protections
  for (let i = map.length - 1; i >= 0; i--) {
    const { placeholder, original } = map[i];
    const idx = restored.indexOf(placeholder);
    if (idx !== -1) {
      restored = restored.substring(0, idx) + original + restored.substring(idx + placeholder.length);
    }
  }
  return restored;
}


// ═══════════════════════════════════════════════════════════════════
// GRAMMAR REPAIR — Post-processing
// Fixes common artifacts from phrase/word replacement
// ═══════════════════════════════════════════════════════════════════

/**
 * Repair grammar issues introduced by word/phrase replacement.
 */
export function repairGrammar(text) {
  let output = text;

  // ── Collocation repairs ──────────────────────────────────────────

  // Fix "plays a [adj] purpose" → "plays a [adj] role" (purpose doesn't collocate with "play")
  output = output.replace(/\bplays?\s+a\s+(\w+)\s+purpose\b/gi,
    (match, adj) => match.replace(/purpose$/i, 'role')
  );

  // Fix "plays a [adj] capacity" → "plays a [adj] role"
  output = output.replace(/\bplays?\s+a\s+(\w+)\s+capacity\b/gi,
    (match, adj) => match.replace(/capacity$/i, 'role')
  );

  // ── Subject-verb agreement ───────────────────────────────────────

  // Common academic plural nouns → fix singular verb to plural
  const pluralNouns = 'results|findings|figures|studies|changes|factors|impacts|effects|challenges|outcomes|approaches|modifications|patterns|methods|strategies|observations|suggestions|conclusions|researchers|analysts|experts|scholars|variables|parameters|indicators|implications|products|consequences|shifts|trends|temperatures|efforts|conditions|developments|measures|policies|regulations|interventions|reductions|frameworks|examinations|reviews|investigations|assessments|analyses|evaluations|technologies|tools|networks|structures|concerns|regions|needs|systems';
  const svaRe = new RegExp(
    `\\b(The\\s+)?(?:these\\s+|those\\s+|such\\s+|several\\s+|many\\s+|some\\s+|various\\s+|all\\s+)?` +
    `(${pluralNouns})\\s+(drives|directs|leads|suggests|indicates|shows|demonstrates|reveals|points|requires|introduces|produces|creates|triggers|generates|signals|necessitates|establishes|highlights|underscores|illustrates|depicts|reflects|displays|represents|encompasses|covers|spans|extends|denotes|remains|captures|constitutes|demands|affects|involves|determines|symbolizes|embodies)\\b`,
    'gi'
  );
  output = output.replace(svaRe, (match, det, noun, verb) => {
    // Convert singular verb to plural: remove trailing 's', handle 'es'
    let fixedVerb = verb;
    if (/es$/i.test(verb) && /[sxzh]es$/i.test(verb)) {
      fixedVerb = verb.slice(0, -2);
    } else if (/ies$/i.test(verb)) {
      fixedVerb = verb.slice(0, -3) + 'y';
    } else if (/s$/i.test(verb)) {
      fixedVerb = verb.slice(0, -1);
    }
    // Preserve original capitalization
    if (verb[0] === verb[0].toUpperCase()) fixedVerb = fixedVerb.charAt(0).toUpperCase() + fixedVerb.slice(1);
    return match.replace(new RegExp(verb + '$', 'i'), fixedVerb);
  });

  // Extended SVA: plural subject + prepositional phrase + singular verb
  // "Shifts in climate tendencies reflects" → "Shifts in climate tendencies reflect"
  const extSvaSubjects = 'shifts|trends|changes|effects|impacts|consequences|outcomes|findings|results|efforts|conditions|measures|patterns|factors|temperatures|developments|policies|reductions|frameworks|modifications|approaches|strategies';
  const extSvaVerbs = 'reflects|depicts|suggests|indicates|shows|demonstrates|reveals|drives|leads|requires|highlights|represents|encompasses|extends|remains|demands|creates|produces|triggers|establishes|symbolizes|signifies|constitutes|affects|involves|determines|illustrates';
  const extSvaRe = new RegExp(
    `\\b(${extSvaSubjects})\\s+(?:in|of|from|to|across|within|among|between|through|for|over|under|around|about|during)\\s+[^.!?]{3,50}?\\s+(${extSvaVerbs})\\b`,
    'gi'
  );
  output = output.replace(extSvaRe, (match, subj, verb) => {
    let fixedVerb = verb;
    if (/es$/i.test(verb) && /[sxzh]es$/i.test(verb)) {
      fixedVerb = verb.slice(0, -2);
    } else if (/ies$/i.test(verb)) {
      fixedVerb = verb.slice(0, -3) + 'y';
    } else if (/s$/i.test(verb)) {
      fixedVerb = verb.slice(0, -1);
    }
    if (verb[0] === verb[0].toUpperCase()) fixedVerb = fixedVerb.charAt(0).toUpperCase() + fixedVerb.slice(1);
    return match.replace(new RegExp(verb + '$', 'i'), fixedVerb);
  });

  // ── Broken phrase repairs ────────────────────────────────────────

  // Fix "a [adjective]" where noun was lost: "requires a complete that" → "a complete approach that"
  output = output.replace(/\ba\s+(complete|thorough|broad|overall|whole|full|strong|solid|reliable|detailed)\s+that\b/gi,
    (_, adj) => `a ${adj} approach that`
  );

  // Fix "[preposition] [bare-verb]" → "[preposition] [verb-ing]"
  output = output.replace(/\b(should be on|needs to be on|focus on|emphasis on|aimed at|dedicated to)\s+([a-z]+)\b/gi,
    (match, prep, verb) => {
      if (verb.endsWith('ing')) return match;
      if (/^(the|a|an|this|that|these|those|each|every|some|any|all)\b/i.test(verb)) return match;
      if (verb.endsWith('e') && !verb.endsWith('ee')) return `${prep} ${verb.slice(0, -1)}ing`;
      if (/[^aeiou][aeiou][bcdfghlmnprst]$/i.test(verb) && verb.length <= 5) return `${prep} ${verb}${verb.slice(-1)}ing`;
      return `${prep} ${verb}ing`;
    }
  );

  // Fix "first of its kind [noun]" → "remarkable [noun]"
  output = output.replace(/\bfirst of its kind\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi,
    (_, noun) => `remarkable ${noun}`
  );
  output = output.replace(/\bnever before seen\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi,
    (_, noun) => `extraordinary ${noun}`
  );
  output = output.replace(/\bwithout prior example\s+(rate|level|pace|speed|scale|degree|growth|volume)/gi,
    (_, noun) => `exceptional ${noun}`
  );

  // Fix "points to [subject] [verb]" → "suggests that [subject] [verb]"
  output = output.replace(/\bpoints?\s+to\s+([A-Za-z]+)\s+(are|is|was|were|can|could|will|would|have|has|had|do|does|did)\b/gi,
    (_, subject, verb) => `suggests that ${subject} ${verb}`
  );

  // Fix "points to that" → "indicates that"
  output = output.replace(/\bpoints?\s+to\s+that\b/gi, 'indicates that');

  // Fix "drives to" → "leads to" (common garbled collocation)
  output = output.replace(/\b(drives?|directs?)\s+to\s+the\s+(interpretation|conclusion|idea|notion|view)/gi,
    (_, verb, noun) => `leads to the ${noun}`
  );

  // Fix broken verb phrases where verb got replaced with a noun
  // "element to" → "point to", "aspects to" → "point to", "feature to that" → "suggest that"
  // Also handle cases where discourse markers are inserted between: "aspect, by extension, to"
  output = output.replace(/\b(element|aspect|detail|feature|matter)\s+to\b/gi, 'point to');
  output = output.replace(/\b(element|aspect|detail|feature|matter)\s*,\s*(?:in practice|in effect|in turn|as expected|by extension|at this stage|on balance|in particular|to be specific|on closer inspection|at the same time|by comparison|in broad terms|upon review|in the strictest sense|at its core|on this basis|by all accounts)\s*,\s*to\b/gi,
    (_, noun) => 'point to'
  );

  // Fix "is core in" → "is central to" (broken collocation)
  output = output.replace(/\bis\s+core\s+in\b/gi, 'is central to');

  // Fix transitive verbs with orphaned "in": "embraces in", "adopts in", "assumes in"
  output = output.replace(/\b(embraces?|adopts?|assumes?)\s+in\b/gi, (_, verb) => verb);

  // Fix garbled "point to [clause without that]" — needs "that" before a clause
  output = output.replace(/\bpoint to\s+([a-z]+-based|evidence|research|data|study|studies)\b/gi,
    (_, noun) => `suggest that ${noun}`
  );

  // Fix "at the nearly all elementary [noun]" → remove garbled adverb expansion
  output = output.replace(/\bat the nearly all elementary\s+\w+/gi, 'fundamentally');

  // Fix orphaned comma-period: ",."
  output = output.replace(/,\s*\./g, '.');

  // Fix orphaned trailing phrase fragments: ", the [adj] nature of."
  output = output.replace(/,\s+the\s+[\w-]+\s+nature\s+of\s*\./gi, '.');

  // Fix garbled paradigm/method replacements: "In method," "In way," "Via this big alteration in way,"
  output = output.replace(/\bIn\s+(?:method|way|mode|means|approach)\s*,/gi, 'Through this approach,');
  output = output.replace(/\bVia\s+this\s+(?:big|large|major|key)\s+(?:alteration|change|shift)\s+in\s+(?:way|method|mode)\s*,/gi,
    'Through this significant change,'
  );

  // Fix adjacent verbs without conjunction (cascade artifact)
  // Pattern: [verb1] [verb2] where both are base form verbs
  output = output.replace(/\b(shore up|prop up|bolster|reinforce|back up|support|assist|help|aid|sustain|produce|enable|allow)\s+(trigger|cause|produce|create|generate|enable|facilitate|support|allow|make|drive|yield|deliver|provide)\b/gi,
    (_, v1) => v1
  );
  output = output.replace(/\b(assist|help|aid)\s+(?:in\s+)?(\w+),\s*(?:besides|moreover|furthermore|additionally|joined by|coupled with)\s+(\w+)\b/gi,
    (_, verb, w1, w2) => `${verb} in ${w1} and ${w2}`
  );

  // Fix garbled sentence-start prepositional phrases: "In heart,", "In thinking,", "In core"
  // With comma
  output = output.replace(/\bIn\s+(heart|thinking|method|way|mode|means|strategy|core)\s*,/gi, (_, word) => {
    const fixes = { heart: 'At heart,', thinking: 'In this regard,', method: 'Through this approach,', way: 'In this way,', mode: 'In this mode,', means: 'By this means,', strategy: 'Strategically,', core: 'At the core,' };
    return fixes[word.toLowerCase()] || 'In this regard,';
  });
  // Without comma (directly followed by text)
  output = output.replace(/\bIn\s+(heart|core|strategy)\s+(\w)/gi, (_, word, next) => {
    const fixes = { heart: 'At heart, ', core: 'At the core, ', strategy: 'Strategically, ' };
    return (fixes[word.toLowerCase()] || 'In this regard, ') + next;
  });

  // Fix "is showed" → "is shown" (irregular past participle)
  output = output.replace(/\bis\s+showed\b/gi, 'is shown');
  output = output.replace(/\bwas\s+showed\b/gi, 'was shown');
  output = output.replace(/\bhave\s+showed\b/gi, 'have shown');
  output = output.replace(/\bhas\s+showed\b/gi, 'has shown');

  // ── "fundamentally" garbled expansions ────────────────────────────
  // "at the root", "at its bedrock", "at its groundwork", "in crux", "at root" → "fundamentally"
  output = output.replace(/\bat\s+(?:the\s+|its\s+)?root\b/gi, 'fundamentally');
  output = output.replace(/\bat\s+its\s+(?:bedrock|groundwork|foundation|base|root|basis)\b/gi, 'fundamentally');
  output = output.replace(/\bin\s+crux\b/gi, 'fundamentally');
  output = output.replace(/\bat\s+its\s+core\b/gi, 'fundamentally');
  // "At the core," or "at the core" → "fundamentally"
  output = output.replace(/\b[Aa]t\s+the\s+core\s*,?\s*/gi, 'fundamentally ');
  // "at the nearly all core amount" and similar → "fundamentally"
  output = output.replace(/\bat\s+the\s+(?:majority|bulk|most|nearly all|greater part)\s+of\s+(?:\w+\s+){0,2}(?:tier|level|stage|amount|degree)\b/gi, 'fundamentally');
  // "the nearly all" → "the most" (superlative garble from BACKUP_SYN)
  output = output.replace(/\bthe\s+nearly\s+all\b/gi, 'the most');
  output = output.replace(/\bnearly\s+all\s+(pressing|important|critical|significant|challenging|common|prevalent|frequent|difficult|complex|advanced)\b/gi,
    (_, adj) => `most ${adj}`
  );
  // "at the most elementary/core/primary amount/tier/extent" → "fundamentally"
  output = output.replace(/\bat\s+the\s+most\s+(?:elementary|core|primary|basic|fundamental)\s+(?:amount|tier|level|stage|degree|extent|point)\b/gi, 'fundamentally');
  // "at the most fundamental level" variants
  output = output.replace(/\bat\s+the\s+most\s+(?:fundamental|basic|elementary|primary)\s+(?:level|tier|stage|extent|point)\b/gi, 'fundamentally');
  // "At heart," mid-sentence or start → "fundamentally"
  output = output.replace(/\bAt\s+heart\s*,\s*/gi, 'fundamentally ');

  // ── Garbled "demonstrates" replacements ──────────────────────────
  // "builds/creates/crafts evident/plain/obvious" → "makes clear"
  output = output.replace(/\b(?:builds?|creates?|crafts?)\s+(evident|obvious|apparent|clear|plain)\b/gi, (_, adj) => `makes ${adj}`);
  // "makes evident the" → "reveals the"
  output = output.replace(/\bmakes?\s+evident\s+the\b/gi, 'reveals the');
  // "makes plain that" → "shows that"
  output = output.replace(/\bmakes?\s+plain\s+that\b/gi, 'shows that');

  // ── Tautology: "uncovered uncovers", "discovered discovers" ──────
  output = output.replace(/\buncovered\s+uncovers?\b/gi, 'uncovered evidence');
  output = output.replace(/\bdiscovered\s+discovers?\b/gi, 'discovered evidence');
  output = output.replace(/\bWhat was uncovered uncovers\b/gi, 'The findings reveal');
  output = output.replace(/\bWhat was discovered discovers\b/gi, 'The findings show');

  // ── Garbled "imperative" replacements ─────────────────────────────
  // "the pressing call for is to" → "an urgent need is to" or "it is important to"
  output = output.replace(/\bthe\s+pressing\s+call\s+for\s+is\s+to\b/gi, 'it is important to');
  // "the pressing demand is to" → "it is important to"
  output = output.replace(/\bthe\s+pressing\s+(?:demand|requirement|need)\s+is\s+to\b/gi, 'it is important to');

  // ── Garbled conjunction repairs ──────────────────────────────────
  // "joined/paired via [gerund]" → "and [gerund]"
  output = output.replace(/\b(?:joined|paired)\s+(?:via|by means of|through)\s+(\w+ing)\b/gi, 'and $1');
  // "coupled via [gerund]" → "and [gerund]"
  output = output.replace(/\bcoupled\s+(?:via|by means of|through)\s+(\w+ing)\b/gi, 'and $1');
  // "continues/stays [adjective]" → "remains [adjective]" (for state-adjectives)
  output = output.replace(/\b(?:continue|continues|stay|stays|endure|endures|persist|persists|last|lasts)\s+(inconsistent|consistent|unchanged|unclear|uncertain|stable|relevant|important|significant|critical|essential|vital|crucial|necessary|problematic|contentious|controversial)\b/gi, 'remains $1');
  // "intersection by [Topic]" → "intersection of [Topic]"
  output = output.replace(/\bintersection\s+by\b/gi, 'intersection of');

  // ── Collocation repairs: preposition mismatch after synonym swap ──
  // "strategy/method/technique to [gerund]" → "strategy for [gerund]"
  output = output.replace(/\b(strategy|technique|method|framework|tactic|structure|approach)\s+to\s+(\w+ing)\b/gi, '$1 for $2');
  // "expense/price of [gerund]" → "cost of [gerund]" (restore natural collocation)
  output = output.replace(/\b(expense|price)\s+of\s+(developing|building|creating|implementing|running|maintaining|operating)\b/gi, 'cost of $2');
  // "records/figures security" → "data security" (restore compound noun)
  output = output.replace(/\b(records|figures)\s+(security|protection|privacy|breach|loss|integrity)\b/gi, 'data $2');
  // "correctness/precision levels" → "accuracy rates" or accept "precision levels"
  output = output.replace(/\bcorrectness\s+levels\b/gi, 'accuracy levels');
  // "sustains the potential" → "has the potential"
  output = output.replace(/\bsustains\s+the\s+potential\b/gi, 'has the potential');
  // "assume/consider into account" → "take into account"
  output = output.replace(/\b(?:assume|consider|adopt|grab|seize)\s+into\s+account\b/gi, 'take into account');
  // "overlap across/amid X" → "overlap between X" (fix preposition after SYN swap)
  output = output.replace(/\boverlap\s+(?:across|amid|among)\b/gi, 'overlap between');
  // "convergence across/amid X" → "convergence of X"
  output = output.replace(/\bconvergence\s+(?:across|amid|among)\b/gi, 'convergence of');

  // ── Orphaned trailing words ──────────────────────────────────────
  // "solutions plus." / "solutions besides." → "solutions."
  output = output.replace(/\b(solutions?|costs?)\s+(?:plus|besides|moreover|furthermore)\s*\./gi, '$1.');

  // ── Missing subject after "demands that" ─────────────────────────
  // "demands that examine" → "demands that one examine"
  output = output.replace(/\bdemands?\s+that\s+(examine|consider|review|assess|evaluate|address|investigate|analyze|study|explore|weigh|reflect|look)\b/gi,
    (_, verb) => `demands that one ${verb}`
  );

  // ── "What + subject" garbled sentence openings ───────────────────
  // "What artificial intelligence is vital to" → "Artificial intelligence is vital to"
  output = output.replace(/^What\s+([a-zA-Z])/gm, (_, ch) => ch.toUpperCase());

  // ── Capitalized connector mid-sentence after comma ───────────────
  // "Over X, Beyond this, Y" → "Over X, beyond this, Y" (lowercase mid-sentence connectors)
  output = output.replace(/,\s+(In addition|Beyond this|Beyond that|What is more|On top of that|Also|Adding to this|As a result|In contrast|On the other hand|In particular|As such|For this reason|In effect|By extension|At the same time)\s*,/gi,
    (match, connector) => `, ${connector.toLowerCase()},`
  );

  // ── Fix "pressing require/call for is to" ────────────────────────
  output = output.replace(/\bthe\s+pressing\s+(?:require|call for|call|need|demand|requirement|take)\s+is\s+to\b/gi, 'it is important to');
  // Fix "serves/operating in stage/action/concert with" garbled conjunction
  output = output.replace(/\b(?:operating|serving|working|performing|functioning)\s+in\s+(?:stage|action|concert|measure|phase)\s+with\b/gi, 'along with');

  // ── Fix em-dash before coordinating conjunctions ─────────────────
  // "social — and economic" → "social and economic"
  output = output.replace(/ — (and|or|but|nor|yet|so) /g, ' $1 ');

  // Orphaned "besides/plus/furthermore" at sentence end
  output = output.replace(/\b(\w{4,})\s+(?:besides|plus|furthermore|moreover)\s*\./gi, '$1.');

  // Orphaned "worth noting" at sentence/text end
  output = output.replace(/[,;]?\s*worth noting\s*\.?\s*$/gi, '.');
  output = output.replace(/[,;]?\s*worth noting\s*\./gi, '.');
  
  // ── Fix sentence ending with ", applied in." or preposition ──────
  // "the approach applied in." → remove garbled trailing phrase
  output = output.replace(/,\s+the\s+(?:approach|technique|method|way|procedure|setup|structure|system|operation|network)\s+(?:applied|employed|used|relied on|drew on)\s+in\s*\./gi, '.');

  // ── Garbled "end product(s)" ─────────────────────────────────────
  // "end products" → "outcomes", "end result" is ok but "end product" often garbled
  output = output.replace(/\bend\s+products?\b/gi, 'outcomes');

  // ── Truncated transition words at sentence start ─────────────────
  // "Total," → "Overall,", "Broad," → "Broadly,", etc.
  // Use word boundary + lookahead since these appear mid-text after period-space
  output = output.replace(/\bTotal,/g, 'Overall,');
  output = output.replace(/\bBroad,/g, 'Broadly,');
  output = output.replace(/\bCollective,/g, 'Collectively,');
  output = output.replace(/\bLoose(ly)?,/g, 'Loosely,');
  output = output.replace(/\bWidely,/g, 'Broadly,');
  output = output.replace(/\bGeneral,/g, 'Generally,');

  // ── Fix "persists/continues crucial/vital/important to" ──────────
  // "persists/continues/endures crucial/vital/important to" → "remains crucial to"
  output = output.replace(/\b(persists?|continues?|endures?)\s+(crucial|vital|important|essential|necessary|critical|key|central|decisive|defining|pivotal|urgent)\s+to\b/gi,
    (_, verb, adj) => `remains ${adj} to`
  );

  // ── Fix "stretches spanning" and similar double-preposition ──────
  output = output.replace(/\bstretches?\s+spanning\b/gi, 'spans');
  output = output.replace(/\bcovers?\s+spanning\b/gi, 'spans');
  output = output.replace(/\bspans?\s+spanning\b/gi, 'spans');

  // ── Article agreement: "a" before vowel → "an" ─────────────────
  output = output.replace(/\b([Aa])\s+([aeiouAEIOU]\w+)/g, (match, article, word) => {
    if (/^an$/i.test(article)) return match;
    return (article === 'A' ? 'An' : 'an') + ' ' + word;
  });

  // ── Fix "drew on in" / "drawn on in" → "used in" ──────────────
  output = output.replace(/\b(drew|drawn)\s+on\s+in\b/gi, 'used in');
  output = output.replace(/\bcalled\s+upon\s+in\b/gi, 'used in');
  // Fix "relied on in" → "used in"
  output = output.replace(/\brelied\s+on\s+in\b/gi, 'used in');

  // ── Fix "in basis" → "fundamentally" ───────────────────────────
  output = output.replace(/\bin\s+basis\b/gi, 'fundamentally');

  // ── Fix lowercase "fundamentally" at sentence start ────────────
  output = output.replace(/(^|\.\s+)fundamentally\b/gm, (_, prefix) => prefix + 'Fundamentally');

  // ── Fix orphaned transitions at end of text ────────────────────
  // "On balance." or "On balance" at very end
  output = output.replace(/\s+(?:On balance|By extension|In practice|In effect|In short|In brief|In the end|Broadly|Widely|Besides|Loosely|finally|bringing everything together|weighing it all|in conclusion)\s*\.?\s*$/i, '.');

  // ── Fix "the [adj] likely/probable/feasible of" (potential as noun) ──
  // When potential is used as a noun but was replaced with an adjective-only synonym
  output = output.replace(/\bthe\s+([\w-]+)\s+(possible|likely|probable|feasible|prospective|expected|anticipated|projected)\s+of\b/gi,
    (_, adj, wrongNoun) => `the ${adj} potential of`
  );
  // Simple: "the [adj] of" → potential was removed entirely in some cases
  output = output.replace(/\bthe\s+(transformative|revolutionary|creative|innovative|immense|enormous|vast|full|true|real|great|sheer)\s+of\b/gi,
    (_, adj) => `the ${adj} potential of`
  );

  // ── Tautology repair ──────────────────────────────────────────────

  // Fix "The indication indicates" / "The suggestion suggests" etc
  const tautologyPairs = {
    'indication indicates': 'evidence shows',
    'indication indicated': 'evidence showed',
    'indicated by scientific indication': 'indicated by scientific evidence',
    'indicated by\\s+\\w+\\s+indication': 'shown by available evidence',
    'suggestion suggests': 'evidence suggests',
    'suggestion suggested': 'evidence suggested',
    'conclusion concludes': 'analysis concludes',
    'observation observes': 'analysis observes',
    'assumption assumes': 'premise holds',
    'description describes': 'account describes',
    'explanation explains': 'reasoning explains',
    'demonstration demonstrates': 'proof demonstrates',
    'implication implies': 'evidence implies',
    'recommendation recommends': 'guidance recommends'
  };
  for (const [pattern, fix] of Object.entries(tautologyPairs)) {
    const re = new RegExp('\\b' + pattern.replace(/\s+/g, '\\s+') + '\\b', 'gi');
    output = output.replace(re, fix);
  }

  // ── Broken transition repairs ────────────────────────────────────

  // Fix garbled sentence-initial transitions: "In damages," "In additions,"
  output = output.replace(/\bIn\s+(damages?|additions?|furthers?|additions)\s*,/gi, 'Additionally,');

  // ── Double word / article repairs ────────────────────────────────

  // Fix possessive on words already ending in 's' (e.g. "temperatures's" → "temperatures'")
  output = output.replace(/(\w)s's\b/g, '$1s\'');

  // Fix double articles: "a a", "the the", "an an"
  output = output.replace(/\b(a|an|the)\s+\1\b/gi, '$1');

  // Fix "to to" doubling
  output = output.replace(/\bto\s+to\b/gi, 'to');

  // Fix orphaned commas at sentence start
  output = output.replace(/^,\s*/g, '');

  // Fix double spaces (preserve paragraph breaks)
  output = output.replace(/[ \t]{2,}/g, ' ');

  // Fix space before punctuation (but not before decimals like .05)
  output = output.replace(/\s+([.,;:!?])(?!\d)/g, '$1');

  // ── Remove garbled short sentence fragments ──────────────────────
  // Catch tiny garbled sentences (< 8 words, no subject-verb structure)
  // e.g. "Being an instance in matter." / "In a situation of."
  output = output.replace(/(?<=[.!?]\s+)((?:Being|Having|Making|Taking|In)\s+(?:an?\s+)?(?:\w+\s+){0,4}(?:in|of|for|to|at|on)\s*(?:\w+\s*)?)\.\s*/gi, '');

  // ── Sentence-initial capitalization ──────────────────────────────
  // After period+space, ensure next character is uppercase
  output = output.replace(/(\.\s+)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
  // Ensure first character is uppercase
  output = output.replace(/^([a-z])/, (_, ch) => ch.toUpperCase());

  // ── Missing period before capitalized transition ────────────────
  // "costs Finally," → "costs. Finally," (missing period before sentence-initial transition)
  output = output.replace(/([a-z])\s+(Finally|Overall|Additionally|Moreover|Furthermore|Consequently|Therefore|However|Nevertheless|Bringing everything together|Weighing it all|Collectively|Broadly|Generally|In short|In conclusion|In the end|On balance)\s*,/g,
    (_, lastChar, transition) => `${lastChar}. ${transition},`
  );

  // ── Double "fundamentally" ─────────────────────────────────────
  output = output.replace(/\bfundamentally\s*,\s*fundamentally\b/gi, 'fundamentally');

  return output.trim();
}


// ═══════════════════════════════════════════════════════════════════
// COHERENCE — Post-processing
// Cross-sentence quality: dedup, repetitive starters, transitions
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect sentences with repetitive opening words/phrases.
 * Returns indices of sentences that should have starters changed.
 */
function detectRepetitiveStarters(sentences) {
  const duplicateIndices = [];
  const seen = new Map();

  for (let i = 0; i < sentences.length; i++) {
    const first2 = sentences[i].trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
    if (seen.has(first2)) {
      duplicateIndices.push(i);
    }
    seen.set(first2, i);
  }

  return duplicateIndices;
}

/**
 * Remove bigram repetitions within a sentence.
 */
function deduplicateWithinSentence(sentence) {
  const words = sentence.split(/\s+/);
  if (words.length < 4) return sentence;

  const result = [words[0]];
  for (let i = 1; i < words.length; i++) {
    if (i >= 2 && i < words.length - 1) {
      const prevBigram = (words[i - 2] + ' ' + words[i - 1]).toLowerCase();
      const currBigram = (words[i] + ' ' + (words[i + 1] || '')).toLowerCase();
      if (prevBigram === currBigram) {
        i++; // Skip repeated bigram
        continue;
      }
    }
    result.push(words[i]);
  }

  return result.join(' ');
}

/**
 * Find consecutive sentences starting with connectors.
 */
function findMonotonousTransitions(sentences) {
  const monotonous = [];
  const connectors = ['however', 'moreover', 'furthermore', 'additionally', 'consequently', 'therefore'];

  let consecutiveCount = 0;
  for (let i = 0; i < sentences.length; i++) {
    const lower = sentences[i].toLowerCase().trim();
    if (connectors.some(c => lower.startsWith(c))) {
      consecutiveCount++;
      if (consecutiveCount >= 2) monotonous.push(i);
    } else {
      consecutiveCount = 0;
    }
  }

  return monotonous;
}

/**
 * Apply coherence fixes to the full humanized text.
 * Splits into sentences, fixes issues, rejoins.
 */
export function applyCoherenceFixes(text) {
  // Split into sentences (preserve the separator)
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length < 2) return text;

  // Check for trailing text not ending with punctuation
  const joined = sentences.join('');
  const trailing = text.substring(joined.length);

  let result = [...sentences];

  // 1. Dedup within each sentence
  result = result.map(s => deduplicateWithinSentence(s));

  // 2. Fix repetitive starters
  const repIndices = detectRepetitiveStarters(result);
  for (const idx of repIndices) {
    const sentence = result[idx];
    const match = sentence.match(/^\s*(\w+,?\s+)/);
    if (match && match[1].length < 15) {
      result[idx] = sentence.substring(match[0].length);
      result[idx] = result[idx].charAt(0).toUpperCase() + result[idx].slice(1);
    }
  }

  // 3. Fix monotonous transitions (consecutive connector words)
  const monotonous = findMonotonousTransitions(result);
  for (const idx of monotonous) {
    const sentence = result[idx];
    const commaIdx = sentence.indexOf(', ');
    if (commaIdx > 0 && commaIdx < 20) {
      result[idx] = sentence.substring(commaIdx + 2);
      result[idx] = result[idx].charAt(0).toUpperCase() + result[idx].slice(1);
    }
  }

  return (result.join(' ') + trailing).replace(/[ \t]{2,}/g, ' ');
}
