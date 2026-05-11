'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Checks whether first-time setup is required and redirects to /setup if so.
 * Retries up to 5 times to handle the server startup window where migrations
 * may still be running.
 *
 * Pass skip=true to suppress the check (e.g. while auth state is still loading).
 * Returns { isChecking } — true from the first render where skip=false until the
 * status check resolves, so callers can suppress their UI and avoid a flash
 * before the redirect fires.
 */
export function useSetupRedirect({ skip = false }: { skip?: boolean } = {}): { isChecking: boolean } {
  const router = useRouter()
  const hasChecked = useRef(false)
  const [checkDone, setCheckDone] = useState(false)

  // Derived synchronously: if we haven't skipped and haven't finished checking,
  // we're still in-flight — even on the very first render where skip just became false.
  const isChecking = !skip && !checkDone

  useEffect(() => {
    if (skip || hasChecked.current) return
    hasChecked.current = true

    let cancelled = false
    const check = async (attempts = 0) => {
      try {
        const r = await fetch('/api/v1/setup/status')
        if (!r.ok) throw new Error('not ready')
        const json = await r.json()
        if (!cancelled) {
          if (json.data?.setupRequired) {
            router.replace('/setup')
          } else {
            setCheckDone(true)
          }
        }
      } catch {
        if (!cancelled) {
          if (attempts < 5) {
            setTimeout(() => check(attempts + 1), 1000)
          } else {
            setCheckDone(true)
          }
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [skip, router])

  return { isChecking }
}
