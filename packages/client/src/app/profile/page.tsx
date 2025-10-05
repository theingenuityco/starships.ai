'use client'

import React from 'react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { User as UserIcon, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

import AccountForm from '@/components/profile/AccountForm'

export default function ProfilePage(): React.JSX.Element {
  const { logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/')
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
              <p className="text-muted-foreground">Manage your account settings and preferences.</p>
            </div>

            <div className="rounded-xl border border-border/40 bg-background p-6">
              <h3 className="text-lg font-semibold mb-4">Account Settings</h3>
              <AccountForm />
            </div>

            {/* Logout Section */}
            <Card className="shadow-sm border-border/50 bg-background/80">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-destructive">Sign Out</h3>
                    <p className="text-sm text-muted-foreground">End your current session</p>
                  </div>
                  <Button variant="destructive" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
