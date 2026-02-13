'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

declare global {
   
  var __STARSHIPS_SENTRY_CLIENT_INIT__: boolean | undefined
}

interface SentryInitProps {
  dsn: string
}

export function SentryInit({ dsn }: SentryInitProps) {
  useEffect(() => {
    // IMPORTANT:
    // - React 18 Strict Mode (dev) intentionally mounts/unmounts components twice.
    // - App Router/HMR can also remount client components.
    // If we call `Sentry.init()` more than once, Session Replay will attempt to
    // create multiple instances and throw:
    // "Multiple Sentry Session Replay instances are not supported"
    if (!dsn) return
    if (globalThis.__STARSHIPS_SENTRY_CLIENT_INIT__) return
    globalThis.__STARSHIPS_SENTRY_CLIENT_INIT__ = true

    // If Replay was already created (for any reason), don't attempt to create
    // another instance (it will throw).
    const hasReplayInstance = '__SENTRY_REPLAY__' in globalThis

    let replayIntegration: ReturnType<typeof Sentry.replayIntegration> | null = null
    if (!hasReplayInstance) {
      try {
        replayIntegration = Sentry.replayIntegration()
      } catch (err) {
        // Defensive: don't crash the app if Replay was initialized elsewhere
        // (e.g. due to remounts, HMR, or other init paths).
        console.warn('Sentry Replay init skipped:', err)
      }
    }

    Sentry.init({
      dsn,

      // Add optional integrations for additional features
      integrations: replayIntegration ? [replayIntegration] : [],

      // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 1,
      // Enable logs to be sent to Sentry
      enableLogs: true,

      // Define how likely Replay events are sampled.
      // This sets the sample rate to be 10%. You may want this to be 100% while
      // in development and sample at a lower rate in production
      replaysSessionSampleRate: 0.1,

      // Define how likely Replay events are sampled when an error occurs.
      replaysOnErrorSampleRate: 1.0,

      // Enable sending user PII (Personally Identifiable Information)
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
      sendDefaultPii: true,
    })
  }, [dsn])

  return null
}
