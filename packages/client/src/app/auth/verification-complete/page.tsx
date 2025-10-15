'use client'

import { StarfieldBackground } from '@/components/StarfieldBackground'
import { StarTheme } from '@/components/theme-context'
import { useAuth } from '@/hooks/useAuth'
import { CheckCircle2 } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect } from 'react'

/**
 * Email Verification Complete Page
 * 
 * This page handles the redirect after email verification is complete.
 * It intelligently routes users based on their authentication state:
 * - Logged in users: Redirects to dashboard
 * - Not logged in users: Shows success message with login link
 */
export default function VerificationCompletePage() {
  const { isAuthenticated, isLoading, starship } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // If user is authenticated, redirect to dashboard after a brief delay
    // This gives them time to see the success message
    if (isAuthenticated && !isLoading && starship?.slug) {
      const timer = setTimeout(() => {
        router.replace(`/ship/${starship.slug}/conversations`)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, isLoading, starship, router])

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

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
          <StarfieldBackground launching={false} density={400} speed={0.8} />
        </Suspense>

        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/60 pointer-events-none" />

        <div className="relative z-10 w-full max-w-md px-6 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
              className="w-20 h-20 bg-green-500/20 rounded-full mx-auto mb-6 flex items-center justify-center"
            >
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </motion.div>
            
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent mb-4">
              Email Verified!
            </h1>
            
            <p className="text-muted-foreground">
              {isAuthenticated 
                ? "Your email has been verified. Redirecting to your dashboard..."
                : "Your email has been successfully verified. You can now log in to access your starship."
              }
            </p>
          </motion.div>

          {!isAuthenticated && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              <Link 
                href="/login" 
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8"
              >
                Continue to Login
              </Link>
            </motion.div>
          )}

          {isAuthenticated && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex items-center justify-center gap-2"
            >
              <div className="h-1 w-1 bg-primary rounded-full animate-pulse" />
              <div className="h-1 w-1 bg-primary rounded-full animate-pulse [animation-delay:200ms]" />
              <div className="h-1 w-1 bg-primary rounded-full animate-pulse [animation-delay:400ms]" />
            </motion.div>
          )}
        </div>
      </div>
    </StarTheme>
  )
}