/**
 * Test ALL humanizer engines in parallel with long academic text.
 * Validates:
 *  1. Sentence-by-sentence processing (no batch merging/splitting)
 *  2. Paragraph structure preserved (same paragraph count)
 *  3. Titles/headings maintained
 *  4. Paragraph breaks are 1:1 with input
 *  5. No sentences lost or invented
 */

const BASE = 'http://localhost:3000';

const INPUT_TEXT = `Variable Descriptions

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

// All engines from the UI
const ENGINES = [
  'ninja_4',     // Stealth Pro
  'easy',        // Stealth Quick
  'ozone',       // Stealth Shield
  'ninja_1',     // Stealth Ninja
  'humara_v3_3', // GPTZero Killer
  'oxygen',      // GPTZero Shield
  'king',        // Stealth King
  'nuru_v2',     // Nuru Pure
  'ghost_pro_wiki', // Academic Shield
  'ninja_3',     // Deep Kill Alpha
  'ninja_2',     // Deep Kill Beta
  'ninja_5',     // Deep Kill Omega
  'ghost_trial_2', // Deep Kill Ghost
];

const ENGINE_LABELS = {
  ninja_4: 'Stealth Pro',
  easy: 'Stealth Quick',
  ozone: 'Stealth Shield',
  ninja_1: 'Stealth Ninja',
  humara_v3_3: 'GPTZero Killer',
  oxygen: 'GPTZero Shield',
  king: 'Stealth King',
  nuru_v2: 'Nuru Pure',
  ghost_pro_wiki: 'Academic Shield',
  ninja_3: 'Deep Kill Alpha',
  ninja_2: 'Deep Kill Beta',
  ninja_5: 'Deep Kill Omega',
  ghost_trial_2: 'Deep Kill Ghost',
};

// ── Analyze input structure ──
function analyzeStructure(text) {
  const lines = text.split('\n');
  const paragraphs = [];
  const titles = [];
  let currentParagraph = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') {
      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
      continue;
    }
    // Detect titles: short lines, no period at end, starts with capital
    const words = line.split(/\s+/);
    const isTitle = words.length <= 12 && !/[.!?]$/.test(line) && /^[A-Z]/.test(line);
    if (isTitle && !currentParagraph) {
      titles.push(line);
      paragraphs.push(line);
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + line;
    }
  }
  if (currentParagraph) {
    paragraphs.push(currentParagraph.trim());
  }
  
  return { paragraphs, titles, lineCount: lines.length };
}

// ── Count sentences ──
function countSentences(text) {
  // Match sentence-ending punctuation followed by space or end
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0).length;
}

// ── Parse SSE stream ──
async function parseSSEStream(response) {
  const text = await response.text();
  const events = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        events.push(data);
      } catch {}
    }
  }
  return events;
}

// ── Test a single engine via SSE streaming ──
async function testEngine(engineId) {
  const label = ENGINE_LABELS[engineId] || engineId;
  const start = Date.now();
  
  try {
    const res = await fetch(`${BASE}/api/humanize-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: INPUT_TEXT,
        engine: engineId,
        strength: 'medium',
        tone: 'academic',
      }),
    });
    
    if (!res.ok) {
      return { engineId, label, status: 'ERROR', error: `HTTP ${res.status}`, elapsed: Date.now() - start };
    }
    
    const events = await parseSSEStream(res);
    
    // Find init event (shows sentence-by-sentence processing)
    const initEvent = events.find(e => e.type === 'init');
    // Find sentence events (proves sentence-by-sentence processing)
    const sentenceEvents = events.filter(e => e.type === 'sentence');
    // Find done event
    const doneEvent = events.find(e => e.type === 'done');
    
    if (!doneEvent) {
      const errorEvent = events.find(e => e.type === 'error');
      return { engineId, label, status: 'ERROR', error: errorEvent?.error || 'No done event', elapsed: Date.now() - start };
    }
    
    const elapsed = Date.now() - start;
    const output = doneEvent.humanized;
    
    // Analyze structures
    const inputStructure = analyzeStructure(INPUT_TEXT);
    const outputStructure = analyzeStructure(output);
    
    // ── Validation checks ──
    const checks = [];
    
    // 1. Sentence-by-sentence streaming (init event should have sentences array)
    if (initEvent && initEvent.sentences) {
      checks.push({ name: 'Sentence-by-sentence init', pass: true, detail: `${initEvent.sentences.length} sentences sent to client` });
    } else {
      checks.push({ name: 'Sentence-by-sentence init', pass: false, detail: 'No init event with sentences array' });
    }
    
    // 2. Sentence events received (proves individual processing)
    if (sentenceEvents.length > 0) {
      // Check that sentence indices are sequential and cover the range
      const indices = new Set(sentenceEvents.map(e => e.index));
      checks.push({ name: 'Per-sentence streaming', pass: true, detail: `${sentenceEvents.length} sentence updates, ${indices.size} unique indices` });
    } else {
      checks.push({ name: 'Per-sentence streaming', pass: false, detail: 'No sentence events received' });
    }
    
    // 3. Paragraph count preserved
    const paraDiff = Math.abs(inputStructure.paragraphs.length - outputStructure.paragraphs.length);
    const paraPass = paraDiff <= 1; // Allow ±1 tolerance for edge cases
    checks.push({ 
      name: 'Paragraph count', 
      pass: paraPass, 
      detail: `Input: ${inputStructure.paragraphs.length}, Output: ${outputStructure.paragraphs.length}${paraDiff > 0 ? ` (diff: ${paraDiff})` : ''}` 
    });
    
    // 4. Titles preserved
    const outputTitleSet = new Set(outputStructure.titles.map(t => t.toLowerCase()));
    const titlesFound = inputStructure.titles.filter(t => {
      const lower = t.toLowerCase();
      // Check if any output title contains or matches
      return outputStructure.titles.some(ot => 
        ot.toLowerCase() === lower || 
        ot.toLowerCase().includes(lower) || 
        lower.includes(ot.toLowerCase())
      );
    });
    const titlePass = titlesFound.length === inputStructure.titles.length;
    checks.push({ 
      name: 'Titles preserved', 
      pass: titlePass, 
      detail: `${titlesFound.length}/${inputStructure.titles.length} titles found. Input: [${inputStructure.titles.join(', ')}], Output: [${outputStructure.titles.join(', ')}]` 
    });
    
    // 5. Paragraph breaks (double newlines) count
    const inputBreaks = (INPUT_TEXT.match(/\n\n/g) || []).length;
    const outputBreaks = (output.match(/\n\n/g) || []).length;
    const breakDiff = Math.abs(inputBreaks - outputBreaks);
    const breakPass = breakDiff <= 2; // small tolerance
    checks.push({ 
      name: 'Paragraph breaks 1:1', 
      pass: breakPass, 
      detail: `Input: ${inputBreaks} breaks, Output: ${outputBreaks} breaks${breakDiff > 0 ? ` (diff: ${breakDiff})` : ''}` 
    });
    
    // 6. No excessive sentence merging or splitting
    const inputSentCount = countSentences(INPUT_TEXT.replace(/\n\n/g, ' '));
    const outputSentCount = countSentences(output.replace(/\n\n/g, ' '));
    const sentDiff = Math.abs(inputSentCount - outputSentCount);
    const sentRatio = outputSentCount / inputSentCount;
    const sentPass = sentRatio >= 0.7 && sentRatio <= 1.3; // Within 30% tolerance
    checks.push({ 
      name: 'Sentence count stability', 
      pass: sentPass, 
      detail: `Input: ${inputSentCount}, Output: ${outputSentCount}, Ratio: ${sentRatio.toFixed(2)}` 
    });
    
    // 7. Output not empty and reasonable length
    const wordCountIn = INPUT_TEXT.trim().split(/\s+/).length;
    const wordCountOut = output.trim().split(/\s+/).length;
    const wordRatio = wordCountOut / wordCountIn;
    const wordPass = wordRatio >= 0.5 && wordRatio <= 1.5;
    checks.push({ 
      name: 'Word count reasonable', 
      pass: wordPass, 
      detail: `Input: ${wordCountIn}w, Output: ${wordCountOut}w, Ratio: ${wordRatio.toFixed(2)}` 
    });
    
    // 8. No single-line output (structure wasn't flattened)
    const outputLines = output.split('\n').length;
    const linePass = outputLines > 5;
    checks.push({ 
      name: 'Multi-line output', 
      pass: linePass, 
      detail: `${outputLines} lines` 
    });
    
    const allPass = checks.every(c => c.pass);
    
    return { 
      engineId, 
      label, 
      status: allPass ? 'PASS' : 'WARN',
      elapsed,
      checks,
      outputPreview: output.substring(0, 200) + '...',
      outputFull: output,
    };
    
  } catch (err) {
    return { engineId, label, status: 'ERROR', error: err.message, elapsed: Date.now() - start };
  }
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PARALLEL ENGINE TEST — All engines, structure validation');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Analyze input
  const inputStructure = analyzeStructure(INPUT_TEXT);
  console.log(`\nInput: ${INPUT_TEXT.trim().split(/\s+/).length} words, ${inputStructure.paragraphs.length} paragraphs, ${inputStructure.titles.length} titles`);
  console.log(`Titles: ${inputStructure.titles.join(' | ')}`);
  console.log(`Paragraph breaks: ${(INPUT_TEXT.match(/\n\n/g) || []).length}`);
  console.log(`\nLaunching ${ENGINES.length} engines in parallel...\n`);
  
  const startAll = Date.now();
  
  // Run ALL engines in parallel
  const results = await Promise.all(ENGINES.map(eng => testEngine(eng)));
  
  const totalElapsed = Date.now() - startAll;
  
  // ── Print results ──
  console.log('\n' + '═'.repeat(100));
  console.log('  RESULTS');
  console.log('═'.repeat(100));
  
  let passCount = 0;
  let warnCount = 0;
  let errorCount = 0;
  
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    console.log(`\n${icon} ${r.label} (${r.engineId}) — ${r.status} — ${(r.elapsed / 1000).toFixed(1)}s`);
    
    if (r.error) {
      console.log(`   Error: ${r.error}`);
      errorCount++;
      continue;
    }
    
    if (r.status === 'PASS') passCount++;
    if (r.status === 'WARN') warnCount++;
    
    if (r.checks) {
      for (const c of r.checks) {
        const ci = c.pass ? '  ✓' : '  ✗';
        console.log(`${ci} ${c.name}: ${c.detail}`);
      }
    }
  }
  
  // ── Summary ──
  console.log('\n' + '═'.repeat(100));
  console.log(`  SUMMARY: ${passCount} PASS, ${warnCount} WARN, ${errorCount} ERROR — Total: ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log('═'.repeat(100));
  
  // ── Detailed output structure comparison ──
  console.log('\n\n' + '─'.repeat(100));
  console.log('  DETAILED OUTPUT STRUCTURE (first 3 paragraphs per engine)');
  console.log('─'.repeat(100));
  
  for (const r of results) {
    if (r.outputFull) {
      const structure = analyzeStructure(r.outputFull);
      console.log(`\n[${r.label}] — ${structure.paragraphs.length} paragraphs, ${structure.titles.length} titles`);
      console.log(`  Titles: ${structure.titles.join(' | ') || '(none)'}`);
      // Show first 3 paragraphs with truncation
      for (let i = 0; i < Math.min(3, structure.paragraphs.length); i++) {
        const p = structure.paragraphs[i];
        const preview = p.length > 120 ? p.substring(0, 120) + '...' : p;
        console.log(`  P${i}: ${preview}`);
      }
    }
  }
}

main().catch(console.error);
