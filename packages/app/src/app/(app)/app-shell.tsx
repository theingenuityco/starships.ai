'use client'

import { JwtAuthGate } from '@/components/auth/JwtAuthGate'
import { EmailChangeToastHandler } from '@/components/global/EmailChangeToastHandler'
import { NotificationSoundBootstrap } from '@/components/global/NotificationSoundBootstrap'
import { Navigation } from '@/components/navigation/Navigation'
import { MobileNavProvider } from '@/components/navigation/MobileNavContext'
import { StarTheme } from '@/components/theme-context'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [isMobile, setIsMobile] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!isMobile) return
    setShowMobileMenu(false)
  }, [pathname, isMobile])

  return (
    <JwtAuthGate>
      <StarTheme>
        <NotificationSoundBootstrap />
        <Suspense fallback={null}>
          <EmailChangeToastHandler />
        </Suspense>
        <MobileNavProvider
          value={{
            isMobile,
            isOpen: showMobileMenu,
            open: () => setShowMobileMenu(true),
            close: () => setShowMobileMenu(false),
            toggle: () => setShowMobileMenu(v => !v),
          }}
        >
          <div className="relative h-[100dvh] flex overflow-hidden bg-card">
            {/* Desktop nav */}
            {!isMobile ? (
              <div className="flex-shrink-0 relative z-50">
                <aside className="relative h-full">
                  <Navigation isMobile={false} isOpen={true} />
                </aside>
              </div>
            ) : null}

            {/* Mobile overlay nav */}
            {isMobile ? <Navigation isMobile={true} isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} /> : null}

            {/* Main content */}
            <div className="flex-1 min-h-0 min-w-0 p-0 md:p-4">
              <div className="h-full w-full overflow-hidden bg-background md:rounded-2xl md:border md:border-border/60 md:shadow-sm">
                <main className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar pb-[calc(env(safe-area-inset-bottom,0px))]">
                  {children}
                </main>
              </div>
            </div>
          </div>
        </MobileNavProvider>
      </StarTheme>
    </JwtAuthGate>
  )
}

