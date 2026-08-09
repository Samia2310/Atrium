import { NextRequest, NextResponse } from 'next/server';

// Purely a UX redirect (protect nothing here — the API is the real gate).
// If there's no session cookie at all, bounce dashboard routes to /login.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('atrium_session');
  const protectedPrefixes = ['/participant', '/coach', '/admin'];
  const isProtected = protectedPrefixes.some((p) => req.nextUrl.pathname.startsWith(p));

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/participant/:path*', '/coach/:path*', '/admin/:path*']
};