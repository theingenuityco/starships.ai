/* eslint-disable react/no-unescaped-entities */
'use client'

import { useEffect } from 'react'

export default function ChannelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Route segment error boundary: keep the rest of the app alive.
    console.error('Channels route error:', error)
  }, [error])

  return (
    <div className="h-screen w-full flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-background p-6">
        <div className="text-base font-semibold">Something went wrong in Channels</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Try again. If this keeps happening, refresh the page.
          {error?.digest ? <span className="block mt-2 text-xs">Error id: {error.digest}</span> : null}
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Back to Marketplace
          </a>
        </div>
      </div>
    </div>
  )
}

