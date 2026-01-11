import { connection } from 'next/server'
import { GoogleAnalytics } from './google-analytics'
import { GaPageView } from './ga-pageview'
import { PostHogProvider } from './posthog-provider'
import { getPublicEnvConfig } from '@starships/env/public'

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

  const { GA_MEASUREMENT_ID } = getPublicEnvConfig()
  const measurementId = GA_MEASUREMENT_ID

  return (
    <>
      {measurementId ? (
        <>
          <GoogleAnalytics measurementId={measurementId} />
          <GaPageView />
        </>
      ) : null}
      <PostHogProvider />
    </>
  )
}
