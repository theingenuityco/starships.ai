import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require any validation (neither auth nor waitlist)
const publicPaths = [
  '/waitlist',
  '/api/auth',
  '/api/waitlist',
  '/api/pricing',
  '/_next',
  '/favicon',
  '/public'
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Dynamically import Kinde to check authentication
  // This avoids build-time env validation
  let isUserAuthenticated = false;
  try {
    const { getKindeServerSession } = await import("@kinde-oss/kinde-auth-nextjs/server");
    const { isAuthenticated } = getKindeServerSession();
    isUserAuthenticated = await isAuthenticated();
  } catch (error) {
    // If Kinde is not configured, treat as unauthenticated
    console.error('Kinde auth check failed:', error);
  }

  // If authenticated, allow access to all routes (bypass waitlist)
  if (isUserAuthenticated) {
    // If trying to access root, redirect to fleet
    if (pathname === '/') {
      console.log('[Middleware] Authenticated user at root, redirecting to /fleet');
      return NextResponse.redirect(new URL('/fleet', request.url));
    }
    return NextResponse.next();
  }

  // For unauthenticated users, check waitlist validation
  const waitlistValidated = request.cookies.get('waitlist_validated');

  // If not validated and trying to access protected routes, redirect to waitlist
  if (!waitlistValidated && pathname !== '/waitlist') {
    const waitlistUrl = new URL('/waitlist', request.url);
    return NextResponse.redirect(waitlistUrl);
  }

  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};