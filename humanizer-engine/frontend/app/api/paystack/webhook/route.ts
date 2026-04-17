import { NextResponse } from 'next/server';
import crypto from 'crypto';
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

export async function POST(request: Request) {
  try {
    const paystackSecret = resolvePaystackSecret();
    if (!paystackSecret) {
      return NextResponse.json({ error: 'PAYSTACK_SECRET_KEY is not configured' }, { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get('x-paystack-signature');

    // Verify webhook signature
    const hash = crypto.createHmac('sha512', paystackSecret).update(body).digest('hex');
    if (hash !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);

    if (event.event === 'charge.success') {
      const { customer, metadata, reference, paid_at } = event.data;
      const email = customer?.email;
      const plan = metadata?.plan;
      const billing = metadata?.billing;

      if (!email || !plan) {
        console.error('Webhook missing email or plan', { email, plan });
        return NextResponse.json({ received: true });
      }

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

      if (!userId) {
        console.error('No user found for email:', email);
        return NextResponse.json({ received: true });
      }

      // Find the plan
      const planRow = await findPlanIdByName(supabase, plan);

      if (!planRow) {
        console.error('No plan found for name:', plan);
        return NextResponse.json({ received: true });
      }

      const periodMonths = billing === 'yearly' ? 12 : 1;
      const periodEnd = new Date(paid_at);
      periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

      // Deactivate any existing active subscriptions for this user
      const { error: deactivateError } = await supabase
        .from('subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (deactivateError) console.error('Subscription deactivation failed:', deactivateError.message);

      // Insert new active subscription
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planRow.id,
          status: 'active',
          current_period_start: paid_at,
          current_period_end: periodEnd.toISOString(),
          stripe_subscription_id: `paystack_${reference}`,
        });

      if (subError) console.error('Subscription insert failed:', subError.message, subError.details);

      // Record payment
      const { error: payError } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          amount: event.data.amount / 100,
          currency: event.data.currency.toLowerCase(),
          status: 'succeeded',
          stripe_payment_id: `paystack_${reference}`,
        });

      if (payError) console.error('Payment insert failed:', payError.message, payError.details);

      console.log(`Subscription activated: ${email} -> ${plan} (${billing})`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
