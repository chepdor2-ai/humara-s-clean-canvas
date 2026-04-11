import { NextResponse } from 'next/server';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const KSH_RATE = 125; // $1 = 125 KSH

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, plan, currency, billing } = body;

    if (!email || !plan || !currency || !billing) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['USD', 'KES'].includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency. Use USD or KES.' }, { status: 400 });
    }

    if (!['monthly', 'yearly'].includes(billing)) {
      return NextResponse.json({ error: 'Invalid billing period.' }, { status: 400 });
    }

    const PLANS: Record<string, { monthly: number; yearly: number }> = {
      starter: { monthly: 5, yearly: 4.25 },
      creator: { monthly: 10, yearly: 8.50 },
      professional: { monthly: 20, yearly: 17 },
      business: { monthly: 35, yearly: 29.75 },
    };

    const planData = PLANS[plan.toLowerCase()];
    if (!planData) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const usdAmount = billing === 'yearly' ? planData.yearly * 12 : planData.monthly;

    // Convert to the smallest currency unit
    // Paystack expects amounts in the smallest unit (kobo for NGN, cents for USD, cents for KES)
    let amountInSmallestUnit: number;
    let paystackCurrency: string;

    if (currency === 'KES') {
      const kshAmount = usdAmount * KSH_RATE;
      amountInSmallestUnit = Math.round(kshAmount * 100); // KES cents
      paystackCurrency = 'KES';
    } else {
      amountInSmallestUnit = Math.round(usdAmount * 100); // USD cents
      paystackCurrency = 'USD';
    }

    // Use env-configured callback URL, fallback to request origin
    const callbackUrl = process.env.NEXT_PUBLIC_PAYSTACK_CALLBACK_URL
      || `${new URL(request.url).origin}/app/payment/verify`;

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountInSmallestUnit,
        currency: paystackCurrency,
        metadata: {
          plan: plan.toLowerCase(),
          billing,
          currency,
          usd_amount: usdAmount,
        },
        callback_url: callbackUrl,
      }),
    });

    const data = await res.json();

    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Payment initialization failed' }, { status: 400 });
    }

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
      access_code: data.data.access_code,
    });
  } catch (error) {
    console.error('Paystack init error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
