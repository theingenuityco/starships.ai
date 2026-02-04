'use client'

import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import type { CSSProperties } from 'react'
import { forwardRef, useEffect, useMemo, useState } from 'react'

type EmojiMartData = unknown

type EmojiMartSelectEvent =
  | {
      native?: string
      emoji?: string
    }
  | string
  | null
  | undefined

// next/dynamic defaults to `ComponentType<{}>`; widen props so TS accepts picker props.
const EmojiMartPicker = dynamic<any>(() => import('@emoji-mart/react').then(m => m.default as any), { ssr: false })

export const EmojiPicker = forwardRef<
  HTMLDivElement,
  {
    onEmojiSelect: (emoji: string) => void
    height?: number
  } & React.HTMLAttributes<HTMLDivElement>
>(function EmojiPicker({ onEmojiSelect, className, height = 320, ...props }, ref) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'light' ? 'light' : 'dark'

  const [data, setData] = useState<EmojiMartData | null>(null)
  const [rgbTokens, setRgbTokens] = useState<{ background: string; input: string; color: string } | null>(null)
  const [fontFamily, setFontFamily] = useState<string | null>(null)

  const parseHslTriplet = (raw: string): { h: number; s: number; l: number } | null => {
    const t = String(raw || '').trim()
    // Expected formats:
    // - "38 30% 97.5%"
    // - "0 0% 3%"
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/)
    if (!m) return null
    const h = Number(m[1])
    const s = Number(m[2]) / 100
    const l = Number(m[3]) / 100
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null
    return { h, s: Math.max(0, Math.min(1, s)), l: Math.max(0, Math.min(1, l)) }
  }

  const hslToRgbTriplet = (hsl: { h: number; s: number; l: number } | null): string | null => {
    if (!hsl) return null
    const { h, s, l } = hsl
    const hh = ((((h % 360) + 360) % 360) / 360) * 6
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((hh % 2) - 1))
    const m = l - c / 2
    let r1 = 0,
      g1 = 0,
      b1 = 0
    if (hh >= 0 && hh < 1) [r1, g1, b1] = [c, x, 0]
    else if (hh >= 1 && hh < 2) [r1, g1, b1] = [x, c, 0]
    else if (hh >= 2 && hh < 3) [r1, g1, b1] = [0, c, x]
    else if (hh >= 3 && hh < 4) [r1, g1, b1] = [0, x, c]
    else if (hh >= 4 && hh < 5) [r1, g1, b1] = [x, 0, c]
    else [r1, g1, b1] = [c, 0, x]
    const r = Math.round((r1 + m) * 255)
    const g = Math.round((g1 + m) * 255)
    const b = Math.round((b1 + m) * 255)
    if (![r, g, b].every(v => Number.isFinite(v))) return null
    return `${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))}`
  }

  useEffect(() => {
    // Emoji Mart needs RGB triples (not HSL). Read our CSS variables and convert them so
    // the picker's internal search input matches our `Input` theme.
    try {
      const root = document.documentElement
      const css = getComputedStyle(root)
      const cardHsl = css.getPropertyValue('--card')
      const backgroundHsl = css.getPropertyValue('--background')
      const popFgHsl = css.getPropertyValue('--popover-foreground') || css.getPropertyValue('--foreground')

      const background = hslToRgbTriplet(parseHslTriplet(cardHsl)) // picker surface
      const input = hslToRgbTriplet(parseHslTriplet(backgroundHsl)) // input bg matches shadcn Input (bg-background)
      const color = hslToRgbTriplet(parseHslTriplet(popFgHsl)) // popover foreground

      if (background && input && color) {
        setRgbTokens({ background, input, color })
      }
    } catch {
      // ignore; fall back to defaults below
    }
  }, [theme])

  useEffect(() => {
    // Emoji Mart renders inside Shadow DOM and won't automatically pick up our Next/font styles
    // unless we explicitly set its `--font-family`.
    try {
      const body = document.body
      const fam = body ? getComputedStyle(body).fontFamily : ''
      const next = String(fam || '').trim()
      if (next) setFontFamily(next)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod: any = await import('@emoji-mart/data')
        const next = (mod && (mod.default ?? mod)) as EmojiMartData
        if (!cancelled) setData(next ?? null)
      } catch {
        if (!cancelled) setData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleEmojiSelect = useMemo(() => {
    return (ev: EmojiMartSelectEvent) => {
      if (!ev) return
      if (typeof ev === 'string') {
        const e = ev.trim()
        if (e) onEmojiSelect(e)
        return
      }
      const native = typeof (ev as any)?.native === 'string' ? String((ev as any).native).trim() : ''
      const emoji = typeof (ev as any)?.emoji === 'string' ? String((ev as any).emoji).trim() : ''
      const out = native || emoji
      if (out) onEmojiSelect(out)
    }
  }, [onEmojiSelect])

  // Emoji Mart uses CSS variables like `--rgb-background: 255,255,255` which it later
  // wraps with `rgb(var(--rgb-background))` inside Shadow DOM.
  // We map those to our existing shadcn tokens so the picker matches cards/popovers.
  const themeVars = useMemo(() => {
    const isLight = theme === 'light'
    const vars: CSSProperties = {
      // Core colors
      ['--rgb-background' as any]: rgbTokens?.background ?? (isLight ? '255, 255, 255' : '15, 15, 15'),
      ['--rgb-color' as any]: rgbTokens?.color ?? (isLight ? '20, 20, 20' : '242, 242, 242'),
      ['--rgb-input' as any]: rgbTokens?.input ?? (isLight ? '255, 255, 255' : '0, 0, 0'),
      // Accent: use our existing RGB token if available
      ['--rgb-accent' as any]: 'var(--primary-rgb)',

      // Borders (Emoji Mart consumes these directly as colors, not rgb triples)
      // Emoji Mart uses `--em-color-border` as the *resting search input background*.
      // Set it to our input background so the search field matches shadcn `Input` styling.
      // (The focus style already uses `--em-rgb-input`.)
      ['--color-border' as any]: 'rgb(var(--em-rgb-input))',
      // Keep hover/over states aligned with our input border token.
      ['--color-border-over' as any]: 'hsl(var(--input) / 1)',

      // Geometry
      ['--border-radius' as any]: '0.5rem', // matches `rounded-lg`
      // Avoid a second "component shadow" since Radix/popovers handle elevation in our UI.
      ['--shadow' as any]: 'none',
      // Typography
      ['--font-family' as any]: fontFamily ?? 'inherit',
      // Emoji Mart uses `calc(var(--font-size) - 1px)` for the search input.
      // Set to 15px so the search text lands at 14px (matches our `Input` / `text-sm`).
      ['--font-size' as any]: '15px',
    }
    return vars
  }, [fontFamily, rgbTokens, theme])

  if (!data) {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center text-xs text-muted-foreground overflow-hidden rounded-lg bg-card ring-1 ring-border/60 dark:ring-border shadow-md',
          className
        )}
        style={{ height, ...(themeVars as any), ...(props.style ?? {}) }}
        {...props}
      >
        Loading emojis…
      </div>
    )
  }

  const { style: styleProp, ...restProps } = props

  return (
    <div
      ref={ref}
      className={cn('inline-block overflow-hidden rounded-lg bg-card text-popover-foreground ring-1 ring-border/60 dark:ring-border shadow-md', className)}
      style={{ ...(themeVars as any), ...(styleProp ?? {}) }}
      {...restProps}
    >
      <EmojiMartPicker
        data={data as any}
        theme={theme}
        previewPosition="none"
        skinTonePosition="search"
        dynamicWidth={false}
        onEmojiSelect={handleEmojiSelect as any}
        // Sizing / density
        set="native"
        emojiSize={20}
        emojiButtonSize={32}
        emojiButtonRadius="12px"
        perLine={9}
        maxFrequentRows={2}
        navPosition="bottom"
        searchPosition="sticky"
        // Match our popover vibe a bit (emoji-mart uses inline styles)
        icons="auto"
        noCountryFlags={false}
        height={height}
      />
    </div>
  )
})

