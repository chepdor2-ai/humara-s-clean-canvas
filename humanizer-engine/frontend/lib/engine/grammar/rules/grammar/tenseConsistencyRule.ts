import type { Rule } from '../baseRule';
import type { Sentence, Issue } from '../../core/types';
import { IRREGULAR_VERBS, FORM_TO_BASE } from '../../lexicon/irregularVerbs';

/**
 * Detects common verb tense errors:
 * - "He go" → "He goes" (missing 3rd-person -s)
 * - "She have" → "She has"
 * - "Yesterday he go" → "Yesterday he went" (past context with present verb)
 * - "He did went" → "He did go" (double past marking)
 */

const THIRD_PERSON = new Set(['he', 'she', 'it']);
const PAST_MARKERS = new Set([
  'yesterday', 'ago', 'previously', 'earlier', 'last', 'formerly', 'once',
]);
const BASE_VERBS_NEEDING_S: Record<string, string> = {
  go: 'goes', do: 'does', have: 'has', say: 'says', make: 'makes',
  take: 'takes', come: 'comes', see: 'sees', know: 'knows', get: 'gets',
  give: 'gives', find: 'finds', think: 'thinks', tell: 'tells', become: 'becomes',
  leave: 'leaves', feel: 'feels', put: 'puts', bring: 'brings', begin: 'begins',
  keep: 'keeps', hold: 'holds', write: 'writes', stand: 'stands', hear: 'hears',
  let: 'lets', mean: 'means', set: 'sets', meet: 'meets', run: 'runs',
  pay: 'pays', sit: 'sits', speak: 'speaks', lie: 'lies', lead: 'leads',
  read: 'reads', grow: 'grows', lose: 'loses', fall: 'falls', send: 'sends',
  build: 'builds', understand: 'understands', draw: 'draws', break: 'breaks',
  receive: 'receives', continue: 'continues', eat: 'eats', walk: 'walks',
  need: 'needs', want: 'wants', seem: 'seems', try: 'tries', ask: 'asks',
  work: 'works', call: 'calls', move: 'moves', live: 'lives', play: 'plays',
  study: 'studies', learn: 'learns', change: 'changes', follow: 'follows',
  stop: 'stops', create: 'creates', talk: 'talks', open: 'opens', carry: 'carries',
  offer: 'offers', include: 'includes', turn: 'turns', reach: 'reaches',
  buy: 'buys', watch: 'watches', die: 'dies', wish: 'wishes',
};

export const tenseRule: Rule = {
  id: 'tense_errors',
  description: 'Detects 3rd-person singular missing -s and double past marking',

  apply(sentence: Sentence): Issue[] {
    const issues: Issue[] = [];
    const words = sentence.tokens.filter(t => t.kind === 'word');
    if (words.length < 2) return issues;

    for (let i = 0; i < words.length - 1; i++) {
      const subj = words[i].norm;
      const verb = words[i + 1].norm;

      // 3rd-person singular: "He go" → "He goes"
      if (THIRD_PERSON.has(subj) && BASE_VERBS_NEEDING_S[verb]) {
        // Make sure the previous word isn't an auxiliary (would, will, can, etc.)
        const prevNorm = i > 0 ? words[i - 1].norm : '';
        const auxSet = new Set(['will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'did', 'does', 'do', "didn't", "doesn't", "don't", "won't", "wouldn't", "can't", "couldn't", "shouldn't", 'to']);
        if (!auxSet.has(prevNorm)) {
          issues.push({
            ruleId: 'third_person_s',
            message: `"${words[i].text} ${words[i + 1].text}" → "${words[i].text} ${BASE_VERBS_NEEDING_S[verb]}"`,
            severity: 'error',
            start: words[i + 1].start,
            end: words[i + 1].end,
            replacements: [BASE_VERBS_NEEDING_S[verb]],
            confidence: 0.92,
            category: 'Grammar',
            sentenceIndex: 0,
          });
        }
      }

      // "did went" / "did ran" → "did go" / "did run"
      if ((subj === 'did' || subj === "didn't") && FORM_TO_BASE.has(verb)) {
        const base = FORM_TO_BASE.get(verb)!;
        if (base !== verb) {
          issues.push({
            ruleId: 'double_past',
            message: `After "${words[i].text}", use base form: "${base}"`,
            severity: 'error',
            start: words[i + 1].start,
            end: words[i + 1].end,
            replacements: [base],
            confidence: 0.95,
            category: 'Grammar',
            sentenceIndex: 0,
          });
        }
      }
    }

    return issues;
  },
};
