'use client'

import React, { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/hooks/useAuth'
import { PageLayout } from '@/components/layout/PageLayout'
import Icon from '@/components/primitives/Icon'
import AccountForm from '@/components/profile/AccountForm'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { useUserPreferencesStore } from '@/store/user-preferences-store'

export default function AccountPage(): React.JSX.Element {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, user, isInstanceAdmin } = useAuth()
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const showAnalytics = Boolean(isInstanceAdmin && expertMode)
  const { getSelectedStarshipId } = useSelectedStarship()
  const selectedStarshipId = getSelectedStarshipId()
  const { data: userStarships } = useUserStarships(user?.id || '', Boolean(user?.id) && isAuthenticated)

  const activeStarship = useMemo(() => {
    if (!userStarships?.length) return null
    return pickPrimaryStarshipForUser(userStarships, user?.id, selectedStarshipId)
  }, [selectedStarshipId, user?.id, userStarships])

  const activeStarshipSlug = activeStarship?.slug ?? null
  const canManageBilling = Boolean(isInstanceAdmin === true || (user?.id && activeStarship?.ownerId && String(activeStarship.ownerId) === String(user.id)))

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) return
    router.replace('/login')
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated) {
    return <AuthLoadingScreen message="Loading your account..." />
  }

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="user" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">My Profile</h1>
              </div>
            </div>

            <Tabs
              value="account"
              onValueChange={value => {
                if (value === 'account') {
                  router.push('/account')
                  return
                }
                if (!activeStarshipSlug) return
                router.push(`/ship/${activeStarshipSlug}/settings/${value}`)
              }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-card p-1 shadow-sm">
                  <TabsTrigger value="account" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="user" className="h-4 w-4" />
                    <span>My Profile</span>
                  </TabsTrigger>
                  <TabsTrigger value="my-starship" className="gap-2 rounded-xl px-3 py-1" disabled={!activeStarshipSlug}>
                    <Icon name="rocket" className="h-4 w-4" />
                    <span>My Starship</span>
                  </TabsTrigger>
                  {canManageBilling ? (
                    <TabsTrigger value="upgrade" className="gap-2 rounded-xl px-3 py-1" disabled={!activeStarshipSlug}>
                      <Icon name="arrow-up" className="h-4 w-4" />
                      <span>Upgrade</span>
                    </TabsTrigger>
                  ) : null}
                  {canManageBilling ? (
                    <TabsTrigger value="billing" className="gap-2 rounded-xl px-3 py-1" disabled={!activeStarshipSlug}>
                      <Icon name="credit-card" className="h-4 w-4" />
                      <span>Billing</span>
                    </TabsTrigger>
                  ) : null}
                  {showAnalytics ? (
                    <TabsTrigger value="usage" className="gap-2 rounded-xl px-3 py-1 border border-border/50 hover:border-border/80" disabled={!activeStarshipSlug}>
                      <Icon name="sparkles" className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400" />
                      <span>Analytics</span>
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </div>

              <TabsContent value="account">
                <section aria-label="My profile" className="bg-background">
                  <AccountForm />
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

