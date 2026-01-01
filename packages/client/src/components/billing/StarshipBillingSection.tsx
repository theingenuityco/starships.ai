'use client'


import React, { useEffect } from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'
import PromoRedeemForm from '@/components/billing/PromoRedeemForm'
import { useWallet, WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStarship, STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'
import { useFrigateUpgradeCheckout } from '@/hooks/useFrigateUpgrade'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

const SECTION_CARD_CLASS =
  'relative overflow-hidden rounded-lg bg-card border border-border/40 shadow-sm'

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)
  const { data: starship } = useStarship(starshipId || '', enabled)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const upgradeMutation = useFrigateUpgradeCheckout()
  const { toast } = useToast()

  // After successful Stripe redirect, refresh wallet balance
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success' && starshipId) {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) })
    }
  }, [searchParams, queryClient, starshipId])

  const handleUpgrade = async () => {
    if (!starshipId) return
    try {
      const result = await upgradeMutation.mutateAsync({ starshipId })
      if (result.checkoutUrl) window.location.href = result.checkoutUrl
      else throw new Error('No checkout URL received')
    } catch (e) {
      toast({
        title: 'Upgrade Failed',
        description: e instanceof Error ? e.message : 'Failed to start upgrade checkout. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Compact sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Balance + Promo (stacked) */}
        <div className="space-y-4">
          {/* Ship class / upgrade */}
          {starship && (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Ship class</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Current</span>
                    <span className="font-medium">{starship.shipClass}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max agents</span>
                    <span className="font-medium">{starship.maxAgents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max concurrent turns</span>
                    <span className="font-medium">{starship.maxConcurrentTurns}</span>
                  </div>
                </div>

                {starship.shipClass === 'scout' && (
                  <Button onClick={handleUpgrade} disabled={upgradeMutation.isPending} className="w-full">
                    {upgradeMutation.isPending ? 'Redirecting…' : 'Upgrade to frigate ($20/mo)'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} variant="compact" />
            </CardContent>
          </Card>

          {starshipId && (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Promo</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <PromoRedeemForm starshipId={starshipId} variant="compact" className="border-0 bg-transparent p-0 shadow-none backdrop-blur-0" />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Add credits */}
        {starshipId && (
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Add credits</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <AmountSelector starshipId={starshipId} variant="compact" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ledger */}
      {wallet?.id && (
        <Card className={SECTION_CARD_CLASS}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <LedgerHistoryTable walletId={wallet.id} view="full" title="Transactions" variant="bare" showTitle={false} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
