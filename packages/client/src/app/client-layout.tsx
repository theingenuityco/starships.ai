'use client'

import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { Navigation } from '@/components/navigation/Navigation'
import { AuthGate } from '@/components/auth/AuthGate'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const isWaitlist = pathname === '/waitlist'

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

  if (isDashboard || isWaitlist) {
    // Landing page and waitlist routes - no authentication required
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    )
  }

  // Hide navigation on all routes except starship routes (only show inside starship context)
  const shouldHideNavigation = !pathname.startsWith('/ship/')

  // Regular pages with conditional navigation sidebar
  return (
    <AuthGate>
      <div className="h-screen flex relative overflow-hidden">
        {/* Navigation Sidebar with gutter (16px) - conditionally rendered */}
        {!shouldHideNavigation && (
          <div className="fixed top-0 left-0 bottom-0 w-[300px] z-50">
            <motion.aside
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, when: 'beforeChildren', staggerChildren: 0.2 }}
              className="w-full h-full bg-background/70 backdrop-blur-lg border-r border-border/40 shadow-xl overflow-hidden"
            >
              <Navigation mode="sidebar" isMobile={isMobile} />
            </motion.aside>
          </div>
        )}

        {/* Mobile Toggle Button (only shown when navigation is hidden on mobile) */}
        {isMobile && !shouldHideNavigation && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="fixed top-4 left-4 z-50 p-3 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </motion.button>
        )}

        {/* Main Content Area - Dynamic positioning based on navigation visibility */}
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={cn(
              'flex-1 min-h-full w-full transition-all duration-300 overflow-auto',
              // Position content next to navigation with fixed margin when navigation is shown
              !shouldHideNavigation ? 'ml-[300px]' : ''
            )}
            style={{
              width: !shouldHideNavigation ? 'calc(100% - 300px)' : '100%',
            }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </AuthGate>
  )
}
