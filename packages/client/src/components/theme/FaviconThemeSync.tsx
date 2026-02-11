'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function getFaviconSvg(isDark: boolean, ts: number) {
  const tile = isDark ? '#0b1220' : '#ffffff'
  const tileBorder = isDark ? '#1f2937' : '#e5e7eb'
  const stroke = isDark ? '#ffffff' : '#111827'
  const opacity = isDark ? '1' : '0.7'

  // Keep this SVG tiny: no whitespace beyond what's needed.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" data-ts="${ts}">` +
    `<rect x="0.75" y="0.75" width="22.5" height="22.5" rx="5" fill="${tile}" stroke="${tileBorder}" stroke-width="1"/>` +
    `<g fill="none" stroke="${stroke}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" vector-effect="non-scaling-stroke" transform="translate(2.5 2.5) scale(0.7916667)">` +
    `<path d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>` +
    `<path d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>` +
    `<path d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>` +
    `<circle cx="14.5" cy="9" r="1.5"/>` +
    `<line x1="6" y1="15" x2="2.5" y2="18.5"/>` +
    `<line x1="7.5" y1="16.5" x2="5.4" y2="18.6"/>` +
    `<line x1="9" y1="18" x2="7.6" y2="19.4"/>` +
    `</g></svg>`
  )
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

  useEffect(() => {
    const runId = 'post-fix'

    const isDark =
      resolvedTheme === 'dark' || (resolvedTheme == null && document.documentElement.classList.contains('dark'))

    // Use data URL to avoid Chrome favicon caching/order issues on reload.
    const ts = Date.now()
    const nextHref = svgToDataUrl(getFaviconSvg(isDark, ts))

    currentHrefRef.current = nextHref
    applyAppFavicon(nextHref)
  }, [resolvedTheme, pathname])

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

