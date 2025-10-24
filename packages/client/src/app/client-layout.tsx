'use client'

import Icon from '@/components/primitives/Icon'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { Navigation } from '@/components/navigation/Navigation'
import { useAuth } from '@/hooks/useAuth'
import { StarTheme } from '@/components/theme-context'
import { StarshipsLogo } from '@/components/ui/starships-logo'

import { motion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Orbitron } from 'next/font/google'

interface ClientLayoutProps {
  children: React.ReactNode
}

// Enhanced animation variants
// const dashboardVariants = {
//   initial: { opacity: 0, scale: 0.95 },
//   animate: { opacity: 1, scale: 1 },
//   exit: { opacity: 0, scale: 1.05 },
// }

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

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
  const isPublicSimplePage = pathname === '/' || pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'

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
          <div className="relative min-h-[100dvh] flex overflow-hidden bg-background">
            {/* Public top navigation for marketplace (unauthenticated) */}
            <div
              className="fixed top-8 left-8 z-[1000] cursor-pointer select-none"
              onClick={() => {
                setLogoTrigger(v => v + 1)
                window.location.href = '/'
              }}
              title="Go to home"
            >
              <div className="flex items-center gap-2">
                <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
                <span className={`${orbitron.className} text-xl md:text-2xl font-normal tracking-tight`}>starships.ai</span>
              </div>
            </div>
            <nav className="fixed top-8 right-8 z-[1000] flex items-center gap-6 text-sm">
              <Link
                href="/"
                className={pathname === '/' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}
                aria-current={pathname === '/' ? 'page' : undefined}
              >
                Home
              </Link>
              <Link
                href="/marketplace"
                className={pathname.startsWith('/marketplace') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}
                aria-current={pathname.startsWith('/marketplace') ? 'page' : undefined}
              >
                Marketplace
              </Link>
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className={pathname.startsWith('/docs') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}
                aria-current={pathname.startsWith('/docs') ? 'page' : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  Documentation
                  <Icon name="external-link" className="w-3 h-3 opacity-80" />
                </span>
              </a>
            </nav>
            <main className="relative flex-1 min-h-full w-full overflow-auto">{children}</main>
          </div>
        </StarTheme>
      )
    }

    // Authenticated users: show navigation like protected pages (without auth gate)
    const shouldHideNavigation = false

    return (
      <StarTheme theme="dark">
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {/* Floating Navigation - conditionally rendered */}
          {!shouldHideNavigation && (
            <div className="fixed top-6 left-6 z-[1000]">
              <aside className="relative" style={{ zIndex: 1000 }}>
                <Navigation isMobile={isMobile} />
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

          {/* Main Content Area - Dynamic positioning based on navigation visibility */}
          <main className="relative flex-1 min-h-full w-full transition-all duration-300 overflow-auto" style={{ paddingLeft: isMobile || shouldHideNavigation ? 0 : '5.5rem' }}>
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
      <StarTheme theme="dark">
        <div className="relative h-[100dvh] flex overflow-hidden bg-background">
          {/* Floating Navigation - conditionally rendered */}
          {!shouldHideNavigation && (
            <div className="fixed top-6 left-6 z-[1000]">
              <aside className="relative" style={{ zIndex: 1000 }}>
                <Navigation isMobile={isMobile} />
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

          {/* Main Content Area - Dynamic positioning based on navigation visibility */}
          <main className="relative flex-1 min-h-full w-full transition-all duration-300 overflow-auto" style={{ paddingLeft: isMobile || shouldHideNavigation ? 0 : '5.5rem' }}>
            {children}
          </main>
        </div>
      </StarTheme>
    </JwtAuthGate>
  )
}
