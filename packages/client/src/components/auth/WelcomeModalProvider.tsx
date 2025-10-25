'use client'

import { useEffect, useState } from 'react'
import { WelcomeModal } from './WelcomeModal'
import { useAuth, useWelcomeModalState } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

export function WelcomeModalProvider({ children }: { children: React.ReactNode }) {
  const [showWelcome, setShowWelcome] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { user, isAuthenticated } = useAuth()
  const { shouldShow, clearFlag } = useWelcomeModalState()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Only check for welcome modal if user is authenticated
    if (isAuthenticated && user && shouldShow) {
      // Small delay to ensure page has loaded
      const timer = setTimeout(() => {
        setShowWelcome(true)
        // Clear the flag from query cache so modal doesn't show again
        clearFlag()
      }, 800)

      return () => clearTimeout(timer)
    }
  }, [mounted, isAuthenticated, user, shouldShow, clearFlag])

  const handleClose = () => {
    setShowWelcome(false)
  }

  const handleViewBalance = () => {
    setShowWelcome(false)
    // Navigate to profile or wallet page
    router.push('/profile')
  }

  return (
    <>
      {children}
      {mounted && (
        <WelcomeModal
          open={showWelcome}
          onClose={handleClose}
          userName={user?.name}
          walletBalance={10}
          onViewBalance={handleViewBalance}
        />
      )}
    </>
  )
}
