'use client'

import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

import { usePathname, useRouter } from 'next/navigation'
import React from 'react'

interface UserProfileProps {
  mode?: 'collapsed' | 'expanded'
  onClick?: () => void
  active?: boolean
}

/**
 * User profile component for navigation bottom
 * Shows user name and email with logout functionality via tooltip
 */
export const UserProfile = React.memo(function UserProfile({ mode = 'expanded', onClick, active = false }: UserProfileProps) {
  const { user, userName, userEmail, isAuthenticated, logout, userAvatar } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleGoToSettings = (): void => {
    // Only navigate when current route contains a starship slug
    const parts = typeof pathname === 'string' ? pathname.split('/') : []
    const slug = parts[1] === 'ship' && parts.length > 2 ? parts[2] : null
    if (!slug) return
    router.push(`/ship/${slug}/settings/usage`)
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
    return (
      <div className="flex justify-center group">
        <div
          className={`group relative transition-all duration-300 mx-auto rounded-xl w-10 h-10 flex items-center justify-center border cursor-pointer ${
            active
              ? 'text-foreground bg-gradient-to-r from-muted/40 to-muted/30 shadow-md border-transparent'
              : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md'
          }`}
          role="button"
          aria-label="Open user menu"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') onClick?.()
          }}
        >
          {userAvatar ? (
            <Avatar className="w-7 h-7">
              <AvatarFallback className="text-xs">{userAvatar}</AvatarFallback>
            </Avatar>
          ) : (
            <LordIcon src={getLordiconUrl('user')} width={28} height={28} className="w-[28px] h-[28px]" trigger="click" />
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
        <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300">
          {userAvatar ? (
            <Avatar className="w-4 h-4">
              <AvatarFallback className="text-[10px]">{userAvatar}</AvatarFallback>
            </Avatar>
          ) : (
            <LordIcon src={getLordiconUrl('user')} width={16} height={16} className="w-4 h-4 text-primary" trigger="click" />
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{userName}</p>
        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
      </div>
    </div>
  )
})
