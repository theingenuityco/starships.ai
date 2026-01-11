'use client'

import { GoogleTagManager as NextGoogleTagManager } from '@next/third-parties/google'

interface GoogleTagManagerProps {
  containerId: string
}

/**
 * Client Component that renders the Google Tag Manager container script.
 *
 * Note: GTM consumes `window.dataLayer`. Our app events already push to
 * `window.dataLayer`, so GTM can route them to GA4/ads/other tags.
 */
export function GoogleTagManager({ containerId }: GoogleTagManagerProps) {
  if (!containerId) {
    console.warn('Google Tag Manager container ID not provided')
    return null
  }

  return <NextGoogleTagManager gtmId={containerId} />
}

