import { connection } from 'next/server'
import { PostHogProviderClient } from '@/components/analytics/posthog-provider-client'
import { getPublicEnvConfig } from '@starships/env/public'

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

  const { POSTHOG_KEY, POSTHOG_HOST } = getPublicEnvConfig()
  const apiKey = POSTHOG_KEY
  const apiHost = POSTHOG_HOST || undefined

  if (!apiKey) {
    return null
  }

  return <PostHogProviderClient apiKey={apiKey} apiHost={apiHost} />
}

