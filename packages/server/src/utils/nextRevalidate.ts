import { getEnvConfig } from '@starships/env'

function normalizeBaseUrl(value: string): string {
  return String(value || '').replace(/\/+$/, '')
}

function getRevalidateConfig(): { token: string; baseUrl: string } {
  // Use the canonical env system (packages/env).
  const env = getEnvConfig()
  return {
    token: String(env.REVALIDATE_TOKEN || '').trim(),
    // `CLIENT_URL` is the canonical origin for the Next app.
    baseUrl: normalizeBaseUrl(env.CLIENT_URL),
  }
}

/**
 * Ask the co-located Next.js app to invalidate ISR cache entries by tag/path.
 *
 * Notes:
 * - In our container, Next runs on :3000 and Express API on :4000.
 * - This endpoint is NOT exposed through the reverse proxy (/api/* goes to backend),
 *   so we call it directly via localhost.
 * - Failures should never break the user-facing API call.
 */
export async function triggerNextRevalidate(args: { tags?: string[]; paths?: string[] }) {
  try {
    const { token, baseUrl } = getRevalidateConfig()
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[nextRevalidate] REVALIDATE_TOKEN is not set; skipping on-demand revalidation')
      }
      return
    }

    const tags = Array.isArray(args.tags) ? args.tags.filter(Boolean) : []
    const paths = Array.isArray(args.paths) ? args.paths.filter(Boolean) : []
    if (tags.length === 0 && paths.length === 0) return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    try {
      const url = `${baseUrl}/__revalidate`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-token': token,
        },
        body: JSON.stringify({ tags, paths }),
        signal: controller.signal,
      }).catch(() => null)

      if (process.env.NODE_ENV === 'development') {
        if (!res) {
          // eslint-disable-next-line no-console
          console.warn('[nextRevalidate] Request failed (no response)', { url, tags, paths })
        } else if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn('[nextRevalidate] Request failed', { url, status: res.status, tags, paths })
        }
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // no-op
  }
}

