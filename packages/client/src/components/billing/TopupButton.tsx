'use client'

import React from 'react'
import { useTopup } from '@/hooks/useTopup'
import { useWallet } from '@/hooks/useWallet'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

export interface TopupButtonProps {
  starshipId: string
  amount?: number
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

const CREDITS_PER_USD = 100

export default function TopupButton({ starshipId, amount = 20, variant = 'default', size = 'default', className = '' }: TopupButtonProps): React.JSX.Element {
  const mutation = useTopup()
  const { data: wallet } = useWallet(starshipId)
  const { toast } = useToast()

  const handleTopup = async () => {
    if (!wallet) {
      toast({
        title: 'Error',
        description: 'Wallet not found. Please refresh and try again.',
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await mutation.mutateAsync({
        starshipId,
        amountUsd: amount,
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

  return (
    <Button onClick={handleTopup} disabled={mutation.isPending || !wallet} variant={variant} size={size} className={className}>
      {mutation.isPending ? 'Processing...' : `Buy ${Math.round(amount * CREDITS_PER_USD).toLocaleString()} credits ($${amount})`}
    </Button>
  )
}
