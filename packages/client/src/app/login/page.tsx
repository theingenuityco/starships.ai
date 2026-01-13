'use client'

import { LoginForm } from '@/components/auth/LoginForm'
import { StarTheme } from '@/components/theme-context'
import { useAuth } from '@/hooks/useAuth'
import Icon from '@/components/primitives/Icon'
import { motion } from 'motion/react'
import { Suspense, useState } from 'react'
import * as React from 'react'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import { useRouter, useSearchParams } from 'next/navigation'
import { isValidRedirectUrl } from '@/lib/utils'
import { useUserStarships } from '@/hooks/useStarships'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Orbitron } from 'next/font/google'
import Link from 'next/link'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

function LoginContent() {
  const { isAuthenticated, isLoading, user, logout } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [logoTrigger, setLogoTrigger] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab')
  const initialTab = tabParam === 'register' ? 'register' : 'login'
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab)

  // Fetch user's starships when authenticated
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)

  // Prevent hydration mismatch by only rendering after mount
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Support deep links like /login?tab=register
  React.useEffect(() => {
    if (tabParam === 'login' || tabParam === 'register') {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const logoutParam = searchParams?.get('logout')
  const expectedEmail = searchParams?.get('expectedEmail')
  const forcedLogoutRef = React.useRef(false)

  // Redirect authenticated users to their starship (skip while forced logout is pending)
  React.useEffect(() => {
    if (!mounted || isLoading || starshipsLoading) {
      return
    }
    if (isAuthenticated) {
      if ((logoutParam === 'true' || expectedEmail) && !forcedLogoutRef.current) {
        forcedLogoutRef.current = true
        ;(async () => {
          try {
            await logout()
          } finally {
            forcedLogoutRef.current = false
            if (typeof window !== 'undefined') {
              const params = new URLSearchParams(window.location.search)
              params.delete('logout')
              const query = params.toString()
              const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
              window.history.replaceState(null, '', newUrl)
            }
          }
        })()
        return
      }

      // Handle redirect with returnUrl pattern
      const returnUrl = searchParams?.get('returnUrl')

      if (returnUrl && isValidRedirectUrl(returnUrl)) {
        router.push(returnUrl)
      } else if (starships && starships.length > 0) {
        // Redirect to the first starship's conversations
        router.push(`/ship/${starships[0].slug}/conversations`)
      } else {
        // If no starship available, redirect to profile which handles starship creation
        router.push('/profile')
      }
    }
  }, [mounted, isAuthenticated, isLoading, starshipsLoading, starships, router, searchParams, logoutParam, expectedEmail, logout])

  // Show loading state while checking authentication or mounting
  if (!mounted || isLoading || (isAuthenticated && starshipsLoading) || forcedLogoutRef.current) {
    return <AuthLoadingScreen message="Loading..." />
  }

  // If already authenticated, show redirecting state
  if (isAuthenticated && logoutParam !== 'true' && !expectedEmail) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-black relative overflow-hidden flex items-center justify-center">
        {/* Full-screen background */}
        <AuthMarketingPanel className="fixed inset-0" />

        {/* Header with logo */}
        <header className="fixed top-4 sm:top-8 left-0 right-0 z-50">
          <div className="px-4 sm:px-8 flex items-center justify-between h-8">
            <button
              className="cursor-pointer select-none h-8 flex items-center"
              onClick={() => {
                setLogoTrigger(v => v + 1)
                router.push('/')
              }}
              title="Go to home"
            >
              <span className="flex items-center gap-2">
                <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
                <span className={`${orbitron.className} text-lg sm:text-xl md:text-2xl font-normal tracking-tight leading-none transition-all duration-200 ease-out opacity-100 translate-x-0`}>
                  starships.ai
                </span>
              </span>
            </button>
          </div>
        </header>

        {/* Centered Login Form */}
        <div className="w-full flex items-center justify-center px-6 py-16 relative z-10">
          <div className="w-full max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-4 text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-3">
                <h1 className="text-3xl font-bold text-primary">{activeTab === 'login' ? 'Sign in' : 'Sign up'}</h1>
              </motion.div>
            </motion.div>

            <LoginForm defaultTab={activeTab} onTabChange={tab => setActiveTab(tab === 'register' ? 'register' : 'login')} />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginContent />
    </Suspense>
  )
}
