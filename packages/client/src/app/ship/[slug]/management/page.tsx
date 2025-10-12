'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

import { useParams, useSearchParams, useRouter } from 'next/navigation'

import ShipManagement from '@/components/profile/ShipManagement'
import { useStarshipBySlug } from '@/hooks/useStarships'
import StarshipBillingSection from '@/components/billing/StarshipBillingSection'

export default function ShipProfilePage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const { data: starshipData } = useStarshipBySlug(slug, true)
  const searchParams = useSearchParams()
  const router = useRouter()
  const defaultTab = searchParams.get('tab') === 'billing' ? 'billing' : 'usage'

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
              <p className="text-muted-foreground">Monitor your starship&lsquo;s usage, performance metrics, and manage billing.</p>
            </div>

            {/* Sections using shared Tabs UI with improved alignment */}
            <Tabs defaultValue={defaultTab} onValueChange={value => router.push(`?tab=${value}`)} className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="usage" className="gap-2 rounded-xl px-4 py-2">
                    <Icon name="activity" className="h-4 w-4" />
                    <span>Analytics</span>
                  </TabsTrigger>
                  <TabsTrigger value="billing" className="gap-2 rounded-xl px-4 py-2">
                    <Icon name="credit-card" className="h-4 w-4" />
                    <span>Billing</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="usage">
                <section aria-labelledby="usage-section" className="rounded-xl border border-border/80 bg-background p-6">
                  {starshipData?.id && <ShipManagement starshipId={starshipData.id} />}
                </section>
              </TabsContent>

              <TabsContent value="billing">
                <section aria-labelledby="billing-section" className="rounded-xl border border-border/80 bg-background p-6">
                  <Icon name="star"shipBillingSection starshipId={starshipData?.id}  />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
