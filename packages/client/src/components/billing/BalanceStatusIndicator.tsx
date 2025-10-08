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
}

const BALANCE_THRESHOLDS = {
  CRITICAL: 0.05, // Below this = blocked
  LOW: 0.2, // Below this = warning
  GOOD: 1.0, // Above this = healthy
}

export default function BalanceStatusIndicator({ wallet, isLoading, showDetails = false, className, variant = 'default' }: BalanceStatusIndicatorProps): React.JSX.Element {
  const balance = Number(wallet?.balance ?? '0')
  const isCritical = balance < BALANCE_THRESHOLDS.CRITICAL
  const isLow = balance < BALANCE_THRESHOLDS.LOW && balance >= BALANCE_THRESHOLDS.CRITICAL
  const isGood = balance >= BALANCE_THRESHOLDS.GOOD

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

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold', className)}>
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
        <span>Loading balance...</span>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold', statusConfig.textColor, className)}>
        <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div>
        <span>${balance.toFixed(2)}</span>
        {showDetails && <span>• Active</span>}
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div>
        <span className={cn('text-sm font-semibold', statusConfig.textColor)}>${balance.toFixed(2)}</span>
      </div>
    )
  }

  // Default variant - matches original design exactly
  return (
    <div className={cn('flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold', className)}>
      <div className={cn('w-2 h-2 rounded-full animate-pulse', statusConfig.indicatorColor)}></div>
      <span>Active Balance</span>
    </div>
  )
}
