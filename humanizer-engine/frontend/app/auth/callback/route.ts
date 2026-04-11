import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    return origin;
  }
}

function getRequestOrigin(request: Request) {
  const url = new URL(request.url);

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto || url.protocol.replace(':', '') || 'https';
    return normalizeOrigin(`${proto}://${forwardedHost}`);
  }

  return normalizeOrigin(url.origin);
}

function safeNextPath(next: string | null) {
  if (!next) return '/app';
  if (!next.startsWith('/')) return '/app';
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));
  const siteUrl = getRequestOrigin(request);

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, siteUrl));
  }

  // If there's no `code`, this is typically implicit OAuth flow where tokens are in the URL hash.
  // The server cannot read the hash, but browsers preserve it across redirects, so we just
  // redirect to the intended page and let the client-side Supabase SDK finalize the session.
  return NextResponse.redirect(new URL(next, siteUrl));
}
