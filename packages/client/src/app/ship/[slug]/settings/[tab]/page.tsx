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
import { useAuth } from '@/hooks/useAuth'
import { MyStarshipSettingsSection } from '@/components/settings/MyStarshipSettingsSection'
import { useUserPreferencesStore } from '@/store/user-preferences-store'

const ALL_TABS = ['my-profile', 'my-starship', 'billing', 'usage'] as const
type TabValue = (typeof ALL_TABS)[number]

export default function ShipSettingsTabPage(): React.JSX.Element {
  const router = useRouter()
  const { slug, tab } = useParams<{ slug: string; tab: string }>()
  const { isInstanceAdmin, isLoading: authLoading } = useAuth()
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const showAnalytics = isInstanceAdmin && expertMode
  const visibleTabs: readonly TabValue[] = showAnalytics ? ALL_TABS : (['my-profile', 'my-starship', 'billing'] as const)
  const isValidTab = visibleTabs.includes(tab as TabValue)
  const currentTab: TabValue = isValidTab ? (tab as TabValue) : 'my-profile'

  useEffect(() => {
    if (authLoading) return
    if (!isValidTab) router.replace(`/ship/${slug}/settings/${currentTab}`)
  }, [router, slug, currentTab, isValidTab, authLoading])

  const { data: starshipData, isLoading: starshipLoading } = useStarshipBySlug(slug, true)

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="rocket" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Settings</h1>
              </div>
            </div>

            {/* Sections using shared Tabs UI with improved alignment */}
            <Tabs value={currentTab} onValueChange={value => router.push(`/ship/${slug}/settings/${value}`)} className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-card p-1 shadow-sm">
                  <TabsTrigger value="my-profile" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="user" className="h-4 w-4" />
                    <span>My Profile</span>
                  </TabsTrigger>
                  <TabsTrigger value="my-starship" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="rocket" className="h-4 w-4" />
                    <span>My Subscription</span>
                  </TabsTrigger>
                  <TabsTrigger value="billing" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="credit-card" className="h-4 w-4" />
                    <span>Billing</span>
                  </TabsTrigger>
                  {showAnalytics ? (
                    <TabsTrigger value="usage" className="gap-2 rounded-xl px-3 py-1 border border-border/50 hover:border-border/80">
                      <Icon name="sparkles" className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400" />
                      <span>Analytics</span>
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </div>

              <TabsContent value="my-profile">
                <section aria-labelledby="my-profile-section" className="bg-background">
                  <AccountForm />
                </section>
              </TabsContent>

              <TabsContent value="my-starship">
                <section aria-labelledby="my-starship-section" className="bg-background">
                  <MyStarshipSettingsSection starship={starshipData} starshipSlug={slug} isLoading={starshipLoading} />
                </section>
              </TabsContent>

              {showAnalytics && (
                <TabsContent value="usage">
                  <section aria-labelledby="usage-section" className="rounded-xl border border-border/80 bg-background p-6">
                    {starshipData?.id ? <ShipManagement starshipId={starshipData.id} /> : null}
                  </section>
                </TabsContent>
              )}

              <TabsContent value="billing">
                <section aria-labelledby="billing-section" className="bg-background">
                  <StarshipBillingSection starshipId={starshipData?.id} />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
