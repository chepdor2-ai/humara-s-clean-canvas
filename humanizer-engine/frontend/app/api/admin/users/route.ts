import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabase = createServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (error || !user?.email || !ADMIN_EMAILS.includes(user.email)) return null;
  return user;
}

// GET /api/admin/users - List all users with subscription info
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('profiles')
    .select(`
      id, full_name, email, avatar_url, use_case, onboarding_done, plan_id, created_at,
      plans(id, name, display_name, price_monthly, daily_words_fast, daily_words_stealth),
      subscriptions(id, status, plan_name, current_period_start, current_period_end, stripe_subscription_id)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: users, count, error } = await query;

  if (error) {
    console.error('Admin users fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  return NextResponse.json({
    users: users || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

// PATCH /api/admin/users - Update a user (suspend, change plan, set limits, set subscription)
export async function PATCH(request: Request) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await request.json();
  const { user_id, action, ...params } = body;

  if (!user_id || !action) {
    return NextResponse.json({ error: 'Missing user_id or action' }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (action) {
    case 'suspend': {
      // Suspend user: set subscription to suspended
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'suspended' })
        .eq('user_id', user_id);

      if (error) {
        // If no subscription exists, create one with suspended status
        await supabase.from('subscriptions').upsert({
          user_id,
          status: 'suspended',
          plan_name: 'free',
        }, { onConflict: 'user_id' });
      }

      return NextResponse.json({ success: true, message: 'User suspended' });
    }

    case 'unsuspend': {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('user_id', user_id);

      if (error) {
        return NextResponse.json({ error: 'Failed to unsuspend user' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'User unsuspended' });
    }

    case 'set_plan': {
      const { plan_name, days } = params;
      if (!plan_name) {
        return NextResponse.json({ error: 'Missing plan_name' }, { status: 400 });
      }

      // Find the plan
      const { data: planRow } = await supabase
        .from('plans')
        .select('id, name, display_name')
        .eq('name', plan_name)
        .single();

      if (!planRow) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const periodDays = days || 30;
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + periodDays);

      // Upsert subscription
      await supabase
        .from('subscriptions')
        .upsert({
          user_id,
          plan_id: planRow.id,
          plan_name: planRow.name,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          stripe_subscription_id: `admin_manual_${Date.now()}`,
        }, { onConflict: 'user_id' });

      // Update profile plan_id
      await supabase
        .from('profiles')
        .update({ plan_id: planRow.id })
        .eq('id', user_id);

      return NextResponse.json({
        success: true,
        message: `Plan set to ${planRow.display_name || planRow.name} for ${periodDays} days`,
      });
    }

    case 'set_limits': {
      const { daily_words_fast, daily_words_stealth } = params;

      // Store custom limits in a user_overrides field or a separate table
      // For now, store in profile metadata
      const updates: Record<string, unknown> = {};
      if (daily_words_fast !== undefined) updates.custom_daily_words_fast = daily_words_fast;
      if (daily_words_stealth !== undefined) updates.custom_daily_words_stealth = daily_words_stealth;

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user_id);

      if (error) {
        return NextResponse.json({ error: 'Failed to update limits' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Custom limits updated' });
    }

    case 'reset_usage': {
      // Delete today's usage records
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_usage')
        .delete()
        .eq('user_id', user_id)
        .eq('date', today);

      return NextResponse.json({ success: true, message: 'Daily usage reset' });
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}
