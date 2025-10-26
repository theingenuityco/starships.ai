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

function LoginContent() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [activeTab, setActiveTab] = useState('login')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Fetch user's starships when authenticated
  const { data: starships, isLoading: starshipsLoading } = useUserStarships(
    user?.id || '',
    isAuthenticated && !!user?.id
  )

  // Prevent hydration mismatch by only rendering after mount
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect authenticated users to their starship
  React.useEffect(() => {
    if (mounted && isAuthenticated && !isLoading && !starshipsLoading) {
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
  }, [mounted, isAuthenticated, isLoading, starshipsLoading, starships, router, searchParams])

  // Show loading state while checking authentication or mounting
  if (!mounted || isLoading || (isAuthenticated && starshipsLoading)) {
    return <AuthLoadingScreen message="Loading..." />
  }

  // If already authenticated, show redirecting state
  if (isAuthenticated) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-black relative overflow-hidden flex">
        {/* Left Side - Animated Fluid Background */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          {/* Animated gradient orbs */}
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-primary/40 via-purple-500/40 to-pink-500/40 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 50, 0],
              y: [0, 30, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-br from-blue-500/40 via-primary/40 to-cyan-500/40 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              x: [0, -40, 0],
              y: [0, -50, 0],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 w-72 h-72 bg-gradient-to-br from-violet-500/30 via-fuchsia-500/30 to-primary/30 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.1, 1],
              x: [0, -30, 0],
              y: [0, 40, 0],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
          />

          {/* Overlay gradient for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/60" />

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white via-primary to-purple-300 bg-clip-text text-transparent">
                Turn ideas into intelligent workflows
              </h1>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                Design, deploy, and monitor AI agents with complete visibility and control
              </p>
              <div className="space-y-4">
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Icon name="rocket-launch" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Rapid agent development & deployment</span>
                </motion.div>
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Icon name="wrench" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Pre-built tools & customization</span>
                </motion.div>
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Icon name="store" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Marketplace of agents & tools</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-gradient-to-br from-gray-950 to-black">
          <div className="w-full max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mb-6"
              >
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent">
                  {activeTab === 'login' ? 'Welcome Back' : 'Join Starships'}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {activeTab === 'login' ? 'Continue your starship journey' : 'Start your starship journey'}
                </p>
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
