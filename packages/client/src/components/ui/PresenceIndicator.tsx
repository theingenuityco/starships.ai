'use client'

import { cn } from '@/lib/utils'

export type PresenceIndicatorKind = 'online' | 'busy' | 'offline'
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
  // - offline: gray
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
  const color = kind === 'busy' ? 'bg-amber-500 dark:bg-amber-400' : kind === 'offline' ? 'bg-border dark:bg-muted-foreground' : 'bg-emerald-500 dark:bg-emerald-400'

  return (
    <span className={cn(pos, className)} aria-label={kind} title={kind}>
      <span
        // Solid fill + solid outline (no opacity/alpha) so it stays fully opaque everywhere.
        className={cn('inline-block rounded-full ring-2 ring-background outline outline-1 outline-border', color)}
        style={{
          width: sizePx,
          height: sizePx,
        }}
      />
    </span>
  )
}
