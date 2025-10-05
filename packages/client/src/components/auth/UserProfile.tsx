'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/useAuth'
import { User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React from 'react'

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
        <div className="p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" onClick={handleGoToProfile}>
          <div className="flex items-center gap-2">
            {userAvatar ? (
              <Avatar className="w-5 h-5">
                <AvatarFallback className="text-xs">{userAvatar}</AvatarFallback>
              </Avatar>
            ) : (
              <User className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Expanded mode - Professional design
  return (
    <div
      className="flex items-center gap-2.5 p-3 m-3 rounded-lg bg-gradient-to-r from-muted/30 to-muted/20 hover:from-muted/40 hover:to-muted/30 cursor-pointer transition-all duration-300 group border border-border/40 hover:border-border/60 shadow-sm hover:shadow-md"
      onClick={handleGoToProfile}
    >
      <div className="relative">
        <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300">
          <User className="w-4 h-4 text-primary" />
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
