'use client'

import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
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

  if (!data) {
    return (
      <div
        ref={ref}
        className={cn('h-[320px] w-full flex items-center justify-center text-xs text-muted-foreground', className)}
        style={{ height }}
        {...props}
      >
        Loading emojis…
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('inline-block overflow-hidden rounded-md', className)} {...props}>
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

