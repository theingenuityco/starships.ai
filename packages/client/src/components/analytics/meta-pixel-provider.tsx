import { getPublicEnvConfig } from '@starships/env/public'
import { MetaPixelProviderClient } from '@/components/analytics/meta-pixel-provider-client'

/**
 * Server Component that decides whether to inject Meta Pixel.
 * Mirrors PostHog: read env server-side at runtime → render client component.
 */
export function MetaPixelProvider() {
  const { META_PIXEL_ID } = getPublicEnvConfig()
  const pixelId = String(META_PIXEL_ID || '').trim()

  if (!pixelId) return null
  return <MetaPixelProviderClient pixelId={pixelId} />
}

