'use client'

import Icon from '@/components/primitives/Icon'

import React, { useEffect } from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useParams, useRouter } from 'next/navigation'

import ShipManagement from '@/components/profile/ShipManagement'
import { useStarshipBySlug } from '@/hooks/useStarships'
import StarshipBillingSection from '@/components/billing/StarshipBillingSection'
import AccountForm from '@/components/profile/AccountForm'
import CreditLedgerSection from '@/components/billing/CreditLedgerSection'
import { useAuth } from '@/hooks/useAuth'

const ALL_TABS = ['profile', 'usage', 'billing', 'ledger'] as const
type TabValue = (typeof ALL_TABS)[number]

export default function ShipSettingsTabPage(): React.JSX.Element {
  const router = useRouter()
  const { slug, tab } = useParams<{ slug: string; tab: string }>()
  const { isInstanceAdmin, isLoading: authLoading } = useAuth()
  const visibleTabs: readonly TabValue[] = isInstanceAdmin ? ALL_TABS : (['profile', 'billing', 'ledger'] as const)
  const isValidTab = visibleTabs.includes(tab as TabValue)
  const currentTab: TabValue = isValidTab ? (tab as TabValue) : 'profile'

  useEffect(() => {
    if (authLoading) return
    if (!isValidTab) router.replace(`/ship/${slug}/settings/${currentTab}`)
  }, [router, slug, currentTab, isValidTab, authLoading])

  const { data: starshipData } = useStarshipBySlug(slug, true)

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="rocket" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Ship Management</h1>
              </div>
              <p className="text-muted-foreground">Monitor your starship&apos;s usage, performance metrics, and manage billing.</p>
            </div>

            {/* Sections using shared Tabs UI with improved alignment */}
            <Tabs value={currentTab} onValueChange={value => router.push(`/ship/${slug}/settings/${value}`)} className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="profile" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="user" className="h-4 w-4" />
                    <span>Profile</span>
                  </TabsTrigger>
                  {isInstanceAdmin && (
                    <TabsTrigger value="usage" className="gap-2 rounded-xl px-3 py-1">
                      <Icon name="activity" className="h-4 w-4" />
                      <span>Analytics</span>
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="billing" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="credit-card" className="h-4 w-4" />
                    <span>Billing</span>
                  </TabsTrigger>
                  <TabsTrigger value="ledger" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="receipt" className="h-4 w-4" />
                    <span>Credit Ledger</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="profile">
                <section aria-labelledby="profile-section" className="rounded-xl border border-border/80 bg-background p-6">
                  <div className="space-y-6">
                    <AccountForm />
                  </div>
                </section>
              </TabsContent>

              {isInstanceAdmin && (
                <TabsContent value="usage">
                  <section aria-labelledby="usage-section" className="rounded-xl border border-border/80 bg-background p-6">
                    {starshipData?.id && <ShipManagement starshipId={starshipData.id} />}
                  </section>
                </TabsContent>
              )}

              <TabsContent value="billing">
                <section aria-labelledby="billing-section" className="rounded-xl border border-border/80 bg-background p-6">
                  <StarshipBillingSection starshipId={starshipData?.id} />
                </section>
              </TabsContent>

              <TabsContent value="ledger">
                <section aria-labelledby="ledger-section" className="rounded-xl border border-border/80 bg-background p-6">
                  <CreditLedgerSection starshipId={starshipData?.id} />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
