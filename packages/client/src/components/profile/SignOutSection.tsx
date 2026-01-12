'use client'

import React from 'react'
import Icon from '@/components/primitives/Icon'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
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
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="log-out" className="h-4 w-4 text-primary" />
            End Session
          </CardTitle>
          <Button variant="destructive" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </CardHeader>
    </Card>
  )
}
