/**
 * Nuru — Sentence-by-Sentence Intelligent Humanizer
 * =========================================================
 *
 * Post-LLM-rewrite non-LLM engine. Per sentence:
 *   1. Detector-signature attack plan (which attacks this sentence needs)
 *   2. Evaluative phrase surgery (only if the plan says so)
 *   3. Connector-opener rotation (if this sentence has an AI opener)
 *   4. Per-sentence word swaps via curated dictionaries (intensity from plan)
 *   5. Safe clause reorder / voice toggle (NO sentence splits, NO merges)
 *   6. Opener diversification (at most once per run, never on paragraph leads)
 *   7. Purity gate: zero contractions, zero first person, zero funny phrases
 *      (unless input already had them)
 *   8. Iterative best-of-N: every iteration seeds its RNG differently so
 *      repeated runs of the same input produce different humanized output.
 *
 * STRICT NO-SPLIT / NO-MERGE: `manageBurstiness` is disabled. Sentences
 * that entered this engine leave this engine with identical count. Any
 * transform that accidentally splits a sentence is collapsed back to one
 * via the shared split-merge-guard.
 */

import { AI_WORD_REPLACEMENTS } from '../shared-dictionaries';
import { getBestReplacement } from './dictionary-service';
import { runFullDetectorForensicsCleanup, deepSignalClean } from './forensics';
import { detectDomain, getProtectedTermsForDomain, type Domain } from '../domain-detector';
import { scoreSentenceRisk } from '../sentence-risk-scorer';
import { resolveStrategy, type DomainStrategy } from '../domain-strategies';
import { resolveTone, type ToneSettings } from '../ai-signal-dictionary';
import { isSafeSwap, pickBestReplacement, contextFor } from '../synonym-safety';
import {
  createVariationRNG,
  guardSingleSentence,
  detectInputShape,
  applyPurityRules,
  violatesPurity,
  type VariationRNG,
  type InputShape,
} from '../intelligence';

// NOTE: _stealthStrategy and _activeTone were formerly module-level globals.
// They are now per-call locals inside stealthHumanize, passed as parameters
// to processSentence — this eliminates the race condition under concurrent requests.

