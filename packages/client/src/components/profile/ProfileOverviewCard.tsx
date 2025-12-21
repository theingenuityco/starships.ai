'use client'

import React, { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

const DEFAULT_EMOJI_OPTIONS = ['😊', '😎', '🚀', '🌟', '🧠', '🔥', '🐱', '⚡']

export default function ProfileOverviewCard({ initials, displayName, email, selectedEmoji, profileImageUrl, onSelectEmoji, emojiOptions = DEFAULT_EMOJI_OPTIONS }: ProfileOverviewCardProps) {
  // Determine what to show in avatar: priority order is emoji > OAuth image > initials
  const hasSelectedEmoji = !!selectedEmoji
  // Validate profile image URL using same logic as navigation
  const hasProfileImage = useMemo(() => {
    if (!profileImageUrl || typeof profileImageUrl !== 'string') return false
    const trimmed = profileImageUrl.trim()
    return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
  }, [profileImageUrl])
  const shouldShowImage = !hasSelectedEmoji && hasProfileImage
  const hintMode = !hasSelectedEmoji && !hasProfileImage

  // Positions for orbiting emojis when no emoji is set
  const orbitPositions = useMemo(() => {
    const n = emojiOptions.length
    // Distribute evenly on a circle
    return emojiOptions.map((_, i) => {
      const angle = (i / n) * 360
      return angle
    })
  }, [emojiOptions])

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Profile overview</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-20 w-20">
            {/* Animated orbit when no emoji selected */}
            {hintMode && (
              <div
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center animate-spin origin-center"
                style={{ animationDuration: '14s', transformOrigin: '50% 50%' }}
                aria-hidden="true"
              >
                <div className="relative h-full w-full">
                  {orbitPositions.map((deg, idx) => (
                    <span
                      key={idx}
                      className="absolute left-1/2 top-1/2 text-xs"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${deg}deg) translate(42px) rotate(-${deg}deg)`,
                      }}
                    >
                      {emojiOptions[idx]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hasSelectedEmoji ? (
              <div className="relative z-0 flex h-20 w-20 items-center justify-center rounded-full bg-background text-xl ring-2 ring-primary/30">{selectedEmoji}</div>
            ) : (
              <Avatar className={`h-20 w-20 relative z-0 ring-2 ${hintMode ? 'ring-primary/60 animate-pulse' : 'ring-primary/30'}`}>
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
                <AvatarFallback className="text-xl font-semibold text-white bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">{initials || 'U'}</AvatarFallback>
              </Avatar>
            )}
          </div>

          <div className="text-sm font-medium">{displayName || 'Your name'}</div>
          <div className="text-xs text-muted-foreground">{email || 'you@example.com'}</div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pick an emoji</div>
          <div className="flex flex-wrap gap-1.5">
            {emojiOptions.map(emoji => {
              const selected = selectedEmoji === emoji
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Select emoji ${emoji}`}
                  aria-pressed={selected}
                  onClick={() => onSelectEmoji(emoji)}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full border text-base transition-colors',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-border',
                  ].join(' ')}
                >
                  <span className="leading-none">{emoji}</span>
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
