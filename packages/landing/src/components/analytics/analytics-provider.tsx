import { GoogleAnalytics } from './google-analytics'
import { GaPageView } from './ga-pageview'
import { PostHogProvider } from './posthog-provider'
import { getPublicEnvConfig } from '@starships/env/public'

export async function AnalyticsProvider() {
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
