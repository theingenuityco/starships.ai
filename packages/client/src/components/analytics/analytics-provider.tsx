import { connection } from 'next/server'
import { GoogleAnalytics } from './google-analytics'

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

  // Read env var at runtime (available on server-side only by default)
  const measurementId = process.env.GA_MEASUREMENT_ID

  if (!measurementId) {
    console.warn('GA_MEASUREMENT_ID not found in environment variables')
    return null
  }

  // Pass the runtime value to the client component
  return <GoogleAnalytics measurementId={measurementId} />
}
