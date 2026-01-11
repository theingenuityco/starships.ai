'use client'

import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { useAuthContext } from '@/providers/auth-provider'

export function PostHogAuthSync() {
  const { isAuthenticated, userId, userEmail, userName } = useAuthContext()
  const lastIdentifiedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    // If user logs out, reset PostHog identity.
    if (!isAuthenticated || !userId) {
      if (lastIdentifiedUserIdRef.current) {
        posthog.reset()
        lastIdentifiedUserIdRef.current = null
      }
      return
    }

    if (lastIdentifiedUserIdRef.current === userId) return

    posthog.identify(userId, {
      email: userEmail,
      name: userName ?? userEmail,
    })

    lastIdentifiedUserIdRef.current = userId
  }, [isAuthenticated, userId, userEmail, userName])

  return null
}

