'use client'

import React from 'react'
import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SignOutSectionProps {
  onSignOut: () => Promise<void>
  onNavigateHome?: () => void
}

export default function SignOutSection({ onSignOut, onNavigateHome }: SignOutSectionProps): React.JSX.Element {
  const handleSignOut = async () => {
    try {
      await onSignOut()
      onNavigateHome?.()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <Card className="shadow-sm border-border/50 bg-background/80">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-destructive">Sign Out</h3>
            <p className="text-sm text-muted-foreground">End your current session</p>
          </div>
          <Button variant="destructive" className="gap-2" onClick={handleSignOut}>
            <Icon name="log-out" className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">You&apos;ll need to sign in again to access your starships.</p>
      </CardContent>
    </Card>
  )
}
