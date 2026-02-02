'use client'

import { cn } from '@/lib/utils'

export type PresenceIndicatorKind = 'online' | 'busy'
export type PresenceIndicatorSize = 'xs' | 'sm' | 'md'

export function PresenceIndicator({
  kind,
  active,
  size = 'xs',
  className,
}: {
  kind: PresenceIndicatorKind
  active: boolean
  size?: PresenceIndicatorSize
  className?: string
}) {
  if (!active) return null

  // Match tool-calls indicator sizing, but with requested semantics:
  // - online: green
  // - busy: yellow/amber
  // - no pulsing animation
  // Slightly larger than tool-call dots so it's visible on avatars.
  const sizePx = size === 'md' ? 12 : size === 'sm' ? 10 : 8
  // Use a high z-index so avatar rings/shadows don't cover it.
  // Slight nudge up+left vs 1/4 by reducing the outward translation.
  const pos = 'absolute bottom-0 right-0 translate-x-[16%] translate-y-[16%] z-50 pointer-events-none'
  const color =
    kind === 'busy'
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-emerald-500 dark:bg-emerald-400'

  return (
    <span className={cn(pos, className)} aria-label={kind} title={kind}>
      <span
        // Add a subtle neutral outline (not white) so the dot is visible on top of photos.
        className={cn('inline-block rounded-full shadow-md opacity-90 ring-1 ring-border/80', color)}
        style={{
          width: sizePx,
          height: sizePx,
          // Subtle glow similar to StatusDots success/error (but no animation).
          boxShadow: kind === 'busy' ? '0 0 12px rgba(245, 158, 11, 0.35)' : '0 0 12px rgba(16, 185, 129, 0.35)',
        }}
      />
    </span>
  )
}

