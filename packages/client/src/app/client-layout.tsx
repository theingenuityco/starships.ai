'use client'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { Navigation } from '@/components/navigation/Navigation'
import { useAuth } from '@/hooks/useAuth'
import { Menu } from 'lucide-react'
import { motion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

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
  useAuth() // Keep the hook call but don't destructure unused values
  const isDashboard = pathname === '/'

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (isDashboard) {
    // Landing page - no authentication required
    return <div className="h-full w-full">{children}</div>
  }

  // Hide navigation on all routes except starship routes and marketplace
  const shouldHideNavigation = !pathname.startsWith('/ship/') && pathname !== '/marketplace'

  // Regular pages with conditional navigation sidebar
  return (
    <JwtAuthGate>
      <div className="relative h-screen flex overflow-hidden">
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
            <Menu className="w-5 h-5" />
          </motion.button>
        )}

        {/* Main Content Area - Dynamic positioning based on navigation visibility */}
        <main className="relative flex-1 min-h-full w-full transition-all duration-300 overflow-auto">{children}</main>
      </div>
    </JwtAuthGate>
  )
}
