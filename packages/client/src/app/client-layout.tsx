'use client'

import Icon from '@/components/primitives/Icon'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { Navigation } from '@/components/navigation/Navigation'
import { useAuth } from '@/hooks/useAuth'
import { StarTheme } from '@/components/theme-context'
import { WelcomeModalProvider } from '@/components/auth/WelcomeModalProvider'

import { motion } from 'motion/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ClientLayoutProps {
  children: React.ReactNode
}

// Enhanced animation variants
// const dashboardVariants = {
//   initial: { opacity: 0, scale: 0.95 },
//   animate: { opacity: 1, scale: 1 },
//   exit: { opacity: 0, scale: 1.05 },
// }

// const pageVariants = {
//   initial: { opacity: 0, y: 20 },
//   animate: { opacity: 1, y: 0 },
//   exit: { opacity: 0, y: -20 },
// }

// Note: Public header is rendered by individual public pages (e.g., landing, marketplace)

// const LoadingSpinner = () => (
//   <div className="flex items-center justify-center h-screen bg-background">
//     <motion.div
//       className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full"
//       animate={{ rotate: 360 }}
//       transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
//     />
//   </div>
// )

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useAuth()
  const isDashboard = pathname === '/'
  const isMarketplace = pathname === '/marketplace'
  const isPublicSimplePage = pathname === '/' || pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/terms' || pathname === '/privacy'

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [logoTrigger, setLogoTrigger] = useState(0)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setLogoTrigger(v => v + 1), 900)
    return () => clearTimeout(t)
  }, [])

  if (isPublicSimplePage) {
    // Public pages - no authentication required
    return <div className="h-full w-full">{children}</div>
  }

  // Public page with optional navigation (shown only when authenticated)
  if (isMarketplace) {
    // Unauthenticated users: simple public view without nav
    if (!isAuthenticated) {
      return (
        <StarTheme theme="dark">
          <div className="relative min-h-[100dvh] bg-background">
            <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
          </div>
        </StarTheme>
      )
    }

    // Simple: hide navigation only when explicitly coming from public context
    const shouldHideNavigation = searchParams?.get('from') === 'public'

    return (
      <StarTheme theme="dark">
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {/* Sidebar Navigation - conditionally rendered */}
          {!shouldHideNavigation && (
            <div className="flex-shrink-0 p-3">
              <aside className="relative h-full">
                <Navigation />
              </aside>
            </div>
          )}

          {/* Mobile Toggle Button (only shown when navigation is hidden on mobile) */}
          {isMobile && !shouldHideNavigation && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="fixed top-4 left-4 z-[999] p-3 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
              aria-label="Open navigation menu"
              style={{ zIndex: 999 }}
            >
              <Icon name="menu" className="w-5 h-5" />
            </motion.button>
          )}

          {/* Main Content Area - takes remaining space */}
          <main className="relative flex-1 min-h-full w-full overflow-auto">
            {children}
          </main>
        </div>
      </StarTheme>
    )
  }

  // Only show navigation for authenticated users (JwtAuthGate will handle this)
  // Hide navigation only on landing page
  const shouldHideNavigation = isDashboard

  // Regular pages with conditional navigation sidebar
  return (
    <JwtAuthGate>
      <WelcomeModalProvider>
        <StarTheme theme="dark">
          <div className="relative h-[100dvh] flex overflow-hidden bg-background">
            {/* Sidebar Navigation - conditionally rendered */}
            {!shouldHideNavigation && (
              <div className="flex-shrink-0 p-3">
                <aside className="relative h-full">
                  <Navigation />
                </aside>
              </div>
            )}

            {/* Mobile Toggle Button (only shown when navigation is hidden on mobile) */}
            {isMobile && !shouldHideNavigation && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="fixed top-4 left-2 z-[999] p-3 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
                aria-label="Open navigation menu"
                style={{ zIndex: 999 }}
              >
                <Icon name="menu" className="w-5 h-5" />
              </motion.button>
            )}

            {/* Main Content Area - takes remaining space */}
            <main className="relative flex-1 min-h-full w-full overflow-auto">
              {children}
            </main>
          </div>
        </StarTheme>
      </WelcomeModalProvider>
    </JwtAuthGate>
  )
}
