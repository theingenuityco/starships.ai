'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App error:', error)
  }, [error])

  // Handle chunk load errors specifically
  if (error.message && error.message.includes('Loading chunk')) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h2 className="text-2xl font-semibold mb-4">Loading Error</h2>
        <p className="text-muted-foreground mb-6">There was a problem loading the application resources.</p>
        <Button
          onClick={() => {
            // Clear cache and reload
            if ('caches' in window) {
              caches.keys().then(names => {
                names.forEach(name => {
                  caches.delete(name)
                })
              })
            }
            window.location.reload()
          }}
        >
          Reload Application
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-2xl font-semibold mb-4">Something went wrong!</h2>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
