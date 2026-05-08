'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Checks whether first-time setup is required and redirects to /setup if so.
 * Retries up to 5 times to handle the server startup window where migrations
 * may still be running.
 *
 * Pass skip=true to suppress the check (e.g. while auth state is still loading).
 */
export function useSetupRedirect({ skip = false }: { skip?: boolean } = {}) {
  const router = useRouter()
  const hasChecked = useRef(false)

  useEffect(() => {
    if (skip || hasChecked.current) return
    hasChecked.current = true

    let cancelled = false
    const check = async (attempts = 0) => {
      try {
        const r = await fetch('/api/v1/setup/status')
        if (!r.ok) throw new Error('not ready')
        const json = await r.json()
        if (!cancelled && json.data?.setupRequired) {
          router.replace('/setup')
        }
      } catch {
        if (!cancelled && attempts < 5) {
          setTimeout(() => check(attempts + 1), 1000)
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [skip, router])
}
