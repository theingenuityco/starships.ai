'use client'

import { useEffect, useState } from 'react'
import { WelcomeModal } from './WelcomeModal'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

const WELCOME_MODAL_STORAGE_KEY = 'starships_show_welcome'
const WELCOME_MODAL_SHOWN_KEY = 'starships_welcome_shown'

export function WelcomeModalProvider({ children }: { children: React.ReactNode }) {
  const [showWelcome, setShowWelcome] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { user, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return

    // Only check for welcome modal if user is authenticated
    if (isAuthenticated && user) {
      const shouldShowWelcome = localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)
      const pendingWelcome = localStorage.getItem('starships_pending_welcome')
      const hasShownBefore = localStorage.getItem(WELCOME_MODAL_SHOWN_KEY)

      // Check if we should show the modal (either from OAuth or from email verification)
      const shouldShow = (shouldShowWelcome === 'true' || pendingWelcome === 'true') && hasShownBefore !== 'true'

      if (shouldShow) {
        // Small delay to ensure page has loaded
        const timer = setTimeout(() => {
          setShowWelcome(true)
          // Clear the flags so modal doesn't show again
          localStorage.removeItem(WELCOME_MODAL_STORAGE_KEY)
          localStorage.removeItem('starships_pending_welcome')
          // Mark as shown
          localStorage.setItem(WELCOME_MODAL_SHOWN_KEY, 'true')
        }, 800)

        return () => clearTimeout(timer)
      }
    }
  }, [mounted, isAuthenticated, user])

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

// Helper function to trigger welcome modal (called from auth hooks)
export function triggerWelcomeModal() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true')
  }
}
