'use client'

import React from 'react'
import { WalletModel } from '@starships/protocol'
import { cn } from '@/lib/utils'

interface BalanceStatusIndicatorProps {
  wallet?: WalletModel | null
  isLoading?: boolean
  showDetails?: boolean
  className?: string
  variant?: 'default' | 'compact' | 'minimal'
  showDot?: boolean
  showUnit?: boolean
  /**
   * When true, do not apply the status-based text color classes.
   * Useful when the parent container controls color (e.g. icon + text should match).
   */
  inheritTextColor?: boolean
  /**
   * Optional className override applied to the numeric value span (e.g. to adjust font size).
   */
  valueClassName?: string
}

// Client-side thresholds for credit UX (server enforces actual billing rules).
// Defaults align with: 10 credits per message, 200 signup credits.
const CREDIT_THRESHOLDS = {
  CRITICAL: 10, // < 1 message
  LOW: 50, // ~5 messages
  GOOD: 200, // ~20 messages
} as const

function formatCredits(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  // Force comma-grouping for readability (e.g. 12,345.67), independent of user locale.
  return v.toLocaleString('en-US', { useGrouping: true, maximumFractionDigits: 2 })
}

export default function BalanceStatusIndicator({
  wallet,
  isLoading,
  showDetails = false,
  className,
  variant = 'default',
  showDot = true,
  showUnit = true,
  inheritTextColor = false,
  valueClassName,
}: BalanceStatusIndicatorProps): React.JSX.Element {
  const balance = Number(wallet?.balance ?? '0')
  const isCritical = balance < CREDIT_THRESHOLDS.CRITICAL
  const isLow = balance < CREDIT_THRESHOLDS.LOW && balance >= CREDIT_THRESHOLDS.CRITICAL
  const isGood = balance >= CREDIT_THRESHOLDS.GOOD

  const getStatusConfig = () => {
    if (isCritical)
      return {
        indicatorColor: 'bg-red-400',
        textColor: 'text-red-600 dark:text-red-400',
      }
    if (isLow)
      return {
        indicatorColor: 'bg-orange-400',
        textColor: 'text-orange-600 dark:text-orange-400',
      }
    if (isGood)
      return {
        indicatorColor: 'bg-green-400',
        textColor: 'text-slate-600 dark:text-slate-400',
      }
    return {
      indicatorColor: 'bg-slate-400',
      textColor: 'text-slate-600 dark:text-slate-400',
    }
  }

  const statusConfig = getStatusConfig()
  const balanceLabel = `${formatCredits(balance)}${showUnit ? ' cr' : ''}`

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold', className)}>
        {showDot ? <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div> : null}
        <span>{variant === 'minimal' || variant === 'compact' ? '—' : 'Loading balance...'}</span>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold', inheritTextColor ? undefined : statusConfig.textColor, className)}>
        {showDot ? <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div> : null}
        <span className={cn(valueClassName)}>{balanceLabel}</span>
        {showDetails && <span>• Credits</span>}
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {showDot ? <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div> : null}
        <span className={cn('text-sm font-semibold', inheritTextColor ? undefined : statusConfig.textColor, valueClassName)}>{balanceLabel}</span>
      </div>
    )
  }

  // Default variant - matches original design exactly
  return (
    <div className={cn('flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold', className)}>
      <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div>
      <span>Credits</span>
    </div>
  )
}
