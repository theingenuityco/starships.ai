import { connection } from 'next/server'
import { SentryInit } from './sentry-init'

/**
 * Server component that reads SENTRY_DSN_CLIENT at runtime and passes it to the client
 * Uses dynamic rendering to ensure env vars are read at request time
 *
 * This allows the same Docker image to be deployed across environments
 * with different SENTRY_DSN_CLIENT values injected at runtime
 */
export async function SentryWrapper() {
  // Force dynamic rendering by using connection() API
  // This ensures env vars are evaluated at runtime, not build time
  await connection()

  // Read env var at runtime (available on server-side only by default)
  const sentryDsn = process.env.SENTRY_DSN_CLIENT

  if (!sentryDsn) {
    console.warn('SENTRY_DSN_CLIENT not found in environment variables')
    return null
  }

  // Pass the runtime value to the client component
  return <SentryInit dsn={sentryDsn} />
}
