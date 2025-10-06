'use client'

import { WalletModel } from '@starships/protocol'
import React from 'react'

interface BillingOverviewCardProps {
  wallet?: WalletModel | null
  isLoading?: boolean
  error?: unknown
}

export default function BillingOverviewCard({ wallet, isLoading, error }: BillingOverviewCardProps): React.JSX.Element {
  const hasError = !!error
  const displayAmount = Number(wallet?.balance ?? 0).toFixed(2)

  return (
    <div className="flex items-center justify-center p-8">
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
          <div className="text-center p-6 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/20 dark:to-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p className="text-red-700 dark:text-red-300 font-semibold">Failed to load wallet</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 font-medium">Please refresh and try again</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <div className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-white bg-clip-text text-transparent">
                ${displayAmount}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-semibold">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Active Balance
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
