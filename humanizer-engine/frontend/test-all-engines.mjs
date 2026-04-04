/**
 * Test all humanizer engine combinations
 * Tests: ghost_mini, ghost_pro, ninja, undetectable (premium=false)
 * Then: ghost_pro + premium=true
 * Across strengths: light, medium, strong
 * Across tones: neutral, academic, professional, simple
 */

const API_URL = 'http://localhost:3000/api/humanize';

const TEST_TEXT = `Thank you for completing the intake form and outlining your financial goals. After reviewing your monthly income of $3,500 and fixed expenses totaling $2,583, I have reallocated the remaining $917 using a zero-based budgeting system. This approach ensures that every dollar is assigned a specific purpose, leaving no surplus or deficit at the end of the month. Your fixed expenses remain unchanged as required, while the variable expense categories have been updated to better align with your stated objectives.

The first priority in any sound financial plan is establishing an emergency fund. Without a safety net, unexpected expenses such as medical bills, car repairs, or sudden job loss can derail even the most carefully structured budget. I have allocated $150 per month toward your emergency savings. At this rate, you will accumulate approximately $1,800 over the course of one year.

In addition to building emergency reserves, it is important to begin addressing outstanding debts. High-interest credit card balances and personal loans can significantly hinder your ability to save and invest. I recommend directing $100 per month toward your highest-interest debt, using the avalanche method to minimize total interest paid over time. Once your highest-interest account is cleared, you can redirect those payments to the next obligation.

Transportation costs represent another area where adjustments can yield meaningful savings. By carpooling, using public transit two to three days per week, or consolidating errands into fewer trips, you may be able to reduce fuel and maintenance costs. I have budgeted $80 per month for transportation-related variable expenses, which includes fuel and minor upkeep.

Groceries and household supplies are essential but often overestimated in personal budgets. Meal planning, purchasing store-brand products, and buying in bulk for non-perishable items can help stretch your food budget. I have set this category at $200 per month. Tracking actual spending over the next 60 days will help determine whether this figure needs to be adjusted.

Healthcare expenses, including copays, over-the-counter medications, and wellness-related purchases, should also be anticipated. Even with insurance coverage, out-of-pocket costs can add up quickly. A monthly allocation of $50 has been included to cover these recurring needs.

Personal spending is an important but frequently overlooked component of a sustainable budget. Without some allowance for discretionary purchases such as dining out, entertainment, or hobbies, individuals often feel deprived and abandon their financial plans entirely. I have set aside $75 per month for personal spending to maintain motivation and reduce the likelihood of impulsive overspending.

Finally, I recommend setting aside a small amount each month for irregular or seasonal expenses. These may include annual subscriptions, holiday gifts, vehicle registration fees, or back-to-school supplies. An allocation of $62 per month will help you prepare for these periodic costs without disrupting your regular cash flow.

The remaining $200 has been directed toward long-term savings or investment contributions. Even modest, consistent contributions to a retirement account or index fund can compound significantly over time. Starting early and maintaining discipline are among the most effective strategies for building wealth.

I encourage you to review this plan carefully and identify any areas where you feel the allocations could be improved. Financial planning is not a one-time exercise but an ongoing process that should evolve as your circumstances change. Please do not hesitate to reach out if you have questions or would like to schedule a follow-up session to discuss your progress.`;

const ENGINES = ['ghost_mini', 'ghost_pro', 'ninja', 'undetectable'];
const STRENGTHS = ['light', 'medium', 'strong'];
const TONES = ['neutral', 'academic', 'professional', 'simple'];

