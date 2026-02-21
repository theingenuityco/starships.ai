'use client'

import { pickPrimaryStarshipForUser, useStarshipBySlug, useUserStarships } from '@/hooks/useStarships'
import { NOTIFICATION_QUERY_KEYS, useNotificationsList } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useSyncExternalStore, useCallback, useState } from 'react'
import { usePathname } from '@/platform/navigation'
import { useTheme } from 'next-themes'
import { buildFaviconBaseSvg } from '@/lib/faviconSvg'

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
          const label = escapeXml(badgeLabel.trim())
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
  return buildFaviconBaseSvg({ tile, stroke, opacity, strokeWidth, ts }).replace(`</svg>`, `${badge}</svg>`)
}

function applyAppFavicon(nextHref: string): {
  prevHref: string | null
  index: number
} {
  const existing = document.querySelector<HTMLLinkElement>('link#app-favicon')
  const prevHref = existing?.getAttribute('href') ?? null

  // Deliberate trade-off:
  // Remove *all* other icon links so Chrome can't "stick" to a static one.
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

  const readSelectedStarshipId = useCallback((): string | null => {
    try {
      if (typeof window === 'undefined') return null
      return window.localStorage.getItem('selectedStarshipId')
    } catch {
      return null
    }
  }, [])
  const applySelectedStarshipId = useCallback(() => setSelectedStarshipId(readSelectedStarshipId()), [readSelectedStarshipId])

  // Cross-tab updates (subscribe once).
  useEffect(() => {
    applySelectedStarshipId()
    try {
      window.addEventListener('storage', applySelectedStarshipId)
      return () => window.removeEventListener('storage', applySelectedStarshipId)
    } catch {
      return
    }
  }, [applySelectedStarshipId])
  // In-tab route changes can impact which starship is "active" without firing storage events.
  useEffect(() => {
    applySelectedStarshipId()
  }, [applySelectedStarshipId, pathname])

  const pathStarshipSlug = useMemo(() => {
    const p = typeof pathname === 'string' ? pathname : ''
    if (!p.startsWith('/ship/')) return null
    const parts = p.split('/')
    const slug = parts[2] ? String(parts[2]).trim() : ''
    return slug || null
  }, [pathname])

  const { data: starshipFromPath } = useStarshipBySlug(pathStarshipSlug || '', Boolean(isAuthenticated && pathStarshipSlug))
  const { data: userStarships } = useUserStarships(user?.id || '', Boolean(isAuthenticated && user?.id))
  const validSelectedStarshipId = useMemo(() => {
    const sid = String(selectedStarshipId || '').trim()
    if (!sid) return null
    const list = Array.isArray(userStarships) ? userStarships : []
    return list.some(s => String(s?.id || '') === sid) ? sid : null
  }, [selectedStarshipId, userStarships])
  const primaryStarship = useMemo(
    () => pickPrimaryStarshipForUser(userStarships ?? [], user?.id, selectedStarshipId),
    [userStarships, user?.id, selectedStarshipId]
  )

  // If the stored selection points to a starship the user no longer has access to,
  // clear it so we don't keep hitting starship-scoped endpoints with a stale ID.
  useEffect(() => {
    if (!isAuthenticated) return
    if (!Array.isArray(userStarships)) return
    if (!selectedStarshipId) return
    if (validSelectedStarshipId) return
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem('selectedStarshipId')
    } catch {
      /* ignore */
    }
    setSelectedStarshipId(null)
  }, [isAuthenticated, selectedStarshipId, userStarships, validSelectedStarshipId])

  const starshipId = useMemo(() => {
    const byPath = starshipFromPath?.id ? String(starshipFromPath.id) : null
    const primary = primaryStarship?.id ? String(primaryStarship.id) : null
    return byPath || primary || validSelectedStarshipId
  }, [primaryStarship?.id, starshipFromPath?.id, validSelectedStarshipId])

  // Prefer live unread counts if an SSE notifications stream is already mounted (e.g. ConversationList).
  const streamKey = useMemo(() => (starshipId ? NOTIFICATION_QUERY_KEYS.stream(starshipId) : null), [starshipId])
  const streamChunks = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!streamKey) return () => {}
        const sameKey = (a: unknown, b: unknown): boolean => {
          if (!Array.isArray(a) || !Array.isArray(b)) return false
          if (a.length !== b.length) return false
          const aa = a as unknown[]
          const bb = b as unknown[]
          for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false
          return true
        }
        const cache = queryClient.getQueryCache()
        const unsub = cache.subscribe(event => {
          try {
            const q = (event as unknown as { query?: { queryKey?: unknown } } | null)?.query
            const qk = q ? (q.queryKey as unknown) : null
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
        return Array.isArray(data) ? (data as unknown[]) : null
      } catch {
        return null
      }
    }, [queryClient, streamKey]),
    () => null
  )

  const { data: notifList } = useNotificationsList(starshipId, Boolean(isAuthenticated && starshipId))
  const unreadTotal = useMemo(() => {
    const chunks = Array.isArray(streamChunks) ? (streamChunks as unknown[]) : []
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i] as { type?: unknown; data?: unknown } | null
      if (c && c.type === 'notification.state') {
        const unread = (c.data as { unread?: { totalUnread?: unknown } } | null)?.unread
        const n = Number(unread?.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
      if (c && c.type === 'snapshot') {
        const unread = (c.data as { unread?: { totalUnread?: unknown } } | null)?.unread
        const n = Number(unread?.totalUnread ?? 0)
        return Number.isFinite(n) ? n : 0
      }
    }
    const fallback = Number((notifList as { unread?: { totalUnread?: unknown } } | null)?.unread?.totalUnread ?? 0)
    return Number.isFinite(fallback) ? fallback : 0
  }, [streamChunks, notifList])

  // Only regenerate the data URL when the visual favicon output actually changes.
  // This avoids unnecessary `Date.now()` churn on navigations.
  const lastRenderKeyRef = useRef<string>('')
  const stableTsRef = useRef<number>(Date.now())

  useEffect(() => {
    const isDark =
      resolvedTheme === 'dark' || (resolvedTheme == null && document.documentElement.classList.contains('dark'))

    const badgeLabel = getBadgeLabel(unreadTotal)
    const renderKey = `${isDark ? 'dark' : 'light'}:${badgeLabel ?? ''}`
    if (renderKey !== lastRenderKeyRef.current) {
      lastRenderKeyRef.current = renderKey
      stableTsRef.current = Date.now()
    }

    // Use data URL to avoid Chrome favicon caching/order issues on reload.
    const ts = stableTsRef.current
    const nextHref = svgToDataUrl(getFaviconSvg(isDark, ts, badgeLabel))

    if (currentHrefRef.current === nextHref) return
    currentHrefRef.current = nextHref
    applyAppFavicon(nextHref)
  }, [resolvedTheme, unreadTotal])

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

