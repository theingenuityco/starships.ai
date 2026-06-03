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
import { pickPrimaryStarshipForUser, useSelectedStarship, useUserStarships } from '@/hooks/useStarships'
import { MobileNavProvider } from '@/components/navigation/MobileNavContext'
import { DemoProvider } from '@/components/demo/DemoContext'
import { Suspense } from 'react'

interface ClientLayoutProps {
  children: React.ReactNode
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const { getSelectedStarshipId, setSelectedStarship } = useSelectedStarship()
  const { data: starships = [] } = useUserStarships(user?.id ?? '', !!user?.id)
  const selectedStarshipId = getSelectedStarshipId()
  const primaryStarship = pickPrimaryStarshipForUser(starships, user?.id, selectedStarshipId)
  const isConnectorInstallPage = typeof pathname === 'string' && pathname.startsWith('/connectors/') && pathname.endsWith('/install')
  const isPublicSimplePage =
    pathname === '/login' ||
    pathname === '/setup' ||
    pathname === '/onboarding' ||
    pathname === '/accept-invite' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    isConnectorInstallPage

  useEffect(() => {
    if (!pathname) return

    const titleForPath = (path: string): string | null => {
      if (path === '/login') return 'Login | Starships.ai'
      if (path === '/forgot-password') return 'Forgot Password | Starships.ai'
      if (path === '/reset-password') return 'Reset Password | Starships.ai'
      if (path === '/terms') return 'Terms of Service | Starships.ai'
      if (path === '/privacy') return 'Privacy Policy | Starships.ai'
      if (path === '/account') return 'My Profile | Starships.ai'
      if (path === '/onboarding') return 'Get started — Starships.ai'
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
          if (tab === 'my-starship') return 'Settings: My Starship | Starships.ai'
          if (tab === 'usage') return 'Settings: Analytics | Starships.ai'
          return 'Settings | Starships.ai'
        }
        if (section === 'management') return 'Management | Starships.ai'
        if (section === 'schedules') return 'Schedules | Starships.ai'

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

  // Close the mobile navigation menu on route changes.
  useEffect(() => {
    if (!isMobile) return
    setShowMobileMenu(false)
  }, [pathname, isMobile])

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
    return (
      <div className="h-full w-full">
        <NotificationSoundBootstrap />
        <Suspense fallback={null}>
          <EmailChangeToastHandler />
        </Suspense>
        {children}
      </div>
    )
  }

  // Regular pages with navigation sidebar (requires auth)
  return (
    <JwtAuthGate>
      <StarTheme>
        <NotificationSoundBootstrap />
        <EmailChangeToastHandler />
        <MobileNavProvider
          value={{
            isMobile,
            isOpen: showMobileMenu,
            open: () => setShowMobileMenu(true),
            close: () => setShowMobileMenu(false),
            toggle: () => setShowMobileMenu(v => !v),
          }}
        >
          <DemoProvider>
          <div className="relative h-[100dvh] flex overflow-hidden bg-card">
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

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 min-w-0 p-0 md:pt-4 md:pr-4 md:pb-4 md:pl-0">
              <div className="h-full w-full overflow-hidden bg-background md:rounded-2xl md:border md:border-border/60 md:shadow-sm">
                <main className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar pb-[calc(var(--mobile-bottom-filter-bar-height,0px)+env(safe-area-inset-bottom,0px))]">
                  {children}
                </main>
              </div>
            </div>
          </div>
          </DemoProvider>
        </MobileNavProvider>
      </StarTheme>
    </JwtAuthGate>
  )
}
