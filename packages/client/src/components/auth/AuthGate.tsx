'use client'

import { useServerAuth } from '@/hooks/useServerAuth'
import { LoginButton } from './LoginButton'
import { motion } from 'motion/react'
import { Rocket, Stars, Zap } from 'lucide-react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AuthGateProps {
  children: React.ReactNode
}

/**
 * Authentication gate component
 * Shows login UI for unauthenticated users, or renders children for authenticated users
 * Uses server-side auth state as source of truth
 */
export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useServerAuth()
  const router = useRouter()

  useEffect(() => {
    // Check auth state periodically in case of changes
    const interval = setInterval(() => {
      router.refresh()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [router])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center space-y-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Rocket className="h-8 w-8 text-primary" />
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
        <motion.div
          className="flex flex-col items-center space-y-6 text-center max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="flex items-center space-x-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <Stars className="h-8 w-8 text-primary" />
            <Rocket className="h-10 w-10 text-primary" />
            <Zap className="h-8 w-8 text-primary" />
          </motion.div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Starships.ai</h1>
            <p className="text-muted-foreground">
              Please sign in to access your crew console and manage your AI agents.
            </p>
          </div>

          <LoginButton />
        </motion.div>
      </div>
    )
  }

  // Render protected content for authenticated users
  return <>{children}</>
}