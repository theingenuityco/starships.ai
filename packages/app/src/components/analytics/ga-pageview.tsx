'use client'

import { sendGAEvent } from '@next/third-parties/google'
import { usePathname, useSearchParams } from '@/platform/navigation'
import { useEffect, useRef } from 'react'

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
