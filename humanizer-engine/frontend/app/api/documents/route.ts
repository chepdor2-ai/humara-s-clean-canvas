import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase';

function getUserFromAuth(authHeader: string | null) {
  if (!authHeader) return null;
  return authHeader.replace('Bearer ', '');
}

export async function GET(request: Request) {
  try {
    const token = getUserFromAuth(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('documents')
      .select('id, title, engine_used, strength, tone, input_word_count, output_word_count, input_ai_score, output_ai_score, meaning_preserved, status, created_at', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Documents fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch documents.' }, { status: 500 });
    }

    return NextResponse.json({
      documents: data || [],
      total: count || 0,
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = getUserFromAuth(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { title, input_text, output_text, engine_used, strength, tone, input_word_count, output_word_count, input_ai_score, output_ai_score, meaning_preserved, meaning_similarity, detector_results } = body;

    if (!input_text) {
      return NextResponse.json({ error: 'Input text is required.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('documents').insert({
      user_id: user.id,
      title: title ? String(title).slice(0, 500) : 'Untitled Document',
      input_text: String(input_text),
      output_text: output_text ? String(output_text) : null,
      engine_used,
      strength,
      tone,
      input_word_count: input_word_count || 0,
      output_word_count: output_word_count || null,
      input_ai_score: input_ai_score || null,
      output_ai_score: output_ai_score || null,
      meaning_preserved: meaning_preserved ?? null,
      meaning_similarity: meaning_similarity || null,
      detector_results: detector_results || null,
      status: 'completed',
    }).select().single();

    if (error) {
      console.error('Document insert error:', error);
      return NextResponse.json({ error: 'Failed to save document.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: data });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = getUserFromAuth(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const docId = url.searchParams.get('id');
    if (!docId) return NextResponse.json({ error: 'Document ID required.' }, { status: 400 });

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Document delete error:', error);
      return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
