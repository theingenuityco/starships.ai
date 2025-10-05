'use client'

import React from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { User as UserIcon } from 'lucide-react'

import AccountForm from '@/components/profile/AccountForm'

export default function ProfilePage(): React.JSX.Element {
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
              <p className="text-muted-foreground">Manage your account settings and preferences.</p>
            </div>

            <div className="rounded-xl border border-border/40 bg-background p-6">
              <h3 className="text-lg font-semibold mb-4">Account Settings</h3>
              <AccountForm />
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
