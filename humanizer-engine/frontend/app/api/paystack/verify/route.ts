import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PLAN_ALIASES: Record<string, string[]> = {
  starter: ['starter'],
  creator: ['creator'],
  professional: ['professional', 'pro'],
  business: ['business'],
};

function resolvePaystackSecret(): string | null {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  return key || null;
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error('Supabase service credentials are not configured.');
  }

  return createClient(
    supabaseUrl,
    serviceRole,
  );
}

async function findPlanIdByName(supabase: ReturnType<typeof createServiceClient>, rawPlan: string) {
  const normalized = rawPlan.trim().toLowerCase();
  const aliases = PLAN_ALIASES[normalized] ?? [normalized];

  for (const candidate of aliases) {
    const { data } = await supabase
      .from('plans')
      .select('id, name')
      .eq('name', candidate)
      .maybeSingle();

    if (data) {
      return data;
    }
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.json({ status: 'failed', message: 'No reference provided' }, { status: 400 });
  }

  try {
    const paystackSecret = resolvePaystackSecret();
    if (!paystackSecret) {
      return NextResponse.json({ status: 'failed', message: 'PAYSTACK_SECRET_KEY is not configured' }, { status: 500 });
    }

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });

    const data = await res.json();

    if (data.status && data.data?.status === 'success') {
      const { customer, metadata, paid_at } = data.data;
      const email = customer?.email;
      const plan = metadata?.plan;
      const billing = metadata?.billing;

      if (email && plan) {
        const supabase = createServiceClient();

        // Find user by email via auth admin API (profiles table has no email column)
        let userId: string | null = null;

        // Method 1: RPC function (works if migration has been applied)
        const { data: rpcUser } = await supabase.rpc('get_user_id_by_email', { p_email: email });
        if (rpcUser) {
          userId = rpcUser;
        }

        // Method 2: Fallback to auth admin API
        if (!userId) {
          const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const targetUser = userList?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase());
          if (targetUser) userId = targetUser.id;
        }

        if (userId) {
          // Find the plan
          const planRow = await findPlanIdByName(supabase, plan);

          if (planRow) {
            const periodMonths = billing === 'yearly' ? 12 : 1;
            const periodEnd = new Date(paid_at || new Date());
            periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

            // Deactivate existing active subscriptions
            await supabase
              .from('subscriptions')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('status', 'active');

            // Insert new active subscription
            const { error: subError } = await supabase
              .from('subscriptions')
              .insert({
                user_id: userId,
                plan_id: planRow.id,
                status: 'active',
                current_period_start: paid_at || new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
                stripe_subscription_id: `paystack_${reference}`,
              });

            if (subError) console.error('Subscription insert failed:', subError.message);

            // Update profile plan_id
            await supabase
              .from('profiles')
              .update({ plan_id: planRow.id })
              .eq('id', userId);
          }
        } else {
          console.error('No user found for email:', email);
        }
      }

      return NextResponse.json({
        status: 'success',
        data: { plan: metadata?.plan, billing: metadata?.billing },
      });
    }

    return NextResponse.json({ status: 'failed', message: data.data?.gateway_response || 'Payment not verified' });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ status: 'failed', message: 'Verification failed' }, { status: 500 });
  }
}
