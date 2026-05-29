'use client'

import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/primitives/LoadingSpinner'
import type { DemoConvStatus } from '@/components/demo/demoActivity'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * The small status indicator the demo sidebar puts on rooms and conversations:
 *   live      → spinner (an agent is actively working it)
 *   needs-you → yellow pulsing dot (gated on your approval)
 *   done      → blue pulsing dot (only on the beat it completes — transient)
 *   idle      → renders `idleFallback` (callers pass the normal conversation icon)
 *
 * Every state lives in the same fixed 3x3 slot and cross-fades into the next as
 * the beat clock changes a conversation's status, so the marker never abruptly
 * swaps one element tree for another.
 */
export function DemoStatusIndicator({
  status,
  className,
  idleFallback,
}: {
  status: DemoConvStatus
  className?: string
  idleFallback?: ReactNode
}) {
  // Nothing to show and no fallback: render nothing (and keep no slot) so room
  // trailing slots collapse cleanly when there's no status.
  if (status === 'idle' && !idleFallback) return null

  const node: ReactNode =
    status === 'live' ? (
      <LoadingSpinner size={12} className="text-muted-foreground" />
    ) : status === 'needs-you' ? (
      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
    ) : status === 'done' ? (
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
    ) : (
      idleFallback
    )

  return (
    <span className={cn('relative flex h-3 w-3 shrink-0 items-center justify-center', className)} aria-hidden>
      <AnimatePresence initial={false}>
        <motion.span
          key={status}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {node}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
