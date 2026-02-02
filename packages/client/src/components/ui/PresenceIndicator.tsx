'use client'

import { cn } from '@/lib/utils'
import { motion } from 'motion/react'

export type PresenceIndicatorKind = 'online' | 'busy'

export function PresenceIndicator({
  kind,
  active,
  className,
  pulse = true,
}: {
  kind: PresenceIndicatorKind
  active: boolean
  className?: string
  pulse?: boolean
}) {
  if (!active) return null

  const baseDot = 'w-3.5 h-3.5 rounded-full border-2 border-card shadow-md z-20'
  const pos = 'absolute bottom-0 right-0 -translate-x-1/4 -translate-y-1/4'
  const colors =
    kind === 'busy'
      ? { dot: 'bg-amber-500', pulse: 'bg-amber-400' }
      : { dot: 'bg-green-500', pulse: 'bg-green-400' }

  return (
    <div className={cn(pos, baseDot, colors.dot, className)}>
      {pulse ? (
        <motion.div
          className={cn('absolute inset-0 rounded-full', colors.pulse)}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      ) : null}
    </div>
  )
}

