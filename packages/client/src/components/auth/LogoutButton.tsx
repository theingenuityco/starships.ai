'use client'

import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface LogoutButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
  children?: React.ReactNode
}

/**
 * Logout button that signs out the user via JWT auth
 * Integrates with existing UI components and theme
 */
export function LogoutButton({ variant = 'ghost', size = 'default', className, children }: LogoutButtonProps) {
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    // Optionally redirect to home page
    window.location.href = '/'
  }

  return (
    <Button variant={variant} size={size} className={cn('flex items-center gap-2', className)} onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      {children || 'Sign Out'}
    </Button>
  )
}
