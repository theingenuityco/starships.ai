import { revalidatePath, revalidateTag } from 'next/cache'

function getToken(): string {
  // Prefer a dedicated token, but fall back to JWT_SECRET so revalidation works
  // in existing deployments without extra configuration.
  return String(process.env.REVALIDATE_TOKEN || process.env.JWT_SECRET || '').trim()
}

function unauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: Request) {
  const token = getToken()
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

  for (const t of tags) revalidateTag(String(t))
  for (const p of paths) revalidatePath(String(p))

  return Response.json({ ok: true, tags, paths })
}

