'use client'

import Icon from '@/components/primitives/Icon'

import { useAuth } from '@/hooks/useAuth'

import { motion } from 'motion/react'
import { LoginForm } from '@/components/auth/LoginForm'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

interface JwtAuthGateProps {
  children: React.ReactNode
}

/**
 * JWT Authentication gate component
 * Shows login UI for unauthenticated users, or renders children for authenticated users
 */
export function JwtAuthGate({ children }: JwtAuthGateProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isOnboardingFlow = searchParams?.get('onboarding') === '1'

  // If a user is authenticated but has not completed onboarding, force them into /onboarding.
  // This prevents deep-links (e.g. /ship/*) from bypassing onboarding before initial provisioning.
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) return
    if (!user) return
    if (user.onboardingCompleted) return
    if (pathname === '/onboarding') return
    if (pathname === '/login') return
    // Allow explicitly marked onboarding conversation routes to render while onboarding is incomplete.
    if (isOnboardingFlow) return
    // Avoid redirect loops on connector install flows (they are public + can authenticate later).
    if (typeof pathname === 'string' && pathname.startsWith('/connectors/') && pathname.includes('/install')) return
    router.replace('/onboarding')
  }, [isLoading, isAuthenticated, user, pathname, router, isOnboardingFlow])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center space-y-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Icon name="rocket" className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-muted-foreground">Initializing starship systems...</p>
        </motion.div>
      </div>
    )
  }

  // Show login page for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center space-y-6 text-center max-w-md" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <motion.div className="flex items-center space-x-2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}>
            <Icon name="star" className="h-8 w-8 text-primary" />
            <Icon name="rocket" className="h-10 w-10 text-primary" />
            <Icon name="zap" className="h-8 w-8 text-primary" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Starships.ai</h1>
          </div>

          <LoginForm />
        </motion.div>
      </div>
    )
  }

  // While we are redirecting an authenticated-but-not-onboarded user, avoid rendering protected content.
  // IMPORTANT: allow /onboarding itself to render (it is intentionally accessible before completion).
  if (user && !user.onboardingCompleted && pathname !== '/onboarding' && !isOnboardingFlow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center space-y-4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Icon name="rocket" className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-muted-foreground">Redirecting to onboarding...</p>
        </motion.div>
      </div>
    )
  }

  // Render protected content for authenticated users
  return <>{children}</>
}
