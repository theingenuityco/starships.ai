'use client'


import { LoginForm } from '@/components/auth/LoginForm'
import { StarfieldBackground } from '@/components/StarfieldBackground'
import { StarTheme } from '@/components/theme-context'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function LoginContent() {
  const { isAuthenticated, isLoading, starship } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const verificationStatus = searchParams.get('verification')

  useEffect(() => {
    // If user is authenticated and lands on login page (e.g., from email verification link)
    // redirect them to their dashboard
    if (isAuthenticated && !isLoading && starship?.slug) {
      // If coming from email verification, show a brief success message
      if (verificationStatus === 'success') {
        // Redirect to dashboard with success notification
        router.replace(`/ship/${starship.slug}/conversations`)
      } else {
        // Regular redirect for already logged in users
        router.replace(`/ship/${starship.slug}/conversations`)
      }
    }
  }, [isAuthenticated, isLoading, starship, router, verificationStatus])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <StarTheme theme="dark">
        <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <StarfieldBackground launching={false} density={400} speed={0.8} />
          </Suspense>
          <div className="relative z-10">
            <div className="animate-pulse">
              <div className="w-8 h-8 bg-primary/20 rounded-full mx-auto" />
            </div>
          </div>
        </div>
      </StarTheme>
    )
  }

  // If already authenticated, show loading while redirecting
  if (isAuthenticated) {
    return (
      <StarTheme theme="dark">
        <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <StarfieldBackground launching={false} density={400} speed={0.8} />
          </Suspense>
          <div className="relative z-10 text-center">
            <div className="animate-pulse mb-4">
              <div className="w-8 h-8 bg-primary/20 rounded-full mx-auto" />
            </div>
            {verificationStatus === 'success' && (
              <p className="text-sm text-muted-foreground">Email verified! Redirecting to your dashboard...</p>
            )}
            {!verificationStatus && (
              <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
            )}
          </div>
        </div>
      </StarTheme>
    )
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
          <StarfieldBackground launching={false} density={400} speed={0.8} />
        </Suspense>

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

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.6 }} className="mt-8 text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Back to home
            </Link>
          </motion.div>
        </div>
      </div>
    </StarTheme>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <StarTheme theme="dark">
        <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
          <div className="relative z-10">
            <div className="animate-pulse">
              <div className="w-8 h-8 bg-primary/20 rounded-full mx-auto" />
            </div>
          </div>
        </div>
      </StarTheme>
    }>
      <LoginContent />
    </Suspense>
  )
}
