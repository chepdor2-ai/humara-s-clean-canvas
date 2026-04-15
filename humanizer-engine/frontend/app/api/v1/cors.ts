import { NextResponse } from 'next/server';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

/** Preflight handler — export as OPTIONS from each v1 route */
export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Wrap a NextResponse with CORS headers */
export function withCors(response: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