export interface StealthHumanizeOptions {
  detectorPressure?: number;
  targetAiScore?: number;
  preserveLeadSentences?: boolean;
  humanVariance?: number;
  readabilityBias?: number;
  /** Override auto-detected domain instead of re-detecting from text. */
  domain?: Domain;
  /** Allow first-person pronouns to remain (default: inherit from input). */
  firstPersonAllowed?: boolean;
  /**
   * Optional per-call variation seed. If omitted we mint one. Two calls
   * with the same text will still diverge because we blend Date.now()
   * into the seed.
   */
  variationSeed?: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/* ── Tone Adjustment ─────────────────────────────────────────────── */

/**
 * Apply tone-specific polish to a fully-processed string.
 * Implements the user-visible differences between tones without
 * rebuilding the sentence (so meaning is preserved).
 */
function applyToneAdjustment(text: string, tone: ToneSettings): string {
  if (!text) return text;
  let result = text;

  // Contraction policy
  if (tone.expandContractions) {
    const CONTRACTION_EXPANSIONS: Record<string, string> = {
      "don't": "do not", "doesn't": "does not", "didn't": "did not",
      "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
      "shouldn't": "should not", "won't": "will not", "isn't": "is not",
      "aren't": "are not", "wasn't": "was not", "weren't": "were not",
      "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
      "it's": "it is", "that's": "that is", "there's": "there is",
      "what's": "what is", "who's": "who is", "let's": "let us",
      "i'm": "I am", "i've": "I have", "i'd": "I would", "i'll": "I will",
      "we're": "we are", "we've": "we have", "we'd": "we would",
      "we'll": "we will", "they're": "they are", "they've": "they have",
      "you're": "you are", "you've": "you have",
      "they'd": "they would", "you'd": "you would", "you'll": "you will",
      "she's": "she is", "he's": "he is",
      "she'd": "she would", "he'd": "he would",
    };
    for (const [c, e] of Object.entries(CONTRACTION_EXPANSIONS)) {
      result = result.replace(new RegExp(`\\b${c}\\b`, 'gi'), (m) =>
        m[0] === m[0].toUpperCase() ? e.charAt(0).toUpperCase() + e.slice(1) : e);
    }
  }
  // (Intentionally no contraction *injection* path — academic_blog keeps the
  // input's natural register; full contractions are only expanded when the
  // tone explicitly requires it.)

  // First-person policy — for tones that do not allow first person, the
  // rest of the pipeline (processSentence) already handles removal. For
  // tones that allow it, we do nothing additional here.

  // Blog cadence: introduce short "aside" sentences by splitting over-long
  // sentences in academic_blog / casual tones, using the same safe splitter
  // as the GPTZero burstiness pass.
  if (tone.id === 'academic_blog' || tone.id === 'casual') {
    result = result.split(/(\n\s*\n)/).map((para) => {
      if (/^\n\s*\n$/.test(para)) return para;
      const sents = para.match(/[^.!?]+[.!?]+/g);
      if (!sents) return para;
      let splitDone = 0;
      const out: string[] = [];
      for (const s of sents) {
        const trimmed = s.trim();
        const words = trimmed.split(/\s+/).length;
        // Only split if sentence exceeds tone's max length and we haven't
        // split too much already (prevent run-on choppy paragraphs)
        if (words > tone.maxSentenceLength && splitDone < 2) {
          const splitRe = /(,\s+(?:which|and|but)\s+)/;
          const m = trimmed.match(splitRe);
          if (m && m.index && m.index > 25 && m.index < trimmed.length - 15) {
            const before = trimmed.slice(0, m.index).trim();
            const connector = m[1].replace(/^,\s+/, '').replace(/\s+$/, '');
            let after = trimmed.slice(m.index + m[0].length).trim();
            after = after.charAt(0).toUpperCase() + after.slice(1);
            out.push(/[.!?]$/.test(before) ? before : before + '.');
            const starterMap: Record<string, string> = {
              which: 'This',
              and: 'Plus,',
              but: 'Still,',
            };
            const starter = starterMap[connector.toLowerCase()] ?? '';
            out.push(starter ? `${starter} ${after.charAt(0).toLowerCase() + after.slice(1)}` : after);
            splitDone++;
            continue;
          }
        }
        out.push(trimmed);
      }
      const trailing = para.match(/\s+$/)?.[0] ?? '';
      return out.join(' ') + trailing;
    }).join('');
  }

  return result;
}

/* ── Sentence Splitter ────────────────────────────────────────────── */

function splitSentences(text: string): string[] {
  // Split on . ! ? followed by space+capital, but respect abbreviations
  return text
    .replace(/([.!?])\s+(?=[A-Z])/g, (match, punct, offset) => {
      // Don't split if this period is part of an abbreviation like D.C., U.S., U.K.
      // Pattern: the char before the period is a letter, and two chars back is a period (X.Y. pattern)
      if (punct === '.' && offset >= 2 && /[A-Za-z]/.test(text[offset - 1]) && text[offset - 2] === '.') {
        return match; // abbreviation — don't split
      }
      return punct + '\n';
    })
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/* ── AI Phrase Patterns → Natural Replacements ────────────────────── */

const PHRASE_REPLACEMENTS: Array<{ pattern: RegExp; replacements: string[] }> = [
  { pattern: /\bin order to\b/gi, replacements: ['to', 'so as to'] },
  { pattern: /\bdue to the fact that\b/gi, replacements: ['because', 'since'] },
  { pattern: /\ba large number of\b/gi, replacements: ['many', 'numerous'] },
  { pattern: /\bin the event that\b/gi, replacements: ['if', 'should'] },
  { pattern: /\bon the other hand\b/gi, replacements: ['then again', 'by contrast'] },
  { pattern: /\bas a result\b/gi, replacements: ['so', 'because of this'] },
  { pattern: /\bin addition\b/gi, replacements: ['also', 'besides'] },
  { pattern: /\bfor example\b/gi, replacements: ['for instance', 'to illustrate'] },
  { pattern: /\bin terms of\b/gi, replacements: ['regarding', 'when it comes to'] },
  { pattern: /\bwith regard to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bit is important to note that\s*/gi, replacements: ['Notably, ', 'Significantly, ', 'Worth noting, '] },
  { pattern: /\bit should be noted that\s*/gi, replacements: ['Of note, ', 'Notably, ', 'It bears mention that '] },
  { pattern: /\bit is worth mentioning that\s*/gi, replacements: ['Significantly, ', 'Worth noting, ', 'Notably, '] },
  { pattern: /\bin the context of\b/gi, replacements: ['within', 'in'] },
  { pattern: /\bon the basis of\b/gi, replacements: ['based on', 'from'] },
  { pattern: /\bat the same time\b/gi, replacements: ['simultaneously', 'concurrently'] },
  { pattern: /\bwith respect to\b/gi, replacements: ['about', 'regarding'] },
  { pattern: /\bin spite of\b/gi, replacements: ['despite', 'even with'] },
  { pattern: /\bby means of\b/gi, replacements: ['through', 'using'] },
  { pattern: /\bin accordance with\b/gi, replacements: ['following', 'per'] },
  { pattern: /\bfor the purpose of\b/gi, replacements: ['to', 'for'] },
  { pattern: /\bprior to\b/gi, replacements: ['before'] },
  { pattern: /\bsubsequent to\b/gi, replacements: ['after', 'following'] },
  { pattern: /\bin contrast to\b/gi, replacements: ['unlike', 'compared with'] },
  { pattern: /\bas well as\b/gi, replacements: ['and', 'along with'] },
  { pattern: /\ba wide range of\b/gi, replacements: ['many', 'various'] },
  { pattern: /\btake into account\b/gi, replacements: ['consider', 'factor in'] },
  { pattern: /\bplay a (?:significant |important |key |crucial |vital |critical |pivotal )?role in\b/gi, replacements: ['shape', 'affect', 'influence'] },
  { pattern: /\bplays a (?:significant |important |key |crucial |vital |critical |pivotal )?role in\b/gi, replacements: ['shapes', 'affects', 'influences'] },
  { pattern: /\bhave an impact on\b/gi, replacements: ['affect', 'influence'] },
  { pattern: /\bhas an impact on\b/gi, replacements: ['affects', 'influences'] },
  { pattern: /\bin light of\b/gi, replacements: ['given', 'considering'] },
  { pattern: /\bthe fact that\b/gi, replacements: ['that', 'how'] },
  { pattern: /\bit is (?:clear|evident|obvious) that\b/gi, replacements: ['clearly,'] },
  { pattern: /\bthere is no doubt that\b/gi, replacements: ['certainly,'] },
  { pattern: /\bin today's (?:world|society|era|age)\b/gi, replacements: ['right now', 'today'] },
  { pattern: /\bin the modern (?:world|era|age)\b/gi, replacements: ['today'] },
  { pattern: /\bnot only\b(.{3,60}?)\bbut also\b/gi, replacements: ['SPLIT'] },
  { pattern: /\bgive rise to\b/gi, replacements: ['cause', 'lead to'] },
  { pattern: /\bshed light on\b/gi, replacements: ['explain', 'clarify'] },
  { pattern: /\bpave the way for\b/gi, replacements: ['enable', 'allow'] },
  { pattern: /\bover the course of\b/gi, replacements: ['during', 'throughout'] },
  { pattern: /\bat this point in time\b/gi, replacements: ['now', 'currently'] },
  // ── Extra Conversational Markers ──
  { pattern: /^(In this light|Stepping back|Likewise|Meanwhile|Yet|Conversely|Moreover|Furthermore|Additionally),\s*/gi, replacements: ['', '', ''] },
  { pattern: /^[A-Z][a-z]+-century views on equality reveal (?:some |many )?(?:fascinating |interesting |profound )?similarities/gi, replacements: ['Modern equality ideals reflect these historical perspectives'] },
  { pattern: /^(?:This |Such )?(?:shift|evolution|discrepancy) (?:from |in )?(?:a |the )?(?:narrow view of |limited social condition )?(?:to a broader |more inclusive )?(?:points out|shows|reveals|reflects) the (?:lasting |ongoing )?influence (?:of |on )?/gi, replacements: ['This demonstrates the impact of '] },
  // ── Extended AI-tell patterns (borrowed from AntiPangram forensics) ──
  { pattern: /\bwhich contributes? to (?:better |improved |enhanced |greater |stronger |more effective )?/gi, replacements: [', improving', '. This supports'] },
  { pattern: /\bResearch has shown that\b/gi, replacements: ['Studies show', 'Evidence shows', 'Research shows'] },
  { pattern: /\bstudies have shown that\b/gi, replacements: ['Research shows', 'Evidence suggests'] },
  { pattern: /\bit is widely (?:recognized|acknowledged|accepted) that\b/gi, replacements: ['Most agree that', 'It is known that'] },
  { pattern: /\bone of the (?:major|key|most important|primary|greatest|significant) (?:strengths|advantages|benefits|features) of\b/gi, replacements: ['a strength of', 'a benefit of', 'an advantage of'] },
  { pattern: /\bprovides (?:a |an )?(?:comprehensive|holistic|thorough) (?:overview|understanding|analysis|examination) of\b/gi, replacements: ['covers', 'examines', 'looks closely at'] },
  { pattern: /\bhas (?:gained|garnered|received|attracted) (?:significant|considerable|substantial|growing|increasing) (?:attention|interest|focus|traction)\b/gi, replacements: ['has drawn attention', 'has become a topic of interest', 'has become more studied'] },
  { pattern: /\bthis (?:study|paper|research|analysis|article) (?:aims|seeks|attempts|endeavors) to\b/gi, replacements: ['this work looks to', 'the goal here is to', 'the focus is on'] },
  { pattern: /\bserves as (?:a |an )?(?:critical|crucial|vital|important|key|essential) (?:tool|mechanism|framework|foundation)\b/gi, replacements: ['works as a tool', 'acts as a base', 'functions as a framework'] },
  { pattern: /\bultimately (?:leads|leading) to\b/gi, replacements: ['eventually causing', 'resulting in'] },
  { pattern: /\bultimately (?:drives|driving)\b/gi, replacements: ['eventually pushing', 'helping push'] },
  { pattern: /\bthis is particularly (?:important|relevant|significant|notable|true) (?:because|since|as|given)\b/gi, replacements: ['this matters because', 'this stands out since'] },
  { pattern: /\bthis (?:highlights|underscores|emphasizes) the (?:importance|need|significance|value) of\b/gi, replacements: ['this points to the value of', 'this shows why it matters to focus on'] },
  // ── GPTZero / Turnitin / Originality.ai high-signal patterns ──
  { pattern: /\bit can be argued that\s*/gi, replacements: ['arguably, ', 'one might say that '] },
  { pattern: /\bit could be argued that\s*/gi, replacements: ['arguably, ', 'some would say that '] },
  { pattern: /\bit is possible that\s*/gi, replacements: ['perhaps ', 'it may be that '] },
  { pattern: /\bit is likely that\s*/gi, replacements: ['it appears that ', 'the evidence suggests that '] },
  { pattern: /\bin recent years[,]?\s+/gi, replacements: ['lately, ', 'over the past few years, ', 'recently, '] },
  { pattern: /\bmoving forward[,]?\s+/gi, replacements: ['from here, ', 'going ahead, ', 'from this point, '] },
  { pattern: /\bgoing forward[,]?\s+/gi, replacements: ['from now on, ', 'in the future, ', 'ahead, '] },
  { pattern: /\bbest practices?\b/gi, replacements: ['proven methods', 'standard methods', 'effective approaches'] },
  { pattern: /\bkey (?:takeaway|takeaways)\b/gi, replacements: ['main point', 'the upshot', 'the central point'] },
  { pattern: /\bat the (?:heart|core) of\b/gi, replacements: ['central to', 'at the center of', 'fundamental to'] },
  { pattern: /\bat the forefront of\b/gi, replacements: ['leading in', 'ahead in', 'at the front of'] },
  { pattern: /\bcutting[- ]edge\b/gi, replacements: ['advanced', 'latest', 'new'] },
  { pattern: /\bstate[- ]of[- ]the[- ]art\b/gi, replacements: ['advanced', 'modern', 'current'] },
  { pattern: /\bparadigm shift\b/gi, replacements: ['fundamental change', 'major shift', 'significant shift'] },
  { pattern: /\bgame[- ]changer?\b/gi, replacements: ['major development', 'important shift', 'turning point'] },
  { pattern: /\bgame[- ]changing\b/gi, replacements: ['major', 'transformative', 'significant'] },
  { pattern: /\ba holistic (?:approach|view|understanding|perspective)\b/gi, replacements: ['a broad approach', 'an overall view', 'a wider perspective'] },
  { pattern: /\bholistic (?:approach|view|understanding|perspective)\b/gi, replacements: ['broad approach', 'overall view', 'wider perspective'] },
  { pattern: /\bfirst and foremost[,]?\s*/gi, replacements: ['above all, ', 'primarily, ', 'most importantly, '] },
  { pattern: /\bneedless to say[,]?\s*/gi, replacements: ['of course, ', 'naturally, ', 'obviously, '] },
  { pattern: /\bit goes without saying that\s*/gi, replacements: ['of course, ', 'naturally, '] },
  { pattern: /\bin this day and age[,]?\s*/gi, replacements: ['today, ', 'nowadays, '] },
  { pattern: /\bhas emerged as (?:a|an)\b/gi, replacements: ['has become a', 'now stands as a', 'has grown into a'] },
  { pattern: /\bhave emerged as (?:a|an)\b/gi, replacements: ['have become a', 'now stand as a', 'have grown into a'] },
  { pattern: /\bcan be attributed to\b/gi, replacements: ['stems from', 'comes down to', 'traces back to'] },
  { pattern: /\bfosters a (?:sense|culture|environment|atmosphere) of\b/gi, replacements: ['builds a sense of', 'creates an atmosphere of', 'develops a culture of'] },
  { pattern: /\bfosters?\b/gi, replacements: ['builds', 'supports', 'develops', 'helps build'] },
  { pattern: /\bempowers? (?:individuals|people|students|users|learners) to\b/gi, replacements: ['helps people to', 'allows people to', 'gives people the ability to'] },
  { pattern: /\bdemonstrates? (?:a|an) (?:commitment|dedication|focus) to\b/gi, replacements: ['shows commitment to', 'reflects a commitment to', 'signals a focus on'] },
  { pattern: /\ba (?:growing|increasing|mounting) body of (?:research|evidence|literature|work)\b/gi, replacements: ['more research', 'increasing evidence', 'a body of research'] },
  { pattern: /\bposes? (?:a|an) (?:significant|major|considerable|serious|unique) challenge\b/gi, replacements: ['presents a challenge', 'is a challenge', 'creates a challenge'] },
  { pattern: /\bit is (?:widely|generally|commonly) (?:believed|accepted|agreed|recognized|understood) that\s*/gi, replacements: ['most agree that ', 'it is accepted that ', 'the consensus is that '] },
  { pattern: /\bdemonstrat(?:es|ed|ing)? (?:a|the) need for\b/gi, replacements: ['shows a need for', 'highlights the need for', 'points to the need for'] },
  { pattern: /\bdemonstr(?:ates|ated|ating) the (?:potential|ability|capacity) of\b/gi, replacements: ['shows what', 'reveals the potential of', 'shows the ability of'] },
  { pattern: /\bcan (?:be|serve as) (?:a|an) (?:valuable|useful|effective|powerful) (?:tool|resource|approach)\b/gi, replacements: ['is a useful tool', 'works as a resource', 'serves as a practical tool'] },
  { pattern: /\bserves? as (?:a|an) (?:crucial|vital|key|important|essential|critical|central|fundamental) (?:tool|mechanism|framework|foundation|basis|component|resource)\b/gi, replacements: ['acts as a key tool', 'functions as a resource', 'works as a framework'] },
  { pattern: /\brepresents? (?:a|an) (?:significant|major|important|notable|key|crucial|critical) (?:step|shift|change|development|advancement|milestone) (?:in|toward|towards|for)\b/gi, replacements: ['marks a step in', 'is a major development in', 'marks a change in'] },
  { pattern: /\bhas (?:significant|profound|important|major|far-reaching) implications for\b/gi, replacements: ['matters for', 'affects', 'has consequences for'] },
  { pattern: /\bas (?:previously|earlier) (?:mentioned|noted|discussed|stated|outlined|explained)\b/gi, replacements: ['as noted', 'as covered', ''] },
  { pattern: /\bover the (?:past|last) (?:few|several|many|recent) (?:years|decades)\b/gi, replacements: ['recently', 'in recent times', 'over recent years'] },
];

/* ── Evaluative Phrase Surgery (sentence-level AI signal removal) ── */

const EVALUATIVE_SURGERIES: Array<{ pattern: RegExp; replaceFn: (match: string, ...groups: string[]) => string }> = [
  {
    // "One of the major/key strengths/advantages of X is"
    pattern: /\b[Oo]ne of the (?:major|key|most important|primary|greatest|significant) (?:strengths|advantages|benefits|features) of (.+?) is (?:its |that it |the fact that it )?/gi,
    replaceFn: (_m, subject) => `${subject.trim()} `,
  },
  {
    // Evaluative meta-commentary: "This discrepancy shows an important tension"
    pattern: /^[Tt]his (?:discrepancy|shift|evolution) (?:shows|reveals|points out|reflects) (?:an?|some) (?:important|fascinating|profound|significant) (?:tension|similarit(?:y|ies)|difference) (?:between|in) /gi,
    replaceFn: () => {
      const alts = ['This underscores the gap between ', 'This marks a divide in ', 'This reflects shifting ideas about '];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is widely used in the treatment of" → "It treats"
    pattern: /\b[Ii]t is widely used in the (?:treatment|management|handling) of\b/gi,
    replaceFn: () => {
      const alts = ['It treats', 'It is used to treat', 'It addresses'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "By understanding X, individuals can learn how to Y"
    pattern: /\b[Bb]y (?:understanding|recognizing|identifying|addressing|examining|exploring) (?:these |this |the )?([\w\s]+?),\s*(?:individuals|people|organizations|companies|teams) can (?:learn (?:how )?to |begin to |start to )?/gi,
    replaceFn: (_m, topic) => {
      const alts = [
        `Understanding ${topic.trim()} helps `,
        `Knowing about ${topic.trim()} means they can `,
        `With a grasp of ${topic.trim()}, it becomes easier to `,
      ];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "As a result, people become more confident in"
    pattern: /\b[Aa]s a result,?\s*(?:people|individuals|organizations) become (?:more )?/gi,
    replaceFn: () => {
      const alts = ['People end up ', 'This makes them ', 'So they get '];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is based on the idea that"
    pattern: /\b[Ii]t is based on the idea that\b/gi,
    replaceFn: () => {
      const alts = ['The idea is that', 'The premise is that', 'It works on the basis that'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "This serves as a [crucial/key/vital] [tool/mechanism/foundation]"
    pattern: /\b[Tt]his (?:serves?|functions?|operates?|acts?) as (?:a|an) (?:crucial|vital|key|important|essential|critical|central|fundamental|primary|core) (?:tool|mechanism|framework|foundation|basis|component|resource|means|way)\b/gi,
    replaceFn: (_m) => {
      const alts = ['This works as a tool', 'This functions as a resource', 'This acts as a core element', 'This is a key resource'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "This represents a [significant/major] [step/shift/development/change]"
    pattern: /\b[Tt]his represents? (?:a|an) (?:significant|major|important|notable|key|crucial|critical|fundamental|substantial|remarkable) (?:step|shift|change|development|advancement|milestone|departure|move) (?:in|toward|towards|for|away from)\b/gi,
    replaceFn: (_m) => {
      const alts = ['This marks a step in', 'This is a key shift in', 'This signals a change in', 'This marks a development in'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "The [significance/importance/value] of [X] cannot be [overstated/overlooked]"
    pattern: /\b[Tt]he (?:significance|importance|value|impact|role|relevance) of (?:this|these|such|the|their) .{2,40}? cannot be (?:overstated|overlooked|underestimated|ignored)\b/gi,
    replaceFn: (_m) => {
      const alts = ['This deserves careful attention', 'This matters more than it may appear', 'This is worth taking seriously'];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "[X] has emerged as [a/an] [key/crucial] [tool/approach/solution]"
    pattern: /\b(.{3,40}?) has emerged as (?:a|an) (?:key|crucial|vital|important|essential|leading|prominent|dominant|primary|critical) (?:tool|approach|method|solution|technique|mechanism|option|alternative|strategy|framework|resource)\b/gi,
    replaceFn: (_m, subject) => {
      const alts = [`${subject.trim()} has become a go-to option`, `${subject.trim()} is now a common approach`, `${subject.trim()} has grown into a key option`];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "It is [widely/generally] [known/accepted/recognized] that"
    pattern: /\b[Ii]t is (?:widely|generally|commonly|broadly) (?:known|accepted|recognized|acknowledged|understood|agreed) that\s+/gi,
    replaceFn: () => {
      const alts = ['Most agree that ', 'The consensus is that ', 'It is accepted that '];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
  {
    // "X has gained [significant/considerable] attention/traction/momentum"
    pattern: /\b(.{3,50}?) has (?:gained|garnered|received|attracted|drawn) (?:significant|considerable|substantial|growing|increasing|much|great|widespread) (?:attention|interest|traction|momentum|prominence|recognition)\b/gi,
    replaceFn: (_m, subject) => {
      const alts = [`${subject.trim()} has drawn attention`, `${subject.trim()} has become a topic of interest`, `${subject.trim()} is increasingly studied`];
      return alts[Math.floor(Math.random() * alts.length)];
    },
  },
];

/* ── Sentence Starters (probabilistic injection) ──────────────────── */

const STARTERS_ACADEMIC: string[] = [
  'Notably,', 'Historically,', 'Traditionally,', 'In practice,',
  'In broad terms,', 'From a practical standpoint,', 'At its core,',
  'On balance,', 'By extension,', 'In reality,',
  'Against this backdrop,', 'Under these conditions,',
];

/* ── Contraction Map ──────────────────────────────────────────────── */

const CONTRACTIONS: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "can't": "cannot", "couldn't": "could not", "wouldn't": "would not",
  "shouldn't": "should not", "won't": "will not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "it's": "it is", "that's": "that is", "there's": "there is",
  "what's": "what is", "who's": "who is", "let's": "let us",
  "i'm": "I am", "i've": "I have", "i'd": "I would", "i'll": "I will",
  "we're": "we are", "we've": "we have", "we'd": "we would",
  "we'll": "we will", "they're": "they are", "they've": "they have",
  "you're": "you are", "you've": "you have",
};

/* ── Protected Terms (never replace) ──────────────────────────────── */

const PROTECTED = new Set([
  // Scientific/academic terms that MUST stay
  'hypothesis', 'methodology', 'statistical', 'significance', 'correlation',
  'empirical', 'qualitative', 'quantitative', 'longitudinal',
  'photosynthesis', 'mitochondria', 'chromosome', 'genome', 'algorithm',
  'quantum', 'thermodynamic', 'electromagnetic', 'gravitational',
  'diagnosis', 'prognosis', 'pathology', 'epidemiology', 'therapeutic',
  'jurisdiction', 'plaintiff', 'defendant', 'statute', 'precedent',
  'infrastructure', 'implementation', 'specification', 'authentication',
  // Core AI/tech terms (terrible dictionary synonyms)
  'artificial', 'intelligence', 'decision', 'human', 'ai',
  'making', 'modern', 'based', 'related', 'driven', 'oriented', 'focused',
  'learning', 'training', 'network', 'system', 'data', 'information',
  'technology', 'digital', 'computer', 'machine', 'software', 'hardware',
  // Domain terms that get terrible dictionary replacements
  'healthcare', 'medical', 'clinical', 'clinician', 'diagnostic', 'diagnostics',
  'algorithmic', 'computational', 'multidisciplinary', 'cognitive', 'biased', 'biases',
  'criminal', 'justice', 'financial', 'forecasting',
  'model', 'models', 'image', 'images',
  // Academic domain terms — protect from garbling
  'patient', 'patients', 'clinical', 'bias', 'privacy', 'algorithm', 'algorithms',
  'dataset', 'datasets', 'observer', 'observers', 'machine', 'adoption',
  'barrier', 'barriers', 'decision', 'decisions', 'pattern', 'patterns',
  // NOTE: 'however','moreover','furthermore','nevertheless','consequently' intentionally
  // removed — these are top AI detector signals and MUST be replaceable by Nuru.
  // Number words — never replace
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'twenty',
  'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
  'thousand', 'million', 'billion', 'first', 'second', 'third', 'fourth', 'fifth',
  'half', 'quarter', 'dozen', 'once', 'twice', 'triple', 'double', 'single',
  // Geography/social-science terms — only protect words WITHOUT curated replacements
  'suburbanization', 'reinvestment', 'redevelopment', 'industrialization',
  'post', 'industrial', 'socioeconomic', 'socio',
  'concentrated',
  // Structural/transition words that must stay (AI-signal connectors removed — they must be replaceable)
  'while', 'although', 'despite', 'such', 'both', 'once', 'past',
  // NOTE: 'particularly','increasingly','especially','specifically' removed — AI signals
  // ASD / sensory integration / therapy domain terms
  'sensory', 'integration', 'autism', 'asd', 'spectrum', 'disorder',
  'occupational', 'therapy', 'therapist', 'therapists', 'intervention',
  'interventions', 'stimulation', 'hypersensitivity', 'hyposensitivity',
  'neuroimaging', 'wearable', 'sensors', 'fnirs', 'footscan',
  'caregivers', 'caregiver', 'neuroscience', 'psychology',
  'behavioral', 'developmental', 'cognitive', 'motor', 'executive',
  'longitudinal', 'interdisciplinary', 'standardized', 'protocols',
  'generalization', 'inclusive', 'personalized', 'individualized',
  'sustained', 'physiological', 'adaptive', 'interactive',
  'practitioner', 'practitioners', 'clinician', 'clinicians',
  'multi-sensory', 'multisensory',
  // Key academic terms that garble when replaced
  'processing', 'performance', 'relationships', 'environments',
  'development', 'populations', 'settings', 'evidence', 'outcomes',
  'community', 'practices', 'assessment', 'ensuring',
  'remaining', 'including', 'culturally', 'responsive', 'work',
  'tools', 'measures', 'profiles', 'frameworks', 'presents',
  'early', 'remains', 'academic',
  // NOTE: 'emerging' removed — AI signal
  // Clinical/research vocab that morphology destroys
  'limited', 'validated', 'systems', 'establishing', 'developing',
  'improvements', 'examining', 'prioritize', 'methodologies',
  'personalize', 'outcome', 'methodology',
  // Terms whose replacements lose precision in academic context
  'research', 'profile', 'practice',
  'ethical', 'validation', 'address',
  'educators', 'technologies', 'programs', 'areas',
  // NOTE: 'current','existing','insights','insight','comprehensive' removed — AI signals
  // Confusable word pairs — morphology can swap affect/effect
  'affect', 'affected', 'affecting', 'affects',
  'effect', 'effected', 'effecting', 'effects',
  // Medical/nursing domain terms
  'monitoring', 'clinical', 'intervention', 'patient',
  'medication', 'chronic', 'diagnosis', 'therapeutic',
  'interaction', 'delivery',
  // NOTE: 'vital','impacted' removed — AI signals
  // Common words that garble when replaced across iterations
  'collection', 'collections', 'approach', 'approaches',
  'process', 'processes', 'level', 'levels',
  'opportunities', 'opportunity', 'produced', 'producing',
  'shifted', 'shifting', 'conversations', 'conversation',
  'education', 'educational', 'learning', 'teaching',
  'students', 'student', 'teachers', 'teacher',
  'pose', 'poses', 'posed', 'posing',
  'raise', 'raises', 'raised', 'raising',
  'change', 'changes', 'changed', 'changing',
  'focus', 'focused', 'focusing',
  'provide', 'provides', 'provided', 'providing',
  'concerns', 'concern', 'create', 'creates', 'created',
  // Analytics/data/financial domain terms
  'traffic', 'organic', 'conversion', 'engagement', 'metrics',
  'revenue', 'acquisition', 'channel', 'channels', 'dataset',
  'records', 'variables', 'variable', 'column', 'columns',
  'source', 'sources', 'referral', 'navigation', 'search',
  'optimization', 'keyword', 'keywords', 'visibility',
  'marketing', 'advertisers', 'advertising', 'expenditure',
  'credibility', 'personalization', 'leads', 'qualified',
  // NOTE: 'sustainable','actionable' removed — strong AI signals
]);

/* ── Helper: check if a token is a proper noun (capitalized, non-sentence-start) ── */

function isProperNoun(token: string, index: number, tokens: string[]): boolean {
  // If it starts with uppercase and is not just a normal word
  if (!/^[A-Z]/.test(token)) return false;
  // Citation names: word followed by "et" (as in "et al.") — look far ahead due to \b boundary tokens
  const ahead = tokens.slice(index + 1, Math.min(tokens.length, index + 12)).join('').trim().toLowerCase();
  if (ahead.startsWith('et al') || ahead.startsWith('et. al')) return true;
  // Preceded by "(" — likely citation
  for (let j = index - 1; j >= 0; j--) {
    const prev = tokens[j];
    if (prev === '' || /^\s+$/.test(prev)) continue;
    if (prev === '(') return true; // parenthetical citation
    break;
  }
  // Check if it's at sentence start (after period, start of string, or after sentence boundary)
  if (index === 0) return false; // first token — likely sentence start
  // Look backward for sentence boundary
  for (let j = index - 1; j >= 0; j--) {
    const prev = tokens[j];
    if (prev === '' || /^\s+$/.test(prev)) continue; // skip whitespace/boundary tokens
    if (/[.!?]$/.test(prev)) return false; // after punctuation = sentence start, not proper noun
    return true; // preceded by normal text = proper noun
  }
  return false; // beginning of tokens = sentence start
}

/* ── Replacement Blacklist (never use as synonym output) ───────────── */

const REPLACEMENT_BLACKLIST = new Set([
  // Taxonomic/offensive substitutions
  'homo', 'hominid', 'mortal', 'soul', 'mod', 'waterway',
  // Wrong-POS pronouns (from noun senses of adjectives)
  'someone', 'somebody', 'anyone', 'nobody', 'nothing', 'everything',
  'anything', 'whoever', 'whatever',
  // Too vague verbs (lose meaning)
  'get', 'got', 'gotten', 'do', 'did', 'done', 'put', 'set', 'let',
  'go', 'went', 'gone', 'come', 'came', 'run', 'ran',
  // Single syllable fillers
  'thing', 'stuff', 'lot', 'bit', 'way',
  // Wrong-sense WordNet synonyms (academic context mismatch)
  'breeding', 'rearing', 'upbringing', 'infirmary', 'infirmaries', 'asylum',
  'asylums', 'clinic', 'clinics', 'dwelling', 'hut', 'shanty', 'hovel',
  'pedagogue', 'pedagogues', 'schoolmaster', 'pupil', 'dame',
  'picture', 'painting', 'scenery', 'vista', 'panorama', 'terrain',
  'trim', 'prune', 'shave', 'clip', 'chop', 'snip', 'lop',
  'handle', 'handles', 'knob', 'grip', 'lever', 'crank',
  'moved', 'budge', 'nudge', 'shove', 'haul', 'tow', 'drag',
  'breed', 'mate', 'spawn', 'hatch', 'sow', 'reap',
  'wield', 'brandish', 'clasp', 'clutch', 'grasp',
  'folk', 'kin', 'tribe', 'clan', 'mob', 'gang', 'bunch', 'pack',
  'lad', 'lass', 'chap', 'bloke', 'dude', 'guy', 'gal',
  'wee', 'tiny', 'itty', 'puny', 'dinky', 'teeny',
  'nifty', 'groovy', 'swell', 'dandy', 'peachy', 'keen',
  'slay', 'smite', 'sever', 'cleave', 'hack', 'slash',
  // Academic garble — common wrong-sense outputs from WordNet/PPDB
  'indoctrinate', 'brainwash', 'proselytize', 'sufferer', 'quieten',
  'hush', 'muffle', 'stifle', 'squelch', 'quash', 'quell',
  'lie', 'fib', 'falsehood', 'untruth', 'deceive',
  'construction', 'constructions', 'edifice', 'scaffold', 'scaffolding',
  'movement', 'movements', 'motion', 'locomotion', 'gesture',
  'environs', 'surroundings', 'locale', 'premises', 'precinct',
  'motif', 'motifs', 'ornament', 'embellishment', 'adornment',
  'persons', 'beings', 'creatures', 'mortals', 'souls',
  'immense', 'colossal', 'gargantuan', 'mammoth', 'titanic',
  'formula', 'formulas', 'recipe', 'recipes', 'concoction',
  'activity', 'activities', 'pastime', 'hobby', 'recreation',
  'concern', 'anxiety', 'angst', 'distress', 'anguish',
  'specify', 'specified', 'specifyed', 'designate',
  // Catastrophic WordNet wrong-sense outputs (found in testing)
  'yangtze', 'yangtzes', 'botany', 'botanical', 'flora',
  'leash', 'quartet', 'trio', 'duet', 'solo', 'quintet',
  'capital', 'capitol', 'seasoned', 'molded', 'moulded',
  'happening', 'happenings', 'occurrence', 'occurrences',
  'argument', 'arguments', 'quarrel', 'feud', 'spat', 'brawl',
  'emphasis', 'emphases', 'stress', 'accent', 'punctuation',
  'stage', 'stages', 'platform', 'podium', 'dais',
  'orient', 'oriental', 'occident', 'occidental',
  'stream', 'streams', 'creek', 'brook', 'rivulet', 'tributary',
  'rendering', 'renderings', 'rendition', 'portrayal', 'depiction',
  'outline', 'contour', 'silhouette', 'profile',
  'enhancement', 'enhancements', 'embellishment', 'beautification',
  'abundances', 'abundance', 'bounty', 'plethora', 'cornucopia',
  'meagreness', 'meagerness', 'scarcity', 'dearth', 'paucity',
  'entity', 'entities', 'organism', 'specimen',
  'botany', 'horticulture', 'gardening', 'cultivation',
  'possible', 'probable', 'feasible', 'plausible', // wrong when replacing "potential" (noun)
  'likely',  // wrong sense as noun replacement
  'prospective', // wrong sense as noun
  'place', 'spot', 'locale', // wrong sense for "level"
  'poorness', 'richness', 'affluence', // wrong register
  'renovation', 'refurbishment', 'overhaul', // wrong for "redevelopment"
  'communal', 'communals',
  'aid', 'aided', 'aiding', // too generic, often wrong sense
  // Extended dict garbage (found in testing)
  'severeness', 'severity', 'entrench', 'entrenched', 'entrenchment',
  'veteran', 'veterans', // noun/adj, wrong when replacing verb "experienced"
  'measured', 'unmeasured', // wrong sense for "levels"
  'supplied', 'lent', 'brought', // bad collocation with "to" when replacing "contributed"
  'fortune', 'fortunes', // wrong sense for "wealth"
  'institution', 'institutions', // wrong sense for "organization" (meaning structure)
  'establishment', 'establishments', // wrong sense for "organization" (meaning arrangement)
  'fields', // wrong sense for geographic "areas"
  'variances', 'variance', // wrong for "neighborhoods"
  'ocean', 'oceans', // wrong for "dramatic"
  'consignment', 'consignments', // wrong for "investment"
  'stated', // wrong for "high" (means "declared", not "elevated")
  'pecuniary', // too obscure
  'deficit', 'deficits', 'scarcity', 'shortage', 'absence', // noun-only, wrong when replacing verb "lack"
  // affect/effect confusion prevention
  'effected', 'effecting', // almost always wrong (should be "affected"/"affecting")
  // Extended dict wrong-sense outputs (found in nuru testing)
  'wrongdoer', 'wrongdoers', 'apiece', 'didactics', 'pedagogics',
  'procession', 'processions', 'dispute', 'disputes',
  'person', // wrong sense for "machine"
  'rattling', // wrong register for academic
  'anticipate', 'anticipated', // wrong when replacing nouns like "potential"
  'frightful', 'awful', 'terrible', 'howling', // wrong register for "tremendous"
  'penury', 'indigence', 'impoverishment', // wrong for "needs"
  'plow', 'plowed', 'plowing', // wrong sense for "discuss"/"address"
  'treat', 'treated', // ambiguous sense
  'demand', 'demands', // wrong sense for "needs" (too aggressive)
  'foul', 'fouls', // wrong sense for "technical"
  'latest', // causes "more latest" double comparative
  'built', // wrong sense for "emerged/established"
  'raiss', 'holmed', 'poss', // known garbled morphology outputs
  // Meaning-distorting synonyms found in testing
  'critique', 'critiques', // wrong sense for "analysis" (implies negative review)
  'confronting', 'confront', 'confronted', // wrong for "handling" (too aggressive)
  'arrangement', 'arrangements', // wrong for "organization" (means layout, not company)
  'fortify', 'fortified', 'fortifying', // wrong register for academic "strengthen"
  'appreciate', // wrong for "understand" in technical context (means value, not comprehend)
  'employs', 'employ', 'employed', // overused replacement, creates repetition
  'locate', 'locating', // wrong for "identify" in analytical context
  'cover', 'covering', 'covers', // wrong for "contain" / "include" (too casual)
  'chief', // wrong for "main"/"primary" (old-fashioned for academic text)
  'tackle', 'tackling', 'tackled', // too informal for academic
  'oversee', 'overseeing', 'oversaw', // wrong sense for "handle"
]);

/* ── Stopwords (skip for synonym replacement) ─────────────────────── */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'we', 'our', 'he', 'she', 'his', 'her',
  'which', 'what', 'who', 'whom', 'about', 'also', 'up', 'down', 'much',
  // ── Academic garble prevention ──
  'publication', 'workflow', 'workflowing', 'scheme', 'schemed',
  'tooling', 'toolings', 'zero', 'residents', 'citizenry',
  'stretch', 'boundary', 'organization', 'districts', 'surfacing',
  'dwelling', 'denizen', 'populace', 'edifice', 'pedagogue',
  'methoding', 'populaces', 'milieus', 'milieu', 'coursing',
  'operationing', 'proceduring', 'linger', 'lingering',
  'ceilinged', 'betterment', 'apparatus', 'inspect', 'initiatived',
]);

/* ── Extra Academic Replacements (fills gaps in AI_WORD_REPLACEMENTS) ── */

const EXTRA_REPLACEMENTS: Record<string, string[]> = {
  // ── High-frequency academic nouns (prevent bad WordNet senses) ──
  education: ['instruction', 'learning', 'schooling', 'teaching'],
  institution: ['organization', 'establishment', 'body', 'entity'],
  landscape: ['domain', 'sphere', 'arena', 'terrain'],
  student: ['learner', 'scholar', 'pupil', 'trainee'],
  teacher: ['educator', 'instructor', 'professor', 'mentor'],
  educator: ['instructor', 'teacher', 'mentor', 'trainer'],
  technology: ['innovation', 'tool', 'method', 'system'],
  society: ['community', 'populace', 'civilization', 'culture'],
  process: ['procedure', 'method', 'course', 'operation'],
  processes: ['procedures', 'methods', 'steps', 'operations'],
  system: ['framework', 'mechanism', 'apparatus', 'structure'],
  research: ['study', 'investigation', 'inquiry', 'analysis'],
  development: ['growth', 'progress', 'expansion', 'evolution'],
  environment: ['setting', 'context', 'surroundings', 'landscape'],
  experience: ['exposure', 'encounter', 'involvement', 'practice'],
  analysis: ['examination', 'assessment', 'evaluation', 'review'],
  strategy: ['approach', 'plan', 'tactic', 'method'],
  resource: ['asset', 'supply', 'material', 'means'],
  knowledge: ['understanding', 'awareness', 'expertise', 'insight'],
  information: ['data', 'details', 'facts', 'intelligence'],
  opportunity: ['prospect', 'opening', 'possibility', 'occasion'],
  community: ['group', 'network', 'collective', 'population'],
  individual: ['particular', 'distinct', 'specific', 'separate'],
  organization: ['institution', 'entity', 'company', 'firm'],
  program: ['initiative', 'plan', 'project', 'effort'],
  activity: ['task', 'endeavor', 'undertaking', 'pursuit'],
  improvement: ['enhancement', 'advancement', 'refinement', 'gain'],
  participation: ['engagement', 'involvement', 'contribution', 'inclusion'],
  response: ['reaction', 'reply', 'answer', 'feedback'],
  // ── High-frequency academic verbs ──
  leverage: ['harness', 'employ', 'utilize', 'capitalize'],
  utilize: ['employ', 'apply', 'use', 'harness'],
  implement: ['execute', 'carry', 'deploy', 'enact'],
  streamline: ['simplify', 'optimize', 'refine', 'improve'],
  personalize: ['tailor', 'customize', 'adapt', 'individualize'],
  enable: ['allow', 'empower', 'facilitate', 'permit'],
  facilitate: ['support', 'enable', 'promote', 'assist'],
  generate: ['produce', 'create', 'yield', 'deliver'],
  analyze: ['examine', 'evaluate', 'assess', 'study'],
  investigate: ['explore', 'probe', 'research', 'study'],
  design: ['build', 'construct', 'craft', 'structure'],
  present: ['introduce', 'pose', 'show', 'display'],
  revolutionize: ['overhaul', 'reshape', 'redefine', 'modernize'],
  acknowledge: ['recognize', 'accept', 'concede', 'admit'],
  identify: ['detect', 'recognize', 'pinpoint', 'determine'],
  // ── More academic nouns that WordNet garbles ──
  care: ['treatment', 'support', 'aid', 'service'],
  setting: ['context', 'environment', 'domain', 'space'],
  challenge: ['difficulty', 'obstacle', 'hurdle', 'complication'],
  vast: ['large', 'extensive', 'broad', 'sweeping'],
  observer: ['reviewer', 'analyst', 'examiner', 'assessor'],
  integration: ['incorporation', 'blending', 'merging', 'unification'],
  potential: ['likely', 'possible', 'probable', 'expected'],
  adoption: ['uptake', 'acceptance', 'incorporation', 'implementation'],
  // ── Words that produce catastrophic WordNet garble ──
  federal: ['national', 'governmental', 'central', 'public'],
  investment: ['funding', 'spending', 'commitment', 'allocation'],
  investments: ['funds', 'expenditures', 'commitments', 'allocations'],
  population: ['populace', 'group', 'community', 'demographic'],
  resident: ['inhabitant', 'occupant', 'dweller', 'local'],
  residents: ['inhabitants', 'occupants', 'dwellers', 'locals'],
  economy: ['market', 'financial system', 'marketplace'],
  economic: ['financial', 'fiscal', 'monetary', 'commercial'],
  social: ['communal', 'collective', 'public', 'civic'],
  define: ['characterize', 'describe', 'mark', 'distinguish'],
  defined: ['characterized', 'described', 'marked', 'distinguished'],
  policy: ['regulation', 'directive', 'guideline', 'rule'],
  neglect: ['overlook', 'disregard', 'ignore', 'abandon'],
  neglected: ['overlooked', 'disregarded', 'ignored', 'abandoned'],
  previously: ['formerly', 'earlier', 'once', 'before'],
  especially: ['particularly', 'notably', 'specifically', 'mainly'],
  decline: ['decrease', 'reduction', 'drop', 'downturn'],
  poverty: ['deprivation', 'hardship', 'destitution', 'disadvantage'],
  wealth: ['prosperity', 'affluence', 'fortune', 'riches'],
  segregation: ['separation', 'division', 'exclusion', 'isolation'],
  dramatic: ['striking', 'remarkable', 'profound', 'sweeping'],
  undergo: ['endure', 'face', 'encounter', 'weather'],
  undergone: ['endured', 'faced', 'encountered', 'weathered'],
  displace: ['uproot', 'relocate', 'remove', 'expel'],
  displacing: ['uprooting', 'relocating', 'removing', 'pushing out'],
  deepen: ['intensify', 'worsen', 'aggravate', 'amplify'],
  deepening: ['intensifying', 'worsening', 'aggravating', 'amplifying'],
  spatial: ['geographic', 'territorial', 'regional', 'physical'],
  racial: ['ethnic', 'race-based'],
  shifting: ['evolving', 'changing', 'moving', 'fluctuating'],
  restructuring: ['reorganization', 'reform', 'overhaul', 'redesign'],
  gentrification: ['urban renewal', 'redevelopment'],
  revitalization: ['renewal', 'regeneration', 'restoration', 'revival'],
  intensify: ['heighten', 'escalate', 'strengthen', 'amplify'],
  intensified: ['heightened', 'escalated', 'strengthened', 'amplified'],
  inequality: ['disparity', 'imbalance', 'gap', 'divide'],
  urban: ['metropolitan', 'municipal', 'civic', 'city-based'],
  demographic: ['population', 'societal', 'communal'],
  transformation: ['shift', 'overhaul', 'conversion', 'evolution'],
  change: ['shift', 'alteration', 'adjustment', 'variation'],
  changes: ['shifts', 'alterations', 'modifications', 'adjustments'],
  growth: ['expansion', 'progress', 'development', 'advance'],
  level: ['degree', 'extent', 'measure', 'scale'],
  levels: ['degrees', 'extents', 'measures', 'scales'],
  priority: ['focus', 'goal', 'emphasis', 'objective'],
  priorities: ['goals', 'objectives', 'aims', 'targets'],
  neighborhood: ['district', 'area', 'quarter', 'locality'],
  neighborhoods: ['districts', 'areas', 'quarters', 'localities'],
  contribute: ['add', 'lead', 'give rise', 'help lead'],
  contributed: ['added', 'led', 'given rise', 'helped lead'],
  shape: ['form', 'influence', 'mold', 'define'],
  shaped: ['formed', 'influenced', 'defined', 'molded'],
  transition: ['shift', 'conversion', 'passage', 'move'],
  high: ['elevated', 'heightened', 'pronounced', 'marked'],
  city: ['municipality', 'metropolis', 'locale', 'township'],
  decade: ['period', 'span', 'era', 'stretch'],
  decades: ['periods', 'spans', 'eras', 'stretches'],
  // ── Adjectives ──
  rapid: ['swift', 'fast', 'brisk', 'accelerated'],
  significant: ['notable', 'marked', 'substantial', 'considerable'],
  important: ['critical', 'vital', 'key', 'central'],
  various: ['diverse', 'multiple', 'assorted', 'several'],
  complex: ['intricate', 'involved', 'elaborate', 'multifaceted'],
  specific: ['particular', 'certain', 'distinct', 'precise'],
  current: ['present', 'existing', 'ongoing', 'prevailing'],
  effective: ['efficient', 'productive', 'successful', 'capable'],
  traditional: ['conventional', 'established', 'classical', 'customary'],
  fundamental: ['core', 'basic', 'essential', 'primary'],
  substantial: ['considerable', 'meaningful', 'sizable', 'large'],
  primary: ['main', 'leading', 'principal', 'foremost'],
  critical: ['vital', 'pivotal', 'essential', 'crucial'],
  comprehensive: ['thorough', 'complete', 'extensive', 'wide-ranging'],
  increasing: ['growing', 'rising', 'expanding', 'mounting'],
  overall: ['general', 'broad', 'total', 'aggregate'],
  notable: ['remarkable', 'striking', 'prominent', 'significant'],
  remarkable: ['striking', 'exceptional', 'outstanding', 'impressive'],
  sophisticated: ['advanced', 'refined', 'nuanced', 'elaborate'],
  unprecedented: ['unmatched', 'unparalleled', 'extraordinary', 'novel'],
  balanced: ['measured', 'equitable', 'proportionate', 'fair'],
  automated: ['mechanized', 'computerized', 'streamlined', 'automatic'],
  sheer: ['absolute', 'pure', 'utter', 'total'],
  available: ['accessible', 'obtainable', 'usable', 'present'],
  early: ['initial', 'preliminary', 'formative', 'foundational'],
  widespread: ['broad', 'extensive', 'pervasive', 'prevalent'],
  unfair: ['unjust', 'inequitable', 'uneven', 'lopsided'],
  ethical: ['moral', 'principled', 'responsible', 'sound'],
  technical: ['specialized', 'applied', 'practical', 'skilled'],
  experienced: ['encountered', 'witnessed', 'faced', 'undergone'],
  existing: ['current', 'present', 'prevailing', 'ongoing'],
  central: ['key', 'main', 'pivotal', 'core'],
  useful: ['helpful', 'valuable', 'practical', 'beneficial'],
  relevant: ['pertinent', 'applicable', 'fitting', 'suitable'],
  clear: ['definite', 'distinct', 'apparent', 'evident'],
  broad: ['wide', 'expansive', 'general', 'sweeping'],
  main: ['central', 'principal', 'primary', 'leading'],
  key: ['central', 'vital', 'crucial', 'essential'],
  certain: ['particular', 'definite', 'precise', 'specified'],
  strong: ['robust', 'powerful', 'solid', 'firm'],
  necessary: ['needed', 'required', 'essential', 'vital'],
  valuable: ['worthwhile', 'beneficial', 'meaningful', 'useful'],
  scholarly: ['academic', 'learned', 'intellectual', 'rigorous'],
  genuine: ['authentic', 'true', 'real', 'sincere'],
  fresh: ['new', 'recent', 'original', 'novel'],
  prominent: ['leading', 'major', 'notable', 'distinguished'],
  evident: ['clear', 'apparent', 'plain', 'visible'],
  definite: ['specific', 'particular', 'precise', 'concrete'],
  structured: ['organized', 'systematic', 'orderly', 'arranged'],
  logical: ['rational', 'coherent', 'sound', 'reasoned'],
  informative: ['instructive', 'educational', 'enlightening', 'revealing'],
  practical: ['applied', 'functional', 'concrete', 'usable'],
  considerable: ['substantial', 'notable', 'meaningful', 'significant'],
  appropriate: ['suitable', 'fitting', 'proper', 'apt'],
  common: ['frequent', 'typical', 'usual', 'routine'],
  entire: ['whole', 'complete', 'full', 'total'],
  obvious: ['clear', 'apparent', 'plain', 'evident'],
  recent: ['new', 'current', 'fresh'],
  major: ['significant', 'principal', 'leading', 'primary'],
  numerous: ['many', 'several', 'multiple', 'abundant'],
  distinct: ['separate', 'unique', 'individual', 'different'],
  ongoing: ['continuing', 'persistent', 'sustained', 'active'],
  academic: ['scholarly', 'educational', 'intellectual', 'learned'],
  deeper: ['more thorough', 'richer', 'fuller', 'broader'],
  contemporary: ['current', 'present', 'modern', 'recent'],
  // ── Verbs (base forms — morphology handles -ed/-ing) ──
  transform: ['reshape', 'alter', 'shift', 'revamp'],
  demonstrate: ['show', 'reveal', 'illustrate', 'display'],
  establish: ['set up', 'build', 'found', 'institute'],
  require: ['demand', 'need', 'necessitate', 'expect'],
  indicate: ['suggest', 'signal', 'imply', 'denote'],
  provide: ['offer', 'supply', 'deliver', 'furnish'],
  achieve: ['reach', 'attain', 'accomplish', 'gain'],
  maintain: ['keep', 'sustain', 'preserve', 'uphold'],
  evaluate: ['assess', 'judge', 'appraise', 'review'],
  influence: ['shape', 'affect', 'sway', 'guide'],
  predict: ['forecast', 'anticipate', 'project', 'foresee'],
  recommend: ['suggest', 'advise', 'propose', 'endorse'],
  enhance: ['boost', 'improve', 'strengthen', 'elevate'],
  integrate: ['combine', 'merge', 'blend', 'incorporate'],
  advocate: ['support', 'champion', 'promote', 'endorse'],
  ensure: ['guarantee', 'confirm', 'verify', 'safeguard'],
  augment: ['supplement', 'expand', 'bolster', 'strengthen'],
  replace: ['substitute', 'displace', 'supplant', 'swap'],
  struggle: ['grapple', 'contend', 'wrestle', 'strain'],
  handle: ['manage', 'address', 'deal with', 'process'],
  guide: ['steer', 'direct', 'lead', 'channel'],
  prompt: ['motivate', 'spur', 'encourage', 'push'],
  raise: ['pose', 'introduce', 'spark', 'bring'],
  serve: ['function', 'act', 'operate', 'work'],
  remain: ['stay', 'continue', 'persist', 'endure'],
  range: ['span', 'scope', 'breadth', 'spectrum'],
  limit: ['cap', 'ceiling', 'constraint', 'threshold'],
  exceed: ['surpass', 'outstrip', 'outpace', 'eclipse'],
  match: ['rival', 'equal', 'parallel', 'mirror'],
  emerge: ['appear', 'surface', 'develop', 'come about'],
  adopt: ['embrace', 'implement', 'accept', 'employ'],
  train: ['educate', 'prepare', 'instruct', 'develop'],
  perpetuate: ['sustain', 'prolong', 'continue', 'maintain'],
  amplify: ['intensify', 'magnify', 'heighten', 'increase'],
  combine: ['unite', 'merge', 'blend', 'fuse'],
  address: ['resolve', 'manage', 'deal with', 'work through'],
  assist: ['aid', 'support', 'help', 'facilitate'],
  help: ['aid', 'assist', 'support', 'enable'],
  understand: ['grasp', 'comprehend', 'recognize', 'follow'],
  discuss: ['examine', 'explore', 'consider', 'cover'],
  describe: ['depict', 'portray', 'outline', 'detail'],
  illustrate: ['show', 'demonstrate', 'highlight', 'display'],
  highlight: ['emphasize', 'underscore', 'showcase', 'stress'],
  examine: ['review', 'analyze', 'assess', 'study'],
  suggest: ['propose', 'imply', 'hint', 'indicate'],
  determine: ['decide', 'establish', 'figure', 'resolve'],
  develop: ['build', 'create', 'design', 'craft'],
  consider: ['weigh', 'assess', 'evaluate', 'contemplate'],
  engage: ['participate', 'involve', 'interact', 'partake'],
  follow: ['adhere', 'observe', 'track', 'pursue'],
  include: ['encompass', 'cover', 'incorporate', 'involve'],
  argue: ['contend', 'assert', 'claim', 'maintain'],
  note: ['observe', 'mention', 'remark', 'point'],
  focus: ['concentrate', 'center', 'emphasize', 'target'],
  allow: ['enable', 'permit', 'let', 'empower'],
  outline: ['detail', 'sketch', 'describe', 'lay'],
  summarize: ['condense', 'recap', 'encapsulate', 'distill'],
  conclude: ['finish', 'close', 'wrap', 'end'],
  stimulate: ['spark', 'encourage', 'inspire', 'promote'],
  encourage: ['foster', 'promote', 'support', 'inspire'],
  situate: ['place', 'position', 'locate', 'embed'],
  compare: ['contrast', 'measure', 'weigh', 'assess'],
  assess: ['evaluate', 'gauge', 'judge', 'appraise'],
  inform: ['shape', 'guide', 'educate', 'enrich'],
  recognize: ['acknowledge', 'identify', 'appreciate', 'see'],
  publish: ['release', 'issue', 'produce', 'print'],
  apply: ['use', 'employ', 'utilize', 'exercise'],
  offer: ['supply', 'give', 'furnish', 'extend'],
  select: ['choose', 'pick', 'opt', 'designate'],
  stress: ['emphasize', 'underline', 'underscore', 'accent'],
  align: ['match', 'correspond', 'agree', 'fit'],
  preserve: ['protect', 'safeguard', 'uphold', 'maintain'],
  seek: ['aim', 'strive', 'pursue', 'attempt'],
  tackle: ['address', 'confront', 'handle', 'deal'],
  undermine: ['weaken', 'erode', 'damage', 'compromise'],
  foster: ['promote', 'cultivate', 'nurture', 'support'],
  strengthen: ['reinforce', 'bolster', 'improve', 'enhance'],
  lean: ['rely', 'depend', 'rest', 'count'],
  // ── Nouns ──
  rise: ['growth', 'surge', 'expansion', 'climb'],
  approach: ['method', 'strategy', 'technique', 'framework'],
  impact: ['consequence', 'outcome', 'result', 'influence'],
  framework: ['structure', 'model', 'system', 'scaffold'],
  perspective: ['viewpoint', 'angle', 'outlook', 'stance'],
  evidence: ['proof', 'data', 'findings', 'support'],
  outcome: ['result', 'finding', 'product', 'effect'],
  context: ['setting', 'backdrop', 'circumstances', 'situation'],
  aspect: ['facet', 'dimension', 'element', 'feature'],
  ability: ['capacity', 'capability', 'power', 'skill'],
  accuracy: ['precision', 'exactness', 'correctness', 'fidelity'],
  transparency: ['openness', 'clarity', 'visibility', 'accountability'],
  bias: ['prejudice', 'partiality', 'slant', 'skew'],
  concern: ['worry', 'issue', 'reservation', 'apprehension'],
  tool: ['instrument', 'mechanism', 'resource', 'device'],
  practice: ['application', 'method', 'convention', 'routine'],
  pattern: ['trend', 'tendency', 'motif', 'theme'],
  volume: ['amount', 'quantity', 'scale', 'extent'],
  complexity: ['intricacy', 'difficulty', 'depth', 'nuance'],
  efficiency: ['productivity', 'economy', 'output', 'effectiveness'],
  performance: ['output', 'results', 'achievement', 'effectiveness'],
  advantage: ['benefit', 'strength', 'edge', 'asset'],
  speed: ['pace', 'rate', 'velocity', 'tempo'],
  shift: ['change', 'transition', 'move', 'adjustment'],
  balance: ['equilibrium', 'harmony', 'parity', 'stability'],
  area: ['field', 'domain', 'sphere', 'sector'],
  areas: ['fields', 'domains', 'spheres', 'sectors'],
  choice: ['selection', 'option', 'pick', 'preference'],
  action: ['step', 'measure', 'move', 'initiative'],
  // "lack" removed — verb/noun ambiguity causes POS mismatches
  amount: ['volume', 'quantity', 'total', 'sum'],
  scholar: ['academic', 'intellectual', 'expert', 'specialist'],
  practitioner: ['professional', 'specialist', 'operator', 'expert'],
  expertise: ['skill', 'proficiency', 'competence', 'mastery'],
  question: ['inquiry', 'issue', 'matter', 'concern'],
  judgment: ['assessment', 'evaluation', 'appraisal', 'discernment'],
  innovation: ['advancement', 'breakthrough', 'progress', 'invention'],
  oversight: ['supervision', 'regulation', 'monitoring', 'governance'],
  barrier: ['obstacle', 'impediment', 'hurdle', 'hindrance'],
  analyst: ['examiner', 'evaluator', 'reviewer', 'assessor'],
  capacity: ['capability', 'ability', 'competence', 'aptitude'],
  review: ['assessment', 'evaluation', 'examination', 'appraisal'],
  assessment: ['evaluation', 'review', 'appraisal', 'analysis'],
  position: ['role', 'place', 'standing', 'status'],
  discipline: ['field', 'domain', 'branch', 'specialty'],
  feature: ['trait', 'characteristic', 'attribute', 'quality'],
  purpose: ['aim', 'goal', 'intent', 'objective'],
  argument: ['claim', 'thesis', 'contention', 'reasoning'],
  strength: ['merit', 'asset', 'advantage', 'virtue'],
  limitation: ['shortcoming', 'weakness', 'drawback', 'flaw'],
  weakness: ['shortcoming', 'drawback', 'flaw', 'deficiency'],
  discussion: ['debate', 'dialogue', 'conversation', 'discourse'],
  structure: ['format', 'layout', 'arrangement', 'organization'],
  format: ['layout', 'arrangement', 'structure', 'design'],
  contribution: ['input', 'addition', 'role', 'offering'],
  goal: ['aim', 'objective', 'target', 'intent'],
  insight: ['understanding', 'awareness', 'perception', 'grasp'],
  topic: ['subject', 'theme', 'issue', 'matter'],
  regulation: ['rule', 'standard', 'guideline', 'policy'],
  issue: ['matter', 'concern', 'challenge', 'problem'],
  method: ['technique', 'approach', 'procedure', 'process'],
  characteristic: ['feature', 'trait', 'quality', 'attribute'],
  relationship: ['connection', 'link', 'bond', 'tie'],
  effect: ['result', 'consequence', 'outcome', 'influence'],
  solution: ['remedy', 'answer', 'fix', 'resolution'],
  significance: ['importance', 'weight', 'value', 'meaning'],
  difficulty: ['challenge', 'obstacle', 'problem', 'hardship'],
  advancement: ['progress', 'development', 'growth', 'improvement'],
  chance: ['opportunity', 'occasion', 'opening', 'prospect'],
  foundation: ['basis', 'groundwork', 'bedrock', 'core'],
  application: ['use', 'exercise', 'deployment', 'practice'],
  remedy: ['solution', 'fix', 'cure', 'answer'],
  attention: ['focus', 'notice', 'regard', 'awareness'],
  content: ['material', 'subject matter', 'information', 'subject'],
  debate: ['discussion', 'discourse', 'dialogue', 'deliberation'],
  field: ['area', 'domain', 'sector', 'discipline'],
  work: ['research', 'effort', 'study', 'contribution'],
  trust: ['confidence', 'faith', 'belief', 'reliance'],
  life: ['existence', 'experience', 'reality', 'livelihood'],
  freedom: ['liberty', 'autonomy', 'independence', 'right'],
  body: ['collection', 'volume', 'set', 'corpus'],
  // ── Adverbs ──
  significantly: ['markedly', 'considerably', 'substantially', 'notably'],
  particularly: ['especially', 'specifically', 'notably', 'chiefly'],
  effectively: ['efficiently', 'capably', 'productively', 'successfully'],
  increasingly: ['progressively', 'steadily', 'gradually', 'continually'],
  primarily: ['mainly', 'largely', 'mostly', 'predominantly'],
  directly: ['immediately', 'straight', 'squarely', 'firsthand'],
  often: ['frequently', 'regularly', 'commonly', 'routinely'],
  thereby: ['thus', 'consequently', 'hence', 'accordingly'],
  remarkably: ['strikingly', 'exceptionally', 'impressively', 'notably'],
  fundamentally: ['essentially', 'inherently', 'profoundly', 'deeply'],
  commonly: ['typically', 'usually', 'generally', 'ordinarily'],
  clearly: ['plainly', 'evidently', 'unmistakably', 'obviously'],
  simply: ['merely', 'just', 'only', 'purely'],
  quickly: ['rapidly', 'swiftly', 'promptly', 'speedily'],
  closely: ['tightly', 'intimately', 'nearly', 'strictly'],
  merely: ['simply', 'only', 'just', 'purely'],
  genuinely: ['truly', 'sincerely', 'authentically', 'honestly'],
  ultimately: ['eventually', 'finally', 'lastly', 'conclusively'],
  inadvertently: ['accidentally', 'unintentionally', 'unknowingly', 'unwittingly'],
  considerably: ['substantially', 'markedly', 'greatly', 'notably'],
  consequent: ['resulting', 'following', 'ensuing', 'subsequent'],
  // ── ASD / Sensory / Therapy domain verbs ──
  reinforce: ['strengthen', 'solidify', 'support', 'bolster'],
  validate: ['substantiate', 'verify', 'corroborate', 'support'],
  standardize: ['normalize', 'regulate', 'formalize', 'systematize'],
  monitor: ['track', 'observe', 'watch', 'follow'],
  tailor: ['customize', 'adapt', 'adjust', 'fine-tune'],
  collaborate: ['cooperate', 'partner', 'coordinate', 'work together'],
  promote: ['advance', 'encourage', 'support', 'further'],
  coordinate: ['organize', 'arrange', 'synchronize', 'harmonize'],
  // ── ASD / Sensory / Therapy domain nouns ──
  stimulus: ['trigger', 'prompt', 'cue', 'input'],
  stimuli: ['triggers', 'inputs', 'cues', 'prompts'],
  profile: ['outline', 'overview', 'description', 'snapshot'],
  profiles: ['patterns', 'makeups', 'configurations', 'compositions'],
  sensitivity: ['responsiveness', 'reactivity', 'susceptibility', 'awareness'],
  modality: ['mode', 'form', 'channel', 'medium'],
  deficit: ['shortfall', 'gap', 'weakness', 'impairment'],
  dysfunction: ['impairment', 'disruption', 'malfunction', 'irregularity'],
  engagement: ['involvement', 'participation', 'interaction', 'commitment'],
  exposure: ['contact', 'encounter', 'access', 'introduction'],
  consistency: ['uniformity', 'regularity', 'steadiness', 'stability'],
  validation: ['confirmation', 'verification', 'proof', 'corroboration'],
  protocol: ['procedure', 'guideline', 'standard', 'method'],
  frequency: ['rate', 'regularity', 'occurrence', 'recurrence'],
  intensity: ['strength', 'degree', 'force', 'magnitude'],
  duration: ['length', 'span', 'extent', 'period'],
  generalization: ['transfer', 'extension', 'application', 'spread'],
  // ── AI-evaluative vocabulary that slips through (Surfer / Pangram flags) ──
  reveal: ['show', 'uncover', 'expose', 'make clear'],
  reveals: ['shows', 'uncovers', 'exposes', 'makes clear'],
  fascinating: ['interesting', 'striking', 'notable', 'curious'],
  tension: ['conflict', 'gap', 'clash', 'divide'],
  similarity: ['resemblance', 'parallel', 'likeness', 'overlap'],
  similarities: ['resemblances', 'parallels', 'commonalities', 'overlaps'],
  difference: ['distinction', 'contrast', 'gap', 'variation'],
  differences: ['distinctions', 'contrasts', 'gaps', 'variations'],
  divergence: ['split', 'separation', 'gap', 'divide'],
  intersection: ['overlap', 'crossover', 'meeting point', 'juncture'],
  interplay: ['dynamic', 'relationship', 'connection', 'interaction'],
  nuance: ['detail', 'subtlety', 'shade', 'distinction'],
  nuances: ['details', 'subtleties', 'shades', 'distinctions'],
  compelling: ['strong', 'convincing', 'solid', 'persuasive'],
  articulate: ['express', 'state', 'convey', 'put into words'],
  narrative: ['story', 'account', 'version', 'description'],
  discourse: ['discussion', 'debate', 'conversation', 'dialogue'],
  dimension: ['aspect', 'side', 'element', 'layer'],
  dimensions: ['aspects', 'sides', 'elements', 'layers'],
  facet: ['side', 'aspect', 'angle', 'element'],
  facets: ['sides', 'aspects', 'angles', 'elements'],
  hallmark: ['trait', 'marker', 'sign', 'feature'],
  hallmarks: ['traits', 'markers', 'signs', 'features'],
  cornerstone: ['foundation', 'pillar', 'basis', 'core'],
  bedrock: ['foundation', 'base', 'core', 'root'],
  linchpin: ['key part', 'anchor', 'pivot', 'core element'],
  catalyst: ['trigger', 'driver', 'spark', 'cause'],
  nexus: ['link', 'connection', 'meeting point', 'hub'],
  tapestry: ['mix', 'blend', 'combination', 'weave'],
  mosaic: ['mix', 'blend', 'variety', 'combination'],
  spectrum: ['range', 'scale', 'breadth', 'spread'],
  myriad: ['many', 'countless', 'numerous', 'a host of'],
  plethora: ['abundance', 'wealth', 'many', 'host'],
  multitude: ['many', 'large number', 'host', 'crowd'],
  influx: ['surge', 'rise', 'wave', 'increase'],
  unparalleled: ['unique', 'matchless', 'unmatched', 'unequalled'],
  paramount: ['key', 'foremost', 'central', 'top'],
  groundbreaking: ['new', 'pioneering', 'first', 'original'],
  transformative: ['major', 'sweeping', 'lasting', 'significant'],
  pivotal: ['key', 'central', 'turning', 'decisive'],
  holistic: ['whole', 'broad', 'integrated', 'full'],
  salient: ['key', 'notable', 'main', 'prominent'],
  robust: ['solid', 'strong', 'firm', 'reliable'],
  intricate: ['complex', 'detailed', 'involved', 'layered'],
  profound: ['deep', 'strong', 'great', 'marked'],
  inherent: ['built-in', 'natural', 'core', 'basic'],
  overarching: ['main', 'broad', 'overall', 'wider'],
  substantive: ['real', 'meaningful', 'genuine', 'solid'],
  meticulous: ['careful', 'precise', 'thorough', 'exacting'],
  // ── ChatGPT-specific AI vocabulary (heavily flagged by Originality.ai, GPTZero) ──
  delve: ['explore', 'look into', 'examine', 'investigate'],
  delves: ['explores', 'looks into', 'examines', 'investigates'],
  elucidate: ['explain', 'clarify', 'describe', 'break down'],
  elucidates: ['explains', 'clarifies', 'describes', 'lays out'],
  illuminate: ['explain', 'reveal', 'show', 'make clear'],
  illuminates: ['explains', 'reveals', 'shows', 'makes clear'],
  encapsulate: ['capture', 'summarize', 'convey', 'reflect'],
  encapsulates: ['captures', 'summarizes', 'conveys', 'reflects'],
  exemplify: ['show', 'illustrate', 'demonstrate', 'represent'],
  exemplifies: ['shows', 'illustrates', 'demonstrates', 'represents'],
  resonate: ['connect', 'relate', 'appeal', 'strike'],
  resonates: ['connects', 'relates', 'appeals', 'strikes'],
  underscore: ['highlight', 'emphasize', 'stress', 'show'],
  underscores: ['highlights', 'emphasizes', 'stresses', 'shows'],
  embody: ['represent', 'show', 'reflect', 'capture'],
  embodies: ['represents', 'shows', 'reflects', 'captures'],
  seminal: ['key', 'influential', 'foundational', 'landmark'],
  burgeoning: ['growing', 'rising', 'expanding', 'emerging'],
  nascent: ['emerging', 'early-stage', 'developing', 'new'],
  proliferation: ['growth', 'spread', 'rise', 'increase'],
  culmination: ['result', 'outcome', 'endpoint', 'end point'],
  culminates: ['results', 'ends', 'concludes', 'finishes'],
  multifaceted: ['complex', 'many-sided', 'layered', 'broad'],
  synergistic: ['combined', 'complementary', 'collaborative', 'mutually reinforcing'],
  symbiotic: ['mutually beneficial', 'complementary', 'interdependent'],
  vibrant: ['active', 'dynamic', 'lively', 'thriving'],
  underpinning: ['basis', 'foundation', 'support', 'core'],
  underpins: ['supports', 'forms the basis of', 'drives', 'lies behind'],
  encompass: ['include', 'cover', 'span', 'contain'],
  encompasses: ['includes', 'covers', 'spans', 'contains'],
  innovative: ['new', 'fresh', 'original', 'creative'],
  seamless: ['smooth', 'fluid', 'effortless', 'clean'],
  seamlessly: ['smoothly', 'fluidly', 'effortlessly', 'without friction'],
  empower: ['enable', 'allow', 'help', 'give capacity to'],
  empowers: ['enables', 'allows', 'helps', 'gives people the ability to'],
  fosters: ['builds', 'supports', 'develops', 'helps grow'],
  bolster: ['strengthen', 'support', 'reinforce', 'shore up'],
  bolsters: ['strengthens', 'supports', 'reinforces', 'shores up'],
  nuanced: ['detailed', 'layered', 'subtle', 'complex'],
  imperative: ['necessary', 'required', 'needed', 'essential'],
  // ── Pre-2010 academic tone: modern AI markers → pre-2010 equivalents ──
  // Targets contemporary AI-suspicious markers that didn't exist in pre-2010 papers
  'it is important to note': ['notably', 'it should be noted that', 'it is worth noting'],
  'it is worth noting': ['notably', 'of interest', 'worth noting'],
  'recent studies': ['research', 'studies indicate', 'academic work'],
  'recent research': ['investigation', 'research indicates', 'academic inquiry'],
  'recent advances': ['developments', 'progress', 'advancements'],
  'cutting edge': ['advanced', 'sophisticated', 'modern'],
  'state of the art': ['advanced', 'current', 'established'],
  'machine learning': ['automated systems', 'computer systems', 'algorithmic approaches'],
  'artificial intelligence': ['computer systems', 'computational methods', 'algorithms'],
  'deep learning': ['neural network systems', 'computational models'],
  'neural network': ['computational model', 'algorithmic system'],
  'data-driven': ['evidence-based', 'empirical', 'results-oriented'],
  'paradigm shift': ['significant change', 'major shift', 'transformation'],
  'in today\'s world': ['in contemporary society', 'in present times', 'currently'],
  'in the modern world': ['in contemporary society', 'in present times'],
  'innovative approach': ['novel method', 'new approach', 'distinct strategy'],
  'breakthrough finding': ['significant discovery', 'important finding', 'major advancement'],
  'game-changer': ['game-changing', 'significant change', 'important development'],
  'pivotal role': ['important role', 'key role', 'significant role'],
  'catalyst for': ['driver of', 'force behind', 'influence on'],
  'exponential growth': ['rapid expansion', 'fast growth', 'swift increase'],
  'revolutionized': ['fundamentally changed', 'substantially altered', 'reformed'],
  'ecosystems': ['environments', 'systems', 'contexts'],
  'stakeholders': ['participants', 'parties', 'groups involved'],
  'synergy': ['combination', 'working together', 'mutual benefit'],
  'agile': ['flexible', 'adaptable', 'responsive'],
  'scalable': ['expandable', 'growable', 'capable of expansion'],
  'granular': ['detailed', 'fine-grained', 'specific'],
  'actionable': ['usable', 'practical', 'applicable'],
  'stakeholder engagement': ['participant involvement', 'group participation'],
  'key takeaway': ['main point', 'principal finding', 'important conclusion'],
  'best practices': ['established methods', 'proven approaches', 'accepted procedures'],
  'value proposition': ['benefit', 'advantage', 'worth'],
  'end-to-end': ['comprehensive', 'complete', 'full-scale'],
};

/* ── Morphology Helpers ───────────────────────────────────────────── */

/**
 * Transfer the inflectional suffix from the original word to the replacement.
 * "transformed" + "shift" → "shifted"
 * "making" + "create" → "creating"
 */
function transferMorphology(original: string, replacement: string): string {
  const orig = original.toLowerCase();
  const rep = replacement.toLowerCase();

  // Guard: don't inflect nouns/adjectives that can't take verb suffixes
  const UNINFLECTABLE = /(?:ity|ness|ment|tion|sion|ance|ence|ious|eous|ous|ism|ist|ure|ory|ary|ery|phy|ogy|ics)$/;
  if (UNINFLECTABLE.test(rep)) return replacement;

  // Known longer words that need final consonant doubling 
  const DOUBLE_FINAL = new Set(['outstrip', 'admit', 'commit', 'submit', 'permit', 'omit', 'emit', 'refer', 'occur', 'deter', 'prefer', 'regret', 'begin', 'control', 'equip', 'transfer', 'spur', 'spot', 'infer', 'confer', 'defer', 'incur', 'recur', 'compel', 'expel', 'propel']);

  // CVC doubling check: short words ending consonant-vowel-consonant
  const needsDoubling = (w: string) => {
    const lower = w.toLowerCase();
    if (DOUBLE_FINAL.has(lower)) return true;
    if (w.length < 3 || w.length > 4) return false;
    const vowels = 'aeiou';
    const last = w[w.length - 1];
    const secondLast = w[w.length - 2];
    const thirdLast = w[w.length - 3];
    return !vowels.includes(last) && vowels.includes(secondLast) && !vowels.includes(thirdLast)
      && !['w', 'x', 'y'].includes(last);
  };

  // Past tense: -ed
  if (orig.endsWith('ed') && !rep.endsWith('ed') && orig.length > 4) {
    // Irregular verbs that must not be regularized
    const IRREGULAR_PAST: Record<string, string> = {
      arise: 'arose', become: 'became', begin: 'began', break: 'broke',
      bring: 'brought', build: 'built', buy: 'bought', catch: 'caught',
      choose: 'chose', come: 'came', do: 'did', draw: 'drew',
      drink: 'drank', drive: 'drove', eat: 'ate', fall: 'fell',
      feel: 'felt', find: 'found', fly: 'flew', forget: 'forgot',
      freeze: 'froze', get: 'got', give: 'gave', go: 'went',
      grow: 'grew', have: 'had', hear: 'heard', hide: 'hid',
      hit: 'hit', hold: 'held', keep: 'kept', know: 'knew',
      lead: 'led', leave: 'left', lose: 'lost', make: 'made',
      mean: 'meant', meet: 'met', pay: 'paid', put: 'put',
      read: 'read', ride: 'rode', ring: 'rang', rise: 'rose',
      run: 'ran', say: 'said', see: 'saw', sell: 'sold',
      send: 'sent', set: 'set', show: 'showed', sit: 'sat',
      speak: 'spoke', spend: 'spent', stand: 'stood', steal: 'stole',
      swim: 'swam', swing: 'swung', take: 'took', teach: 'taught',
      tear: 'tore', tell: 'told', think: 'thought', throw: 'threw',
      understand: 'understood', wake: 'woke', wear: 'wore', win: 'won',
      write: 'wrote', spread: 'spread', shed: 'shed', cut: 'cut',
    };
    const irregPast = IRREGULAR_PAST[rep];
    if (irregPast) return replacement[0] === replacement[0].toUpperCase() ? irregPast.charAt(0).toUpperCase() + irregPast.slice(1) : irregPast;
    if (rep.endsWith('e')) return replacement + 'd';
    // consonant+y → -ied (apply→applied), vowel+y → -ed (employ→employed)
    if (rep.endsWith('y') && !'aeiou'.includes(rep[rep.length - 2] || '')) return replacement.slice(0, -1) + 'ied';
    if (rep.endsWith('y')) return replacement + 'ed';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ed';
    return replacement + 'ed';
  }

  // Gerund / present participle: -ing
  if (orig.endsWith('ing') && !rep.endsWith('ing') && orig.length > 5) {
    if (rep.endsWith('ie')) return replacement.slice(0, -2) + 'ying';
    // Double-e words: guarantee→guaranteeing, agree→agreeing (keep both e's)
    if (rep.endsWith('ee')) return replacement + 'ing';
    if (rep.endsWith('e')) return replacement.slice(0, -1) + 'ing';
    if (needsDoubling(rep)) return replacement + rep[rep.length - 1] + 'ing';
    return replacement + 'ing';
  }

  // 3rd person singular present: -s / -es (e.g. "examines" + "judge" → "judges")
  if ((orig.endsWith('es') || (orig.endsWith('s') && !orig.endsWith('ss'))) && !rep.endsWith('s') && orig.length > 4) {
    if (/(?:ch|sh|s|x|z)$/.test(rep)) return replacement + 'es';
    if (rep.endsWith('y') && !'aeiou'.includes(rep[rep.length - 2] || '')) return replacement.slice(0, -1) + 'ies';
    return replacement + 's';
  }

  return replacement;
}

/** Add grammatically correct plural suffix */
function addPlural(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('y') && !'aeiou'.includes(w[w.length - 2] || '')) {
    return word.slice(0, -1) + 'ies';
  }
  if (/(?:ch|sh|s|x|z)$/.test(w)) return word + 'es';
  return word + 's';
}

/**
 * Strip common inflectional suffix to get an approximate base form
 * for dictionary lookup.  Returns the base form.
 */
function naiveStem(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ed') && w.length > 4) {
    const base = w.slice(0, -2);
    // Try e-drop: "enabled" → "enabl" but "enable" is the real stem
    if (base.endsWith('l') || base.endsWith('g') || base.endsWith('v') || base.endsWith('z') || base.endsWith('c') || base.endsWith('t') || base.endsWith('m') || base.endsWith('n') || base.endsWith('r') || base.endsWith('s')) {
      // Try if base+'e' is in dictionaries — return it if so
      if (EXTRA_REPLACEMENTS[base + 'e'] || AI_WORD_REPLACEMENTS[base + 'e']) return base + 'e';
    }
    return base;
  }
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    // e-drop: "leveraging" → "leverag" but "leverage" is the real stem
    if (EXTRA_REPLACEMENTS[base + 'e'] || AI_WORD_REPLACEMENTS[base + 'e']) return base + 'e';
    return base;
  }
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 4) {
    // Try dropping -s first (e.g. "poses" → "pose", "raises" → "raise")
    const dropS = w.slice(0, -1);
    if (EXTRA_REPLACEMENTS[dropS] || AI_WORD_REPLACEMENTS[dropS]) return dropS;
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/* ── Helper: measure word-level change ratio ──────────────────────── */

function wordChangeRatio(original: string, modified: string): number {
  const origWords = original.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const modWords = modified.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (origWords.length === 0) return 0;
  let changed = 0;
  const maxLen = Math.max(origWords.length, modWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (origWords[i] !== modWords[i]) changed++;
  }
  return changed / origWords.length;
}

/* ── Helper: content word overlap (meaning check) ─────────────────── */

function contentOverlap(original: string, modified: string): number {
  const getContent = (t: string) => {
    return t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
  };
  const origSet = new Set(getContent(original));
  const modWords = getContent(modified);
  if (origSet.size === 0) return 1;
  let matches = 0;
  for (const w of modWords) {
    if (origSet.has(w)) { matches++; origSet.delete(w); }
    else {
      // Stem match (first 5 chars)
      for (const o of origSet) {
        if (o.length >= 5 && w.length >= 5 && o.slice(0, 5) === w.slice(0, 5)) {
          matches += 0.7; origSet.delete(o); break;
        }
      }
    }
  }
  return Math.min(1, matches / getContent(original).length);
}

/* ── Readability Scorer ───────────────────────────────────────────
 * Scores a sentence's readability on a 0–1 scale.
 * High = readable/natural. Low = garbled/unnatural.
 * Used to select the BEST iteration, not just the most changed one.
 * ──────────────────────────────────────────────────────────────── */

// Common AI-tell patterns that detectors flag
const AI_TELL_PATTERNS = [
  /\bplays? a (?:crucial|vital|key|significant|pivotal|critical|important|essential|fundamental|central|major) role\b/i,
  /\bserves? as (?:a |an )?(?:crucial|vital|key|critical|important|essential) (?:tool|mechanism|framework|foundation|component)\b/i,
  /\bit is (?:important|essential|crucial|vital|worth noting|noteworthy|significant) (?:to|that)\b/i,
  /\bprovides? (?:a |an )?(?:comprehensive|holistic|thorough|detailed) (?:overview|understanding|analysis|framework|examination)\b/i,
  /\bhas (?:gained|garnered|received|attracted) (?:significant|considerable|substantial|growing|increasing) (?:attention|interest|focus|traction)\b/i,
  /\bthis (?:highlights|underscores|emphasizes|demonstrates) the (?:importance|need|significance|value|necessity) of\b/i,
  /\bultimately (?:leads?|leading|drives?|driving|results?|resulting) (?:to|in)\b/i,
  /\bin conclusion\b/i,
  /\bfurthermore\b/i,
  /\bmoreover\b/i,
  /\badditionally\b/i,
  /\bnevertheless\b/i,
  /\bconsequently\b/i,
  /\bdelves? into\b/i,
  /\btapestry\b/i,
  /\bseamlessly?\b/i,
  /\binnovative approach\b/i,
  /\boverall,?\s/i,
  /\bin today's (?:world|society|era|age|landscape)\b/i,
  // Extended AI-tell patterns — detectors flag these heavily
  /\bit is (?:widely|generally|commonly) (?:known|recognized|accepted|acknowledged) that\b/i,
  /\bin (?:the|this) (?:realm|sphere|domain|landscape|arena) of\b/i,
  /\ba (?:myriad|plethora|multitude|wealth) of\b/i,
  /\bnavigat(?:e|es|ed|ing) (?:the )?(?:complexities|challenges|intricacies|landscape)\b/i,
  /\bpave(?:s|d)? the way for\b/i,
  /\bshed(?:s|ding)? light on\b/i,
  /\bgive(?:s|n)? rise to\b/i,
  /\bat the (?:core|heart|forefront) of\b/i,
  /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\bone of the (?:most|key|main|primary|greatest|biggest|major)\b/i,
  /\bin recent years\b/i,
  /\bthere (?:are|is) (?:a )?(?:growing|increasing|mounting)\b/i,
  /\bthis (?:study|paper|research|article|analysis) (?:aims|seeks|attempts) to\b/i,
  /\bwhich contributes? to (?:better|improved|enhanced|greater)\b/i,
  /\bfoster(?:s|ed|ing)? (?:a )?(?:sense|culture|environment|atmosphere) of\b/i,
  /\bparadigm shift\b/i,
  /\bholistic (?:approach|understanding|view|perspective)\b/i,
  // Extended real-detector patterns (GPTZero, Turnitin, Originality.ai, Copyleaks)
  /\bin recent years\b/i,
  /\bit can be argued\b/i,
  /\bmoving forward\b/i,
  /\bgoing forward\b/i,
  /\bbest practices?\b/i,
  /\bhas emerged as\b/i,
  /\bcan be attributed to\b/i,
  /\bdelve(?:s|d|ing)?\b/i,
  /\belucidat(?:e|es|ed|ing)\b/i,
  /\bencapsulat(?:e|es|ed|ing)\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bsynergistic\b/i,
  /\bmultifaceted\b/i,
  /\bgroundbreaking\b/i,
  /\binnovative (?:approach|solution|method|framework)\b/i,
  /\bit is (?:widely|generally|commonly) (?:believed|accepted|recognized|acknowledged)\b/i,
  /\ba growing body of\b/i,
  /\bdemonstrates a commitment to\b/i,
  /\bempowers (?:individuals|people|students|users)\b/i,
  /\brepresents? (?:a|an) (?:significant|major) (?:step|shift|milestone)\b/i,
  /\bserves? as (?:a|an) (?:crucial|vital|key|essential) (?:tool|foundation|mechanism)\b/i,
  /\bhas (?:significant|profound|important) implications for\b/i,
  /\bfirst and foremost\b/i,
  /\bneedless to say\b/i,
  /\bat the (?:heart|core|forefront) of\b/i,
  /\bcutting[- ]edge\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\btransformative (?:impact|change|shift|role|effect)\b/i,
  /\bunprecedented (?:growth|success|rate|scale|level)\b/i,
  /\bever[- ]evolving\b/i,
  /\bvibrant (?:community|culture|ecosystem|landscape)\b/i,
];

function scoreReadability(sentence: string, original: string): number {
  let score = 1.0;
  const words = sentence.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Penalize garbled morphology (e.g. "informationd", "analyzement")
  const garbledMorphology = /\b[a-z]+(?:ment|tion|sion)(?:ed|ing|ly)\b/gi;
  const garbleMatches = sentence.match(garbledMorphology);
  if (garbleMatches) score -= garbleMatches.length * 0.08;

  // 2. Penalize doubled words ("the the", "is is")
  const doubled = sentence.match(/\b(\w+)\s+\1\b/gi);
  if (doubled) score -= doubled.length * 0.15;

  // 3. Penalize sentences that are too short (<4 words) or too long (>45 words)
  if (wordCount < 4 && wordCount > 0) score -= 0.2;
  if (wordCount > 45) score -= 0.15;

  // 4. Penalize article mismatches ("a information", "an big")
  const badArticleA = sentence.match(/\ba\s+[aeiou]\w/gi);
  const badArticleAn = sentence.match(/\ban\s+[bcdfghjklmnpqrstvwxyz]\w/gi);
  if (badArticleA) score -= badArticleA.length * 0.08;
  if (badArticleAn) score -= badArticleAn.length * 0.08;

  // 5. Penalize AI-tell patterns still present — heavier weight drives selection
  //    toward candidates that have fewer AI signals
  let aiTells = 0;
  for (const pattern of AI_TELL_PATTERNS) {
    if (pattern.test(sentence)) aiTells++;
  }
  score -= aiTells * 0.18;

  // 6. Penalize contractions (academic must not have them)
  const contractions = sentence.match(/\b\w+[''\u2019](?:t|s|re|ve|ll|d|m)\b/gi);
  if (contractions) score -= contractions.length * 0.12;

  // 7. Reward meaning preservation — content overlap with original
  const overlap = contentOverlap(original, sentence);
  if (overlap < 0.20) score -= 0.25; // too far from original meaning
  if (overlap > 0.85) score -= 0.05; // not enough change

  // 8. Penalize consecutive rare/long words (3+ in a row with 8+ chars)
  let consecutiveLong = 0;
  let maxConsecutive = 0;
  for (const w of words) {
    if (w.replace(/[^a-zA-Z]/g, '').length >= 8) {
      consecutiveLong++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveLong);
    } else {
      consecutiveLong = 0;
    }
  }
  if (maxConsecutive >= 3) score -= 0.10;
  if (maxConsecutive >= 5) score -= 0.15;

  // 9. Penalize first person when not in original
  if (/\b(?:I|we|my|our|me|us)\b/.test(sentence) && !/\b(?:I|we|my|our|me|us)\b/.test(original)) {
    score -= 0.15;
  }

  // 10. Penalize rhetorical questions
  if (/\?\s*$/.test(sentence) && !/\?\s*$/.test(original)) {
    score -= 0.20;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Composite quality score for selecting the best iteration result.
 * Balances word-level change, readability, and AI signal absence.
 */
function compositeQualityScore(
  original: string,
  candidate: string,
  readabilityBias = 0.45,
  cachedOrigRisk?: ReturnType<typeof scoreSentenceRisk>,
): number {
  const changeRatio = wordChangeRatio(original, candidate);
  const readability = scoreReadability(candidate, original);

  // AI Signal Penalty: penalize candidate if it still carries AI-risk signals.
  // Weights are intentionally high — AI evasion is the primary goal of Nuru.
  const candRisk = scoreSentenceRisk(candidate, null);
  let aiPenalty = 0;
  if (candRisk.tier === 'critical') aiPenalty = 0.60;  // near-total disqualifier
  else if (candRisk.tier === 'high') aiPenalty = 0.42;  // strong disqualifier
  else if (candRisk.tier === 'medium') aiPenalty = 0.20; // meaningful nudge away

  // Directional delta: compare original AI risk tier to candidate tier.
  // Use cached value when available (avoids re-scoring the same original every iteration).
  const origRisk = cachedOrigRisk ?? scoreSentenceRisk(original, null);
  if (origRisk.tier !== candRisk.tier) {
    const tierMap = { protected: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const origLvl = tierMap[origRisk.tier as keyof typeof tierMap] || 0;
    const candLvl = tierMap[candRisk.tier as keyof typeof tierMap] || 0;
    if (candLvl > origLvl) {
      aiPenalty += 0.40; // regressed — penalise hard
    } else if (candLvl < origLvl) {
      aiPenalty -= 0.25; // improved — bonus (can go negative, effectively a boost)
    }
  }

  // Change score: reward change up to 0.80, then diminishing returns
  // (over-changing hurts readability — thesaurus syndrome)
  const changeScore = changeRatio <= 0.80
    ? changeRatio / 0.80
    : 1.0 - (changeRatio - 0.80) * 0.3;

  // Word count preservation: penalize candidates that shrink word count
  const origWordCount = original.split(/\s+/).filter(Boolean).length;
  const candWordCount = candidate.split(/\s+/).filter(Boolean).length;
  const wordCountRatio = origWordCount > 0 ? candWordCount / origWordCount : 1;
  // Candidates below 85% of original word count get penalized
  const wordCountPenalty = wordCountRatio < 0.85
    ? (0.85 - wordCountRatio) * 1.5  // steep penalty for word loss
    : 0;

  const boundedReadabilityBias = Math.max(0.35, Math.min(0.65, readabilityBias));
  const changeWeight = Math.max(0.25, 0.90 - boundedReadabilityBias);
  return (changeScore * changeWeight) + (readability * boundedReadabilityBias) + (0.10 * Math.min(1, wordCountRatio)) - wordCountPenalty - aiPenalty;
}

/* ── Sentence-Level Restructuring ─────────────────────────────────
 * Structural transforms that change sentence shape, not just words.
 * Applied before word replacement for deeper variety.
 * ──────────────────────────────────────────────────────────────── */

function applySentenceRestructuring(sentence: string, strategy: number): string {
  let text = sentence;

  // ── ALWAYS: Apply evaluative phrase surgery first, regardless of strategy.
  // This strips meta-commentary patterns ("This discrepancy shows...",
  // "Eighteenth-century views reveal fascinating...", etc.) that detectors
  // catch immediately. Must run even when strategy = 0 (word-swap only).
  for (const { pattern, replaceFn } of EVALUATIVE_SURGERIES) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, replaceFn);
  }

  // Strategy 0: No structural restructuring beyond surgery above
  if (strategy === 0) {
    text = text.trim();
    if (text.length > 0 && !/[.!?]$/.test(text)) text += '.';
    if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    return text;
  }

  // Strategy 1: Clause reorder (move prepositional phrase to front)
  // Only reorder when the main clause is a complete independent thought
  // to prevent orphaning fragments or creating meaningless sentences.
  if (strategy === 1 || strategy === 3) {
    const ppMatch = text.match(/^(.{20,}?)\s+((?:in|on|at|for|through|during|within|across|by|under|over|between|among|after|before|since|until|without)\s+[^,]+)[.!?]?\s*$/i);
    if (ppMatch && ppMatch[2].split(/\s+/).length >= 3 && ppMatch[2].split(/\s+/).length <= 10) {
      const pp = ppMatch[2].trim();
      const rest = ppMatch[1].trim().replace(/[,.]$/, '');
      // Only reorder if rest is a complete clause (has subject + verb + 5+ words)
      // and the PP doesn't contain sentence-ending punctuation
      if (isIndependentClause(rest) && !/[.!?]/.test(pp)) {
        text = pp.charAt(0).toUpperCase() + pp.slice(1) + ', ' + rest.charAt(0).toLowerCase() + rest.slice(1) + '.';
      }
    }
  }

  // Strategy 2: Passive ↔ Active voice toggle
  if (strategy === 2 || strategy === 4) {
    const passiveRe = /\b(\w[\w\s]{2,30}?)\s+(is|are|was|were)\s+(\w+ed)\s+by\s+(\w[\w\s]{2,30}?)([.,;])/i;
    const pm = text.match(passiveRe);
    if (pm) {
      const [full, subject, , verb, agent, punct] = pm;
      const activeVerb = verb.replace(/ed$/, 's');
      text = text.replace(full, agent.trim() + ' ' + activeVerb + ' ' + subject.trim() + punct);
    }
  }

  // Strategy 3: Break parallel structures — DISABLED
  // This was producing garbled output like "also uses also employs also applies"
  // and mangling numbers (52,446 → "52 and 446"). Parallel structure breaking
  // requires deep syntactic understanding that regex cannot provide safely.
  // if (strategy === 3) { ... }

  // Strategy 4: Connector disruption (strip or downgrade formal connectors)
  if (strategy >= 2) {
    const connectorRemovals: Record<string, string[]> = {
      'furthermore': ['Beyond that', 'On top of this', 'Also'], 'moreover': ['Also', 'Besides', 'On top of that'], 'additionally': ['Also', 'Plus', 'On top of that'],
      'consequently': ['So', 'Because of this'], 'nevertheless': ['Still', 'Even so'], 'nonetheless': ['Still', 'Even so'],
      'subsequently': ['Then', 'After that', 'Later'], 'accordingly': ['So', 'On that basis'], 'therefore': ['So', 'For that reason'],
      'hence': ['So', 'For that reason'], 'indeed': ['Actually', 'Granted', ''], 'however': ['Still', 'That said', 'Even so', ''], 'in contrast': ['But', 'By comparison'],
      'as a result': ['So', 'Because of this'], 'in addition': ['Also', 'Plus'],
      'in conclusion': ['To wrap up', 'Overall'], 'in summary': ['In short', 'Overall'], 'in essence': ['At its core', 'Basically'],
    };
    for (const [conn, repls] of Object.entries(connectorRemovals)) {
      const re = new RegExp(`^${conn}[,;]?\\s*`, 'i');
      if (re.test(text)) {
        const rep = repls[Math.floor(Math.random() * repls.length)];
        text = text.replace(re, '');
        if (rep) {
          text = rep.charAt(0).toUpperCase() + rep.slice(1) + ' ' + text.charAt(0).toLowerCase() + text.slice(1);
        } else {
          text = text.charAt(0).toUpperCase() + text.slice(1);
        }
        break;
      }
    }
  }

  // Ensure proper ending
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) text += '.';
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/* ── Burstiness Manager ───────────────────────────────────────────
 * Varies sentence lengths within a paragraph for natural rhythm.
 * ONLY splits at verified independent-clause boundaries where both
 * halves can stand alone as grammatical sentences.
 * Returns an array of { text, needsReprocess } — any newly created
 * sentence from a split/merge is flagged for re-processing through
 * processSentence so it gets full cleanup.
 * ──────────────────────────────────────────────────────────────── */

interface BurstResult { text: string; needsReprocess: boolean; }

/**
 * Check if a string fragment looks like a complete independent clause.
 * Must have: at least one subject-like word AND at least one verb.
 */
function isIndependentClause(fragment: string): boolean {
  const trimmed = fragment.trim().replace(/[.!?,;:]+$/, '').trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 5) return false; // too short to be a real sentence

  // Must contain a finite verb (is/are/was/were/has/have/had/do/does/did/can/could/
  // will/would/may/might/shall/should OR a word ending in -s/-ed/-es for 3rd person/past)
  const hasVerb = /\b(is|are|was|were|has|have|had|does|did|do|can|could|will|would|may|might|shall|should|seems?|appears?|remains?|becomes?|provides?|includes?|requires?|involves?|suggests?|indicates?|shows?|demonstrates?|reveals?|represents?|offers?|creates?|makes?|takes?|gives?|leads?|allows?|enables?|helps?)\b/i.test(trimmed)
    || /\b\w+(?:ed|ied|ated|ized|ised)\b/i.test(trimmed); // past tense
  if (!hasVerb) return false;

  // Must start with something subject-like (noun phrase, pronoun, determiner + noun)
  const startsWithSubject = /^(?:the|a|an|this|that|these|those|it|they|he|she|we|its|their|his|her|most|many|some|all|each|both|such|every|several|various|certain|particular|specific|different|similar|other|further|additional|overall|general|key|new|recent|current|early|modern|traditional|digital|online|social|financial|commercial|economic|academic|professional|technical|statistical|analytical|empirical|practical|theoretical|significant|important|essential|critical|effective|efficient|successful|comprehensive|systematic|strategic|primary|secondary|initial|final|subsequent|previous|existing|available|relevant|potential|possible|necessary|sufficient|appropriate|suitable|common|frequent|typical|standard|normal|natural|basic|fundamental|central|main|major|minor|local|global|national|international|internal|external|direct|indirect|positive|negative|high|low|large|small|long|short)\b/i.test(trimmed);

  return startsWithSubject;
}

/**
 * STRICT NO-SPLIT / NO-MERGE: this function used to split long
 * sentences at safe clause boundaries and merge short adjacent
 * ones for GPTZero burstiness. That violates the post-LLM
 * invariant (output sentence count MUST equal input sentence
 * count). We keep the function signature for back-compat with
 * the downstream re-processing loop but it now always returns a
 * 1:1 pass-through. Burstiness is instead handled by in-sentence
 * clause reordering and per-sentence LLM rewrite variance.
 */
function manageBurstiness(sentences: string[]): BurstResult[] {
  return sentences.map((s) => ({ text: s, needsReprocess: false }));
}

/* ── Core: process one sentence ──────────────────────────────────── */

function processSentence(
  sentence: string,
  hasFirstPerson: boolean,
  sentenceIndex: number,
  totalSentences: number,
  usedStarters: Set<string>,
  strength: string,
  isParagraphLead = false,
  detectorPressure = 0,
  strategy: DomainStrategy | null = null,
): string {
  if (!sentence || sentence.trim().length < 8) return sentence;
  const original = sentence;
  const pressure = clamp01(detectorPressure);
  // Normalize em-dashes and en-dashes to spaced hyphens so tokenizer handles them
  let text = sentence.replace(/\u2014/g, ' \u2014 ').replace(/\u2013/g, ' \u2013 ').replace(/  +/g, ' ');

  // ─── Step 0: Nuclear connector strip ─────────────────────────────────────
  // Unconditionally remove sentence-opening AI connectors BEFORE any protection
  // or strategy logic. These are the single biggest signal Surfer / Pangram catch.
  // Replace with an empty string then re-capitalise the next word.
  const NUCLEAR_STARTERS: Array<[RegExp, string[]]> = [
    [/^Furthermore[,;]\s*/i, ['Beyond that, ', 'On top of this, ', 'Also, ', '']],
    [/^Moreover[,;]\s*/i, ['Also, ', 'Besides, ', 'On top of that, ', '']],
    [/^Additionally[,;]\s*/i, ['Also, ', 'Plus, ', 'On top of that, ', '']],
    [/^Consequently[,;]\s*/i, ['So, ', 'Because of this, ', '']],
    [/^However[,;]\s*/i, ['Still, ', 'Even so, ', 'That said, ', 'Yet, ', '']],
    [/^Subsequently[,;]\s*/i, ['Then, ', 'After that, ', 'Later, ']],
    [/^Nevertheless[,;]\s*/i, ['Still, ', 'Even so, ', 'Yet, ']],
    [/^Notwithstanding[,;]\s*/i, ['Even so, ', 'Still, ', 'Despite this, ']],
    [/^Accordingly[,;]\s*/i, ['So, ', 'For that reason, ']],
    [/^Likewise[,;]\s*/i, ['Similarly, ', 'In the same way, ', '']],
    [/^Conversely[,;]\s*/i, ['On the other side, ', 'By contrast, ', '']],
    [/^Meanwhile[,;]\s*/i, ['At the same time, ', 'At this point, ', '']],
    [/^In this light[,;]\s*/i, ['Given this, ', 'With that in mind, ', '']],
    [/^Stepping back[,;]\s*/i, ['Looking at this more broadly, ', '']],
    [/^Notably[,;]\s*/i, ['Worth noting, ', 'Of note, ', '']],
    [/^Interestingly[,;]\s*/i, ['Oddly enough, ', 'Of note, ', '']],
    [/^Ultimately[,;]\s*/i, ['In the end, ', 'All told, ', '']],
    [/^Evidently[,;]\s*/i, ['Clearly, ', 'It seems, ', '']],
    [/^Undoubtedly[,;]\s*/i, ['Clearly, ', 'No doubt, ', '']],
    [/^Undeniably[,;]\s*/i, ['Clearly, ', 'Plainly, ', '']],
    [/^Fundamentally[,;]\s*/i, ['At its core, ', 'Basically, ', '']],
    [/^Essentially[,;]\s*/i, ['In short, ', 'Basically, ', 'At heart, ']],
    [/^Importantly[,;]\s*/i, ['Worth noting, ', 'For the record, ', '']],
    [/^Significantly[,;]\s*/i, ['Worth noting, ', 'Of note, ', '']],
    [/^Crucially[,;]\s*/i, ['Key here is that ', 'What matters is ']],
    [/^In conclusion[,;]\s*/i, ['To wrap up, ', 'All told, ', '']],
    [/^In summary[,;]\s*/i, ['In short, ', 'To sum up, ', '']],
    [/^To summarize[,;]\s*/i, ['In short, ', 'Briefly, ', '']],
    [/^To conclude[,;]\s*/i, ['To wrap up, ', '']],
    [/^Overall[,;]\s*/i, ['All told, ', 'On the whole, ', '']],
    [/^Historically[,;]\s*/i, ['In the past, ', 'Over the years, ', '']],
    [/^Traditionally[,;]\s*/i, ['Conventionally, ', 'In the past, ', '']],
    [/^Typically[,;]\s*/i, ['Usually, ', 'In most cases, ', '']],
    [/^Generally[,;]\s*/i, ['Usually, ', 'For the most part, ', '']],
    [/^Specifically[,;]\s*/i, ['In particular, ', 'To be clear, ', '']],
    [/^Particularly[,;]\s*/i, ['Especially, ', 'Of note, ', '']],
    [/^Effectively[,;]\s*/i, ['In practice, ', 'In effect, ', '']],
    [/^Remarkably[,;]\s*/i, ['Notably, ', 'Worth noting, ', '']],
    [/^Invariably[,;]\s*/i, ['Almost always, ', '']],
    [/^Ideally[,;]\s*/i, ['In the best case, ', '']],
    [/^Encouragingly[,;]\s*/i, ['On a positive note, ', '']],
    [/^In recent years[,;]\s*/i, ['Lately, ', 'Over recent years, ', 'Recently, ']],
    [/^In theory[,;]\s*/i, ['On paper, ', 'Conceptually, ', '']],
    [/^In practice[,;]\s*/i, ['In reality, ', 'On the ground, ', '']],
    [/^At its core[,;]\s*/i, ['At heart, ', 'Fundamentally, ', '']],
    [/^At first glance[,;]\s*/i, ['On the surface, ', '']],
    [/^At the same time[,;]\s*/i, ['Also, ', 'Simultaneously, ', '']],
    [/^As a result[,;]\s*/i, ['So, ', 'Because of this, ', '']],
    [/^As such[,;]\s*/i, ['So, ', 'For this reason, ', '']],
    [/^To this end[,;]\s*/i, ['With this in mind, ', 'For this reason, ', '']],
    [/^With this in mind[,;]\s*/i, ['Given this, ', 'So, ', '']],
    [/^Given this[,;]\s*/i, ['So, ', 'With this in mind, ', '']],
    [/^It is (?:worth noting|important to note|essential to note|crucial to note) that\s*/i, ['Notably, ', 'Worth noting, ', '']],
    [/^It should be noted that\s*/i, ['Notably, ', 'Worth noting, ', '']],
    [/^(?:Research|Studies|Evidence) (?:suggests?|shows?|indicates?|demonstrates?) that\s*/i, ['Studies show that ', 'Research shows ', '']],
    // Sentence-initial additive fillers that cluster across paragraphs
    [/^In fact[,;]\s*/i, ['Actually, ', 'Granted, ', 'True, ', '']],
    [/^In addition[,;]\s*/i, ['Also, ', 'On top of that, ', '']],
    [/^Too[,;]\s+(?=[A-Z])/i, ['']],
  ];
  for (const [re, alts] of NUCLEAR_STARTERS) {
    if (re.test(text)) {
      // ── Connector diversity: prefer alternatives not recently used in this document ──
      // Uses the 'usedStarters' set (namespaced with 'nc:') to prevent consecutive
      // sentences from all resolving to the same replacement (e.g. every 'Moreover'
      // → 'Also, ' producing 'Also, X. Also, Y. Also, Z.' runs).
      const usedKeys = new Set(
        [...usedStarters]
          .filter(k => k.startsWith('nc:'))
          .map(k => k.slice(3))
      );
      const freshAlts = alts.filter(a => {
        const key = a.replace(/[,;\s]+$/, '').toLowerCase().trim();
        return key === '' || !usedKeys.has(key);
      });
      const pool = freshAlts.length > 0 ? freshAlts : alts;
      const replacement = pool[Math.floor(Math.random() * pool.length)];
      // Track this replacement for document-level diversity
      const repKey = replacement.replace(/[,;\s]+$/, '').toLowerCase().trim();
      if (repKey) usedStarters.add('nc:' + repKey);
      text = text.replace(re, replacement);
      // Re-capitalise first character if replacement is empty or lowercase
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
      // Guard: double-conjunction check — if the replacement + remaining text forms
      // a double-conjunction like 'Still, although X...' or 'So even though Y...'
      // strip the second conjunction so the sentence reads naturally.
      text = text.replace(
        /^(Still|Even so|Yet|That said|Also|Besides|So|Plus|And|But|Then|After that|For that reason|Similarly)[,]?\s+(although|though|even though|while|whereas|since|because)\s+/i,
        (_m, _c1, c2) => c2.charAt(0).toUpperCase() + c2.slice(1) + ' ',
      );
      break; // only strip one connector per sentence
    }
  }
  const protectionMap: Record<string, string> = {};
  let protIdx = 0;

  // Protect abbreviations like D.C., U.S., U.K., U.S.A.
  text = text.replace(/\b(?:[A-Z]\.){2,}/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect numbers with commas/decimals (e.g. 52,446 or 3.14 or 18,732)
  text = text.replace(/\b\d[\d,]+(?:\.\d+)?\b/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect percentages (e.g. 35.7%, 100%)
  text = text.replace(/\b\d+(?:\.\d+)?%/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect parenthetical abbreviation definitions: "word (ABBR)" or "phrase (abbr)"
  // e.g. "exploratory data analysis (EDA)" → protect "(EDA)"
  text = text.replace(/\(([A-Z]{2,}[a-z]?)\)/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect in-text citations: "(Author, Year)" or "(Author & Author, Year)"
  text = text.replace(/\([A-Z][a-z]+(?:\s+(?:and|&)\s+[A-Z][a-z]+)?,?\s*\d{4}(?:[a-z])?\)/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect quoted terms: "organic", "Organic", "ORG"
  text = text.replace(/[\u201C\u201D"](.*?)[\u201C\u201D"]/g, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // Protect variable names with underscores: traffic_source, traffic_channel
  text = text.replace(/\b[a-z]+_[a-z_]+\b/gi, (m) => {
    const ph = `XPROT${protIdx++}X`;
    protectionMap[ph] = m;
    return ph;
  });

  // ─── Step 0.5: Sentence-level restructuring ─────────────────
  // Always use full strategy pool — paragraph-lead protection was
  // preventing evaluative surgery & connector disruption from firing,
  // allowing AI meta-commentary to survive into the final output.
  const restructurePool = [0, 1, 2, 3, 4];
  const restructureStrategy = restructurePool[Math.floor(Math.random() * restructurePool.length)] ?? 0;
  text = applySentenceRestructuring(text, restructureStrategy);

  // ─── Step 1: AI phrase replacement ───────────────────────────
  for (const { pattern, replacements } of PHRASE_REPLACEMENTS) {
    if (replacements.length === 0) continue;
    if (replacements[0] === 'SPLIT') {
      // "not only X but also Y" → "X, and Y"
      text = text.replace(pattern, (_m, mid) => {
        return mid.trim().replace(/^,?\s*/, '').replace(/,?\s*$/, '') + ', and ';
      });
      continue;
    }
    const match = text.match(pattern);
    if (match) {
      const rep = replacements[Math.floor(Math.random() * replacements.length)];
      // Preserve capitalization
      const final = match[0][0] === match[0][0].toUpperCase() && rep.length > 0
        ? rep.charAt(0).toUpperCase() + rep.slice(1)
        : rep;
      text = text.replace(pattern, final);
      // If replacement was empty (hedging removal), capitalize next char
      if (final === '' && text.length > 0 && text[0] !== text[0].toUpperCase()) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
  }

  // ─── Step 2: AI word replacement (from shared dictionary) ────
  const tokens = text.split(/(\b)/);
  const resultTokens: string[] = [];
  let replaceCount = 0;
  const wordCount = text.split(/\s+/).length;
  const baseReplacementRate = Math.min(0.92, (strength === 'strong' ? 0.80 : 0.70) + pressure * 0.10);
  // Domain strategy can INCREASE replacement rate but NEVER reduce below baseline
  // (reducing replacement lets AI patterns survive → higher detection scores)
  const domainRate = strategy ? strategy.synonymIntensity + 0.15 : baseReplacementRate;
  const leadRateCap = isParagraphLead ? (0.72 + pressure * 0.12) : 1;
  const maxReplacements = Math.ceil(wordCount * Math.max(baseReplacementRate, domainRate) * leadRateCap);
  const alreadyReplaced = new Set<string>(); // Track Step 2 output words

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (replaceCount >= maxReplacements || !/^[a-zA-Z]{3,}$/.test(token)) {
      resultTokens.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
      resultTokens.push(token);
      continue;
    }
    // Skip proper nouns (capitalized mid-sentence words)
    if (isProperNoun(token, i, tokens)) {
      resultTokens.push(token);
      continue;
    }
    // Skip hyphenated compound prefixes/suffixes (handle empty boundary tokens from \b split)
    const hasHyphenBefore = tokens.slice(Math.max(0, i - 2), i).some(t => t === '-');
    const hasHyphenAfter = tokens.slice(i + 1, Math.min(tokens.length, i + 3)).some(t => t === '-');
    if (hasHyphenBefore || hasHyphenAfter) { resultTokens.push(token); continue; }

    // Check EXTRA_REPLACEMENTS (curated, high quality) FIRST for both exact and stem,
    // then fall through to AI_WORD_REPLACEMENTS
    const stemmed = naiveStem(lower);
    const aiReps = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
      || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
    const usingStem = !EXTRA_REPLACEMENTS[lower] && !AI_WORD_REPLACEMENTS[lower]
      && !!(EXTRA_REPLACEMENTS[stemmed] || AI_WORD_REPLACEMENTS[stemmed]);
    if (aiReps && aiReps.length > 0) {
      // ONLY use pure alphabetic single-word replacements, also check blacklist
      const pool = aiReps.filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
        && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()));
      if (pool.length > 0) {
        let rep = pool[Math.floor(Math.random() * Math.min(3, pool.length))];
        // Preserve capitalization
        if (token[0] === token[0].toUpperCase()) {
          rep = rep.charAt(0).toUpperCase() + rep.slice(1);
        }
        // Transfer morphology if we matched via stem
        if (usingStem) {
          rep = transferMorphology(token, rep);
        }
        // Preserve plural — only when we stemmed (otherwise "process" → "analyzes" bug)
        if (usingStem && /s$/.test(token) && !/s$/.test(rep) && token.length > 4) {
          rep = addPlural(rep);
        }
        resultTokens.push(rep);
        alreadyReplaced.add(rep.toLowerCase());
        replaceCount++;
        continue;
      }
    }

    resultTokens.push(token);
  }
  text = resultTokens.join('');

  // ─── Step 3: Additional synonym swap — curated first, then extended dict ──
  // Chain: try curated EXTRA_REPLACEMENTS / AI_WORD_REPLACEMENTS,
  //        then fall back to extended dictionary with aggressive POS filtering.
  const currentChange = wordChangeRatio(original, text);
  if (currentChange < 0.65) {
    const tokens2 = text.split(/(\b)/);
    const result2: string[] = [];
    let extraSwaps = 0;
    const neededChange = 0.65 - currentChange;
    const maxExtra = Math.ceil(wordCount * neededChange) + 6;

    for (let i = 0; i < tokens2.length; i++) {
      const tk = tokens2[i];
      if (extraSwaps >= maxExtra || !/^[a-zA-Z]{4,}$/.test(tk)) {
        result2.push(tk);
        continue;
      }
      const lower = tk.toLowerCase();
      if (PROTECTED.has(lower) || STOPWORDS.has(lower) || alreadyReplaced.has(lower)) {
        result2.push(tk);
        continue;
      }
      // Skip proper nouns (capitalized mid-sentence words)
      if (isProperNoun(tk, i, tokens2)) {
        result2.push(tk);
        continue;
      }
      // Skip hyphenated compound parts (handle empty boundary tokens from \b split)
      const hasHypBefore = tokens2.slice(Math.max(0, i - 2), i).some(t => t === '-');
      const hasHypAfter = tokens2.slice(i + 1, Math.min(tokens2.length, i + 3)).some(t => t === '-');
      if (hasHypBefore || hasHypAfter) { result2.push(tk); continue; }

      // Try curated dictionaries first (100% for each eligible word)
      const stemmed = naiveStem(lower);
      const reps = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
        || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
      const usedStem = !EXTRA_REPLACEMENTS[lower] && !AI_WORD_REPLACEMENTS[lower]
        && !!(EXTRA_REPLACEMENTS[stemmed] || AI_WORD_REPLACEMENTS[stemmed]);

      let replaced = false;
      if (reps && reps.length > 0) {
        const pool = reps.filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
          && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
        if (pool.length > 0) {
          // Consult safety gate — picks the best replacement in this context
          // and vetoes collocation-breakers / register drops / bad bigrams.
          const { leftWord, rightWord } = contextFor(tokens2, i);
          const safePick = pickBestReplacement(lower, pool, {
            sentence: text,
            leftWord,
            rightWord,
          });
          if (safePick && isSafeSwap(lower, safePick, { sentence: text, leftWord, rightWord })) {
            let rep = safePick;
            if (usedStem) rep = transferMorphology(tk, rep);
            if (tk[0] === tk[0].toUpperCase()) {
              rep = rep.charAt(0).toUpperCase() + rep.slice(1);
            }
            const tkStem = naiveStem(tk.toLowerCase());
            if (tkStem !== tk.toLowerCase() && /s$/.test(tk) && !/s$/.test(rep) && tk.length > 4) {
              rep = addPlural(rep);
            }
            result2.push(rep);
            extraSwaps++;
            replaced = true;
          }
        }
      }

      // Fallback: extended dictionary with POS-suffix consistency
      // Extended dictionary — enabled at 20% probability for sentences that
      // have below-average coverage after curated replacements. Guarded by the
      // full REPLACEMENT_BLACKLIST + POS-suffix consistency check.
      if (!replaced && wordChangeRatio(original, result2.join('')) < 0.50 && Math.random() < 0.20) { // formerly 0.00 (dead)
        let syn = getBestReplacement(lower, text);
        if (!syn || syn.toLowerCase() === lower) {
          if (stemmed !== lower) syn = getBestReplacement(stemmed, text);
        }
        if (syn && syn.toLowerCase() !== lower && /^[a-zA-Z]+$/.test(syn) && syn.length >= 3
            && !REPLACEMENT_BLACKLIST.has(syn.toLowerCase())
            && syn.length <= lower.length * 2 && syn.length >= Math.max(3, lower.length * 0.4)) {
          // POS-suffix consistency: if original ends -tion/-ment/-ness, synonym must too
          const origSuffix = lower.match(/(tion|sion|ment|ness|ity|ance|ence|ous|ive|ful|less|able|ible|ing|ated|ized|ally|ily)$/);
          const synSuffix = syn.toLowerCase().match(/(tion|sion|ment|ness|ity|ance|ence|ous|ive|ful|less|able|ible|ing|ated|ized|ally|ily)$/);
          // Either both have similar suffixes, or neither has an obvious suffix
          const suffixOk = (!origSuffix && !synSuffix) // both bare
            || (origSuffix && synSuffix) // both have suffixes (any combo ok)
            || (!origSuffix && syn.length <= lower.length * 1.5); // bare → bare-ish
          if (suffixOk) {
            let rep = syn;
            rep = transferMorphology(tk, rep);
            if (tk[0] === tk[0].toUpperCase()) {
              rep = rep.charAt(0).toUpperCase() + rep.slice(1);
            }
            const tkStem = naiveStem(tk.toLowerCase());
            if (tkStem !== tk.toLowerCase() && /s$/.test(tk) && !/s$/.test(rep) && tk.length > 4) {
              rep = addPlural(rep);
            }
            result2.push(rep);
            extraSwaps++;
            replaced = true;
          }
        }
      }

      if (!replaced) result2.push(tk);
    }
    text = result2.join('');
  }

  // ─── Step 3b: Clause reordering ──────────────────────────────
  // Swap independent clauses around ", and ", ", but ", ", which " etc.
  // This adds structural change without changing any words.
  // Domain strategy can INCREASE structural rate but never reduce below 0.25 baseline
  const clauseReorderRate = (strategy ? Math.max(0.25, strategy.structuralRate) : 0.25) * (isParagraphLead ? 0.55 + pressure * 0.25 : 1);
  if (Math.random() < clauseReorderRate && text.length > 40) {
    // Try swapping clauses around ", and " or ", but "
    const clauseSwapRe = /^(.{15,}?),\s+(and|but|yet)\s+(.{15,})$/i;
    const clauseMatch = text.match(clauseSwapRe);
    if (clauseMatch) {
      const [, first, conj, second] = clauseMatch;
      // Only swap if both parts look like independent clauses (have a verb)
      const hasVerb = (s: string) => /\b(is|are|was|were|has|have|had|does|did|can|could|will|would|may|might|shall|should)\b/i.test(s);
      if (hasVerb(first) && hasVerb(second)) {
        const secondCap = second.charAt(0).toUpperCase() + second.slice(1);
        const firstLower = first.charAt(0).toLowerCase() + first.slice(1);
        text = secondCap + ', ' + conj.toLowerCase() + ' ' + firstLower;
        // Fix ending punctuation
        if (!/[.!?]$/.test(text)) text += '.';
      }
    }
  }

  // ─── Step 3c: Passive ↔ Active voice toggle ─────────────────
  // ~20% chance: convert "X is/was Yed by Z" → "Z Yed X" or vice versa
  // Domain strategy can INCREASE voice toggle rate but never reduce below 0.15 baseline
  const voiceToggleRate = (strategy ? Math.max(0.15, strategy.structuralRate * 0.6) : 0.15) * (isParagraphLead ? 0.45 + pressure * 0.30 : 1);
  if (Math.random() < voiceToggleRate && text.length > 30) {
    // Passive → Active: "X is/was <verb>ed by Y" → "Y <verb>s X"
    const passiveRe = /\b(\w[\w\s]{2,30}?)\s+(is|are|was|were)\s+(\w+ed)\s+by\s+(\w[\w\s]{2,30}?)([.,;])/i;
    const pm = text.match(passiveRe);
    if (pm) {
      const [full, subject, , verb, agent, punct] = pm;
      const activeVerb = verb.replace(/ed$/, 's');
      text = text.replace(full, agent.trim() + ' ' + activeVerb + ' ' + subject.trim() + punct);
    }
  }

  // ─── Step 4: Probabilistic sentence starter injection ────────
  // ~5% chance, only if sentence doesn't already start with a varied opener
  const starterRoll = Math.random();
  const alreadyHasStarter = /^(However|Although|Though|Moreover|Furthermore|Thus|Therefore|Hence|Consequently|Because|Since|Yet|Meanwhile|Additionally|Instead|Despite|In spite|Driven by|As a|As the|Notably|Historically|Traditionally|In practice|In broad|From a|At its|On balance|By extension|In reality|Against|Under these|For instance|For example|To illustrate|In particular|More specifically)/i.test(text) || /^[A-Z][a-z]+,\s/.test(text);
  // Domain strategy can INCREASE starter rate but never reduce below 0.05 baseline
  const starterRate = (strategy ? Math.max(0.05, strategy.starterInjectionRate) : 0.05) * (isParagraphLead ? 0.15 : 1 + pressure * 0.15);
  if (starterRoll < starterRate && !alreadyHasStarter && sentenceIndex > 0 && !isParagraphLead && text.length > 30) {
    // Merge domain-specific starters with academic starters
    const domainStarters = strategy ? strategy.domainStarters : [];
    const allStarters = [...new Set([...STARTERS_ACADEMIC, ...domainStarters])];
    const available = allStarters.filter(s => !usedStarters.has(s));
    if (available.length > 0) {
      const starter = available[Math.floor(Math.random() * available.length)];
      usedStarters.add(starter);
      text = starter + ' ' + text.charAt(0).toLowerCase() + text.slice(1);
    }
  }

  // ─── Step 5: Hedging/cliché opener removal ──────────────────
  text = text.replace(/^In today's (?:world|society|era|age),?\s*/i, '');
  text = text.replace(/^In the modern (?:world|era|age),?\s*/i, '');
  text = text.replace(/^Throughout history,?\s*/i, '');
  text = text.replace(/^It is (?:widely|generally|commonly) (?:known|recognized|accepted) that\s*/i, '');
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // ─── Step 6: Expand contractions (REQUIRE apostrophe) ────────
  for (const [c, e] of Object.entries(CONTRACTIONS)) {
    const escaped = c.replace(/'/g, "[''\u2019]");
    const re = new RegExp('\\b' + escaped + '\\b', 'gi');
    text = text.replace(re, e);
  }

  // ─── Step 7: Remove first person (unless input had it) ───────
  if (!hasFirstPerson) {
    text = text.replace(/\bI believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bI think\b/gi, 'The analysis indicates');
    text = text.replace(/\bWe believe\b/gi, 'The evidence suggests');
    text = text.replace(/\bWe observe\b/gi, 'Observations show');
    text = text.replace(/\bI\s+(?=\w)/g, 'The analysis ');
    text = text.replace(/\bwe\s+(?=\w)/gi, 'the research ');
    text = text.replace(/\bmy\b/g, 'the');
    text = text.replace(/\bMy\b/g, 'The');
    text = text.replace(/\bour\b/g, 'the');
    text = text.replace(/\bOur\b/g, 'The');
  }

  // ─── Step 8: Grammar cleanup ─────────────────────────────────
  text = text.replace(/\b(\w+)\s+\1\b/gi, '$1');          // doubled words
  text = text.replace(/\b(a|an|the)\s+(a|an|the)\b/gi, '$2'); // double articles
  text = text.replace(/\s{2,}/g, ' ');                     // multiple spaces
  text = text.replace(/\s+([.,;:!?])/g, '$1');            // space before punctuation
  // Fix AI/acronym capitalization
  text = text.replace(/\bai\b/gi, 'AI');
  text = text.replace(/\bAi-/g, 'AI-');
  // Article agreement
  text = text.replace(/\ba\s+([aeiou])/gi, (m, v) => {
    return (m[0] === 'A' ? 'An ' : 'an ') + v;
  });
  text = text.replace(/\ban\s+([bcdfgjklmnpqrstvwxyz])/gi, (m, c) => {
    return (m[0] === 'A' ? 'A ' : 'a ') + c;
  });
  // Ensure proper ending
  text = text.trim();
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text += '.';
  }
  // Capitalize first letter
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Restore ALL protected tokens (numbers, brackets, abbreviations, citations, quotes)
  for (const [placeholder, original_text] of Object.entries(protectionMap)) {
    text = text.replace(new RegExp(placeholder, 'g'), original_text);
  }

  // ─── Fix double/triple dots (e.g. "services..." → "services.") ───
  text = text.replace(/\.{2,}/g, '.');

  // ─── Fix repeated words/phrases ("also uses also uses also employs") ───
  // Catch repeated 1-3 word phrases
  text = text.replace(/\b(\w+(?:\s+\w+){0,2})\s+(?:also\s+)?\1\b/gi, '$1');
  text = text.replace(/\b(also\s+\w+)\s+also\s+/gi, '$1 ');

  // ─── Step 9: Quality gate ──────────────────────────────────
  // Disabled: with curated-only replacements, lexical overlap is
  // a poor signal — all content words may legitimately change.
  // The iteration loop naturally selects the best result.
  // const overlap = contentOverlap(original, text);
  // if (overlap < 0.08) return original;

  return text;
}

/* ── Human Imperfection Injector ──────────────────────────────────────────
 * Applied ONCE as the very last transformation in stealthHumanize.
 * Introduces deliberate, authentic human writing patterns that register
 * as natural authorship signals to AI detectors.
 *
 * STRICT RULES (user mandate — never violate):
 *   - NO contractions injected under any circumstance
 *   - NO first-person pronouns (I/me/my/we/our) unless already in input
 *   - NO rhetorical questions
 *   - Only impersonal blog-style natural flow variations permitted
 * ─────────────────────────────────────────────────────────────────────── */
function injectHumanImperfections(
  text: string,
  _activeTone: ToneSettings | null,
  rng: { next: () => number },
): string {
  const paragraphs = text.split(/\n\s*\n/);
  const processed = paragraphs.map((para, paraIdx) => {
    if (!para.trim()) return para;
    const sentences = splitSentences(para.trim());
    if (sentences.length === 0) return para;

    const outputSentences = sentences.map((sent, sentIdx) => {
      const t = sent.trim();
      // Skip headings, citations, URLs, and very short fragments
      if (
        t.length < 15 ||
        /^#{1,6}\s/.test(t) ||
        /^\[\d+\]/.test(t) ||
        /^https?:\/\//.test(t) ||
        /^[A-Z][a-zA-Z, .&]+\(\d{4}\)/.test(t)
      ) return sent;

      const roll = rng.next();

      // ── Type 1: Sentence-initial conjunction (~9% of non-first sentences) ──
      // "And this shows..." / "But the data suggests..." — classic blog openers.
      // Only applies inside the body (not paragraph 0) so the opening stays clean.
      // Safety: never inject if the result would start with a first-person pronoun.
      if (sentIdx > 0 && paraIdx > 0 && roll < 0.09) {
        const conj = rng.next() < 0.55 ? 'And ' : 'But ';
        const lowered = t.charAt(0).toLowerCase() + t.slice(1);
        if (!/^(i |i'|me |my |we |our )/.test(lowered) && !/\?/.test(t)) {
          return conj + lowered;
        }
      }

      // ── Type 2: Oxford comma removal (~18% of eligible list sentences) ──
      // "X, Y, and Z" → "X, Y and Z" — a natural human stylistic variation.
      if (roll >= 0.72 && roll < 0.90 && /,\s+and\s+[a-z]/i.test(t)) {
        return t.replace(/,(\s+and\s+[a-z])/i, '$1');
      }

      // ── Type 3: Light parenthetical aside (~5% of longer sentences) ──
      // Mimics the natural tangents human writers drop mid-sentence.
      // All asides are strictly impersonal — no question forms, no "I think".
      if (roll >= 0.90 && roll < 0.95 && t.split(/\s+/).length > 12) {
        const asides = [
          ' (though this varies)',
          ', at least in practice,',
          ' (worth noting)',
          ', and this matters,',
          ' (to varying degrees)',
          ' (in most cases)',
          ', which is telling,',
          ' (at least in this context)',
        ];
        const aside = asides[Math.floor(rng.next() * asides.length)];
        const insertPos = t.lastIndexOf(',', t.length - 6);
        if (insertPos > Math.floor(t.length * 0.45)) {
          return t.slice(0, insertPos) + aside + t.slice(insertPos);
        }
      }

      // ── Type 4: Mid-sentence qualifier insertion (~5% of longer sentences) ──
      // Adds a natural qualifier word mid-sentence that human writers use instinctively.
      if (roll >= 0.95 && t.split(/\s+/).length > 10 && !/\?/.test(t)) {
        const qualifiers = ['largely ', 'mostly ', 'broadly ', 'generally ', 'in large part '];
        // Find a "which" or "that" or "where" in the second half to insert after
        const midPoint = Math.floor(t.length * 0.4);
        const afterMid = t.slice(midPoint);
        const relMatch = afterMid.match(/\b(which|where|when)\s+(?=[a-z])/i);
        if (relMatch && relMatch.index !== undefined) {
          const insertAt = midPoint + relMatch.index + relMatch[0].length;
          const qualifier = qualifiers[Math.floor(rng.next() * qualifiers.length)];
          return t.slice(0, insertAt) + qualifier + t.slice(insertAt);
        }
      }

      return sent;
    });

    return outputSentences.join(' ');
  });

  return processed.join('\n\n');
}

/* ── Public API ───────────────────────────────────────────────────── */

export function stealthHumanize(
  text: string,
  strength: string = 'medium',
  _tone: string = 'academic',
  maxIterations: number = 15,
  options: StealthHumanizeOptions = {},
): string {
  const detectorPressure = Math.max(0.6, clamp01(options.detectorPressure ?? 0));
  const humanVariance = clamp01(options.humanVariance ?? 0.04);
  const preserveLeadSentences = options.preserveLeadSentences !== false;
  const readabilityBias = clamp01(options.readabilityBias ?? (_tone === 'academic_blog' || _tone === 'casual' ? 0.9 : 0.7));
  // Guarantee Nuru itself iterates completely to clean AI signals (minimum 10)
  const enforcedMaxIterations = Math.max(10, Math.round(maxIterations + detectorPressure * 15));
  console.log('[Nuru] === Intelligent Engine === Input length:', text.length);
  if (!text || text.trim().length === 0) return text;

  // ── Per-call variation RNG ──
  // Guarantees different humanized output on every invocation, even for
  // identical input. Seeded from Date.now() ^ performance.now() ^
  // Math.random() ^ hashText(text) ^ options.variationSeed.
  const rng = createVariationRNG(text, options.variationSeed ?? "");

  // ── Input shape (drives purity gate) ──
  const inputShape = detectInputShape(text);
  const firstPersonAllowed = options.firstPersonAllowed ?? inputShape.hasFirstPerson;
  const effectiveShape: InputShape = {
    hasFirstPerson: firstPersonAllowed,
    hasContractions: false, // always expand contractions for academic output
  };

  // Resolve tone — determines contraction policy, openers, max length, etc.
  const activeTone = resolveTone(_tone);
  console.log(`[Nuru] Tone: ${activeTone.id} (${activeTone.label})`);

  // Detect domain and merge domain-specific protected terms into the static set
  const domainResult = detectDomain(text);
  const domainProtected = getProtectedTermsForDomain(domainResult);
  for (const term of domainProtected) PROTECTED.add(term.toLowerCase());
  const stealthStrategy = resolveStrategy(domainResult);
  console.log(`[Nuru] Domain: ${domainResult.primary} (${(domainResult.confidence * 100).toFixed(0)}%) — added ${domainProtected.size} protected terms, synInt=${stealthStrategy.synonymIntensity.toFixed(2)}, structRate=${stealthStrategy.structuralRate.toFixed(2)}`);

  const hasFirstPerson = firstPersonAllowed;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const usedStarters = new Set<string>();

  // Count total sentences for index tracking
  let globalSentenceIdx = 0;
  const allSentences: Array<{ paraIdx: number; sentences: string[] }> = [];
  let totalSentences = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sents = splitSentences(paragraphs[pi]);
    allSentences.push({ paraIdx: pi, sentences: sents });
    totalSentences += sents.length;
  }

  // Process sentence by sentence, preserving paragraph structure
  const outputParagraphs: string[] = [];

  for (const { sentences } of allSentences) {
    const outputSentences: string[] = [];

    for (const sent of sentences) {
      const originalSent = sent;
      const isParagraphLead = preserveLeadSentences && outputSentences.length === 0;

      // Risk-score the sentence to determine how aggressively to iterate
      const sentRisk = scoreSentenceRisk(sent, domainResult);
      if (sentRisk.tier === 'protected') {
        // Skip all processing — heading, citation, or very short fragment
        outputSentences.push(sent);
        globalSentenceIdx++;
        continue;
      }
      // Scale max iterations per sentence based on its risk tier.
      // ALL tiers including 'low' now use full iterations — user mandate:
      // aggressive at LowDepth, AI evasion is priority at every depth level.
      const sentMaxIter = sentRisk.tier === 'critical'
        ? Math.round(enforcedMaxIterations * 1.5)
        : enforcedMaxIterations;

      // Cache the original sentence's AI risk — it never changes across iterations.
      // Pass it into compositeQualityScore to avoid redundant re-scoring every loop.
      const origRiskCache = scoreSentenceRisk(originalSent, domainResult);

      // First pass uses real sentenceIndex (enables starter injection on non-first sentences)
      const rawFirst = processSentence(
        sent, hasFirstPerson, globalSentenceIdx, totalSentences,
        usedStarters, strength, isParagraphLead, detectorPressure, stealthStrategy,
      );
      // Strict 1:1 guard — if the transform accidentally split, collapse back.
      let best = guardSingleSentence(originalSent, rawFirst);
      // Purity: reject candidates that introduce banned patterns.
      if (violatesPurity(best, effectiveShape)) best = originalSent;
      let bestScore = compositeQualityScore(originalSent, best, 0.35 + readabilityBias * 0.30, origRiskCache);

      // Iterative refinement: each pass starts from ORIGINAL to prevent
      // compounding garble. We keep the best result (highest composite score
      // balancing change ratio, readability, and AI signal absence).
      // Subsequent passes use sentenceIndex=0 to prevent duplicate starter
      // injection, and borrow entropy from the per-call RNG so repeated
      // invocations of the same document produce different humanized text.
      let iter = 1;
      while (iter <= sentMaxIter) {
        // Strength escalation: start escalating from iter 3 (was 5) so more
        // iterations use 'strong' rewrites, increasing AI signal destruction speed.
        const escalate = iter > 3 || rng.next() < detectorPressure * 0.35;
        const iterStrength = escalate ? 'strong' : strength;
        const rawNext = processSentence(
          originalSent, hasFirstPerson, iter === 1 ? globalSentenceIdx : 0,
          totalSentences, usedStarters, iterStrength as any, isParagraphLead, detectorPressure, stealthStrategy,
        );
        const next = guardSingleSentence(originalSent, rawNext);
        if (violatesPurity(next, effectiveShape)) {
          iter++;
          continue;
        }
        const nextScore = compositeQualityScore(originalSent, next, 0.35 + readabilityBias * 0.30, origRiskCache);
        if (nextScore > bestScore) {
          best = next;
          bestScore = nextScore;
        }
        // Only exit early when BOTH conditions hold:
        //   1. We have changed at least 80% of words (strong surface rewrite)
        //   2. The current best has dropped to LOW risk tier (AI signals gone)
        // Never break early for high/critical sentences — keep grinding.
        if (iter >= 10 && wordChangeRatio(originalSent, best) >= 0.80) {
          const bestRisk = scoreSentenceRisk(best, domainResult);
          if (bestRisk.tier === 'low' || bestRisk.tier === 'protected') break;
        }
        iter++;
      }

      // Final per-sentence purity polish — expand any residual contractions,
      // scrub any residual first-person / funny-phrase artifacts.
      best = applyPurityRules(best, effectiveShape);
      best = guardSingleSentence(originalSent, best);

      outputSentences.push(best);
      globalSentenceIdx++;
    }

    // Apply burstiness management — splits/merges get flagged for reprocessing
    const burstyResults = manageBurstiness(outputSentences);

    // Re-process any newly created sentences (from splits/merges) through
    // the full processSentence pipeline so they get proper cleanup, synonym
    // replacement, grammar fixes etc. This keeps everything sentence-by-sentence.
    const finalSentences: string[] = [];
    for (const item of burstyResults) {
      if (item.needsReprocess && item.text.trim().length >= 8) {
        // Run 3 iterations on the new sentence and pick the best
        let reprocessBest = processSentence(
          item.text, hasFirstPerson, 0, totalSentences, usedStarters, strength, false, detectorPressure, stealthStrategy,
        );
        let reprocessBestScore = compositeQualityScore(item.text, reprocessBest, 0.35 + readabilityBias * 0.30);
        for (let ri = 0; ri < 3; ri++) {
          const candidate = processSentence(
            item.text, hasFirstPerson, 0, totalSentences, usedStarters, strength, false, detectorPressure, stealthStrategy,
          );
          const score = compositeQualityScore(item.text, candidate, 0.35 + readabilityBias * 0.30);
          if (score > reprocessBestScore) {
            reprocessBest = candidate;
            reprocessBestScore = score;
          }
        }
        finalSentences.push(reprocessBest);
      } else {
        finalSentences.push(item.text);
      }
    }

    outputParagraphs.push(finalSentences.join(' '));
  }

  // Final post-processing: fix AI/acronym capitalization across all output
  let result = outputParagraphs.join('\n\n');
  result = result.replace(/\bAi\b/g, 'AI');
  result = result.replace(/\bai\b/g, 'AI');

  // Fix double/triple dots across entire output
  result = result.replace(/\.{2,}/g, '.');

  // Fix repeated word/phrase patterns across entire output
  result = result.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Fix spacing issues — use [ \t] to preserve \n\n paragraph breaks
  result = result.replace(/[ \t]{2,}/g, ' ');
  result = result.replace(/[ \t]+([.,;:!?])/g, '$1');

  // Independent detector specific deep cleaning phases
  result = runFullDetectorForensicsCleanup(result);

  // Apply tone-specific polish (contractions, cadence, openers)
  if (activeTone) {
    result = applyToneAdjustment(result, activeTone);
  }

  // Document-level purity polish — one last pass to guarantee no
  // contractions, no first person (unless input had it), no funny phrases.
  result = applyPurityRules(result, effectiveShape);

  if (humanVariance > 0) {
    const paragraphsWithVariance = result.split(/\n\s*\n/).map((paragraph) => {
      const sentences = splitSentences(paragraph.trim());
      if (sentences.length <= 1) return paragraph.trim();
      return sentences.map((sentence, index) => {
        if (index === 0 || rng.next() > Math.min(0.20, humanVariance + detectorPressure * 0.08)) return sentence;
        let varied = sentence;
        varied = varied.replace(/^(However|Moreover|Furthermore|Additionally),\s+/i, (_m, word) => word.charAt(0).toUpperCase() + word.slice(1) + ' ');
        varied = varied.replace(/\s*,\s*/g, ', ');
        varied = varied.replace(/\bthat\s+that\b/gi, 'that');
        return varied;
      }).join(' ');
    });
    result = paragraphsWithVariance.join('\n\n');
  }

  // ── Deliberate Human Imperfection Injection ──────────────────────────────
  // Applied LAST — after all cleanup and tone adjustment — so imperfections
  // survive into the final output. These signals natural human authorship to
  // AI detectors without harming readability or flow.
  result = injectHumanImperfections(result, activeTone, rng);

  return result;
}

export default stealthHumanize;

/* ── Phrase-Targeted Nuru Pass ────────────────────────────────────── */

/**
 * Run a single Nuru pass that focuses extra replacement effort on specific
 * flagged phrases/words identified by an AI detector. The function:
 *   1. Splits the sentence into tokens
 *   2. For tokens that overlap any flagged phrase, forces replacement even
 *      if the word would normally be protected or below the replacement cap
 *   3. Falls back to standard processSentence for the rest
 *
 * @param sentence  The sentence to reprocess
 * @param flaggedPhrases  Array of suspicious phrases/words (3-10 words max each)
 * @param strength  Humanization strength level
 * @returns Reprocessed sentence with targeted replacements
 */
export function stealthHumanizeTargeted(
  sentence: string,
  flaggedPhrases: string[],
  strength: string = 'medium',
): string {
  if (!sentence || sentence.trim().length < 8 || flaggedPhrases.length === 0) {
    // No phrases to target — fall back to standard single pass
    return stealthHumanize(sentence, strength, 'academic', 1, { detectorPressure: 0.85, preserveLeadSentences: false, humanVariance: 0.02, readabilityBias: 0.65 });
  }

  // Build a set of lower-cased words from all flagged phrases for fast lookup
  const flaggedWords = new Set<string>();
  for (const phrase of flaggedPhrases) {
    for (const w of phrase.toLowerCase().split(/\s+/)) {
      if (w.length >= 3) flaggedWords.add(w);
    }
  }

  // Tokenize
  const tokens = sentence.split(/(\b)/);
  const resultTokens: string[] = [];
  let replacements = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^[a-zA-Z]{3,}$/.test(token)) {
      resultTokens.push(token);
      continue;
    }
    const lower = token.toLowerCase();

    // Skip proper nouns (capitalized mid-sentence words like citations)
    if (isProperNoun(token, i, tokens)) {
      resultTokens.push(token);
      continue;
    }

    // If this word is part of a flagged phrase, prioritize replacement
    if (flaggedWords.has(lower)) {
      // Still skip stopwords and protected words even for flagged phrases
      if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
        resultTokens.push(token);
        continue;
      }
      const stemmed = naiveStem(lower);
      const rep = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
                || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
      if (rep) {
        const candidates = (Array.isArray(rep) ? rep : [rep])
          .filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
            && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
        if (candidates.length > 0) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          const final = /^[A-Z]/.test(token) ? chosen.charAt(0).toUpperCase() + chosen.slice(1) : chosen;
          resultTokens.push(final);
          replacements++;
          continue;
        }
      }
      // Skip extended dictionary fallback — it produces too many wrong-sense synonyms
      resultTokens.push(token);
      continue;
    }

    // Non-flagged words: standard replacement logic (lighter touch)
    if (PROTECTED.has(lower) || STOPWORDS.has(lower)) {
      resultTokens.push(token);
      continue;
    }
    const stemmed = naiveStem(lower);
    const aiRep = EXTRA_REPLACEMENTS[lower] || EXTRA_REPLACEMENTS[stemmed]
               || AI_WORD_REPLACEMENTS[lower] || AI_WORD_REPLACEMENTS[stemmed];
    if (aiRep && Math.random() < 0.3) { // 30% chance for non-flagged words
      const candidates = (Array.isArray(aiRep) ? aiRep : [aiRep])
        .filter(r => /^[a-zA-Z]+$/.test(r) && r.length >= 2
          && !REPLACEMENT_BLACKLIST.has(r.toLowerCase()) && r.toLowerCase() !== lower);
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        const final = /^[A-Z]/.test(token) ? chosen.charAt(0).toUpperCase() + chosen.slice(1) : chosen;
        resultTokens.push(final);
        replacements++;
      } else {
        resultTokens.push(token);
      }
    } else {
      resultTokens.push(token);
    }
  }

  let result = resultTokens.join('');

  // Expand contractions (academic standard) — respected by all tones that
  // have `expandContractions: true`. For `academic_blog`/`casual` we keep
  // contractions intact; those tones usually won't call this function
  // because it is sentence-level targeted cleanup.
  for (const [contraction, expanded] of Object.entries(CONTRACTIONS)) {
    result = result.replace(new RegExp(`\\b${contraction}\\b`, 'gi'), expanded);
  }

  // Fix AI/acronym capitalization
  result = result.replace(/\bAi\b/g, 'AI');
  result = result.replace(/\bai\b/g, 'AI');

  // Run aggressive forensic cleanup on this single flagged sentence
  // (phrase-level AI signals that survived word-level replacement).
  result = deepSignalClean(result, { aggressive: true, skipBurstiness: true, skipStarterStrip: false });

  return result;
}
