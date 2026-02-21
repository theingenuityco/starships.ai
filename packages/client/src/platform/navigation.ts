import { useMemo } from 'react'
import { usePlatform } from './context'
import type { PlatformRouter } from './types'

const FALLBACK_ROUTER: PlatformRouter = {
  push: href => {
    if (typeof window === 'undefined') return
    window.location.assign(href)
  },
  replace: href => {
    if (typeof window === 'undefined') return
    window.location.replace(href)
  },
  back: () => {
    if (typeof window === 'undefined') return
    window.history.back()
  },
  refresh: () => {
    if (typeof window === 'undefined') return
    window.location.reload()
  },
}

export function useRouter(): PlatformRouter {
  const { router } = usePlatform()
  return router ?? FALLBACK_ROUTER
}

export function useParams<TParams extends Record<string, string | string[]> = Record<string, string | string[]>>(): TParams {
  const { params } = usePlatform()
  return (params ?? {}) as TParams
}

export function usePathname(): string {
  const { pathname } = usePlatform()
  if (typeof pathname === 'string') return pathname
  if (typeof window === 'undefined') return ''
  return window.location.pathname || ''
}

export function useSearchParams(): URLSearchParams {
  const { searchParams } = usePlatform()
  return useMemo(() => {
    if (searchParams) return searchParams
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search)
  }, [searchParams])
}

