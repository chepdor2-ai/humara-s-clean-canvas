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
          const { data: planRow } = await supabase
            .from('plans')
            .select('id, name')
            .eq('name', plan)
            .single();

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
