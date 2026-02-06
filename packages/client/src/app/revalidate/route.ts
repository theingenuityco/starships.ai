import { revalidatePath, revalidateTag } from 'next/cache'

function getToken(): string {
  // Require an explicit token. Do NOT fall back to auth secrets.
  return String(process.env.REVALIDATE_TOKEN || '').trim()
}

function unauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: Request) {
  const token = getToken()
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[revalidate] REVALIDATE_TOKEN is not set; refusing to revalidate')
    }
    return Response.json({ ok: false, error: 'Revalidation not configured' }, { status: 503 })
  }
  const provided = String(req.headers.get('x-revalidate-token') || '').trim()
  if (!token || provided !== token) return unauthorized()

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // allow empty body
  }

  const tags = Array.isArray((body as any)?.tags) ? ((body as any).tags as unknown[]).filter(t => typeof t === 'string' && t.trim()) : []
  const paths = Array.isArray((body as any)?.paths) ? ((body as any).paths as unknown[]).filter(p => typeof p === 'string' && p.trim()) : []

  for (const t of tags) revalidateTag(String(t), 'default')
  for (const p of paths) revalidatePath(String(p))

  return Response.json({ ok: true, tags, paths })
}

