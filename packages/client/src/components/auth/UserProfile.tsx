'use client'

import Icon from '@/components/primitives/Icon'
import { LordIcon } from '@/components/animated/LordIcon'
import { getLordiconUrl } from '@/components/primitives/lordiconMap'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover'

interface UserProfileProps {
  mode?: 'collapsed' | 'expanded'
}

/**
 * User profile component for navigation bottom
 * Shows user name and email with logout functionality via tooltip
 */
export const UserProfile = React.memo(function UserProfile({ mode = 'expanded' }: UserProfileProps) {
  const { user, userName, userEmail, isAuthenticated, logout, userAvatar } = useAuth()
  const router = useRouter()

  const handleGoToProfile = (): void => {
    // Navigate to the main profile page for account settings
    router.push('/profile')
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
        <Popover>
          <PopoverTrigger asChild>
            <div
              className={`group relative transition-all duration-300 mx-auto rounded-xl w-12 h-12 flex items-center justify-center border text-muted-foreground hover:text-foreground border-transparent hover:bg-gradient-to-r hover:from-muted/40 hover:to-muted/30 hover:shadow-md cursor-pointer`}
              role="button"
              aria-label="Open user menu"
              tabIndex={0}
            >
              {userAvatar ? (
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs">{userAvatar}</AvatarFallback>
                </Avatar>
              ) : (
                <LordIcon src={getLordiconUrl('user')} width={32} height={32} className="w-[32px] h-[32px]" trigger="click" />
              )}
              <PopoverAnchor className="absolute bottom-0 right-0 w-0 h-0 translate-y-[10px]" />
            </div>
          </PopoverTrigger>
          <PopoverContent align="end" alignOffset={16} side="right" sideOffset={20} className="w-48 p-2 z-[1100]">
            <div className="flex flex-col gap-1">
              <button type="button" className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/40" onClick={handleGoToProfile}>
                Settings
              </button>
              <button type="button" className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/40 text-destructive" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  // Expanded mode - Professional design
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2.5 p-3 m-3 rounded-lg bg-gradient-to-r from-muted/30 to-muted/20 hover:from-muted/40 hover:to-muted/30 cursor-pointer transition-all duration-300 group border border-border/40 hover:border-border/60 shadow-sm hover:shadow-md">
          <div className="relative">
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300">
              <LordIcon src={getLordiconUrl('user')} width={16} height={16} className="w-4 h-4 text-primary" trigger="click" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
          <PopoverAnchor className="absolute bottom-0 right-3 w-0 h-0 translate-y-[10px]" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="end" alignOffset={16} side="right" sideOffset={20} className="w-56 p-2 z-[1100]">
        <div className="flex flex-col gap-1">
          <button type="button" className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/40" onClick={handleGoToProfile}>
            Settings
          </button>
          <button type="button" className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/40 text-destructive" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
})
