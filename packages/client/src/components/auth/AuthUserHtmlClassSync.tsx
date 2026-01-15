'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

const HTML_CLASS = 'has-auth-user'

function setAuthUserClass(isAuthed: boolean) {
  try {
    document.documentElement.classList.toggle(HTML_CLASS, isAuthed)
  } catch {
    // no-op
  }
}

/**
 * Robust public-chrome controller:
 * - Only hides public chrome once we have a validated authenticated user (via `useAuth()`).
 * - Avoids "expired token" flicker that can happen if we hide based on localStorage presence.
 */
export function AuthUserHtmlClassSync() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    setAuthUserClass(isAuthenticated)
  }, [isAuthenticated])

  return null
}

