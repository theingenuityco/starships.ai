'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CreditCard, ArrowRight } from 'lucide-react'
import React from 'react'

export interface CreditLimitBannerProps {
  onGoToBilling: () => void
  minimal?: boolean
  className?: string
  joinWithComposer?: boolean
}

export const CreditLimitBanner: React.FC<CreditLimitBannerProps> = ({ onGoToBilling, minimal = false, className, joinWithComposer = false }) => {
  const rounded = joinWithComposer ? (minimal ? 'rounded-t-xl rounded-b-none' : 'rounded-t-2xl rounded-b-none') : minimal ? 'rounded-xl' : 'rounded-2xl'
  const borderB = joinWithComposer ? 'border-b-0' : ''
  return (
    <div
      className={cn(
        'relative overflow-hidden frosted-glass-card bg-amber-50/70 dark:bg-amber-950/30',
        'border border-amber-200/60 dark:border-amber-400/25',
        borderB,
        rounded,
        'shadow-frosted-xl',
        className
      )}
      data-testid="credit-limit-banner"
    >
      {/* Ambient glow and divider */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-400/60 via-amber-300/40 to-transparent" />
        <div className="absolute -inset-x-8 -top-8 h-16 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent blur-xl" />
      </div>

      <div className="relative flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/20">
            <CreditCard className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight">
            <div className="text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-100">Credit limit reached</div>
            <div className="hidden sm:block text-[11px] text-muted-foreground">Top up your balance to continue the conversation</div>
          </div>
        </div>

        <Button onClick={onGoToBilling} size="sm" variant="outline" className="group border-amber-300/60 dark:border-amber-400/30 hover:bg-amber-500/10">
          <span className="hidden sm:inline">Go to Billing</span>
          <ArrowRight className="h-4 w-4 sm:ml-1 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  )
}
