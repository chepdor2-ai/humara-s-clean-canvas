import { analyze as analyzeContext } from '@/lib/engine/context-analyzer';
import { analyzeText as analyzeLinguisticText } from '@/lib/engine/linguistic-intelligence-core';
import { fixMidSentenceCapitalization } from '@/lib/engine/validation-post-process';
import { fixPunctuation } from '@/lib/engine/shared-dictionaries';
import { removeEmDashes, compressPhrases } from '@/lib/engine/v13-shared-techniques';

          // ── Nuru 2.0 Sentence Starter Distribution Fix ──
          export const applySentenceStartersDistribution = (sentences: string[]): void => {
            type StarterCategory =
              | 'article'
              | 'demonstrativeSingular'
              | 'demonstrativePlural'
              | 'pronominal'
              | 'additive'
              | 'contrast'
              | 'result'
              | 'alternative';
            type StarterDefinition = { text: string; category: StarterCategory };

            const starterDefinitions: StarterDefinition[] = [
              { text: 'The', category: 'article' },
              { text: 'This', category: 'demonstrativeSingular' },
              { text: 'These', category: 'demonstrativePlural' },
              { text: 'It', category: 'pronominal' },
              { text: 'Moreover', category: 'additive' },
              { text: 'However', category: 'contrast' },
              { text: 'Furthermore', category: 'additive' },
              { text: 'Additionally', category: 'additive' },
              { text: 'In addition', category: 'additive' },
              { text: 'Also', category: 'additive' },
              { text: 'Therefore', category: 'result' },
              { text: 'Consequently', category: 'result' },
              { text: 'As a result', category: 'result' },
              { text: 'Thus', category: 'result' },
              { text: 'Hence', category: 'result' },
              { text: 'On the other hand', category: 'contrast' },
              { text: 'On the contrary', category: 'contrast' },
              { text: 'In contrast', category: 'contrast' },
              { text: 'Alternatively', category: 'alternative' },
              { text: 'Nevertheless', category: 'contrast' },
              { text: 'Nonetheless', category: 'contrast' },
            ];

            const targetStarters = starterDefinitions.map((starter) => starter.text.toLowerCase());
            const starterCategory = Object.fromEntries(
              starterDefinitions.map((starter) => [starter.text.toLowerCase(), starter.category])
            ) as Record<string, StarterCategory>;
            const starterChoices: Record<StarterCategory, string[]> = {
              article: ['The'],
              demonstrativeSingular: ['This'],
              demonstrativePlural: ['These'],
              pronominal: ['It'],
              additive: ['Additionally', 'In addition', 'Also', 'Moreover', 'Furthermore'],
              contrast: ['However', 'Nevertheless', 'Nonetheless', 'In contrast', 'On the other hand'],
              result: ['Therefore', 'Consequently', 'As a result', 'Thus', 'Hence'],
              alternative: ['Alternatively'],
            };
            const singularReferentialNouns = new Set([
              'analysis', 'approach', 'argument', 'assessment', 'assumption', 'change', 'claim', 'comparison', 'condition', 'context',
              'development', 'difference', 'effect', 'evidence', 'example', 'factor', 'finding', 'framework', 'idea', 'issue', 'method',
              'observation', 'outcome', 'pattern', 'point', 'position', 'process', 'proposal', 'result', 'shift', 'strategy', 'study', 'theme',
              'trend', 'view'
            ]);
            const pluralReferentialNouns = new Set([
              'analyses', 'approaches', 'arguments', 'assessments', 'assumptions', 'changes', 'claims', 'comparisons', 'conditions', 'contexts',
              'developments', 'differences', 'effects', 'examples', 'factors', 'findings', 'ideas', 'issues', 'methods', 'observations',
              'outcomes', 'patterns', 'points', 'positions', 'processes', 'proposals', 'results', 'shifts', 'strategies', 'studies', 'themes',
              'trends', 'views'
            ]);
            const lightModifierWords = new Set([
              'broader', 'current', 'different', 'earlier', 'effective', 'emerging', 'final', 'key', 'later', 'main', 'major', 'modern',
              'overall', 'possible', 'practical', 'primary', 'recent', 'relevant', 'specific', 'stronger', 'wider'
            ]);
            const auxiliaryLeadWords = new Set([
              'is', 'are', 'was', 'were', 'be', 'been', 'being', 'can', 'could', 'may', 'might', 'must', 'should', 'would', 'will', 'has', 'have',
              'had', 'seems', 'appear', 'appears', 'remains', 'remain', 'became', 'becomes', 'follows'
            ]);
            const blockedLeadWords = new Set([
              'the', 'this', 'these', 'it', 'however', 'moreover', 'furthermore', 'additionally', 'also', 'therefore', 'consequently', 'thus',
              'hence', 'alternatively', 'nevertheless', 'nonetheless', 'on', 'in', 'as', 'for', 'to', 'from', 'if', 'when', 'while', 'because',
              'although', 'though', 'but', 'and', 'or', 'yet', 'so', 'he', 'she', 'they', 'we', 'you', 'i'
            ]);
            const additiveCue = /\b(additionally|also|another|further|furthermore|moreover|in addition|similarly|alongside|equally|besides)\b/i;
            const contrastCue = /\b(however|but|although|though|whereas|while|despite|instead|rather|unlike|in contrast|on the other hand|on the contrary|nevertheless|nonetheless)\b/i;
            const resultCue = /\b(therefore|thus|hence|consequently|as a result|for this reason|because of this|this means|this led|accordingly)\b/i;
            const alternativeCue = /\b(alternatively|instead|another option|either|or else)\b/i;

            const normalizeSentence = (sentence: string) => sentence.trim().replace(/^['"([\{\s]+/, '');
            const getWordList = (sentence: string) => normalizeSentence(sentence).split(/\s+/).filter(Boolean);
            const cleanWord = (word: string | undefined) => (word ?? '').replace(/[^a-z'-]/gi, '').toLowerCase();
            const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
            const capitalizeFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
            const isNounLike = (word: string) => {
              if (!word) return false;
              if (singularReferentialNouns.has(word) || pluralReferentialNouns.has(word)) return true;
              return /(?:tion|sion|ment|ness|ity|ism|ship|ance|ence|ory|ure|ing|age|acy|dom|ist|or|er|al|ics|sis|th)$/.test(word);
            };
            const getNounLeadShape = (sentence: string): 'singular' | 'plural' | 'generic' | null => {
              const words = getWordList(sentence);
              if (words.length < 4) return null;
              const firstWord = cleanWord(words[0]);
              const secondWord = cleanWord(words[1]);
              if (!firstWord) return null;
              if (pluralReferentialNouns.has(firstWord)) return 'plural';
              if (singularReferentialNouns.has(firstWord)) return 'singular';
              if (lightModifierWords.has(firstWord) && pluralReferentialNouns.has(secondWord)) return 'plural';
              if (lightModifierWords.has(firstWord) && singularReferentialNouns.has(secondWord)) return 'singular';
              if (blockedLeadWords.has(firstWord) || auxiliaryLeadWords.has(firstWord)) return null;
              if (isNounLike(firstWord) || (lightModifierWords.has(firstWord) && isNounLike(secondWord))) return 'generic';
              return null;
            };
            const getMatchedStarter = (sentence: string): string | null => {
              const words = getWordList(sentence);
              for (const starter of targetStarters) {
                const starterWords = starter.split(/\s+/);
                const prefix = words.slice(0, starterWords.length).join(' ').replace(/[^a-z0-9 ]/gi, '').toLowerCase();
                if (prefix === starter) return starter;
              }
              return null;
            };
            const applyCommaStarter = (sentence: string, starter: string) => {
              const trimmed = sentence.trim();
              if (!trimmed) return sentence;
              return `${starter}, ${lowerFirst(trimmed)}`;
            };
            const applyLeadStarter = (sentence: string, starter: string): string | null => {
              const trimmed = sentence.trim();
              if (!trimmed) return null;
              const shape = getNounLeadShape(trimmed);
              if (starter === 'the' && shape) return `The ${lowerFirst(trimmed)}`;
              if (starter === 'this' && (shape === 'singular' || shape === 'generic')) return `This ${lowerFirst(trimmed)}`;
              if (starter === 'these' && shape === 'plural') return `These ${lowerFirst(trimmed)}`;
              if (starter === 'it') {
                const firstWord = cleanWord(getWordList(trimmed)[0]);
                if (auxiliaryLeadWords.has(firstWord)) return `It ${lowerFirst(trimmed)}`;
              }
              return null;
            };
            const demoteStarter = (sentence: string, starter: string): string => {
              const words = getWordList(sentence);
              const starterLength = starter.split(/\s+/).length;
              let trimmed = words.slice(starterLength).join(' ').trim().replace(/^,\s*/, '');
              if (starter === 'this') trimmed = `That ${trimmed}`.trim();
              if (starter === 'these') trimmed = `Those ${trimmed}`.trim();
              return trimmed ? capitalizeFirst(trimmed) : sentence;
            };
            const inferConnectorCategory = (sentence: string, previousSentence: string | null): StarterCategory | null => {
              const normalized = normalizeSentence(sentence);
              const previous = previousSentence ? normalizeSentence(previousSentence) : '';
              if (alternativeCue.test(normalized)) return 'alternative';
              if (resultCue.test(normalized)) return 'result';
              if (contrastCue.test(normalized) || /\b(unlike|rather than)\b/i.test(previous)) return 'contrast';
              if (additiveCue.test(normalized) || /\b(first|second|finally|another|similarly)\b/i.test(previous)) return 'additive';
              return null;
            };
            const supportsStarter = (starter: string, sentence: string, previousSentence: string | null): boolean => {
              if (starter === 'the' || starter === 'this' || starter === 'these' || starter === 'it') {
                return Boolean(applyLeadStarter(sentence, starter));
              }
              const category = starterCategory[starter];
              const expectedCategory = inferConnectorCategory(sentence, previousSentence);
              return Boolean(category && expectedCategory === category);
            };

            const counts: Record<string, number> = {};
            targetStarters.forEach((starter) => { counts[starter] = 0; });

            for (let i = 0; i < sentences.length; i++) {
              if (false) continue;
              const matchedStarter = getMatchedStarter(sentences[i]);
              if (!matchedStarter) continue;
              const previousSentence = i > 0 ? sentences[i - 1] : null;
              const previousStarter = i > 0 ? getMatchedStarter(sentences[i - 1]) : null;
              counts[matchedStarter]++;
              if (matchedStarter === previousStarter || !supportsStarter(matchedStarter, demoteStarter(sentences[i], matchedStarter), previousSentence)) {
                sentences[i] = demoteStarter(sentences[i], matchedStarter);
                counts[matchedStarter] = Math.max(0, counts[matchedStarter] - 1);
              }
            }

            for (const starter of targetStarters) counts[starter] = 0;

            const validIndices = sentences
              .map((_, idx) => idx)
              .filter((_idx) => true);
            if (validIndices.length === 0) return;
            for (const idx of validIndices) {
              const matchedStarter = getMatchedStarter(sentences[idx]);
              if (matchedStarter) counts[matchedStarter]++;
            }

            const eligibleCount = validIndices.length;
            const placedStarters = () => validIndices.reduce((total, idx) => total + (getMatchedStarter(sentences[idx]) ? 1 : 0), 0);
            const capacities = validIndices.reduce<Record<string, number>>((acc, idx) => {
              const previousSentence = idx > 0 ? sentences[idx - 1] : null;
              for (const starter of ['the', 'this', 'these', 'it']) {
                if (supportsStarter(starter, sentences[idx], previousSentence)) acc[starter] = (acc[starter] || 0) + 1;
              }
              return acc;
            }, { the: 0, this: 0, these: 0, it: 0 });
            const minimumTarget = (share: number, starter: string) => {
              const rounded = Math.round(eligibleCount * share);
              const floor = share >= 0.20 ? (eligibleCount >= 5 ? 1 : 0) : (eligibleCount >= 10 ? 1 : 0);
              return Math.min(capacities[starter] || 0, Math.max(floor, rounded));
            };
            const quotaTargets: Record<string, number> = {
              the: minimumTarget(0.20, 'the'),
              this: minimumTarget(0.05, 'this'),
              these: minimumTarget(0.05, 'these'),
              it: minimumTarget(0.05, 'it'),
            };
            const totalStarterTarget = Math.max(quotaTargets.the + quotaTargets.this + quotaTargets.these + quotaTargets.it, Math.min(eligibleCount, Math.round(eligibleCount * 0.40)));
            const totalStarterCap = Math.max(totalStarterTarget, Math.ceil(eligibleCount * 0.55));
            const perStarterCap: Record<string, number> = {
              the: Math.max(quotaTargets.the, Math.ceil(eligibleCount * 0.30)),
              this: Math.max(quotaTargets.this, Math.ceil(eligibleCount * 0.12)),
              these: Math.max(quotaTargets.these, Math.ceil(eligibleCount * 0.12)),
              it: Math.max(quotaTargets.it, Math.ceil(eligibleCount * 0.12)),
            };
            const findNearestSameStarterDistance = (idx: number, starter: string) => {
              let best = eligibleCount + 1;
              for (const validIdx of validIndices) {
                if (validIdx === idx || getMatchedStarter(sentences[validIdx]) !== starter) continue;
                best = Math.min(best, Math.abs(validIdx - idx));
              }
              return best;
            };
            const scorePlacement = (idx: number, starter: string) => {
              const previousStarter = idx > 0 ? getMatchedStarter(sentences[idx - 1]) : null;
              const nextStarter = idx < sentences.length - 1 ? getMatchedStarter(sentences[idx + 1]) : null;
              const sameStarterDistance = findNearestSameStarterDistance(idx, starter);
              let score = getWordList(sentences[idx]).length;
              if (previousStarter === starter) score -= 100;
              if (nextStarter === starter) score -= 30;
              if (previousStarter) score -= 8;
              if (nextStarter) score -= 4;
              score += Math.min(sameStarterDistance, 6) * 6;
              score -= counts[starter] * 5;
              return score;
            };
            const tryPlaceStarter = (starter: string): boolean => {
              if ((counts[starter] || 0) >= (perStarterCap[starter] || Number.MAX_SAFE_INTEGER)) return false;
              const candidateIndices = validIndices.filter((idx) => !getMatchedStarter(sentences[idx]) && supportsStarter(starter, sentences[idx], idx > 0 ? sentences[idx - 1] : null));
              if (candidateIndices.length === 0) return false;
              candidateIndices.sort((left, right) => scorePlacement(right, starter) - scorePlacement(left, starter));
              const chosenIdx = candidateIndices[0];
              const updated = starter === 'the' || starter === 'this' || starter === 'these' || starter === 'it'
                ? applyLeadStarter(sentences[chosenIdx], starter)
                : applyCommaStarter(sentences[chosenIdx], capitalizeFirst(starter));
              if (!updated) return false;
              sentences[chosenIdx] = updated;
              counts[starter] = (counts[starter] || 0) + 1;
              return true;
            };

            for (const starter of ['the', 'this', 'these', 'it']) {
              while ((counts[starter] || 0) < quotaTargets[starter]) {
                if (!tryPlaceStarter(starter)) break;
              }
            }

            const connectorPriority: StarterCategory[] = ['additive', 'contrast', 'result', 'alternative'];
            while (placedStarters() < totalStarterTarget && placedStarters() < totalStarterCap) {
              let placed = false;
              for (const category of connectorPriority) {
                const starterPool = starterChoices[category].map((starter) => starter.toLowerCase()).sort((left, right) => counts[left] - counts[right] || left.localeCompare(right));
                for (const starter of starterPool) {
                  if (tryPlaceStarter(starter)) {
                    placed = true;
                    break;
                  }
                }
                if (placed) break;
              }
              if (!placed) break;
            }

            while (placedStarters() > totalStarterCap) {
              let trimmed = false;
              for (let i = validIndices.length - 1; i >= 0; i--) {
                const idx = validIndices[i];
                const matchedStarter = getMatchedStarter(sentences[idx]);
                if (!matchedStarter) continue;
                if ((counts[matchedStarter] || 0) <= (quotaTargets[matchedStarter] || 0)) continue;
                sentences[idx] = demoteStarter(sentences[idx], matchedStarter);
                counts[matchedStarter] = Math.max(0, (counts[matchedStarter] || 0) - 1);
                trimmed = true;
                break;
              }
              if (!trimmed) break;
            }
          };

          export const applyNuruDocumentFlowCalibration = (
            sentences: string[],
            paragraphBoundaries: number[],
            sourceSentences: string[],
          ): void => {
            const validIndices = sentences
              .map((_, idx) => idx)
              .filter((_idx) => true);
            if (validIndices.length < 2) return;

            const normalizeSentence = (sentence: string) => sentence.trim().replace(/^['"([\{\s]+/, '');
            const cleanWord = (word: string | undefined) => (word ?? '').replace(/[^a-z0-9'-]/gi, '').toLowerCase();
            const getWordList = (sentence: string) => normalizeSentence(sentence).split(/\s+/).filter(Boolean);
            const capitalizeFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
            const FLOW_STOPWORDS = new Set([
              'the', 'a', 'an', 'and', 'or', 'but', 'if', 'while', 'because', 'as', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by',
              'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over', 'again', 'further', 'then',
              'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
              'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'could', 'may', 'might', 'must', 'should', 'would', 'will',
              'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'this', 'these', 'those', 'that', 'it',
              'however', 'therefore', 'thus', 'hence', 'also', 'additionally', 'moreover', 'furthermore'
            ]);
            const getContentWords = (sentence: string) => getWordList(sentence)
              .map((word) => cleanWord(word))
              .filter((word) => word.length > 2 && !FLOW_STOPWORDS.has(word));
            const leadStarters = [
              'on the other hand', 'on the contrary', 'as a result', 'in addition', 'in contrast',
              'nevertheless', 'nonetheless', 'alternatively', 'additionally', 'furthermore', 'consequently', 'therefore', 'moreover', 'however', 'thus', 'hence', 'also', 'these', 'this', 'the', 'it'
            ];
            const getLeadStarter = (sentence: string): string | null => {
              const normalized = getWordList(sentence).join(' ').replace(/[^a-z0-9 ]/gi, '').toLowerCase();
              return leadStarters.find((starter) => normalized.startsWith(starter)) ?? null;
            };
            const getStarterFamily = (sentence: string) => {
              const starter = getLeadStarter(sentence);
              if (!starter) return 'none';
              if (starter === 'the') return 'article';
              if (starter === 'this' || starter === 'these') return 'demonstrative';
              if (starter === 'it') return 'pronominal';
              if (['also', 'moreover', 'furthermore', 'additionally', 'in addition'].includes(starter)) return 'additive';
              if (['however', 'nevertheless', 'nonetheless', 'in contrast', 'on the other hand', 'on the contrary'].includes(starter)) return 'contrast';
              if (['therefore', 'consequently', 'as a result', 'thus', 'hence'].includes(starter)) return 'result';
              if (starter === 'alternatively') return 'alternative';
              return starter;
            };
            const demoteLeadStarter = (sentence: string): string => {
              const starter = getLeadStarter(sentence);
              if (!starter) return sentence;
              const words = getWordList(sentence);
              const starterLength = starter.split(/\s+/).length;
              let trimmed = words.slice(starterLength).join(' ').trim().replace(/^,\s*/, '');
              if (starter === 'this') trimmed = `That ${trimmed}`.trim();
              if (starter === 'these') trimmed = `Those ${trimmed}`.trim();
              return trimmed ? capitalizeFirst(trimmed) : sentence;
            };
            const buildParagraphGroups = (bounds: number[], total: number) => {
              const groups: number[][] = [];
              for (let i = 0; i < bounds.length; i++) {
                const start = bounds[i];
                const end = i < bounds.length - 1 ? bounds[i + 1] : total;
                groups.push(Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset));
              }
              return groups;
            };
            const paragraphGroups = buildParagraphGroups(paragraphBoundaries.length ? paragraphBoundaries : [0], sentences.length);
            const sourceGroups = buildParagraphGroups(paragraphBoundaries.length ? paragraphBoundaries : [0], sourceSentences.length);
            const paragraphKeywordSets = sourceGroups.map((indices) => {
              const paragraphText = indices.map((idx) => sourceSentences[idx]).join(' ');
              const paragraphContext = analyzeContext(paragraphText);
              const rankedTerms = Array.from(paragraphContext.wordFreq.entries())
                .filter(([word]) => paragraphContext.protectedTerms.has(word) && word.length > 3)
                .sort((left, right) => right[1] - left[1])
                .map(([word]) => word)
                .slice(0, 3);
              return [...Array.from(paragraphContext.domainBigrams).slice(0, 2), ...rankedTerms];
            });
            const linguistic = analyzeLinguisticText(validIndices.map((idx) => sentences[idx]));
            const analysisByIndex = new Map<number, ReturnType<typeof analyzeLinguisticText>['sentences'][number]>();
            validIndices.forEach((idx, position) => {
              analysisByIndex.set(idx, linguistic.sentences[position]);
            });
            const collectAnchorTerms = (idx: number): Set<string> => {
              const analysis = analysisByIndex.get(idx);
              const terms = new Set<string>();
              if (!analysis) return terms;
              const subjectWords = analysis.subject?.text.split(/\s+/) ?? [];
              const objectWords = analysis.object?.text.split(/\s+/) ?? [];
              const entityWords = analysis.entities.flatMap((entity) => entity.text.split(/\s+/));
              for (const word of [...subjectWords, ...objectWords, ...entityWords]) {
                const cleaned = cleanWord(word);
                if (cleaned.length > 2 && !FLOW_STOPWORDS.has(cleaned)) terms.add(cleaned);
              }
              return terms;
            };
            const overlapScore = (leftIdx: number, rightIdx: number) => {
              const leftTerms = new Set([...getContentWords(sentences[leftIdx]), ...collectAnchorTerms(leftIdx)]);
              const rightTerms = new Set([...getContentWords(sentences[rightIdx]), ...collectAnchorTerms(rightIdx)]);
              let score = 0;
              for (const term of leftTerms) {
                if (rightTerms.has(term)) score++;
              }
              return score;
            };

            for (const paragraphIndex in paragraphGroups) {
              const group = paragraphGroups[paragraphIndex].filter((_idx) => true);
              if (group.length < 2) continue;

              const anchorKeywords = paragraphKeywordSets[Number(paragraphIndex)] ?? [];
              if (anchorKeywords.length > 0) {
                const firstSentence = sentences[group[0]].toLowerCase();
                const hasOpeningAnchor = anchorKeywords.some((keyword) => firstSentence.includes(keyword.toLowerCase()));
                if (!hasOpeningAnchor) {
                  let bestIdx = -1;
                  let bestScore = 0;
                  for (const candidateIdx of group.slice(1)) {
                    const sentenceLower = sentences[candidateIdx].toLowerCase();
                    const keywordScore = anchorKeywords.reduce((score, keyword) => score + (sentenceLower.includes(keyword.toLowerCase()) ? 2 : 0), 0);
                    const cohesionScore = overlapScore(group[0], candidateIdx);
                    if (keywordScore + cohesionScore > bestScore) {
                      bestScore = keywordScore + cohesionScore;
                      bestIdx = candidateIdx;
                    }
                  }
                  if (bestIdx !== -1) {
                    [sentences[group[0]], sentences[bestIdx]] = [sentences[bestIdx], sentences[group[0]]];
                  }
                }
              }

              for (let offset = 1; offset < group.length - 1; offset++) {
                const previousIdx = group[offset - 1];
                const currentIdx = group[offset];
                const nextIdx = group[offset + 1];
                const currentFlow = overlapScore(previousIdx, currentIdx);
                const nextFlow = overlapScore(previousIdx, nextIdx);
                const bridgeFlow = overlapScore(currentIdx, nextIdx);
                if (currentFlow === 0 && nextFlow > currentFlow && bridgeFlow > 0) {
                  [sentences[currentIdx], sentences[nextIdx]] = [sentences[nextIdx], sentences[currentIdx]];
                }
              }
            }

            const paragraphStarts = new Set(paragraphBoundaries.length ? paragraphBoundaries : [0]);
            for (const idx of validIndices) {
              const starter = getLeadStarter(sentences[idx]);
              if (!starter) continue;
              if ((starter === 'this' || starter === 'these' || starter === 'it') && paragraphStarts.has(idx)) {
                sentences[idx] = demoteLeadStarter(sentences[idx]);
                continue;
              }
              if (starter === 'this' || starter === 'these' || starter === 'it' || starter === 'the') {
                const priorAnchors = new Set<string>();
                for (const previousIdx of [idx - 1, idx - 2]) {
                  if (previousIdx >= 0) {
                    for (const term of collectAnchorTerms(previousIdx)) priorAnchors.add(term);
                  }
                }
                if (priorAnchors.size === 0) {
                  sentences[idx] = demoteLeadStarter(sentences[idx]);
                }
              }
            }

            const recentFamilies: string[] = [];
            const recentPrefixes: string[] = [];
            for (const idx of validIndices) {
              const family = getStarterFamily(sentences[idx]);
              const prefix = getWordList(sentences[idx]).slice(0, 2).map((word) => cleanWord(word)).filter(Boolean).join(' ');
              if ((family !== 'none' && recentFamilies.includes(family)) || (prefix.length > 4 && recentPrefixes.includes(prefix))) {
                let revised = demoteLeadStarter(sentences[idx]);
                revised = compressPhrases(revised);
                revised = fixMidSentenceCapitalization(fixPunctuation(removeEmDashes(revised)));
                sentences[idx] = revised;
              }
              recentFamilies.push(family);
              recentPrefixes.push(prefix);
              if (recentFamilies.length > 3) recentFamilies.shift();
              if (recentPrefixes.length > 4) recentPrefixes.shift();
            }

            for (const group of paragraphGroups) {
              const sentenceGroup = group.filter((_idx) => true);
              for (let offset = 1; offset < sentenceGroup.length - 1; offset++) {
                const leftWords = getWordList(sentences[sentenceGroup[offset - 1]]).length;
                const middleWords = getWordList(sentences[sentenceGroup[offset]]).length;
                const rightWords = getWordList(sentences[sentenceGroup[offset + 1]]).length;
                const range = Math.max(leftWords, middleWords, rightWords) - Math.min(leftWords, middleWords, rightWords);
                if (range <= 3) {
                  const idx = sentenceGroup[offset];
                  let revised = demoteLeadStarter(sentences[idx]);
                  revised = compressPhrases(revised);
                  sentences[idx] = fixMidSentenceCapitalization(fixPunctuation(revised));
                }
              }
            }
          };
