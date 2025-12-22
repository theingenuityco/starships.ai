'use client'

import Icon from '@/components/primitives/Icon'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { TopRightUserProfile } from '@/components/auth/TopRightUserProfile'
import { Navigation } from '@/components/navigation/Navigation'
import { useAuth } from '@/hooks/useAuth'
import { StarTheme } from '@/components/theme-context'
import { EmailChangeToastHandler } from '@/components/global/EmailChangeToastHandler'

import { motion } from 'motion/react'
import { usePathname } from 'next/navigation'
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
  const { isAuthenticated } = useAuth()
  const isDashboard = pathname === '/'
  const isMarketplace = pathname === '/marketplace'
  const isPublicSimplePage = pathname === '/' || pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/terms' || pathname === '/privacy'

  useEffect(() => {
    if (!pathname) return

    const titleForPath = (path: string): string | null => {
      // Public pages
      if (path === '/') return 'Starships.ai | Hire your AI team, brief them in plain language'
      if (path === '/marketplace') return 'Marketplace | Starships.ai'
      if (path === '/login') return 'Login | Starships.ai'
      if (path === '/forgot-password') return 'Forgot Password | Starships.ai'
      if (path === '/reset-password') return 'Reset Password | Starships.ai'
      if (path === '/terms') return 'Terms of Service | Starships.ai'
      if (path === '/privacy') return 'Privacy Policy | Starships.ai'
      if (path === '/profile') return 'Profile | Starships.ai'

      // Admin
      if (path === '/admin/connector-templates') return 'Admin: Connector Templates | Starships.ai'
      if (path.startsWith('/admin/connector-templates/')) return 'Admin: Connector Template | Starships.ai'
      if (path === '/admin/agents/pending') return 'Admin: Agent Approvals | Starships.ai'
      if (path === '/admin/platform-secrets') return 'Admin: Platform Secrets | Starships.ai'

      // Ship routes (do NOT use route params like slug/ids in title)
      if (path.startsWith('/ship/')) {
        const rest = path.slice('/ship/'.length)
        const parts = rest.split('/').filter(Boolean)
        const section = parts[1] // after slug

        if (!section) return 'Starship | Starships.ai'
        if (section === 'conversations') return parts.length >= 3 ? 'Conversation | Starships.ai' : 'Conversations | Starships.ai'
        if (section === 'agents') return 'Agents | Starships.ai'
        if (section === 'agent') return 'Agent | Starships.ai'
        if (section === 'tools') return 'Tools | Starships.ai'
        if (section === 'tool') return 'Tool | Starships.ai'
        if (section === 'connectors') return 'Connectors | Starships.ai'
        if (section === 'settings') return parts.length >= 3 ? 'Settings: Section | Starships.ai' : 'Settings | Starships.ai'
        if (section === 'management') return 'Management | Starships.ai'
        if (section === 'schedules') return 'Schedules | Starships.ai'

        if (section === 'billing') {
          if (parts[2] === 'topup' && parts[3] === 'success') return 'Top-up Successful | Starships.ai'
          if (parts[2] === 'topup' && parts[3] === 'failure') return 'Top-up Failed | Starships.ai'
          return 'Billing | Starships.ai'
        }

        return 'Starship | Starships.ai'
      }

      return null
    }

    const nextTitle = titleForPath(pathname)
    if (nextTitle && document.title !== nextTitle) document.title = nextTitle
  }, [pathname])

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [logoTrigger, setLogoTrigger] = useState(0)
  const [hasMounted, setHasMounted] = useState(false)
  const [isPageReady, setIsPageReady] = useState(false)

  // Only show the top-right profile on fully-loaded ship pages.
  // - Gate on mount to avoid pre-hydration flashes.
  // - Gate on next animation frame when the route changes to avoid showing during layout churn.
  const isShipPage = typeof pathname === 'string' && pathname.startsWith('/ship/')
  const showTopRightUserProfile = hasMounted && isPageReady && (isShipPage || (isMarketplace && isAuthenticated))

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (!hasMounted) return
    setIsPageReady(false)
    const rafId = window.requestAnimationFrame(() => setIsPageReady(true))
    return () => window.cancelAnimationFrame(rafId)
  }, [hasMounted, pathname])

  useEffect(() => {
    const t = setTimeout(() => setLogoTrigger(v => v + 1), 900)
    return () => clearTimeout(t)
  }, [])

  if (isPublicSimplePage) {
    // Public pages - no authentication required
    return (
      <div className="h-full w-full">
        <EmailChangeToastHandler />
        {showTopRightUserProfile ? <TopRightUserProfile /> : null}
        {children}
      </div>
    )
  }

  // Public page with optional navigation (shown only when authenticated)
  if (isMarketplace) {
    // Unauthenticated users: simple public view without nav
    if (!isAuthenticated) {
      return (
        <StarTheme>
          <EmailChangeToastHandler />
          <div className="relative min-h-[100dvh] bg-background">
            {showTopRightUserProfile ? <TopRightUserProfile /> : null}
            <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
          </div>
        </StarTheme>
      )
    }

    // Always show navigation for authenticated users on marketplace
    const shouldHideNavigation = false

    return (
      <StarTheme>
        <EmailChangeToastHandler />
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {showTopRightUserProfile ? <TopRightUserProfile /> : null}
          {/* Sidebar Navigation - conditionally rendered */}
          {!shouldHideNavigation && (
            <>
              {/* Desktop: always visible */}
              {!isMobile && (
                <div className="flex-shrink-0 relative z-50">
                  <aside className="relative h-full">
                    <Navigation isMobile={false} isOpen={true} />
                  </aside>
                </div>
              )}

              {/* Mobile: overlay navigation */}
              {isMobile && <Navigation isMobile={true} isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} />}
            </>
          )}

          {/* Mobile Toggle Button - only show when menu is closed */}
          {isMobile && !shouldHideNavigation && !showMobileMenu && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setShowMobileMenu(true)}
              className="fixed top-[14px] left-4 z-[999] p-2.5 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
              aria-label="Open navigation menu"
              style={{ zIndex: 999 }}
            >
              <Icon name="sidebar" className="w-5 h-5" />
            </motion.button>
          )}

          {/* Main Content Area - takes remaining space */}
          <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
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
      <StarTheme>
        <EmailChangeToastHandler />
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {showTopRightUserProfile ? <TopRightUserProfile /> : null}
          {/* Sidebar Navigation - conditionally rendered */}
          {!shouldHideNavigation && (
            <>
              {/* Desktop: always visible */}
              {!isMobile && (
                <div className="flex-shrink-0 relative z-50">
                  <aside className="relative h-full">
                    <Navigation isMobile={false} isOpen={true} />
                  </aside>
                </div>
              )}

              {/* Mobile: overlay navigation */}
              {isMobile && <Navigation isMobile={true} isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} />}
            </>
          )}

          {/* Mobile Toggle Button - only show when menu is closed */}
          {isMobile && !shouldHideNavigation && !showMobileMenu && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setShowMobileMenu(true)}
              className="fixed top-[14px] left-4 z-[999] p-2.5 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
              aria-label="Open navigation menu"
              style={{ zIndex: 999 }}
            >
              <Icon name="sidebar" className="w-5 h-5" />
            </motion.button>
          )}

          {/* Main Content Area - takes remaining space */}
          <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
        </div>
      </StarTheme>
    </JwtAuthGate>
  )
}
