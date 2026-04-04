import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase';

function getToken(authHeader: string | null) {
  if (!authHeader) return null;
  return authHeader.replace('Bearer ', '');
}

export async function GET(request: Request) {
  try {
    const token = getToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('style_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Style profiles fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch style profiles.' }, { status: 500 });
    }

    return NextResponse.json({ profiles: data || [] });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const token = getToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'Profile name is required.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('style_profiles').insert({
      user_id: user.id,
      name: String(body.name).slice(0, 200),
      description: body.description ? String(body.description).slice(0, 500) : '',
      avg_sentence_length: Number(body.avg_sentence_length) || 22,
      sentence_length_std: Number(body.sentence_length_std) || 8,
      hedging_rate: Number(body.hedging_rate) || 0.18,
      clause_density: Number(body.clause_density) || 1.4,
      passive_voice_rate: Number(body.passive_voice_rate) || 0.2,
      lexical_diversity: Number(body.lexical_diversity) || 0.62,
      avg_paragraph_length: Number(body.avg_paragraph_length) || 4.5,
      punctuation_rates: body.punctuation_rates || { semicolons_per_1k: 2.5, colons_per_1k: 1.8, dashes_per_1k: 1.2 },
      is_default: body.is_default || false,
    }).select().single();

    if (error) {
      console.error('Style profile create error:', error);
      return NextResponse.json({ error: 'Failed to create style profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: data });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = getToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Profile ID required.' }, { status: 400 });

    const { data, error } = await supabase
      .from('style_profiles')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Style profile update error:', error);
      return NextResponse.json({ error: 'Failed to update style profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: data });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = getToken(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const profileId = url.searchParams.get('id');
    if (!profileId) return NextResponse.json({ error: 'Profile ID required.' }, { status: 400 });

    const { error } = await supabase
      .from('style_profiles')
      .delete()
      .eq('id', profileId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Style profile delete error:', error);
      return NextResponse.json({ error: 'Failed to delete style profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
