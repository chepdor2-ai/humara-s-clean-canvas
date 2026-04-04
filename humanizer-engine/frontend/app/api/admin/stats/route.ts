import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';

function getToken(authHeader: string | null) {
  if (!authHeader) return null;
  return authHeader.replace('Bearer ', '');
}

export async function GET(request: Request) {
  try {
    const token = getToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check admin (simple email-based check — replace with role column in production)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Aggregate stats
    const [usersResult, docsResult, revenueResult, usageResult] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('documents').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('amount').eq('status', 'succeeded'),
      supabase.from('usage').select('words_used_fast, words_used_stealth, requests').gte('usage_date', new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10)),
    ]);

    const totalRevenue = (revenueResult.data || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const monthlyUsage = (usageResult.data || []).reduce((acc, u) => ({
      words: acc.words + (u.words_used_fast || 0) + (u.words_used_stealth || 0),
      requests: acc.requests + (u.requests || 0),
    }), { words: 0, requests: 0 });

    return NextResponse.json({
      total_users: usersResult.count || 0,
      total_documents: docsResult.count || 0,
      total_revenue: totalRevenue,
      monthly_words_processed: monthlyUsage.words,
      monthly_requests: monthlyUsage.requests,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
