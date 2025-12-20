'use client'

import React from 'react'
import Icon from '@/components/primitives/Icon'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PROFILE_SECTION_CARD_CLASS } from './profileCardClasses'

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
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
    </Card>
  )
}
