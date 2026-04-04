/**
 * Phase 12 — Format
 * ==================
 * Final assembly: join sentences back into paragraphs, restore protected
 * content, fix artifacts from multi-phase transforms, validate meaning,
 * and produce the final output.
 */

import type { DocumentState, Phase } from '../types';
import { restoreContent } from '../services/protectionService';
import { checkMeaning, checkLengthBounds } from '../services/validatorService';

/**
 * Fix artifacts produced by stacking 12 phases of transformation.
 */
function fixTransformArtifacts(text: string): string {
  let result = text;

  // Double prepositions: "of of", "to to", "in in", "for for", etc.
  result = result.replace(/\b(of|to|in|for|on|at|by|with|from|as|is|the|a|an) \1\b/gi, '$1');

  // Missing period+space between concatenated sentences: "considerationsThink" → "considerations. Think"
  result = result.replace(/([a-z]{2})([A-Z][a-z]{2,})/g, '$1. $2');

  // Double punctuation with space: ". ."  ", ,"
  result = result.replace(/([.!?,;:])\s+\1/g, '$1');

  // Stacked sentence starters: "What we see here is that even so."
  // Remove when total sentence is <8 words and contains two capital-letter phrases
  result = result.replace(/(?:^|\. )([A-Z][^.]{0,30}?)\.\s+([A-Z][^.]{0,15}\.)\s*/gm, (match, p1, p2) => {
    const words = (p1 + ' ' + p2).split(/\s+/).length;
    if (words < 8) return p1 + '. '; // Drop the fragment
    return match;
  });

  // "Here's the thing: here's the thing:" — doubled injections
  result = result.replace(/([\w\s]{5,30}[:.])\s*\1/gi, '$1');

  // Fix broken possessives: "today 's" → "today's"
  result = result.replace(/(\w)\s+'s\b/g, "$1's");

  // Remove empty sentences (just punctuation or whitespace)
  result = result.replace(/(?:^|\.\s+)[.!?]+\s*/gm, '. ');

  // Kill orphan fragment sentences (<4 words ending with period, not a known short punch)
  const KNOWN_SHORT = /^(that much is clear|the numbers bear this out|the proof is there|a telling sign|no easy answers here|the stakes are real|a fair point|hard to argue otherwise|the evidence confirms this|a relevant distinction|the pattern holds|an instructive case|the data are unambiguous)\./i;
  result = result.replace(/(?:^|\.\s+)([A-Z][^.]{0,25})\.\s*/gm, (match, fragment) => {
    const words = fragment.trim().split(/\s+/).length;
    if (words <= 3 && !KNOWN_SHORT.test(fragment.trim() + '.')) {
      return '. '; // Kill fragment
    }
    return match;
  });

  // Kill "cleft + connector" fragment sentences:
  // "Where it gets interesting is that on top of that." → kill
  // "Where it gets interesting is that." → kill
  result = result.replace(/\b(Where it gets interesting is that|What stands out is that|What often goes unnoticed is that|The crux of it is that|The thing is|The takeaway is straightforward:)[^.]{0,40}\.\s*/gi, (match) => {
    const words = match.trim().split(/\s+/).length;
    if (words < 10) return ' '; // Kill fragments under 10 words
    return match;
  });

  // Fix sentences ending with dangling connectors/words
  // "suggests that besides." → "suggests that."  
  // "the takeaway is straightforward: that said." → "the takeaway is straightforward."
  result = result.replace(/\b(that|which|and|but|or|also|besides|however|moreover|furthermore|additionally|consequently|nevertheless|nonetheless|:)\s+(that said|besides|also|furthermore|moreover|additionally|nevertheless|nonetheless|even so|and yet|all the same|in turn|however)\s*\./gi, 
    (match, prefix) => {
      // If prefix is ":", remove that too
      if (prefix === ':') return '.';
      return prefix + '.';
    });
  
  // More general: sentence ending with just a connector word before the period
  result = result.replace(/\s+(that said|besides|also|furthermore|moreover|additionally|nevertheless|nonetheless|even so|and yet|however|all the same|in turn|by contrast|similarly|equally|likewise|or, to put it differently|under normal circumstances)\s*\.\s*/gi, '. ');

  // Fix sentences ending with "is that also," or similar broken structures
  result = result.replace(/\b(that|which)\s+(also|additionally|furthermore|moreover)\s*[.,]/gi, 'that');

  // Fix dangling "besides," / "also," at start of a clause after a period or comma
  result = result.replace(/([.,])\s+(besides|also|furthermore|moreover|additionally)\s*,\s*/gi, '$1 ');

  // Fix stacked connectors: "That said, nevertheless," → "Nevertheless,"
  // Keep only the second connector when two appear back-to-back
  const CONNECTORS = 'that said|in addition|moreover|furthermore|besides|equally|likewise|similarly|in turn|by contrast|at the same time|and yet|put another way|in a way|to put it another way|or, to put it differently|speaking practically|as it turns out|at its core|granted|from a practical standpoint|broadly speaking|on closer inspection|in many ways|in the strictest sense|more to the point|in short|looking at this closely|in practice|on the face of it|stepping back|at first glance|curiously|on balance|beneath the surface|at the empirical level|viewed from a different angle|against this backdrop|setting aside assumptions|from a structural standpoint';
  const CONNECTORS2 = 'nevertheless|however|still|nonetheless|all the same|yet|but|even so|regardless|in addition|equally|what\'s more|next|afterward|also|as things stand|at this juncture|on top of that|in the present state of things|at the same time|on closer inspection|in many ways|in practice|then|later';
  result = result.replace(new RegExp(`\\b(${CONNECTORS}),?\\s+(${CONNECTORS2}),?\\s*`, 'gi'), 
    (_m, _first, second) => `${second.charAt(0).toUpperCase() + second.slice(1)}, `);

  // Fix "that [connector]," — cleft construction followed by connector word
  // "What we see here is that besides," → "What we see here is that"
  // "It takes no great insight to see that still," → "It takes no great insight to see that"
  result = result.replace(/\bthat\s+(furthermore|besides|moreover|additionally|still|in addition|what's more|all the same|equally|likewise|similarly|next|afterward|and yet|in a way|by contrast|also|on top of that|as things stand|at this juncture),?\s*/gi, 'that ');

  // Fix ": [connector]," — colon followed by connector word
  // "The takeaway is straightforward: furthermore," → "The takeaway is straightforward:"
  result = result.replace(/:\s+(furthermore|besides|moreover|additionally|still|in addition|what's more|all the same|equally|likewise|similarly|next|afterward|and yet|in a way|by contrast|also|on top of that|in practice|then|later|regardless),?\s*/gi, ': ');

  // Fix sentences that are just a starter + fragment (< 6 real words total)
  // e.g. "The bottom line is that under current conditions."
  result = result.replace(/([.!?])\s+([A-Z][^.!?]*[.!?])\s*/g, (match, prevPunct, sentence) => {
    const words = sentence.trim().split(/\s+/).length;
    if (words < 6) {
      return prevPunct + ' '; // Kill the fragment
    }
    return match;
  });

  // Kill sentences that are only connector/filler words with no real content
  // e.g. "That is to say, in a way,." or "Furthermore, moreover."
  const FILLER_ONLY = /^[A-Z][\w\s,;:''-]*[.!?]$/;
  const CONTENT_WORDS = /\b(?!that|is|to|say|in|a|an|the|of|and|but|or|for|with|by|as|on|at|it|this|these|those|which|who|what|how|way|also|besides|moreover|furthermore|however|additionally|consequently|nevertheless|similarly|equally|likewise|curiously|interestingly|notably|put|another|other|words|speaking|broadly|short|turn|contrast|yet|still|same|time|more|point)\b[a-z]{3,}/gi;
  result = result.replace(/([.!?])\s+([A-Z][^.!?]{0,80}[.!?])\s*/g, (match, prevPunct, sentence) => {
    const contentMatches = sentence.match(CONTENT_WORDS);
    if (!contentMatches || contentMatches.length < 2) {
      return prevPunct + ' '; // Kill: no real content
    }
    return match;
  });

  // Fix a/an agreement after synonym swaps
  // "a extensive" → "an extensive", "an large" → "a large"
  const VOWEL_SOUNDS = /^[aeiou]/i;
  const AN_EXCEPTIONS = /^(uni|one|once|use[ds]?|usu|ura|eur|ubi)/i; // These start with vowel but use "a"
  const A_EXCEPTIONS = /^(hour|honest|honor|heir|herb)/i;  // Start with consonant but use "an"
  result = result.replace(/\b(a|an)\s+(\w+)/gi, (_match, article, word) => {
    const shouldBeAn = (VOWEL_SOUNDS.test(word) && !AN_EXCEPTIONS.test(word)) || A_EXCEPTIONS.test(word);
    const correctArticle = shouldBeAn ? 'an' : 'a';
    // Preserve original casing
    const finalArticle = /^A/.test(article)
      ? correctArticle.charAt(0).toUpperCase() + correctArticle.slice(1)
      : correctArticle;
    return `${finalArticle} ${word}`;
  });

  // ── CONTRACTION EXPANSION (absolute rule: zero contractions) ──
  const EXPAND: [RegExp, string][] = [
    [/\bI'm\b/g, 'I am'], [/\bI've\b/g, 'I have'], [/\bI'll\b/g, 'I will'], [/\bI'd\b/g, 'I would'],
    [/\bdon't\b/g, 'do not'], [/\bDon't\b/g, 'Do not'],
    [/\bdoesn't\b/g, 'does not'], [/\bDoesn't\b/g, 'Does not'],
    [/\bdidn't\b/g, 'did not'], [/\bDidn't\b/g, 'Did not'],
    [/\bisn't\b/g, 'is not'], [/\bIsn't\b/g, 'Is not'],
    [/\baren't\b/g, 'are not'], [/\bAren't\b/g, 'Are not'],
    [/\bwasn't\b/g, 'was not'], [/\bWasn't\b/g, 'Was not'],
    [/\bweren't\b/g, 'were not'], [/\bWeren't\b/g, 'Were not'],
    [/\bwon't\b/g, 'will not'], [/\bWon't\b/g, 'Will not'],
    [/\bwouldn't\b/g, 'would not'], [/\bWouldn't\b/g, 'Would not'],
    [/\bcouldn't\b/g, 'could not'], [/\bCouldn't\b/g, 'Could not'],
    [/\bshouldn't\b/g, 'should not'], [/\bShouldn't\b/g, 'Should not'],
    [/\bcan't\b/g, 'cannot'], [/\bCan't\b/g, 'Cannot'],
    [/\bhaven't\b/g, 'have not'], [/\bHaven't\b/g, 'Have not'],
    [/\bhasn't\b/g, 'has not'], [/\bHasn't\b/g, 'Has not'],
    [/\bhadn't\b/g, 'had not'], [/\bHadn't\b/g, 'Had not'],
    [/\bmustn't\b/g, 'must not'], [/\bMustn't\b/g, 'Must not'],
    [/\bneedn't\b/g, 'need not'], [/\bNeedn't\b/g, 'Need not'],
    [/\bit's\b/g, 'it is'], [/\bIt's\b/g, 'It is'],
    [/\bthat's\b/g, 'that is'], [/\bThat's\b/g, 'That is'],
    [/\bthere's\b/g, 'there is'], [/\bThere's\b/g, 'There is'],
    [/\bthere're\b/g, 'there are'], [/\bThere're\b/g, 'There are'],
    [/\bthey're\b/g, 'they are'], [/\bThey're\b/g, 'They are'],
    [/\bthey've\b/g, 'they have'], [/\bThey've\b/g, 'They have'],
    [/\bthey'll\b/g, 'they will'], [/\bThey'll\b/g, 'They will'],
    [/\bwe're\b/g, 'we are'], [/\bWe're\b/g, 'We are'],
    [/\bwe've\b/g, 'we have'], [/\bWe've\b/g, 'We have'],
    [/\bwe'll\b/g, 'we will'], [/\bWe'll\b/g, 'We will'],
    [/\byou're\b/g, 'you are'], [/\bYou're\b/g, 'You are'],
    [/\byou've\b/g, 'you have'], [/\bYou've\b/g, 'You have'],
    [/\byou'll\b/g, 'you will'], [/\bYou'll\b/g, 'You will'],
    [/\bhe's\b/g, 'he is'], [/\bHe's\b/g, 'He is'],
    [/\bhe'll\b/g, 'he will'], [/\bHe'll\b/g, 'He will'],
    [/\bshe's\b/g, 'she is'], [/\bShe's\b/g, 'She is'],
    [/\bshe'll\b/g, 'she will'], [/\bShe'll\b/g, 'She will'],
    [/\bwho's\b/g, 'who is'], [/\bWho's\b/g, 'Who is'],
    [/\bwhat's\b/g, 'what is'], [/\bWhat's\b/g, 'What is'],
    [/\bwhere's\b/g, 'where is'], [/\bWhere's\b/g, 'Where is'],
    [/\bhow's\b/g, 'how is'], [/\bHow's\b/g, 'How is'],
    [/\bwhen's\b/g, 'when is'], [/\bWhen's\b/g, 'When is'],
    [/\bhere's\b/g, 'here is'], [/\bHere's\b/g, 'Here is'],
    [/\blet's\b/g, 'let us'], [/\bLet's\b/g, 'Let us'],
  ];
  for (const [pattern, replacement] of EXPAND) {
    result = result.replace(pattern, replacement);
  }

  // ── EM-DASH LIMIT (max 2 per 1000 words) ──
  const wordCount = result.split(/\s+/).length;
  const maxEmDashes = Math.max(2, Math.floor((wordCount / 1000) * 2));
  const emDashMatches = [...result.matchAll(/\s*—\s*/g)];
  if (emDashMatches.length > maxEmDashes) {
    // Keep the first maxEmDashes, convert the rest to commas
    let removed = 0;
    const positions = emDashMatches.map(m => ({ index: m.index!, length: m[0].length }));
    // Process from end to preserve indices
    for (let i = positions.length - 1; i >= 0; i--) {
      if (i >= maxEmDashes) {
        const pos = positions[i];
        result = result.slice(0, pos.index) + ', ' + result.slice(pos.index + pos.length);
        removed++;
      }
    }
  }

  // Double spaces
  result = result.replace(/ {2,}/g, ' ');

  // Space before punctuation
  result = result.replace(/\s+([.,;:!?])/g, '$1');

  // Missing space after punctuation
  result = result.replace(/([.!?])([A-Z])/g, '$1 $2');

  // Capitalize first letter of text
  if (result.length > 0 && /[a-z]/.test(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // Capitalize after sentence endings
  result = result.replace(/([.!?])\s+([a-z])/g, (_m, p, l) => `${p} ${l.toUpperCase()}`);

  // Fix lowercase at start after em-dash: "— i submit" → "— I submit"
  result = result.replace(/—\s+([a-z])/g, (_m, l) => `— ${l.toUpperCase()}`);

  // Fix lowercase standalone "i" 
  result = result.replace(/\bi\b(?=[^a-zA-Z])/g, 'I');

  // Fix "ai-driven" → "AI-driven" and standalone "ai" → "AI"
  result = result.replace(/\bai-(\w)/gi, (_m, c) => `AI-${c}`);
  result = result.replace(/\bai\b/g, 'AI');

  // Fix "In today's" that may have survived (absolute kill)
  result = result.replace(/\bin today'?s\b/gi, 'in the present');

  // Fix temporal/prepositional phrase fragments that became standalone sentences
  // "In the present state of things. Organizations" → "In the present state of things, organizations"
  result = result.replace(/\b(in the present state of things|as things stand|under current conditions|at this juncture|at this point in time)\.\s+([A-Z])/gi,
    (_m, phrase, letter) => `${phrase}, ${letter.toLowerCase()}`);

  // Fix cleft-that fragments: "What this boils down to is that. The" → merge into next sentence
  result = result.replace(/\b(What (?:this|it|we see here|stands out|often goes unnoticed) (?:boils down to |gets interesting )?is that)\.\s+([A-Z])/gi,
    (_m, cleft, letter) => `${cleft} ${letter.toLowerCase()}`);

  // Kill trailing emphatic fragments at text/paragraph end
  result = result.replace(/([.!?])\s+(That matters|This is key|The evidence confirms this|It shows|The data support this|The pattern holds|The distinction is real|No question about it|The implication is clear|A fair point|The stakes are real|The numbers bear this out|A telling sign|Hard to argue otherwise)\.\s*$/gi, '$1');
  // Also kill emphatics at paragraph breaks
  result = result.replace(/([.!?])\s+(That matters|This is key|The evidence confirms this|It shows|The data support this|The pattern holds|The distinction is real|No question about it|The implication is clear|A fair point|The stakes are real|The numbers bear this out|A telling sign|Hard to argue otherwise)\.\s*\n/gi, '$1\n');

  return result;
}

export const formatPhase: Phase = {
  name: 'format',
  async process(state: DocumentState): Promise<DocumentState> {
    // Reassemble paragraphs from sentences
    const paragraphTexts: string[] = [];

    for (const paragraph of state.paragraphs) {
      // Filter out killed sentences (empty text or marked as killed)
      const liveSentences = paragraph.sentences.filter(
        s => s.text.trim().length > 0 && !s.flags.includes('killed')
      );
      const assembled = liveSentences.map(s => s.text).join(' ');
      paragraph.currentText = assembled;
      if (assembled.trim()) {
        paragraphTexts.push(assembled);
      }
    }

    // Join paragraphs with double newlines
    let finalText = paragraphTexts.join('\n\n');

    // Restore protected content
    finalText = restoreContent(finalText, state.protectedSpans);

    // Fix artifacts from multi-phase transforms
    finalText = fixTransformArtifacts(finalText);

    // Final cleanup
    finalText = finalText
      .replace(/ {2,}/g, ' ')          // Double spaces
      .replace(/\n{3,}/g, '\n\n')      // Max double line breaks
      .replace(/\bai-(\w)/gi, (_m: string, c: string) => `AI-${c}`)  // AI-driven fix (redundant safety)
      .replace(/\bai\b/g, 'AI')        // standalone AI fix (redundant safety)
      .trim();

    // Validate meaning preservation
    const meaning = checkMeaning(state.originalText, finalText);
    const lengthOk = checkLengthBounds(state.originalText, finalText);

    state.currentText = finalText;
    if (!state.metadata) state.metadata = {};
    state.metadata.meaningScore = meaning.similarity;
    state.metadata.meaningPreserved = meaning.isSafe;
    state.metadata.lengthValid = lengthOk;

    state.logs.push(
      `[format] Final output: ${finalText.length} chars, ` +
      `meaning similarity: ${(meaning.similarity * 100).toFixed(1)}%, ` +
      `preserved: ${meaning.isSafe}`
    );

    return state;
  },
};
