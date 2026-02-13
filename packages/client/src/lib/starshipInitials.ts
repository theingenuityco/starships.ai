export type StarshipIdentityInput = { name?: string; slug?: string; id?: string } | null | undefined

export function getStarshipInitials(input: StarshipIdentityInput): string {
  const label = String(input?.name || input?.slug || input?.id || '').trim()
  if (!label) return 'S'
  const parts = label.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'S'
  const second = parts.length > 1 ? parts[1]?.[0] : undefined
  return (first + (second ?? '')).toUpperCase()
}

