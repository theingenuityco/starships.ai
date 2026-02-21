import { PostHogProviderClient } from '@/components/analytics/posthog-provider-client'
import { getPublicEnvConfig } from '@starships/env/public'

export async function PostHogProvider() {
  const { POSTHOG_KEY, POSTHOG_HOST } = getPublicEnvConfig()
  const apiKey = POSTHOG_KEY
  const apiHost = POSTHOG_HOST || undefined

  if (!apiKey) {
    return null
  }

  return <PostHogProviderClient apiKey={apiKey} apiHost={apiHost} />
}
