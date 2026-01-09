export function normalizeAvatarSeed(name?: string | null, fallbackId?: string | null): string {
  const cleaned = (name || '').trim().toLowerCase()
  if (cleaned.length > 0) return cleaned
  if (fallbackId && fallbackId.length > 0) return fallbackId
  return 'starships-avatar'
}

/**
 * Cache-bust stable avatar URLs (e.g. marketplace template avatars).
 * Useful when the underlying image changes but the path stays the same.
 */
export function withAvatarCacheBuster(url?: string | null, updatedAt?: string | null): string | undefined {
  const u = typeof url === 'string' ? url.trim() : ''
  if (!u) return undefined
  const v = typeof updatedAt === 'string' ? updatedAt.trim() : ''
  if (!v) return u

  const sep = u.includes('?') ? '&' : '?'
  return `${u}${sep}v=${encodeURIComponent(v)}`
}
