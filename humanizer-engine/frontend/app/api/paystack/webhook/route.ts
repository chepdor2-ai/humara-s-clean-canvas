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

      // Find user by email
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (!profile) {
        console.error('No profile found for email:', email);
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

      // Upsert subscription
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: profile.id,
          plan_id: planRow.id,
          plan_name: planRow.name,
          status: 'active',
          current_period_start: paid_at,
          current_period_end: periodEnd.toISOString(),
          stripe_subscription_id: `paystack_${reference}`,
        }, { onConflict: 'user_id' });

      // Record payment
      await supabase
        .from('payments')
        .insert({
          user_id: profile.id,
          amount: event.data.amount / 100,
          currency: event.data.currency.toLowerCase(),
          status: 'succeeded',
          stripe_payment_id: `paystack_${reference}`,
        });

      console.log(`Subscription activated: ${email} -> ${plan} (${billing})`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
