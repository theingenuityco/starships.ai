import { connection } from 'next/server'
import { PostHogProviderClient } from '@/components/analytics/posthog-provider-client'

/**
 * Server Component that reads PostHog env vars at runtime.
 * Mirrors the GA pattern: read on server → pass down to client component.
 *
 * Env vars:
 * - POSTHOG_KEY: PostHog project API key (public)
 * - POSTHOG_HOST: Optional, e.g. https://us.i.posthog.com
 */
export async function PostHogProvider() {
  // Force dynamic rendering to read env vars at request time
  await connection()

  const apiKey = process.env.POSTHOG_KEY
  const apiHost = process.env.POSTHOG_HOST

  if (!apiKey) {
    return null
  }

  return <PostHogProviderClient apiKey={apiKey} apiHost={apiHost} />
}

