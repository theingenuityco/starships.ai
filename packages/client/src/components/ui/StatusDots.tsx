import React from 'react'
import { cn } from '@/lib/utils'

export type StatusDotsVariant = 'running' | 'success' | 'idle'

export function StatusDots({
  variant,
  className,
  dotClassName,
  sizePx = 8,
}: {
  variant: StatusDotsVariant
  className?: string
  dotClassName?: string
  sizePx?: number
}) {
  const baseDot = cn('rounded-full', dotClassName)

  // Colors tuned to match the conversation palette.
  const successColor = 'bg-emerald-500/90 dark:bg-emerald-400/90'
  const idleColor = 'bg-muted-foreground/40'
  const runningColors = ['bg-amber-500/90 dark:bg-amber-400/90', 'bg-sky-500/80 dark:bg-sky-400/80', 'bg-violet-500/80 dark:bg-violet-400/80']

  if (variant === 'success') {
    return <span className={cn('inline-flex items-center mr-1', className)} aria-label="Done" title="Done">
      <span className={cn(baseDot, successColor)} style={{ width: sizePx, height: sizePx }} />
    </span>
  }

  if (variant === 'idle') {
    return <span className={cn('inline-flex items-center mr-1', className)} aria-label="Idle" title="Idle">
      <span className={cn(baseDot, idleColor)} style={{ width: sizePx, height: sizePx }} />
    </span>
  }

  // Running: three dots with staggered pulse.
  return (
    <span className={cn('inline-flex items-center gap-[2px] mr-1', className)} aria-label="Running" title="Running">
      {runningColors.map((c, i) => (
        <span
          key={i}
          className={cn(baseDot, c, 'animate-pulse')}
          style={{
            width: sizePx,
            height: sizePx,
            animationDelay: `${i * 140}ms`,
            animationDuration: '750ms',
          }}
        />
      ))}
    </span>
  )
}

