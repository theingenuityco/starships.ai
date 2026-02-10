'use client'

import Icon from '@/components/primitives/Icon'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { Navigation } from '@/components/navigation/Navigation'
import { useAuth } from '@/hooks/useAuth'
import { StarTheme } from '@/components/theme-context'
import { EmailChangeToastHandler } from '@/components/global/EmailChangeToastHandler'
import { NotificationSoundBootstrap } from '@/components/global/NotificationSoundBootstrap'

import { motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StarshipRail } from '@/components/navigation/StarshipRail'
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'

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
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const { getSelectedStarshipId, setSelectedStarship } = useSelectedStarship()
  const { data: starships = [], isLoading: starshipsLoading } = useUserStarships(user?.id ?? '', !!user?.id)
  const selectedStarshipId = getSelectedStarshipId()
  const primaryStarship = pickPrimaryStarshipForUser(starships, user?.id, selectedStarshipId)
  const isDashboard = pathname === '/'
  const isMarketplace = typeof pathname === 'string' && (pathname === '/marketplace' || pathname.startsWith('/marketplace/'))
  const isConnectorInstallPage = typeof pathname === 'string' && pathname.startsWith('/connectors/') && pathname.endsWith('/install')
  const isShipPage = typeof pathname === 'string' && pathname.startsWith('/ship/')
  const isPublicSimplePage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/accept-invite' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    isConnectorInstallPage

  useEffect(() => {
    if (!pathname) return

    const titleForPath = (path: string): string | null => {
      // Public pages
      if (path === '/') return 'Starships.ai | Hire your AI staff, brief them in plain language'
      if (path === '/marketplace') return 'Marketplace | Starships.ai'
      if (path.startsWith('/marketplace/')) return 'Marketplace | Starships.ai'
      if (path === '/login') return 'Login | Starships.ai'
      if (path === '/forgot-password') return 'Forgot Password | Starships.ai'
      if (path === '/reset-password') return 'Reset Password | Starships.ai'
      if (path === '/terms') return 'Terms of Service | Starships.ai'
      if (path === '/privacy') return 'Privacy Policy | Starships.ai'
      if (path === '/account') return 'My Profile | Starships.ai'
      if (path === '/onboarding') return 'Set up your starship | Starships.ai'
      if (path.startsWith('/connectors/') && path.endsWith('/install')) return 'Connectors | Starships.ai'

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
        if (section === 'settings') {
          const tab = parts[2]
          if (!tab) return 'Settings | Starships.ai'
          if (tab === 'profile') return 'Settings: Profile | Starships.ai'
          if (tab === 'usage') return 'Settings: Analytics | Starships.ai'
          if (tab === 'billing') return 'Settings: Billing | Starships.ai'
          return 'Settings | Starships.ai'
        }
        if (section === 'management') return 'Management | Starships.ai'
        if (section === 'schedules') return 'Schedules | Starships.ai'

        if (section === 'billing') return 'Billing | Starships.ai'

        return 'Starship | Starships.ai'
      }

      return null
    }

    const nextTitle = titleForPath(pathname)
    if (nextTitle && document.title !== nextTitle) document.title = nextTitle
  }, [pathname])

  // Marketplace is a "starship-free zone": don't persist / highlight a selected starship
  // while the user is browsing public marketplace pages.
  useEffect(() => {
    if (!isAuthenticated) return
    if (!isMarketplace) return
    setSelectedStarship(null)
  }, [isAuthenticated, isMarketplace, setSelectedStarship])

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

  // Redirect already-logged-in users who haven't completed the wizard (e.g. existing users after migration).
  // Wizard must run before the nav tour; we do not exempt marketplace so users always see the 5-step wizard first.
  // Any flow that sends the user into the app (e.g. to /ship/...) must call wizard/complete and refetch auth first;
  // see: onboarding (handleFinish, handleJoinWithInviteLink) and accept-invite page.
  // Must run unconditionally (before any early return) to satisfy Rules of Hooks.
  useEffect(() => {
    if (!isAuthenticated || !user || pathname === '/onboarding' || isPublicSimplePage) return
    if (user.wizardOnboardingCompleted) return
    if (starshipsLoading) return
    if (!primaryStarship) return
    router.replace('/onboarding')
  }, [isAuthenticated, user?.id, user?.wizardOnboardingCompleted, pathname, isPublicSimplePage, starshipsLoading, primaryStarship, router])

  if (isPublicSimplePage) {
    // Public pages - no authentication required
    return (
      <div className="h-full w-full">
        <NotificationSoundBootstrap />
        <EmailChangeToastHandler />
        {children}
      </div>
    )
  }

  // Wizard onboarding - full page, no sidebar (authenticated only via JwtAuthGate)
  if (pathname === '/onboarding') {
    return (
      <JwtAuthGate>
        <StarTheme>
          <NotificationSoundBootstrap />
          <EmailChangeToastHandler />
          <div className="relative min-h-[100dvh] w-full overflow-auto bg-background">
            <main className="relative min-h-full w-full">{children}</main>
          </div>
        </StarTheme>
      </JwtAuthGate>
    )
  }

  // Public page with optional navigation (shown only when authenticated)
  if (isMarketplace) {
    // Unauthenticated users: simple public view without nav
    if (!isAuthenticated) {
      return (
        <StarTheme>
          <NotificationSoundBootstrap />
          <EmailChangeToastHandler />
          <div className="relative min-h-[100dvh] bg-background">
            <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
          </div>
        </StarTheme>
      )
    }

    return (
      <StarTheme>
        <NotificationSoundBootstrap />
        <EmailChangeToastHandler />
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {/* Rail only (no sidebar panel) */}
          <div className="flex-shrink-0 relative z-50">
            <aside className="relative h-full">
              <StarshipRail
                starships={starships ?? []}
                activeSlug={null}
                onSelect={s => {
                  setSelectedStarship(s.id)
                  router.push(`/ship/${encodeURIComponent(s.slug)}`)
                }}
              />
            </aside>
          </div>

          {/* Main Content Area - takes remaining space */}
          <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
        </div>
      </StarTheme>
    )
  }

  // Hide navigation only on landing page
  const shouldHideNavigation = isDashboard

  // Regular pages with conditional navigation sidebar
  return (
    <JwtAuthGate>
      <StarTheme>
        <NotificationSoundBootstrap />
        <EmailChangeToastHandler />
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
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
