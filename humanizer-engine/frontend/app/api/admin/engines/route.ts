import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';

// Hardcoded engine defaults — must match ALL_ENGINES in page.tsx
const DEFAULT_ENGINES = [
  { engine_id: 'ozone', label: 'Humara 2.1', enabled: true, premium: false, sort_order: 1 },
  { engine_id: 'easy', label: 'Humara 2.2', enabled: true, premium: false, sort_order: 2 },
  { engine_id: 'oxygen', label: 'Humara 2.0', enabled: true, premium: false, sort_order: 3 },
  { engine_id: 'humara_v3_3', label: 'Humara 2.4', enabled: true, premium: false, sort_order: 4 },
  { engine_id: 'ninja_3', label: 'Ninja 3', enabled: true, premium: false, sort_order: 5 },
  { engine_id: 'ninja_2', label: 'Ninja 2', enabled: true, premium: false, sort_order: 6 },
  { engine_id: 'ninja_4', label: 'Ninja 4', enabled: true, premium: false, sort_order: 7 },
  { engine_id: 'ninja_5', label: 'Ninja 5', enabled: true, premium: false, sort_order: 8 },
  { engine_id: 'ghost_trial_2', label: 'Ghost Trial 2', enabled: true, premium: false, sort_order: 9 },
  { engine_id: 'ghost_trial_2_alt', label: 'Ghost Trial 2 Alt', enabled: true, premium: false, sort_order: 10 },
  { engine_id: 'conscusion_1', label: 'Conscusion 1', enabled: true, premium: false, sort_order: 11 },
  { engine_id: 'conscusion_12', label: 'Conscusion 12', enabled: true, premium: false, sort_order: 12 },
];

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

    // If table doesn't exist, return defaults with a flag
    if (error) {
      return NextResponse.json({ engines: DEFAULT_ENGINES, tableExists: false });
    }
    return NextResponse.json({ engines: data && data.length > 0 ? data : DEFAULT_ENGINES, tableExists: !!(data && data.length > 0) });
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
      const row: Record<string, unknown> = {
        engine_id: eng.engine_id,
        updated_at: new Date().toISOString(),
      };
      if (typeof eng.enabled === 'boolean') row.enabled = eng.enabled;
      if (typeof eng.premium === 'boolean') row.premium = eng.premium;
      if (typeof eng.sort_order === 'number') row.sort_order = eng.sort_order;
      if (typeof eng.label === 'string' && eng.label.trim()) row.label = eng.label.trim();

      // Upsert: insert new engines or update existing ones
      const { data, error } = await supabase
        .from('engine_config')
        .upsert(row, { onConflict: 'engine_id' })
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
