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
  const [activeTab, setActiveTab] = useState('login')
  const [mounted, setMounted] = useState(false)
  const [logoTrigger, setLogoTrigger] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Fetch user's starships when authenticated
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(user?.id || '', isAuthenticated && !!user?.id)

  // Prevent hydration mismatch by only rendering after mount
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const logoutParam = searchParams?.get('logout')
  const expectedEmail = searchParams?.get('expectedEmail')
  const logoutTriggeredRef = React.useRef(false)

  // Redirect authenticated users to their starship (skip while forced logout is pending)
  React.useEffect(() => {
    if (!mounted || isLoading || starshipsLoading) {
      return
    }
    if (isAuthenticated) {
      if ((logoutParam === 'true' || expectedEmail) && !logoutTriggeredRef.current) {
        logoutTriggeredRef.current = true
        logout().finally(() => {
          logoutTriggeredRef.current = false
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            params.delete('logout')
            const query = params.toString()
            const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
            window.history.replaceState(null, '', newUrl)
          }
        })
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
  if (!mounted || isLoading || (isAuthenticated && starshipsLoading)) {
    return <AuthLoadingScreen message="Loading..." />
  }

  // If already authenticated, show redirecting state
  if (isAuthenticated && logoutParam !== 'true' && !expectedEmail) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-black relative overflow-hidden flex">
        {/* Full-screen background */}
        <AuthMarketingPanel className="absolute inset-0" />

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

        {/* Left copy overlay */}
        <div className="hidden lg:flex lg:w-1/2 relative z-10">
          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
              <h1 className="text-5xl font-bold mb-6 text-white">
                Turn ideas into intelligent
                <br />
                workflows
              </h1>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">Design, deploy, and monitor AI agents with complete visibility and control</p>
              <div className="space-y-4">
                <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="rocket-launch" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Rapid agent development & deployment</span>
                </motion.div>
                <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.6 }}>
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="wrench" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Pre-built tools & customization</span>
                </motion.div>
                <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.8 }}>
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="store" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Marketplace of agents & tools</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Side - Login Form overlay */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-6 min-h-screen max-h-screen overflow-y-auto relative z-10">
          <div className="w-full max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-4 text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-3">
                <h1 className="text-3xl font-bold text-primary">{activeTab === 'login' ? 'Welcome Back' : 'Join Starships'}</h1>
                <p className="text-muted-foreground mt-1">{activeTab === 'login' ? 'Continue your starship journey' : 'Start your starship journey'}</p>
              </motion.div>
            </motion.div>

            <LoginForm onTabChange={setActiveTab} />
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
