'use client'

import { pickPrimaryStarshipForUser, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { NOTIFICATION_QUERY_KEYS, useNotificationsList } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useSyncExternalStore, useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function getBadgeLabel(unreadTotal: number): string | null {
  const n = Number(unreadTotal ?? 0)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 99) return '99+'
  return String(Math.floor(n))
}

function getFaviconSvg(isDark: boolean, ts: number, badgeLabel: string | null) {
  // Match app theme background:
  // - light: hsl(38 30% 97.5%) ≈ #fbf9f7
  // - dark:  hsl(0 0% 0%)     = #000000
  const tile = isDark ? '#000000' : '#fbf9f7'
  const stroke = isDark ? '#ffffff' : '#111827'
  const opacity = isDark ? '1' : '0.75'
  const strokeWidth = '1.25'

  const badge =
    badgeLabel && badgeLabel.trim().length > 0
      ? (() => {
          const label = badgeLabel.trim()
          const len = label.length
          // User request: make the badge+number ~3x larger.
          // In a 24x24 favicon viewBox, truly 3x would clip, so we scale aggressively
          // but clamp to the maximum size that still fits inside the bounds.
          const SCALE = 3
          const baseR = 5.1
          const maxR = 8.5
          const r = Math.min(baseR * SCALE, maxR)
          // Anchor to the bottom-right like the (accurate) dark-mode placement:
          // slightly nudge past the edge so it reads "corner-attached".
          const nudge = Math.min(1.75, r * 0.18)
          const cx = 24 - r + nudge
          const cy = 24 - r + nudge

          // Scale font, then clamp so it stays readable within the badge.
          const rawFontSize = (len === 1 ? 8.75 : len === 2 ? 7.75 : 6.5) * SCALE
          const maxFontSize = len === 1 ? r * 1.55 : len === 2 ? r * 1.25 : r * 1.05
          const fontSize = Math.min(rawFontSize, maxFontSize)

          // SVG text vertical centering is inconsistent across engines for tiny fonts.
          // Use y=center + dy="0.35em" for more stable visual centering.
          const y = cy
          const strokeWidth = Math.min(4.5, 1.5 * (r / baseR))
          // Avoid theme-dependent "cutout" strokes which can make light mode look mis-positioned.
          // Use a subtle consistent outline instead.
          const badgeStroke = '#00000033'
          return (
            `<g>` +
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" stroke="${badgeStroke}" stroke-width="${strokeWidth}"/>` +
            `<text x="${cx}" y="${y}" dy="0.35em" text-anchor="middle" fill="#ffffff" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-weight="500" font-size="${fontSize}">${label}</text>` +
            `</g>`
          )
        })()
      : ''

  // Keep this SVG tiny: no whitespace beyond what's needed.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" data-ts="${ts}">` +
    `<rect x="0.75" y="0.75" width="22.5" height="22.5" rx="5" fill="${tile}"/>` +
    `<g fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" vector-effect="non-scaling-stroke" transform="translate(2.5 2.5) scale(0.7916667)">` +
    `<path d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>` +
    `<path d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>` +
    `<path d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>` +
    `<circle cx="14.5" cy="9" r="1.5"/>` +
    `<line x1="6" y1="15" x2="2.5" y2="18.5"/>` +
    `<line x1="7.5" y1="16.5" x2="5.4" y2="18.6"/>` +
    `<line x1="9" y1="18" x2="7.6" y2="19.4"/>` +
    `</g></svg>`
  )
    .replace(`</svg>`, `${badge}</svg>`)
}

function applyAppFavicon(nextHref: string): {
  prevHref: string | null
  index: number
} {
  const existing = document.querySelector<HTMLLinkElement>('link#app-favicon')
  const prevHref = existing?.getAttribute('href') ?? null

  // Remove all other icon links so Chrome can't "stick" to a static one.
  // (We'll re-apply via MutationObserver if Next re-inserts them.)
  const iconLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
  for (const l of iconLinks) {
    if (l.id === 'app-favicon') continue
    if (l.id === 'app-favicon-shortcut') continue
    l.remove()
  }

  if (existing) existing.remove()
  const existingShortcut = document.querySelector<HTMLLinkElement>('link#app-favicon-shortcut')
  if (existingShortcut) existingShortcut.remove()

  // Create new <link> elements; Chrome often only updates tab icon on replacement.
  const link = document.createElement('link')
  link.id = 'app-favicon'
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.setAttribute('sizes', 'any')
  link.setAttribute('data-app-theme-favicon', '1')
  link.setAttribute('href', nextHref)

  const shortcut = document.createElement('link')
  shortcut.id = 'app-favicon-shortcut'
  shortcut.rel = 'shortcut icon'
  shortcut.type = 'image/svg+xml'
  shortcut.setAttribute('sizes', 'any')
  shortcut.setAttribute('data-app-theme-favicon', '1')
  shortcut.setAttribute('href', nextHref)

  // Put ours first.
  document.head.prepend(shortcut)
  document.head.prepend(link)

  const iconsNow = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
  const index = iconsNow.indexOf(link)
  return { prevHref, index }
}

