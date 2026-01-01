'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'
import Icon from '@/components/primitives/Icon'
import { StarshipsLogo } from '@/components/ui/starships-logo'

import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarImage } from '@/components/ui/avatar'

import { usePathname, useRouter } from 'next/navigation'
import React from 'react'

interface UserProfileProps {
  mode?: 'collapsed' | 'expanded'
  onClick?: () => void
  active?: boolean
  starshipName?: string
  /**
   * Collapsed mode was originally built for the sidebar and includes small alignment nudges.
   * Set this to true when rendering inside tight containers (e.g. top-right badge) so the avatar centers cleanly.
   */
  centerInContainer?: boolean
  /**
   * Size for the collapsed avatar.
   * Use 'sm' for sidebar, 'md' for top-right header.
   */
  collapsedSize?: 'sm' | 'md'
}

/**
 * User profile component for navigation bottom
 * Shows user name and starship name with logout functionality via tooltip
 */
export const UserProfile = React.memo(function UserProfile({ mode = 'expanded', onClick, active = false, starshipName, centerInContainer = false, collapsedSize = 'sm' }: UserProfileProps) {
  const { user, userName, userEmail, isAuthenticated, logout, userAvatar, isInstanceAdmin } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isImageUrl = (value?: string | null): boolean => {
    if (!value || typeof value !== 'string') return false
    const trimmed = value.trim()
    return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
  }

  const handleGoToSettings = (): void => {
    // Only navigate when current route contains a starship slug
    const parts = typeof pathname === 'string' ? pathname.split('/') : []
    const slug = parts[1] === 'ship' && parts.length > 2 ? parts[2] : null
    if (!slug) return
    const defaultTab = isInstanceAdmin ? 'usage' : 'my-profile'
    router.push(`/ship/${slug}/settings/${defaultTab}`)
  }

  const handleLogout = async () => {
    await logout()
    // Redirect to home page after logout
    router.push('/')
  }

  if (!isAuthenticated || !user) {
    return null
  }

  if (mode === 'collapsed') {
    const isInteractive = !!onClick
    const avatarSizeClass = collapsedSize === 'md' ? 'w-8 h-8' : 'w-7 h-7'
    const iconSize = collapsedSize === 'md' ? 20 : 18

    return (
      <div className={centerInContainer ? 'flex items-center justify-center' : 'flex justify-start -ml-0.5'}>
        <div
          className={`relative transition-all duration-300 rounded-full ${isInteractive ? 'cursor-pointer' : 'cursor-inherit'}`}
          role={isInteractive ? 'button' : undefined}
          aria-label={isInteractive ? 'Open user menu' : undefined}
          tabIndex={isInteractive ? 0 : -1}
          onClick={isInteractive ? onClick : undefined}
          onKeyDown={e => {
            if (!isInteractive) return
            if (e.key === 'Enter' || e.key === ' ') onClick?.()
          }}
        >
          {isImageUrl(userAvatar) ? (
            <Avatar className={`${avatarSizeClass} rounded-full ring-1 ring-border/40`}>
              <AvatarImage src={userAvatar!} alt={userName || userEmail || 'User avatar'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="rounded-full object-cover" />
            </Avatar>
          ) : (
            <div className={`${avatarSizeClass} rounded-full flex items-center justify-center bg-muted/40`}>
              <LordIcon src={getLordiconUrl('user')} width={iconSize} height={iconSize} className="w-4 h-4" trigger="click" />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Expanded mode - click delegates to parent for subnav
  return (
    <div
      className="flex items-center gap-2.5 p-3 m-3 rounded-lg bg-gradient-to-r from-muted/30 to-muted/20 hover:from-muted/40 hover:to-muted/30 cursor-pointer transition-all duration-300 group border border-border/40 hover:border-border/60 shadow-sm hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.()
      }}
    >
      <div className="relative">
        {isImageUrl(userAvatar) ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/10 group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300">
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src={userAvatar!} alt={userName || userEmail || 'User avatar'} referrerPolicy="no-referrer" crossOrigin="anonymous" className="w-full h-full object-cover" />
            </Avatar>
          </div>
        ) : (
          <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300 flex items-center justify-center">
            <LordIcon src={getLordiconUrl('user')} width={20} height={20} className="w-5 h-5 text-primary" trigger="click" />
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{userName}</p>
        <div className="flex items-center gap-1.5">
          <StarshipsLogo width={12} height={12} className="text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground truncate">{starshipName || 'No starship selected'}</p>
        </div>
      </div>
      <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors duration-300 flex-shrink-0" />
    </div>
  )
})
