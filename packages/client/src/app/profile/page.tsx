'use client'

import React from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Activity, CreditCard, Rocket, User as UserIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import AccountForm from '@/components/profile/AccountForm'
import { UserUsage } from '@/components/profile/UserUsage'
import CreditBalanceCard from '@/components/profile/CreditBalanceCard'
import CreditTopupForm from '@/components/profile/CreditTopupForm'
import CreditTransactionHistory from '@/components/profile/CreditTransactionHistory'

export default function ProfilePage(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const ALLOWED_TABS = ['account', 'billing', 'usage'] as const
  type Tab = (typeof ALLOWED_TABS)[number]

  const tabParamRaw = searchParams.get('tab') || ''
  const tabParam = tabParamRaw.toLowerCase()
  const isValidTab = (ALLOWED_TABS as readonly string[]).includes(tabParam)

  React.useEffect(() => {
    if (!isValidTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'account')
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [isValidTab, pathname, router, searchParams])

  const currentTab: Tab = isValidTab ? (tabParam as Tab) : 'account'

  const handleTabChange = (next: string) => {
    if (!(ALLOWED_TABS as readonly string[]).includes(next)) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <UserIcon className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">My Profile</h1>
              </div>
              <p className="text-muted-foreground">Manage your account, billing, and usage.</p>
            </div>

            {/* Sections using shared Tabs UI with improved alignment */}
            <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="account" className="gap-2 rounded-xl px-4 py-2">
                    <UserIcon className="h-4 w-4" />
                    <span>Account</span>
                  </TabsTrigger>
                  <TabsTrigger value="billing" className="gap-2 rounded-xl px-4 py-2">
                    <CreditCard className="h-4 w-4" />
                    <span>Billing</span>
                  </TabsTrigger>
                  <TabsTrigger value="usage" className="gap-2 rounded-xl px-4 py-2">
                    <Activity className="h-4 w-4" />
                    <span>Usage</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="account">
                <section aria-labelledby="account-section" className="rounded-xl border border-border/40 bg-background p-6">
                  <h3 id="account-section" className="text-lg font-semibold">
                    Account
                  </h3>
                  <div className="mt-4">
                    <AccountForm />
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="starship">
                <section aria-labelledby="starship-section" className="rounded-xl border border-border/40 bg-background p-6">
                  <h3 id="starship-section" className="text-lg font-semibold">
                    Starship
                  </h3>
                </section>
              </TabsContent>

              <TabsContent value="billing">
                <div className="space-y-6">
                  <section aria-labelledby="billing-section" className="rounded-xl border border-border/40 bg-background p-6">
                    <h3 id="billing-section" className="text-lg font-semibold mb-4">
                      Billing & Credits
                    </h3>

                    <div className="grid gap-6 md:grid-cols-2">
                      <CreditBalanceCard onTopupClick={() => {}} />
                      <CreditTopupForm />
                    </div>

                    <div className="mt-6">
                      <CreditTransactionHistory />
                    </div>
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="usage">
                <section aria-labelledby="usage-section" className="rounded-xl border border-border/40 bg-background p-6">
                  <h3 id="usage-section" className="sr-only">
                    Usage
                  </h3>
                  <UserUsage />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
