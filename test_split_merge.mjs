// Quick test: verify splitIntoIndexedSentences → reassembleText roundtrip
// preserves paragraph structure with the user's exact input.

// Inline the functions (adapted from route.ts)
function looksLikeHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s/.test(trimmed)) return true;
  if (/^\d+(?:[.)]|(?:\.\d+)+)\s+[A-Z]/.test(trimmed)) return true;
  if (/^[A-Z][A-Z\s0-9:&()\-–—\/,'".]{4,}$/.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
  const isMajorityCapitalized = capitalizedWords / Math.max(1, words.length) >= 0.5;
  return (
    words.length <= 12 &&
    !/[.!?]$/.test(trimmed) &&
    /^[A-Z0-9]/.test(trimmed) &&
    isMajorityCapitalized
  );
}

function robustSentenceSplitSimple(text) {
  if (!text || !text.trim()) return [];
  const sentenceRe = /([.!?]["'\u201D\u2019]?)\s+(?=[A-Z])/g;
  const parts = [];
  let lastIdx = 0;
  let match;
  while ((match = sentenceRe.exec(text)) !== null) {
    const end = match.index + match[1].length;
    parts.push(text.slice(lastIdx, end));
    lastIdx = end;
    while (lastIdx < text.length && /\s/.test(text[lastIdx])) lastIdx++;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}

function splitIntoIndexedSentences(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const sentences = [];
  const paragraphBoundaries = [];

  for (const para of paragraphs) {
    paragraphBoundaries.push(sentences.length);
    const trimmed = para.trim();
    const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length === 1 && looksLikeHeadingLine(trimmed)) {
      sentences.push(trimmed);
    } else if (lines.length > 1 && lines.every(l => looksLikeHeadingLine(l) || l.endsWith('?') || l.endsWith(':') || /^\d+[.)]\s/.test(l) || /^[-•]\s/.test(l))) {
      for (const line of lines) {
        sentences.push(line);
      }
    } else {
      const normalizedPara = trimmed.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const sents = robustSentenceSplitSimple(normalizedPara);
      sentences.push(...(sents.length ? sents : [normalizedPara]));
    }
  }
  return { sentences, paragraphBoundaries };
}

function reassembleText(sentences, paragraphBoundaries) {
  const paragraphs = [];
  for (let i = 0; i < paragraphBoundaries.length; i++) {
    const start = paragraphBoundaries[i];
    const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
    paragraphs.push(sentences.slice(start, end));
  }
  return paragraphs.map(p => p.join(' ')).join('\n\n');
}

// User's exact input
const input = `Variable Descriptions

The second research question focused on the relationship between school-level cell phone restriction policies and standardized test scores. The independent variable, cell phone restriction, was coded as a nominal dichotomy (0 = no restriction, 1 = restricted). This binary coding allowed for a straightforward comparison between students who were subject to restriction policies and those who were not. The dependent variable, standardized test scores, was treated as a continuous variable with a possible range of 40 to 100. The descriptive statistics showed that the average test score across all students was 75.16, with a standard deviation of 10.06. These values indicate that most students scored around the mid-70s, with variability sufficient to allow for meaningful statistical testing (see Table 3, Descriptive Statistics for Test Scores by Restriction Status).

Graphical representations provide further insight into the distribution of test scores. Figure 3. Histogram of Student Test Scores demonstrates that the data approximates a normal distribution, with the bulk of scores concentrated between 70 and 80. This normality supports the appropriateness of parametric tests such as the independent-samples t-test and ANOVA. In addition, Figure 4. Bar Chart of Mean Test Scores by Restriction Status highlights the striking similarity between the two groups. Students in restricted schools achieved a mean score of 75.0, while those in unrestricted schools averaged 75.1. These nearly identical means visually reinforce the descriptive finding that phone restrictions do not appear to make a substantial difference in standardized test outcomes.

T-Test

To formally test whether students in restricted schools performed better than those in unrestricted schools, an independent-samples t-test was conducted. As noted, the mean test scores of the two groups were nearly identical, with a difference of only 0.1 points. The test revealed no statistically significant difference between the groups (p > .05), indicating that the observed variation was due to chance rather than the effect of cell phone policies (see Table 4, Independent Samples t-Test of Test Scores by Restriction Status). These findings suggest that cell phone restrictions, in isolation, are insufficient to raise student academic performance as measured by standardized tests. This aligns with Perry (2021), who argued that student outcomes are shaped more by structural and cultural factors in schools than by narrow, single-issue policies such as phone bans.

ANOVA

In order to test whether broader social factors might interact with cell phone policies to influence performance, a one-way ANOVA was conducted using religious attendance as a grouping variable. This analysis examined whether test scores varied systematically among students with different levels of religious involvement. The results indicated no significant differences across the groups (p > .05), with test scores remaining stable regardless of attendance frequency (see Table 5, ANOVA of Test Scores by Religious Attendance). This finding is notable because it reinforces the conclusion that test performance is not significantly explained by contextual policy or social attendance variables. Instead, the results highlight the need to consider deeper, more complex drivers of academic performance.

Correlation Analysis

To further probe the relationships among key demographic and academic variables, Pearson correlations were calculated between age, household income, classroom engagement, and test scores. The results showed that most associations were minimal and non-significant, with coefficients close to zero. This indicates that, within this dataset, neither age nor cell phone restrictions had a measurable relationship with performance. The only exception was a weak but statistically significant positive relationship between income and classroom engagement, suggesting that students from higher-income households reported slightly greater engagement (see Table 6, Correlation Matrix for Age, Income, Test Scores, and Engagement). While interesting, this result does not undermine the central finding that phone policies were unrelated to test scores. Instead, it emphasizes the role of socioeconomic conditions, which have been widely documented in educational research as powerful determinants of both engagement and achievement.

Conclusion (RQ2)

In summary, the findings for the second research question indicate that there is no significant relationship between school cell phone restriction policies and student standardized test scores. The null hypothesis could not be rejected, as both the independent-samples t-test and ANOVA found no significant differences between restricted and unrestricted groups. These results align with King et al. (2024), who found that phone bans may influence student wellbeing or reduce problematic usage but do not directly translate into academic improvements. Taken together, the evidence from both descriptive and inferential analyses suggests that student performance is shaped more by complex factors such as teaching quality, socioeconomic status, and school resources than by the presence or absence of cell phone restrictions.

General Conclusion

The analyses in this paper addressed the central policy question: should public schools restrict student cell phone use during instructional hours to improve learning outcomes? Two research questions were examined. The first asked whether cell phone restrictions improve classroom engagement, while the second asked whether such restrictions raise standardized test scores. Across both questions, the results were consistent and clear. There was no evidence of a significant impact of restrictions on engagement or academic performance. Correlation analyses, t-tests, and ANOVA all failed to reveal meaningful differences between restricted and unrestricted groups, and the descriptive results confirmed that student outcomes were largely similar regardless of policy context.

The implications of these findings are significant for school leaders and policymakers. First, they suggest that restricting phones alone is not an effective strategy for improving student engagement or academic achievement. Engagement is a complex construct that is influenced by teaching style, classroom climate, and student motivation. Similarly, test scores reflect a wide range of factors, including curriculum quality, socioeconomic background, and student study habits. This aligns with Rahali et al. (2024), who concluded that evidence for the effectiveness of phone bans is mixed and context-dependent. Some schools may observe benefits, while others experience little change, depending on how the bans are implemented and what complementary strategies are in place.

Second, the findings resonate with King et al. (2024), who found that bans may be beneficial for reducing problematic phone use and fostering wellbeing, but they are not sufficient to generate measurable academic improvements. This is important in the current policy debate because many proponents of phone bans argue that they are necessary to raise test scores and engagement levels. The evidence here suggests otherwise: while bans may serve as a useful tool for managing distractions, they should not be viewed as a silver bullet for solving deeper issues in education.

Third, the results are consistent with Perry (2021), who critiqued zero-tolerance and single-issue school policies for their inability to address systemic problems. Like zero-tolerance discipline policies, blanket cell phone bans may create the illusion of control but fail to engage with the root causes of underachievement. Effective educational reform requires a holistic approach that addresses teaching practices, student support systems, digital literacy, and family engagement.`;

// Test
const { sentences, paragraphBoundaries } = splitIntoIndexedSentences(input);
console.log(`\n=== SPLIT RESULTS ===`);
console.log(`Total sentences: ${sentences.length}`);
console.log(`Paragraph boundaries: [${paragraphBoundaries.join(', ')}] (${paragraphBoundaries.length} paragraphs)\n`);

// Show which sentences are in each paragraph
for (let i = 0; i < paragraphBoundaries.length; i++) {
  const start = paragraphBoundaries[i];
  const end = i < paragraphBoundaries.length - 1 ? paragraphBoundaries[i + 1] : sentences.length;
  const paraType = (end - start === 1 && looksLikeHeadingLine(sentences[start])) ? 'HEADING' : 'PARAGRAPH';
  console.log(`--- ${paraType} (${end - start} sentences) ---`);
  for (let j = start; j < end; j++) {
    const preview = sentences[j].length > 80 ? sentences[j].slice(0, 80) + '...' : sentences[j];
    console.log(`  [${j}] ${preview}`);
  }
}

// Reassemble and verify roundtrip
const reassembled = reassembleText(sentences, paragraphBoundaries);
const inputParas = input.split(/\n\s*\n/).filter(p => p.trim());
const outputParas = reassembled.split(/\n\s*\n/).filter(p => p.trim());

console.log(`\n=== ROUNDTRIP CHECK ===`);
console.log(`Input paragraphs: ${inputParas.length}`);
console.log(`Output paragraphs: ${outputParas.length}`);

// Check each paragraph preserved
let allGood = true;
for (let i = 0; i < Math.max(inputParas.length, outputParas.length); i++) {
  const inP = (inputParas[i] || '').trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const outP = (outputParas[i] || '').trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  if (inP !== outP) {
    console.log(`DIFF at paragraph ${i}:`);
    console.log(`  IN:  ${inP.slice(0, 100)}...`);
    console.log(`  OUT: ${outP.slice(0, 100)}...`);
    allGood = false;
  }
}
if (allGood) console.log('✓ All paragraphs match after roundtrip!');
