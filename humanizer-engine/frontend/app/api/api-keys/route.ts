import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase';
import crypto from 'crypto';

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
      .from('api_keys')
      .select('id, name, key_prefix, last_used, requests, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('API keys fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys.' }, { status: 500 });
    }

    return NextResponse.json({ keys: data || [] });
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
    const name = body.name ? String(body.name).slice(0, 100) : 'Default';

    // Generate a secure API key
    const rawKey = `hum_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12) + '...';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const { data, error } = await supabase.from('api_keys').insert({
      user_id: user.id,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
    }).select('id, name, key_prefix, created_at').single();

    if (error) {
      console.error('API key creation error:', error);
      return NextResponse.json({ error: 'Failed to create API key.' }, { status: 500 });
    }

    // Return the full key only once — it's never stored in plain text
    return NextResponse.json({ success: true, key: rawKey, ...data });
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
    const keyId = url.searchParams.get('id');
    if (!keyId) return NextResponse.json({ error: 'Key ID required.' }, { status: 400 });

    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) {
      console.error('API key revoke error:', error);
      return NextResponse.json({ error: 'Failed to revoke API key.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}
