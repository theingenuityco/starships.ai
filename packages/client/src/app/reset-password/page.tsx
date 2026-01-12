'use client'

import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { StarTheme } from '@/components/theme-context'
import { motion } from 'motion/react'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AuthLoadingScreen } from '@/components/ui/simple-loading'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const tokenParam = searchParams?.get('token')
    
    if (!tokenParam) {
      // No token provided, redirect to forgot password page
      router.push('/forgot-password')
      return
    }

    // Validate token format (should be 64 hex characters)
    if (!/^[a-f0-9]{64}$/.test(tokenParam)) {
      // Invalid token format, redirect to forgot password page
      router.push('/forgot-password')
      return
    }

    setToken(tokenParam)
    setIsLoading(false)
  }, [searchParams, router])

  if (isLoading || !token) {
    return <AuthLoadingScreen message="Validating token..." />
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center">
        {/* Full-screen background - same as login page */}
        <AuthMarketingPanel className="absolute inset-0" />

        {/* Centered Form */}
        <div className="w-full flex items-center justify-center px-6 py-16 relative z-10">
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
                <h1 className="text-3xl font-bold text-primary">
                  New Password
                </h1>
                <p className="text-muted-foreground mt-2">
                  Choose a secure password for your account
                </p>
              </motion.div>
            </motion.div>

            <ResetPasswordForm token={token} />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen message="Loading..." />}>
      <ResetPasswordContent />
    </Suspense>
  )
}