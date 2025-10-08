'use client'

import React, { useState } from 'react'
import { useTopup } from '@/hooks/useTopup'
import { useWallet } from '@/hooks/useWallet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/useToast'

export interface AmountSelectorProps {
  starshipId: string
  className?: string
}

const PRESET_AMOUNTS = [5, 10, 20, 30, 50, 100] as const

export default function AmountSelector({ starshipId, className = '' }: AmountSelectorProps): React.JSX.Element {
  const [selectedAmount, setSelectedAmount] = useState<number>(20)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [useCustom, setUseCustom] = useState<boolean>(false)

  const mutation = useTopup()
  const { data: wallet } = useWallet(starshipId)
  const { toast } = useToast()

  const currentAmount = useCustom ? Number(customAmount) || 0 : selectedAmount
  const isValidAmount = currentAmount >= 1 && currentAmount <= 1000

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
        description: 'Please enter a valid amount between $1 and $1000.',
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await mutation.mutateAsync({
        starshipId,
        amountUsd: currentAmount,
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

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount)
    setUseCustom(false)
    setCustomAmount('')
  }

  const handleCustomChange = (value: string) => {
    setCustomAmount(value)
    setUseCustom(true)
    if (value && Number(value) > 0) {
      setSelectedAmount(Number(value))
    }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-3">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <h3 className="text-sm font-bold text-primary uppercase tracking-wide">Add Credits</h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Choose an amount to add to your wallet</p>
      </div>

      {/* Preset amounts - Modern card grid */}
      <div className="grid grid-cols-3 gap-3">
        {PRESET_AMOUNTS.map(amount => (
          <button
            key={amount}
            onClick={() => handlePresetClick(amount)}
            className={`
              relative p-4 rounded-xl border-2 transition-all duration-200 group hover:scale-105
              ${selectedAmount === amount && !useCustom ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50 hover:bg-accent/50'}
            `}
          >
            <div className="text-center">
              <div
                className={`
                text-2xl font-bold transition-colors
                ${selectedAmount === amount && !useCustom ? 'text-primary' : 'text-foreground group-hover:text-primary'}
              `}
              >
                ${amount}
              </div>
            </div>
            {selectedAmount === amount && !useCustom && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-primary-foreground rounded-full"></div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-3 text-muted-foreground font-medium">Or enter custom amount</span>
        </div>
      </div>

      {/* Custom amount input - Modern design */}
      <div className="space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <span className="text-muted-foreground font-medium">$</span>
          </div>
          <Input
            type="number"
            placeholder="20.00"
            value={customAmount}
            onChange={e => handleCustomChange(e.target.value)}
            min="1"
            max="1000"
            step="0.01"
            className="pl-8 h-12 text-lg font-medium border-2 focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Add Credits button - Premium styling */}
      <Button
        onClick={handleTopup}
        disabled={mutation.isPending || !wallet || !isValidAmount}
        size="lg"
        className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200"
      >
        {mutation.isPending ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
            Processing...
          </div>
        ) : (
          `Add ${isValidAmount ? `$${currentAmount.toFixed(2)}` : 'Credits'}`
        )}
      </Button>

      {/* Stripe redirect message - Elegant styling */}
      <div className="text-center p-3 bg-muted/30 rounded-lg border border-border/50">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          You will be redirected to Stripe to complete your payment
        </p>
      </div>

      {/* Amount validation message */}
      {useCustom && customAmount && !isValidAmount && (
        <div className="text-center p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive font-medium">Please enter an amount between $1 and $1000</p>
        </div>
      )}
    </div>
  )
}
