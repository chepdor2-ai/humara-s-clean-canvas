import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/reset-password',
  '/update-password',
  '/pricing',
  '/about',
  '/contact',
  '/detector',
  '/how-it-works',
  '/terms',
  '/privacy',
  '/acceptable-use',
];

const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/',
  '/_next/',
  '/favicon',
  '/logo',
  '/images/',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) return NextResponse.next();
  // Allow static files
  if (pathname.includes('.')) return NextResponse.next();

  // For /app routes, check auth
  if (pathname.startsWith('/app')) {
    const accessToken = request.cookies.get('sb-lqkpjghjermvxzgkocne-auth-token')?.value;
    
    // Check for Supabase auth cookies (multiple formats)
    const hasAuthCookie = request.cookies.getAll().some(c => 
      c.name.startsWith('sb-') && c.name.includes('auth')
    );

    if (!accessToken && !hasAuthCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
