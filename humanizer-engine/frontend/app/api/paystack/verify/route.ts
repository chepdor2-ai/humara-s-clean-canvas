import { NextResponse } from 'next/server';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

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
      return NextResponse.json({ status: 'success', data: { plan: data.data.metadata?.plan, billing: data.data.metadata?.billing } });
    }

    return NextResponse.json({ status: 'failed', message: data.data?.gateway_response || 'Payment not verified' });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ status: 'failed', message: 'Verification failed' }, { status: 500 });
  }
}
