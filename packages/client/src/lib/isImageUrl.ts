/**
 * Lightweight “is this a usable image URL?” check for avatars and previews.
 *
 * Accepts:
 * - http/https URLs
 * - data:image/* base64 URLs
 * - absolute paths (e.g. "/uploads/...")
 */
export function isImageUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
}

