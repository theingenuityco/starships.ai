'use client'

import { cn } from '@/lib/utils'

export type PresenceIndicatorKind = 'online' | 'busy'
export type PresenceIndicatorSize = 'xs' | 'sm' | 'md'
export type PresenceIndicatorPlacement = 'outset' | 'inset'

export function PresenceIndicator({
  kind,
  active,
  size = 'md',
  placement = 'outset',
  className,
}: {
  kind: PresenceIndicatorKind
  active: boolean
  size?: PresenceIndicatorSize
  placement?: PresenceIndicatorPlacement
  className?: string
}) {
  if (!active) return null

  // Match tool-calls indicator sizing, but with requested semantics:
  // - online: green
  // - busy: yellow/amber
  // - no pulsing animation
  // Presets (kept intentionally small across the UI).
  const sizePx = size === 'md' ? 10 : size === 'sm' ? 8 : 6
  // Use a high z-index so avatar rings/shadows don't cover it.
  // Default placement is slightly outside the corner. Some containers (e.g. participant popovers)
  // have `overflow-x-hidden` and will clip an outset dot, so allow an inset placement.
  const pos =
    placement === 'inset'
      ? 'absolute bottom-0 right-0 -translate-x-0.5 -translate-y-0.5 z-50 pointer-events-none'
      : 'absolute bottom-0 right-0 translate-x-[16%] translate-y-[16%] z-50 pointer-events-none'
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
          boxShadow: kind === 'busy' ? '0 0 10px rgba(245, 158, 11, 0.30)' : '0 0 10px rgba(16, 185, 129, 0.30)',
        }}
      />
    </span>
  )
}

