'use client'

import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import type { ComponentType, CSSProperties } from 'react'
import { forwardRef, useEffect, useMemo, useState, lazy, Suspense } from 'react'

type EmojiMartData = Record<string, unknown>
type CSSVars = CSSProperties & Partial<Record<`--${string}`, string>>

type EmojiMartSet = 'native' | 'apple' | 'facebook' | 'google' | 'twitter'
type EmojiMartTheme = 'auto' | 'light' | 'dark'
type EmojiMartIcons = 'auto' | 'outline' | 'solid'
type EmojiMartPreviewPosition = 'top' | 'bottom' | 'none'
type EmojiMartNavPosition = 'top' | 'bottom' | 'none'
type EmojiMartSearchPosition = 'sticky' | 'static' | 'none'
type EmojiMartSkinTonePosition = 'preview' | 'search' | 'none'

type EmojiMartEmojiSelectEvent = {
  native?: string
  emoji?: string
  // allow extra fields from emoji-mart without `any`
  [k: string]: unknown
}

type EmojiMartPickerProps = {
  data: EmojiMartData
  theme?: EmojiMartTheme
  previewPosition?: EmojiMartPreviewPosition
  skinTonePosition?: EmojiMartSkinTonePosition
  dynamicWidth?: boolean
  onEmojiSelect?: (emoji: EmojiMartEmojiSelectEvent) => void
  set?: EmojiMartSet
  emojiSize?: number
  emojiButtonSize?: number
  emojiButtonRadius?: string
  perLine?: number
  maxFrequentRows?: number
  navPosition?: EmojiMartNavPosition
  searchPosition?: EmojiMartSearchPosition
  icons?: EmojiMartIcons
  noCountryFlags?: boolean
}

const EmojiMartPicker = lazy(() =>
  import('@emoji-mart/react').then(m => ({ default: m.default as unknown as ComponentType<EmojiMartPickerProps> }))
)

export const EmojiPicker = forwardRef<
  HTMLDivElement,
  {
    onEmojiSelect: (emoji: string) => void
  } & React.HTMLAttributes<HTMLDivElement>
>(function EmojiPicker({ onEmojiSelect, className, ...props }, ref) {
  const { resolvedTheme } = useTheme()
  const theme: EmojiMartTheme = resolvedTheme === 'light' ? 'light' : 'dark'

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
        const mod = (await import('@emoji-mart/data')) as unknown as { default: EmojiMartData }
        const next = mod?.default ?? null
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
    return (ev: EmojiMartEmojiSelectEvent) => {
      const native = typeof ev?.native === 'string' ? ev.native.trim() : ''
      const emoji = typeof ev?.emoji === 'string' ? ev.emoji.trim() : ''
      const out = native || emoji
      if (out) onEmojiSelect(out)
    }
  }, [onEmojiSelect])

  // Emoji Mart uses CSS variables like `--rgb-background: 255,255,255` which it later
  // wraps with `rgb(var(--rgb-background))` inside Shadow DOM.
  // We map those to our existing shadcn tokens so the picker matches cards/popovers.
  const themeVars = useMemo(() => {
    const isLight = theme === 'light'
    const vars: CSSVars = {
      // Core colors
      '--rgb-background': rgbTokens?.background ?? (isLight ? '255, 255, 255' : '15, 15, 15'),
      '--rgb-color': rgbTokens?.color ?? (isLight ? '20, 20, 20' : '242, 242, 242'),
      '--rgb-input': rgbTokens?.input ?? (isLight ? '255, 255, 255' : '0, 0, 0'),
      // Accent: use our existing RGB token if available
      '--rgb-accent': 'var(--primary-rgb)',

      // Borders (Emoji Mart consumes these directly as colors, not rgb triples)
      // Emoji Mart uses `--em-color-border` as the *resting search input background*.
      // Set it to our input background so the search field matches shadcn `Input` styling.
      // (The focus style already uses `--em-rgb-input`.)
      '--color-border': 'rgb(var(--em-rgb-input))',
      // Keep hover/over states aligned with our input border token.
      '--color-border-over': 'hsl(var(--input) / 1)',

      // Geometry
      '--border-radius': '0.5rem', // matches `rounded-lg`
      // Avoid a second "component shadow" since Radix/popovers handle elevation in our UI.
      '--shadow': 'none',
      // Typography
      '--font-family': fontFamily ?? 'inherit',
      // Emoji Mart uses `calc(var(--font-size) - 1px)` for the search input.
      // Set to 15px so the search text lands at 14px (matches our `Input` / `text-sm`).
      '--font-size': '15px',
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
        style={{ ...themeVars, ...(props.style ?? {}) }}
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
      style={{ ...themeVars, ...(styleProp ?? {}) }}
      {...restProps}
    >
      <Suspense
        fallback={
          <div className="p-4 text-sm text-muted-foreground" role="status">
            Loading emojis…
          </div>
        }
      >
        <EmojiMartPicker
          data={data}
          theme={theme}
          previewPosition="none"
          skinTonePosition="search"
          dynamicWidth={false}
          onEmojiSelect={handleEmojiSelect}
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
        />
      </Suspense>
    </div>
  )
})

