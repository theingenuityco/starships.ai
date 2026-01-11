import { connection } from 'next/server'
import { GoogleAnalytics } from './google-analytics'
import { GoogleTagManager } from './google-tag-manager'

/**
 * Server Component that reads GA_MEASUREMENT_ID at runtime
 * Uses dynamic rendering to ensure env vars are read at request time
 *
 * This allows the same Docker image to be deployed across environments
 * with different GA_MEASUREMENT_ID values injected at runtime
 */
export async function AnalyticsProvider() {
  // Force dynamic rendering by using connection() API
  // This ensures env vars are evaluated at runtime, not build time
  await connection()

  const gtmContainerId = process.env.GTM_CONTAINER_ID

  // Read env var at runtime (available on server-side only by default)
  const measurementId = process.env.GA_MEASUREMENT_ID

  if (!gtmContainerId && !measurementId) {
    console.warn('Neither GTM_CONTAINER_ID nor GA_MEASUREMENT_ID found in environment variables')
    return null
  }

  if (gtmContainerId && measurementId) {
    console.warn('Both GTM_CONTAINER_ID and GA_MEASUREMENT_ID are set. Avoid configuring GA4 inside GTM as well, or you may double-count.')
  }

  return (
    <>
      {gtmContainerId ? <GoogleTagManager containerId={gtmContainerId} /> : null}
      {measurementId ? <GoogleAnalytics measurementId={measurementId} /> : null}
    </>
  )
}
