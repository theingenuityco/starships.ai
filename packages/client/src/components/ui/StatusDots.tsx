'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type StatusDotsVariant = 'running' | 'success' | 'idle'
export type StatusDotsOutcomeVariant = StatusDotsVariant | 'error' | 'info'

export function StatusDots({
  variant,
  className,
  dotClassName,
  sizePx = 8,
  tone = 'amber',
}: {
  variant: StatusDotsOutcomeVariant
  className?: string
  dotClassName?: string
  sizePx?: number
  /**
   * Only applies to the `running` variant.
   * - amber: tool execution / activity
   * - purple: thinking / meta activity
   */
  tone?: 'amber' | 'purple'
}) {
  const baseDot = cn('rounded-full', dotClassName)

  // Colors tuned to match the conversation palette.
  const successColor = 'bg-emerald-500/90 dark:bg-emerald-400/90'
  const errorColor = 'bg-red-500/90 dark:bg-red-400/90'
  const infoColor = 'bg-violet-500/90 dark:bg-violet-400/90'
  const idleColor = 'bg-muted-foreground/40'
  const runningColor = tone === 'purple' ? 'bg-violet-500/90 dark:bg-violet-400/90' : 'bg-amber-500/90 dark:bg-amber-400/90'
  const runningRing =
    tone === 'purple' ? 'ring-[3px] ring-violet-500/60 dark:ring-violet-400/65' : 'ring-[3px] ring-amber-500/60 dark:ring-amber-400/65'

  if (variant === 'success') {
    return (
      <span className={cn('inline-flex items-center', className)} aria-label="Done" title="Done">
        <span className={cn(baseDot, successColor)} style={{ width: sizePx, height: sizePx, boxShadow: '0 0 10px rgba(16, 185, 129, 0.35)' }} />
    </span>
    )
  }

  if (variant === 'error') {
    return (
      <span className={cn('inline-flex items-center', className)} aria-label="Failed" title="Failed">
        <span className={cn(baseDot, errorColor)} style={{ width: sizePx, height: sizePx, boxShadow: '0 0 10px rgba(239, 68, 68, 0.35)' }} />
      </span>
    )
  }

  if (variant === 'info') {
    return (
      <span className={cn('inline-flex items-center', className)} aria-label="Info" title="Info">
        <span className={cn(baseDot, infoColor)} style={{ width: sizePx, height: sizePx }} />
      </span>
    )
  }

  if (variant === 'idle') {
    return (
      <span className={cn('inline-flex items-center', className)} aria-label="Idle" title="Idle">
      <span className={cn(baseDot, idleColor)} style={{ width: sizePx, height: sizePx }} />
    </span>
    )
  }

  // Running: one dot that emits ripple pulses.
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)} aria-label="Running" title="Running">
      {/* Base dot */}
      <span
        className={cn(baseDot, runningColor, 'animate-pulse')}
        style={{ width: sizePx, height: sizePx, animationDuration: '1400ms' }}
      />

      {/* Ripple rings */}
      <span
        aria-hidden="true"
        className={cn('absolute rounded-full bg-transparent', runningRing, 'animate-ping')}
        style={{
          width: sizePx,
          height: sizePx,
          opacity: 0.5,
          animationDuration: '1400ms',
        }}
      />
      <span
        aria-hidden="true"
        className={cn('absolute rounded-full bg-transparent', runningRing, 'animate-ping')}
        style={{
          width: sizePx,
          height: sizePx,
          opacity: 0.35,
          animationDuration: '1400ms',
          animationDelay: '700ms',
        }}
      />
    </span>
  )
}

