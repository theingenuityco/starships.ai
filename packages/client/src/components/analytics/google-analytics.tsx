'use client'

import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google'

interface GoogleAnalyticsProps {
  measurementId: string
}

/**
 * Client Component that renders Google Analytics script
 * Receives measurementId as prop from AnalyticsProvider server component
 */
export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  if (!measurementId) {
    console.warn('Google Analytics Measurement ID not provided')
    return null
  }

  return <NextGoogleAnalytics gaId={measurementId} />
}