// Check for repetitive phrase injection
function checkRepetition(text) {
  const phrases = [
    'along those lines', 'from that angle', 'under those conditions',
    'at that stage', 'for that reason', 'by that measure',
    'on that score', 'in this case', 'at that point', 'by then',
    'as it turned out', 'in real terms', 'in many ways', 'to that end',
    'with that in mind', 'on that note', 'in that regard', 'to be sure',
    'as a matter of fact', 'by the same token', 'in the same vein',
    'on a related note', 'to elaborate', 'in other words',
    'to put it another way', 'looking at it this way',
    'that said', 'even so', 'all in all', 'granted',
    'practically speaking', 'at its core', 'put simply',
    'as it turns out', 'in the end', 'going ahead',
  ];
  const issues = [];
  for (const phrase of phrases) {
    const regex = new RegExp(phrase, 'gi');
    const matches = text.match(regex);
    if (matches && matches.length >= 2) {
      issues.push(`"${phrase}" x${matches.length}`);
    }
  }
  
  // Also check for any 3+ word phrase that appears significantly MORE than in input
  const inputWords = TEST_TEXT.toLowerCase().split(/\s+/);
  const inputTrigramCounts = {};
  for (let i = 0; i < inputWords.length - 2; i++) {
    const tri = inputWords.slice(i, i + 3).join(' ').replace(/[^a-z ]/g, '');
    if (tri.length > 6) {
      inputTrigramCounts[tri] = (inputTrigramCounts[tri] || 0) + 1;
    }
  }
  
  const words = text.toLowerCase().split(/\s+/);
  const trigramCounts = {};
  for (let i = 0; i < words.length - 2; i++) {
    const tri = words.slice(i, i + 3).join(' ').replace(/[^a-z ]/g, '');
    if (tri.length > 6) {
      trigramCounts[tri] = (trigramCounts[tri] || 0) + 1;
    }
  }
  for (const [tri, count] of Object.entries(trigramCounts)) {
    const inputCount = inputTrigramCounts[tri] || 0;
    // Only flag if the output has MORE repetitions than the input AND it appears 3+ times  
    if (count >= 3 && count > inputCount + 1) {
      issues.push(`trigram "${tri}" x${count} (was ${inputCount} in input)`);
    }
  }
  
  return issues;
}

async function testEngine(engine, strength, tone, premium = false) {
  const label = `${premium ? 'PREMIUM+' : ''}${engine}/${strength}/${tone}`;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        strength,
        tone,
        strict_meaning: true,
        enable_post_processing: true,
        premium,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`❌ ${label}: HTTP ${res.status} - ${errText.substring(0, 120)}`);
      return { label, status: 'HTTP_ERROR', code: res.status }; 
    }

    const data = await res.json();

    if (data.error) {
      console.log(`❌ ${label}: API Error - ${data.error}`);
      return { label, status: 'API_ERROR', error: data.error };
    }

    if (!data.humanized || data.humanized.trim().length === 0) {
      console.log(`❌ ${label}: Empty output`);
      return { label, status: 'EMPTY_OUTPUT' };
    }

    // Check for repetition issues
    const repetitions = checkRepetition(data.humanized);
    const inputAI = data.input_detector_results?.overall ?? '?';
    const outputAI = data.output_detector_results?.overall ?? '?';
    const meaning = data.meaning_similarity ?? '?';

    if (repetitions.length > 0) {
      console.log(`⚠️  ${label}: OK but REPETITION detected — AI:${inputAI}→${outputAI} meaning:${meaning}`);
      console.log(`   Repeats: ${repetitions.join(', ')}`);
      console.log(`   OUTPUT: ${data.humanized.substring(0, 500)}`);
      return { label, status: 'REPETITION', repetitions, inputAI, outputAI, meaning, output: data.humanized };
    }

    console.log(`✅ ${label}: OK — AI:${inputAI}→${outputAI} meaning:${meaning} words:${data.word_count}`);
    return { label, status: 'OK', inputAI, outputAI, meaning };
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
    return { label, status: 'EXCEPTION', error: e.message };
  }
}

async function runAll() {
  console.log('=== HUMANIZER ENGINE TEST SUITE (FULL) ===\n');
  console.log(`Test text: ${TEST_TEXT.length} chars, ${TEST_TEXT.split(/\s+/).length} words\n`);
  
  const results = [];
  
  // Test ALL non-premium engine combinations
  console.log('--- ALL NON-PREMIUM ENGINES ---');
  for (const engine of ENGINES) {
    for (const strength of STRENGTHS) {
      for (const tone of TONES) {
        const r = await testEngine(engine, strength, tone, false);
        results.push(r);
      }
    }
  }

  // Test ALL premium combinations - the problematic path
  console.log('\n--- ALL PREMIUM COMBINATIONS ---');
  for (const strength of STRENGTHS) {
    for (const tone of TONES) {
      const r = await testEngine('ghost_pro', strength, tone, true);
      results.push(r);
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  const ok = results.filter(r => r.status === 'OK').length;
  const rep = results.filter(r => r.status === 'REPETITION').length;
  const err = results.filter(r => !['OK', 'REPETITION'].includes(r.status)).length;
  console.log(`Total: ${results.length} | ✅ OK: ${ok} | ⚠️ Repetition: ${rep} | ❌ Error: ${err}`);
  
  if (rep > 0) {
    console.log('\nRepetition issues:');
    results.filter(r => r.status === 'REPETITION').forEach(r => {
      console.log(`  ${r.label}: ${r.repetitions.join(', ')}`);
    });
  }
  if (err > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !['OK', 'REPETITION'].includes(r.status)).forEach(r => {
      console.log(`  ${r.label}: ${r.status} ${r.error || r.code || ''}`);
    });
  }
}

runAll().catch(console.error);
