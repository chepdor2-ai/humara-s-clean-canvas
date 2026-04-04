import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from('contact_submissions').insert({
      name: String(name).slice(0, 200),
      email: String(email).slice(0, 320),
      subject: subject ? String(subject).slice(0, 500) : null,
      message: String(message).slice(0, 5000),
    });

    if (error) {
      console.error('Contact insert error:', error);
      return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Your message has been sent. We\'ll reply within 24 hours.' });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
