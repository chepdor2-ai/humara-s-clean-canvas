import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';

  // Build the redirect base URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  if (code) {
    // We must set cookies on the redirect response, not on the request context.
    // So we create the response first, then use it for cookie writes.
    const redirectUrl = new URL(next, siteUrl);
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  // No code or exchange failed — redirect to login
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', siteUrl));
}
