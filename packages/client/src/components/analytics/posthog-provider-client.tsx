'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'
import { PostHogPageView } from '@/components/analytics/posthog-pageview'
import { PostHogAuthSync } from '@/components/analytics/posthog-auth-sync'

interface PostHogProviderClientProps {
  apiKey: string
  apiHost?: string
}

export function PostHogProviderClient({ apiKey, apiHost }: PostHogProviderClientProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Ensure we only initialize in the browser.
    if (typeof window === 'undefined') return
    if (!apiKey) return

    posthog.init(apiKey, {
      api_host: apiHost,
      capture_pageview: false, // we track pageviews via Next.js navigation hooks
      // Web analytics helpers
      autocapture: true,
      capture_pageleave: true,
      session_recording: {
        // Enable Session Replay with privacy-safe defaults
        maskAllInputs: true,
      },
    })

    setIsReady(true)
  }, [apiKey, apiHost])

  if (!isReady) return null

  return (
    <>
      <PostHogPageView />
      <PostHogAuthSync />
    </>
  )
}
