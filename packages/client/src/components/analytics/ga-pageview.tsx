'use client'

import { sendGAEvent } from '@next/third-parties/google'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Tracks SPA navigations (App Router) as GA4 page_view events.
 * Skips the initial mount to avoid double-counting the first page view,
 * since the injected GA config commonly sends one automatically.
 */
export function GaPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!pathname) return

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    let url = window.location.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += `?${qs}`

    sendGAEvent('page_view', {
      page_location: url,
      page_path: pathname,
    })
  }, [pathname, searchParams])

  return null
}

