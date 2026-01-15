function getToken(): string {
  // Keep backwards compatible: prefer dedicated token, else reuse JWT secret.
  return String(process.env.REVALIDATE_TOKEN || process.env.JWT_SECRET || '').trim()
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
    const token = getToken()
    if (!token) {
      // No token configured; skip silently (time-based ISR will still work).
      return
    }

    const tags = Array.isArray(args.tags) ? args.tags.filter(Boolean) : []
    const paths = Array.isArray(args.paths) ? args.paths.filter(Boolean) : []
    if (tags.length === 0 && paths.length === 0) return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    try {
      await fetch('http://127.0.0.1:3000/__revalidate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-token': token,
        },
        body: JSON.stringify({ tags, paths }),
        signal: controller.signal,
      }).catch(() => {})
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // no-op
  }
}

