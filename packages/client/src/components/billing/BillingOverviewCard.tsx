'use client'

import { WalletModel } from '@starships/protocol'
import React from 'react'
import { Button } from '@/components/ui/button'
import BalanceStatusIndicator from './BalanceStatusIndicator'
import Icon from '@/components/primitives/Icon'

interface BillingOverviewCardProps {
  wallet?: WalletModel | null
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  variant?: 'default' | 'compact'
}

function formatCredits(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function BillingOverviewCard({ wallet, isLoading, error, onRetry, variant = 'default' }: BillingOverviewCardProps): React.JSX.Element {
  const hasError = !!error
  const isCompact = variant === 'compact'

  return (
    <div className={isCompact ? 'p-4' : 'flex items-center justify-center p-8'}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-8 h-8 border-3 border-transparent border-t-primary/40 rounded-full animate-spin animation-delay-150"></div>
            </div>
            <span className="text-slate-600 dark:text-slate-400 font-medium">Loading balance...</span>
          </div>
        ) : hasError ? (
          <div
            className={
              (isCompact ? 'text-center p-4 rounded-xl ' : 'text-center p-8 rounded-3xl ') +
              'bg-gradient-to-br from-red-50/50 to-red-100/30 dark:from-red-950/10 dark:to-red-900/10 border border-red-200/40 dark:border-red-800/20 backdrop-blur-sm'
            }
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100/80 dark:bg-red-900/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p className="text-red-800 dark:text-red-200 font-semibold text-lg mb-2">Unable to Load Balance</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-6 font-medium leading-relaxed">There was an issue retrieving your wallet information. This is usually temporary.</p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry || (() => window.location.reload())}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Large balance amount display - matches original design */}
            <div className="relative">
              {isCompact ? (
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center gap-2">
                    <Icon name="coins" className="h-5 w-5 text-primary" />
                    <div className="text-5xl font-bold tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-white bg-clip-text text-transparent">
                      {formatCredits(Number(wallet?.balance ?? 0))}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <BalanceStatusIndicator wallet={wallet} showDetails={false} variant="default" />
                  </div>
                </div>
              ) : (
                <div className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-white bg-clip-text text-transparent">
                  {formatCredits(Number(wallet?.balance ?? 0))}
                </div>
              )}
            </div>

            {/* Status indicator */}
            {!isCompact && <BalanceStatusIndicator wallet={wallet} showDetails={true} />}
          </div>
        )}
      </div>
    </div>
  )
}
