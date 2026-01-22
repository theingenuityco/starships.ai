import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isIndexingEnabled } from '@/lib/indexing'

export function middleware(_req: NextRequest) {
  // #region agent log
  try {
    const req = _req
    const pathname = req.nextUrl?.pathname || ''
    const shouldLog =
      pathname === '/accept-invite' ||
      pathname === '/login' ||
      pathname.startsWith('/api/v1/starship-invites') ||
      pathname.startsWith('/api/v1/auth')
    if (shouldLog) {
      fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'packages/client/src/middleware.ts:middleware',
          message: 'next middleware saw request',
          data: {
            pathname,
            search: req.nextUrl?.search || '',
            origin: req.nextUrl?.origin || '',
            host: req.headers.get('host') || '',
            referer: req.headers.get('referer') || '',
            userAgent: req.headers.get('user-agent') ? 'present' : '',
            xForwardedHost: req.headers.get('x-forwarded-host') || '',
            xForwardedProto: req.headers.get('x-forwarded-proto') || '',
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'H6',
        }),
      }).catch(() => {})
    }
  } catch {
    // ignore
  }
  // #endregion

  if (isIndexingEnabled()) return NextResponse.next()

  const res = NextResponse.next()
  // Strongest, most explicit signal for crawlers across *all* routes.
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return res
}

export const config = {
  matcher: '/:path*',
}
