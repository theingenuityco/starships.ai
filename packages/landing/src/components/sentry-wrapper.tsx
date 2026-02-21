import { connection } from 'next/server'
import { SentryInit } from './sentry-init'

export async function SentryWrapper() {
  await connection()

  const sentryDsn = process.env.SENTRY_DSN_CLIENT

  if (!sentryDsn) {
    console.warn('SENTRY_DSN_CLIENT not found in environment variables')
    return null
  }

  return <SentryInit dsn={sentryDsn} />
}
