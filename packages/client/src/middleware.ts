import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isIndexingEnabled } from '@/lib/indexing'

export function middleware(_req: NextRequest) {
  if (isIndexingEnabled()) return NextResponse.next()

  const res = NextResponse.next()
  // Strongest, most explicit signal for crawlers across *all* routes.
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return res
}

export const config = {
  matcher: '/:path*',
}
