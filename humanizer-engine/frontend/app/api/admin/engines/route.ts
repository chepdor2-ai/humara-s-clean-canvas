import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';

function getToken(authHeader: string | null) {
  if (!authHeader) return null;
  return authHeader.replace('Bearer ', '');
}

async function verifyAdmin(request: Request) {
  const token = getToken(request.headers.get('authorization'));
  if (!token) return null;

  const supabase = createServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const adminEmails = (process.env.ADMIN_EMAILS || 'maguna956@gmail.com,maxwellotieno11@gmail.com').split(',').map(e => e.trim().toLowerCase());
  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) return null;

  return supabase;
}

// GET — fetch all engine configs
export async function GET(request: Request) {
  try {
    const supabase = await verifyAdmin(request);
    if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabase
      .from('engine_config')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ engines: data });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH — update engine configs (bulk)
export async function PATCH(request: Request) {
  try {
    const supabase = await verifyAdmin(request);
    if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { engines } = body as { engines: { engine_id: string; enabled?: boolean; premium?: boolean; sort_order?: number; label?: string }[] };

    if (!Array.isArray(engines)) {
      return NextResponse.json({ error: 'engines array required' }, { status: 400 });
    }

    // Validate: at least one engine must remain enabled
    const enabledCount = engines.filter(e => e.enabled !== false).length;
    if (enabledCount === 0) {
      return NextResponse.json({ error: 'At least one engine must remain enabled' }, { status: 400 });
    }

    const results = [];
    for (const eng of engines) {
      if (!eng.engine_id) continue;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof eng.enabled === 'boolean') updates.enabled = eng.enabled;
      if (typeof eng.premium === 'boolean') updates.premium = eng.premium;
      if (typeof eng.sort_order === 'number') updates.sort_order = eng.sort_order;
      if (typeof eng.label === 'string' && eng.label.trim()) updates.label = eng.label.trim();

      const { data, error } = await supabase
        .from('engine_config')
        .update(updates)
        .eq('engine_id', eng.engine_id)
        .select()
        .single();

      if (error) {
        results.push({ engine_id: eng.engine_id, error: error.message });
      } else {
        results.push({ engine_id: eng.engine_id, success: true, data });
      }
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
