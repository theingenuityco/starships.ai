'use client'

import { LoginForm } from '@/components/auth/LoginForm'
import { StarTheme } from '@/components/theme-context'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'

function LoginContent() {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading state while checking authentication
  if (isLoading) {
    return <AuthLoadingScreen message="Loading..." />
  }

  // If already authenticated, show redirecting state
  if (isAuthenticated) {
    return <AuthLoadingScreen message="Redirecting..." />
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/60 pointer-events-none" />

        <div className="relative z-10 w-full max-w-md px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8 text-center">
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-6">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent">Welcome Back</h1>
              <p className="text-muted-foreground mt-2">Continue your starship journey</p>
            </motion.div>
          </motion.div>

          <LoginForm />

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
