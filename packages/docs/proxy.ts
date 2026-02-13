import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isIndexingEnabled } from '@/lib/indexing';

export function proxy(_req: NextRequest) {
  void _req;
  if (isIndexingEnabled()) return NextResponse.next();

  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res;
}

export const config = {
  matcher: '/:path*',
};
