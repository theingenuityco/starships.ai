export function normalizeAvatarSeed(name?: string | null, fallbackId?: string | null): string {
  const cleaned = (name || '').trim().toLowerCase()
  if (cleaned.length > 0) return cleaned
  if (fallbackId && fallbackId.length > 0) return fallbackId
  return 'starships-avatar'
}
