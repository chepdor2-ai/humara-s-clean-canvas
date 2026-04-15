import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import crypto from 'crypto';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  // If no auth, return public info
  if (!authHeader?.startsWith('Bearer hum_')) {
    return NextResponse.json({
      success: true,
      data: {
        status: 'operational',
        version: '1.0.0',
        engines: [
          { id: 'oxygen', name: 'Humara 2.0', description: 'GPTZero killer mode', tier: 'hobby' },
          { id: 'ozone', name: 'Humara 2.1', description: 'ZeroGPT/Surfer SEO cleaner', tier: 'developer' },
          { id: 'easy', name: 'Humara 2.2', description: 'Broad-spectrum general-purpose', tier: 'hobby' },
          { id: 'oxygen3', name: 'Humara 3.0', description: 'Fine-tuned 270K pairs model', tier: 'developer' },
          { id: 'humara_v3_3', name: 'Humara 2.4', description: 'Strongest GPTZero killer', tier: 'business' },
          { id: 'nuru_v2', name: 'Nuru 2.0', description: 'Deep sentence restructuring', tier: 'developer' },
          { id: 'ghost_pro_wiki', name: 'Wikipedia', description: 'Encyclopedic NPOV mode', tier: 'developer' },
        ],
        strengths: ['light', 'medium', 'strong'],
        tones: ['neutral', 'academic', 'professional', 'simple', 'creative', 'technical', 'wikipedia'],
        limits: {
          max_text_length: 50000,
          max_word_count: 10000,
        },
      },
    });
  }

  // Authenticated — return user-specific info
  const apiKey = authHeader.replace('Bearer ', '');
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const supabase = createServiceClient();

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, requests')
    .eq('key_hash', keyHash)
    .single();

  if (!keyRow || !keyRow.is_active) {
    return NextResponse.json({ error: 'Invalid or revoked API key.', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Try extended columns
  let monthlyWordsUsed = 0;
  let dailyRequestsUsed = 0;
  const { data: extRow } = await supabase
    .from('api_keys')
    .select('monthly_words_used, daily_requests_used')
    .eq('id', keyRow.id)
    .single();
  if (extRow) {
    monthlyWordsUsed = extRow.monthly_words_used ?? 0;
    dailyRequestsUsed = extRow.daily_requests_used ?? 0;
  }

  const allEngines = ['oxygen', 'ozone', 'easy', 'oxygen3', 'humara_v3_3', 'nuru_v2', 'ghost_pro_wiki'];
  const monthlyWords = 50000;
  const dailyRequests = 100;

  return NextResponse.json({
    success: true,
    data: {
      status: 'operational',
      version: '1.0.0',
      plan: 'Default',
      available_engines: allEngines,
      usage: {
        daily_requests_used: dailyRequestsUsed,
        daily_requests_limit: dailyRequests,
        monthly_words_used: monthlyWordsUsed,
        monthly_words_limit: monthlyWords,
      },
      rate_limit: {
        requests_per_minute: 10,
      },
      total_requests: keyRow.requests || 0,
    },
  });
}
