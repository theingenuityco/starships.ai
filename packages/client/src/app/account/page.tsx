'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/hooks/useAuth'
import { PageLayout } from '@/components/layout/PageLayout'
import Icon from '@/components/primitives/Icon'
import AccountForm from '@/components/profile/AccountForm'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

export default function AccountPage(): React.JSX.Element {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

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
              <p className="text-sm text-muted-foreground">Manage your account details, security, and preferences.</p>
            </div>

            <section aria-labelledby="my-profile-section" className="bg-background">
              <AccountForm />
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

