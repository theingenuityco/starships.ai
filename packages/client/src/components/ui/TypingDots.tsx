'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export function TypingDots({
  className,
  dotClassName,
  dotSizePx = 5,
}: {
  className?: string
  dotClassName?: string
  dotSizePx?: number
}) {
  const dotBase = cn('inline-block rounded-full bg-muted-foreground/70', dotClassName)

  // Classic 3-dot "typing" bounce with staggered delays.
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden="true">
      <span className={cn(dotBase, 'animate-bounce')} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '0ms', animationDuration: '900ms' }} />
      <span className={cn(dotBase, 'animate-bounce')} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '150ms', animationDuration: '900ms' }} />
      <span className={cn(dotBase, 'animate-bounce')} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '300ms', animationDuration: '900ms' }} />
    </span>
  )
}

