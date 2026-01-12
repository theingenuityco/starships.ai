'use client'

import React, { useMemo } from 'react'
import Icon from '@/components/primitives/Icon'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PROFILE_SECTION_CARD_CLASS } from './profileCardClasses'

type ProfileOverviewCardProps = {
  initials: string
  displayName?: string
  email?: string
  selectedEmoji?: string
  profileImageUrl?: string
  onSelectEmoji: (emoji: string) => void
  emojiOptions?: string[]
}

export default function ProfileOverviewCard({ initials, displayName, email, profileImageUrl, selectedEmoji: _selectedEmoji, onSelectEmoji: _onSelectEmoji, emojiOptions: _emojiOptions }: ProfileOverviewCardProps) {
  // Validate profile image URL using same logic as navigation
  const hasProfileImage = useMemo(() => {
    if (!profileImageUrl || typeof profileImageUrl !== 'string') return false
    const trimmed = profileImageUrl.trim()
    return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
  }, [profileImageUrl])
  const shouldShowImage = hasProfileImage

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="user" className="h-4 w-4 text-primary" />
          Profile overview
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-20 w-20">
            <Avatar className="h-20 w-20 relative z-0 ring-2 ring-primary/30">
              {shouldShowImage && profileImageUrl && (
                <AvatarImage
                  src={profileImageUrl}
                  alt={displayName || 'Profile'}
                  className="object-cover"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onLoadingStatusChange={status => {
                    if (status === 'error') {
                      console.warn('Failed to load profile image:', profileImageUrl)
                    }
                  }}
                />
              )}
              <AvatarFallback className="text-xl font-semibold text-foreground bg-gradient-to-br from-muted/60 via-muted/40 to-muted/50">{initials || 'U'}</AvatarFallback>
            </Avatar>
          </div>

          <div className="text-sm font-medium">{displayName || 'Your name'}</div>
          <div className="text-xs text-muted-foreground">{email || 'you@example.com'}</div>
        </div>
      </CardContent>
    </Card>
  )
}
