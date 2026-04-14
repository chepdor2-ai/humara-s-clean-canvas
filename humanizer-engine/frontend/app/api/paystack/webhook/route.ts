import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-paystack-signature');

    // Verify webhook signature
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(body).digest('hex');
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
      const { data: planRow } = await supabase
        .from('plans')
        .select('id, name')
        .eq('name', plan)
        .single();

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
