import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.json({ status: 'failed', message: 'No reference provided' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    const data = await res.json();

    if (data.status && data.data?.status === 'success') {
      const { customer, metadata, paid_at } = data.data;
      const email = customer?.email;
      const plan = metadata?.plan;
      const billing = metadata?.billing;

      if (email && plan) {
        const supabase = createServiceClient();

        // Find user by email
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (profile) {
          // Find the plan
          const { data: planRow } = await supabase
            .from('plans')
            .select('id, name')
            .eq('name', plan)
            .single();

          if (planRow) {
            const periodMonths = billing === 'yearly' ? 12 : 1;
            const periodEnd = new Date(paid_at || new Date());
            periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

            // Upsert subscription
            await supabase
              .from('subscriptions')
              .upsert({
                user_id: profile.id,
                plan_id: planRow.id,
                plan_name: planRow.name,
                status: 'active',
                current_period_start: paid_at || new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
                stripe_subscription_id: `paystack_${reference}`,
              }, { onConflict: 'user_id' });

            // Update profile plan_id
            await supabase
              .from('profiles')
              .update({ plan_id: planRow.id })
              .eq('id', profile.id);
          }
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
