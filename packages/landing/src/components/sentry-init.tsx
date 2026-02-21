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
    if (!dsn) return
    if (globalThis.__STARSHIPS_SENTRY_CLIENT_INIT__) return
    globalThis.__STARSHIPS_SENTRY_CLIENT_INIT__ = true

    const hasReplayInstance = '__SENTRY_REPLAY__' in globalThis

    let replayIntegration: ReturnType<typeof Sentry.replayIntegration> | null = null
    if (!hasReplayInstance) {
      try {
        replayIntegration = Sentry.replayIntegration()
      } catch (err) {
        console.warn('Sentry Replay init skipped:', err)
      }
    }

    Sentry.init({
      dsn,
      integrations: replayIntegration ? [replayIntegration] : [],
      tracesSampleRate: 1,
      enableLogs: true,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      sendDefaultPii: true,
    })
  }, [dsn])

  return null
}