export function FaviconThemeSync() {
  const { resolvedTheme } = useTheme()
  const pathname = usePathname()
  const currentHrefRef = useRef<string | null>(null)
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const [selectedStarshipId, setSelectedStarshipId] = useState<string | null>(null)

  // Keep selectedStarshipId in sync with localStorage + route changes.
  useEffect(() => {
    const readSelected = (): string | null => {
      try {
        if (typeof window === 'undefined') return null
        return window.localStorage.getItem('selectedStarshipId')
      } catch {
        return null
      }
    }
    const apply = () => setSelectedStarshipId(readSelected())
    apply()
    // Cross-tab updates
    try {
      window.addEventListener('storage', apply)
      return () => window.removeEventListener('storage', apply)
    } catch {
      return
    }
  }, [pathname])

  const pathStarshipSlug = useMemo(() => {
    const p = typeof pathname === 'string' ? pathname : ''
    if (!p.startsWith('/ship/')) return null
    const parts = p.split('/')
    const slug = parts[2] ? String(parts[2]).trim() : ''
    return slug || null
  }, [pathname])

  const { data: starshipFromPath } = useStarshipBySlug(pathStarshipSlug || '', Boolean(isAuthenticated && pathStarshipSlug))
  const { data: userStarships } = useUserStarships(user?.id || '', Boolean(isAuthenticated && user?.id))
  const primaryStarship = useMemo(
    () => pickPrimaryStarshipForUser(userStarships ?? [], user?.id, selectedStarshipId),
    [userStarships, user?.id, selectedStarshipId]
  )

  const starshipId = useMemo(() => {
    const byPath = starshipFromPath?.id ? String(starshipFromPath.id) : null
    return byPath || selectedStarshipId || (primaryStarship?.id ? String(primaryStarship.id) : null)
  }, [primaryStarship?.id, selectedStarshipId, starshipFromPath?.id])

  // Prefer live unread counts if an SSE notifications stream is already mounted (e.g. ConversationList).
  const streamKey = useMemo(() => (starshipId ? NOTIFICATION_QUERY_KEYS.stream(starshipId) : null), [starshipId])
  const streamChunks = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!streamKey) return () => {}
        const sameKey = (a: unknown, b: unknown): boolean => {
          if (!Array.isArray(a) || !Array.isArray(b)) return false
          if (a.length !== b.length) return false
          for (let i = 0; i < a.length; i++) if ((a as any)[i] !== (b as any)[i]) return false
          return true
        }
        const cache = queryClient.getQueryCache()
        const unsub = cache.subscribe(event => {
          try {
            const qk = (event as any)?.query?.queryKey
            if (!sameKey(qk, streamKey)) return
            onStoreChange()
          } catch {
            /* ignore */
          }
        })
        return () => {
          try {
            unsub()
          } catch {
            /* ignore */
          }
        }
      },
      [queryClient, streamKey]
    ),
    useCallback(() => {
      if (!streamKey) return null
      try {
        const data = queryClient.getQueryData(streamKey)
        return Array.isArray(data) ? (data as any[]) : null
      } catch {
        return null
      }
    }, [queryClient, streamKey]),
    () => null
  )

  const { data: notifList } = useNotificationsList(starshipId, Boolean(isAuthenticated && starshipId))
  const unreadTotal = useMemo(() => {
    const chunks = Array.isArray(streamChunks) ? (streamChunks as any[]) : []
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i] as any
      if (c?.type === 'notification.state' && c?.data?.unread) {
        const n = Number(c.data.unread.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
      if (c?.type === 'snapshot' && c?.data?.unread) {
        const n = Number(c.data.unread.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
    }
    const fallback = Number((notifList as any)?.unread?.totalUnread ?? 0)
    return Number.isFinite(fallback) ? fallback : 0
  }, [streamChunks, notifList])

  useEffect(() => {
    const isDark =
      resolvedTheme === 'dark' || (resolvedTheme == null && document.documentElement.classList.contains('dark'))

    // Use data URL to avoid Chrome favicon caching/order issues on reload.
    const ts = Date.now()
    const badgeLabel = getBadgeLabel(unreadTotal)
    const nextHref = svgToDataUrl(getFaviconSvg(isDark, ts, badgeLabel))

    currentHrefRef.current = nextHref
    applyAppFavicon(nextHref)
  }, [resolvedTheme, pathname, unreadTotal])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const href = currentHrefRef.current
      if (!href) return

      const app = document.querySelector<HTMLLinkElement>('link#app-favicon')
      const firstIcon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      const missingOrNotFirst = !app || (firstIcon && firstIcon.id !== 'app-favicon')

      if (missingOrNotFirst) {
        applyAppFavicon(href)
      }
    })

    observer.observe(document.head, { childList: true })
    return () => observer.disconnect()
  }, [])

  return null
}

