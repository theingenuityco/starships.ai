import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN_CLIENT,
  tracesSampleRate: 1,
  enableLogs: true,
  sendDefaultPii: true,
})
