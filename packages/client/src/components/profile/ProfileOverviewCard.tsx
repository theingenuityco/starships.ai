'use client'


import React, { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import UserAvatar from '@/components/animated/UserAvatar'

type ProfileOverviewCardProps = {
  initials: string
  displayName?: string
  email?: string
  selectedEmoji?: string
  profileImageUrl?: string
  onSelectEmoji: (emoji: string) => void
  onSelectGeneratedAvatar: () => void
  emojiOptions?: string[]
}

const DEFAULT_EMOJI_OPTIONS = ['😊', '😎', '🚀', '🌟', '🧠', '🔥', '🐱', '⚡']

export default function ProfileOverviewCard({ initials, displayName, email, selectedEmoji, profileImageUrl, onSelectEmoji, onSelectGeneratedAvatar, emojiOptions = DEFAULT_EMOJI_OPTIONS }: ProfileOverviewCardProps) {
  // Determine what to show in avatar: priority order is emoji > generated avatar > OAuth image > initials
  const hasSelectedEmoji = !!selectedEmoji && selectedEmoji !== 'GENERATED_AVATAR'
  const hasGeneratedAvatar = selectedEmoji === 'GENERATED_AVATAR'
  const hasProfileImage = !!profileImageUrl && profileImageUrl.startsWith('http')
  const shouldShowImage = !hasSelectedEmoji && !hasGeneratedAvatar && hasProfileImage
  const shouldShowGeneratedAvatar = !hasSelectedEmoji && hasGeneratedAvatar
  const hintMode = !hasSelectedEmoji && !hasGeneratedAvatar && !hasProfileImage

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
    <Card className="lg:col-span-1 border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Profile overview</CardTitle>
        <CardDescription>
          {hasProfileImage 
            ? "Your profile image from OAuth or select an emoji avatar." 
            : "Select an emoji avatar or keep initials."
          }
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Profile identity with animated ring hint when no emoji is set */}
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

            {shouldShowGeneratedAvatar ? (
              <UserAvatar 
                seed={displayName || 'User'} 
                size={80} 
                className="ring-2 ring-primary/30" 
                rounded 
              />
            ) : (
              <Avatar className={`h-20 w-20 relative z-0 ring-2 ${hintMode ? 'ring-primary/60 animate-pulse' : 'ring-primary/30'} bg-background`}>
                {shouldShowImage && profileImageUrl && (
                  <AvatarImage 
                    src={profileImageUrl} 
                    alt={displayName || 'Profile'} 
                    className="object-cover"
                    onLoadingStatusChange={(status) => {
                      if (status === 'error') {
                        console.warn('Failed to load profile image:', profileImageUrl)
                      }
                    }}
                  />
                )}
                <AvatarFallback className="text-xl">
                  {hasSelectedEmoji ? selectedEmoji : initials || 'U'}
                </AvatarFallback>
              </Avatar>
            )}
          </div>

          <div className="text-sm font-medium">{displayName || 'Your name'}</div>
          <div className="text-xs text-muted-foreground">{email || 'you@example.com'}</div>
        </div>

        <Separator />

        {/* Avatar selector */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Choose your avatar</div>
          
          {/* Generated Avatar Option */}
          <div className="mb-3">
            <button
              type="button"
              aria-label="Use generated avatar"
              aria-pressed={hasGeneratedAvatar}
              onClick={onSelectGeneratedAvatar}
              className={[
                'flex items-center gap-2 w-full p-2 rounded-lg border transition-colors text-left',
                hasGeneratedAvatar ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/60',
              ].join(' ')}
            >
              <UserAvatar seed={displayName || 'User'} size={24} rounded />
              <span className="text-sm">Generated avatar</span>
            </button>
          </div>

          {/* Emoji Options */}
          <div className="text-xs text-muted-foreground mb-2">Or pick an emoji</div>
          <div className="grid grid-cols-8 gap-2">
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
                    'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/60',
                  ].join(' ')}
                >
                  <span className="text-lg leading-none">{emoji}</span>
                </button>
              )
            })}
          </div>

          {/* Small hint when no emoji chosen */}
          {hintMode && !hasProfileImage && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Tip: Pick an emoji to personalize your avatar.
            </p>
          )}
          {hintMode && hasProfileImage && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Your OAuth profile image is displayed. Pick an emoji to override it.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
