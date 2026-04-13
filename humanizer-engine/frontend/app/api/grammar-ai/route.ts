import { NextRequest, NextResponse } from 'next/server';

/**
 * AI Grammar Highlight API
 * Uses LLM ONLY to detect & highlight errors — NOT to rewrite.
 * Returns error positions + messages for the frontend to merge with non-LLM corrections.
 */

const SYSTEM_PROMPT = `You are a grammar error detector and corrector. Your job is to find grammatical errors, spelling mistakes, and punctuation issues in the given text, and provide the corrected version of ONLY the erroneous part.

CRITICAL RULES:
1. Do NOT rewrite or rephrase ANY correct part of the text
2. Do NOT suggest alternative wordings or style improvements for text that is already correct
3. ONLY identify actual grammatical errors, spelling errors, and punctuation errors
4. For each error, return the EXACT text span that is wrong AND the minimal correction
5. The "correction" must fix ONLY the error — do not change surrounding words or rephrase
6. Return a JSON array of issues

Each issue must have:
- "text": the exact wrong text from the input (copy it character-for-character)
- "correction": the minimal corrected version of ONLY that text span (fix the error, nothing else)
- "message": brief explanation of the error (under 15 words)
- "severity": "error" for grammar/spelling, "warning" for punctuation/structure
- "category": one of "Grammar", "Spelling", "Punctuation", "Agreement", "Verb Form", "Word Choice"

Respond ONLY with a valid JSON array. No explanation. No markdown. No code blocks.
Example: [{"text":"she don't","correction":"she doesn't","message":"Subject-verb disagreement: use doesn't","severity":"error","category":"Agreement"}]
If no errors found, respond with: []`;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string' || text.length > 10000) {
      return NextResponse.json({ issues: [] });
    }

    // Try Groq first (faster), fall back to OpenAI
    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    let aiIssues: Array<{
      text: string;
      correction?: string;
      message: string;
      severity: string;
      category: string;
    }> = [];

    if (groqKey) {
      aiIssues = await callGroq(text, groqKey);
    } else if (openaiKey) {
      aiIssues = await callOpenAI(text, openaiKey);
    } else {
      return NextResponse.json({ issues: [], error: 'No AI API key configured' });
    }

    // Map text spans to character positions in the original
    const mappedIssues = aiIssues
      .filter(i => i.text && i.message)
      .map(issue => {
        const idx = text.toLowerCase().indexOf(issue.text.toLowerCase());
        if (idx === -1) return null;
        return {
          start: idx,
          end: idx + issue.text.length,
          message: `[AI] ${issue.message}`,
          severity: issue.severity === 'error' ? 'error' : 'warning',
          category: issue.category || 'Grammar',
          correction: issue.correction || '',
        };
      })
      .filter(Boolean);

    return NextResponse.json({ issues: mappedIssues });
  } catch {
    return NextResponse.json({ issues: [], error: 'AI analysis failed' });
  }
}

async function callGroq(text: string, apiKey: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Find grammar errors in this text:\n\n${text}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '[]';
  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from response
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

async function callOpenAI(text: string, apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Find grammar errors in this text:\n\n${text}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '[]';
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}
