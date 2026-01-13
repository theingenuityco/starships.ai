'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export function TypingDots({
  className,
  dotClassName,
  dotSizePx = 7,
}: {
  className?: string
  dotClassName?: string
  dotSizePx?: number
}) {
  // Match the size + softness of our StatusDots (tool/thought badges).
  const dotBase = cn('ss-typing-dot inline-block rounded-full bg-muted-foreground/60', dotClassName)

  // Classic 3-dot "typing" bounce with staggered delays.
  return (
    <span className={cn('inline-flex items-center gap-[2px]', className)} aria-hidden="true">
      <span className={dotBase} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '0ms' }} />
      <span className={dotBase} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '140ms' }} />
      <span className={dotBase} style={{ width: dotSizePx, height: dotSizePx, animationDelay: '280ms' }} />
      <style jsx>{`
        .ss-typing-dot {
          animation: ssTypingDot 900ms ease-in-out infinite;
          opacity: 0.45;
          transform: translateY(0);
          will-change: transform, opacity;
        }
        @keyframes ssTypingDot {
          0%,
          80%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          40% {
            transform: translateY(-4px);
            opacity: 0.95;
          }
        }
      `}</style>
    </span>
  )
}

