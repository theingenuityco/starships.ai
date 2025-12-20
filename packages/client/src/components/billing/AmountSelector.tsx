'use client'

import React, { useState } from 'react'
import { useTopup } from '@/hooks/useTopup'
import { useWallet } from '@/hooks/useWallet'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import Icon from '@/components/primitives/Icon'

export interface AmountSelectorProps {
  starshipId: string
  className?: string
  variant?: 'default' | 'compact'
}

const PRESET_CREDITS = [1000, 2000, 5000] as const
const CREDITS_PER_USD = 100
const MIN_USD = 5
const MAX_CREDITS = 5000

export default function AmountSelector({ starshipId, className = '', variant = 'default' }: AmountSelectorProps): React.JSX.Element {
  const [selectedCredits, setSelectedCredits] = useState<number>(2000)

  const mutation = useTopup()
  const { data: wallet } = useWallet(starshipId)
  const { toast } = useToast()

  const currentCredits = selectedCredits
  const minCredits = MIN_USD * CREDITS_PER_USD
  const maxCredits = MAX_CREDITS
  const isValidAmount = currentCredits >= minCredits && currentCredits <= maxCredits
  const amountUsd = parseFloat((Math.max(0, currentCredits) / CREDITS_PER_USD).toFixed(2))

  const handleTopup = async () => {
    if (!wallet) {
      toast({
        title: 'Error',
        description: 'Wallet not found. Please refresh and try again.',
        variant: 'destructive',
      })
      return
    }

    if (!isValidAmount) {
      toast({
        title: 'Invalid Amount',
        description: `Please enter a valid amount between ${minCredits.toLocaleString()} and ${maxCredits.toLocaleString()} credits.`,
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await mutation.mutateAsync({
        starshipId,
        amountUsd,
        walletId: wallet.id,
      })

      // Redirect to Stripe Checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (error) {
      toast({
        title: 'Topup Failed',
        description: error instanceof Error ? error.message : 'Failed to initiate topup. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handlePresetClick = (credits: number) => {
    setSelectedCredits(credits)
  }

  return (
    <div className={`${variant === 'compact' ? 'space-y-4' : 'space-y-6'} ${className}`}>
      {/* Header */}
      {variant !== 'compact' && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-3">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wide">Add Credits</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Choose how many credits to buy</p>
          {isValidAmount && (
            <p className="mt-2 text-xs text-muted-foreground">
              You’ll pay <span className="font-semibold text-slate-900 dark:text-slate-100">${amountUsd.toFixed(2)}</span>.
            </p>
          )}
        </div>
      )}

      {/* Preset amounts - Modern card grid */}
      <div className={variant === 'compact' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-3'}>
        {PRESET_CREDITS.map(credits => (
          (() => {
            const presetUsd = credits / CREDITS_PER_USD
            const isSelected = selectedCredits === credits
            return (
          <button
            key={credits}
            onClick={() => handlePresetClick(credits)}
            className={`
              relative ${variant === 'compact' ? 'p-3' : 'p-6'} rounded-2xl border-2 transition-all duration-200 group ${variant === 'compact' ? '' : 'hover:scale-[1.03]'}
              ${isSelected ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50 hover:bg-accent/50'}
            `}
          >
            <div className="text-center">
              <div
                className={`
                ${variant === 'compact' ? 'text-xl' : 'text-3xl'} font-bold transition-colors leading-none
                ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'}
              `}
              >
                {credits.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground font-medium">credits</div>
              <div className="mt-2 text-[12px] font-semibold text-foreground/80">
                ${presetUsd.toFixed(2)}
              </div>
            </div>
            {isSelected && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
              </div>
            )}
          </button>
            )
          })()
        ))}
      </div>

      {/* Add Credits button - Premium styling */}
      <Button
        onClick={handleTopup}
        disabled={mutation.isPending || !wallet || !isValidAmount}
        size={variant === 'compact' ? 'default' : 'lg'}
        className={`w-full ${variant === 'compact' ? 'h-10 text-sm' : 'h-12 text-base'} font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200`}
      >
        {mutation.isPending ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
            Processing...
          </div>
        ) : isValidAmount ? (
          `Buy ${Math.round(currentCredits).toLocaleString()} credits ($${amountUsd.toFixed(2)})`
        ) : (
          'Buy credits'
        )}
      </Button>

      {/* Stripe redirect message - Elegant styling */}
      <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Icon name="external-link" className="h-3 w-3" />
        You will be redirected to Stripe to complete your payment
      </p>

    </div>
  )
}
