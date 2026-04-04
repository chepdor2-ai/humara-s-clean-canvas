import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { document_id, rating, comment, category } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5.' }, { status: 400 });
    }

    const validCategories = ['quality', 'speed', 'accuracy', 'bug', 'feature', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid feedback category.' }, { status: 400 });
    }

    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      document_id: document_id || null,
      rating: Number(rating),
      comment: comment ? String(comment).slice(0, 2000) : null,
      category: category || 'other',
    });

    if (error) {
      console.error('Feedback insert error:', error);
      return NextResponse.json({ error: 'Failed to submit feedback.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
