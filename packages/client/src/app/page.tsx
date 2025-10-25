'use client'

import Icon from '@/components/primitives/Icon'
import Hero from '@/app/components/Hero'
import UseCases from '@/app/components/UseCases'
import Security from '@/app/components/Security'
import PricingTeaser from '@/app/components/PricingTeaser'
import FAQ from '@/app/components/FAQ'
import FinalCTA from '@/app/components/FinalCTA'
import MarketplaceTeaser from '@/app/components/MarketplaceTeaser'

import { StarTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { useEffect, useState, Suspense } from 'react'
import { Orbitron } from 'next/font/google'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

// Legacy components removed for a cleaner landing

function SearchParamsHandler() {
  const searchParams = useSearchParams()

  // Store verification success flag for later (after login)
  useEffect(() => {
    if (searchParams?.get('verification') === 'success') {
      // Store flag so modal will show AFTER user logs in
      if (typeof window !== 'undefined') {
        localStorage.setItem('starships_pending_welcome', 'true')
      }
    }
  }, [searchParams])

  return null
}

export default function HomePage() {
  const [logoTrigger, setLogoTrigger] = useState(0)
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Trigger a one-off logo entry animation after a short delay while keeping default static state
  useEffect(() => {
    const t = setTimeout(() => setLogoTrigger(v => v + 1), 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <StarTheme theme="dark">
      <Suspense fallback={null}>
        <SearchParamsHandler />
      </Suspense>
      <div className="min-h-[100dvh] bg-background relative overflow-x-hidden">
        {/* Header: logo + navigation aligned */}
        <header className="fixed top-4 sm:top-8 left-0 right-0 z-50">
          <div className="px-4 sm:px-8 flex items-center justify-between h-8">
            <div
              className="cursor-pointer select-none h-8 flex items-center"
              onClick={() => {
                setLogoTrigger(v => v + 1)
                router.push('/')
              }}
              title="Animate logo"
            >
              <div className="flex items-center gap-2">
                <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
                <span className={`${orbitron.className} text-xl md:text-2xl font-normal tracking-tight leading-none hidden md:inline`}>starships.ai</span>
              </div>
            </div>

            <nav className="hidden sm:flex items-center gap-3 md:gap-6 text-sm leading-none">
              <Link
                href="/"
                className={`hidden md:inline ${pathname === '/' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
                aria-current={pathname === '/' ? 'page' : undefined}
              >
                Home
              </Link>
              <Link
                href="/marketplace"
                className={`${pathname.startsWith('/marketplace') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
                aria-current={pathname.startsWith('/marketplace') ? 'page' : undefined}
              >
                Marketplace
              </Link>
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className={`${pathname.startsWith('/docs') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}
                aria-current={pathname.startsWith('/docs') ? 'page' : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  <span className="hidden md:inline">Documentation</span>
                  <span className="inline md:hidden">Docs</span>
                  <Icon name="external-link" className="w-3 h-3 opacity-80" />
                </span>
              </a>
            </nav>

            {/* Mobile menu toggle */}
            <div className="sm:hidden relative">
              <button
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(v => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card/60 backdrop-blur hover:bg-accent text-foreground"
              >
                <Icon name={mobileMenuOpen ? 'x' : 'menu'} className="w-4 h-4" />
              </button>

              {mobileMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg p-1 z-[60]">
                  <Link
                    href="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-sm ${pathname === '/' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                  >
                    Home
                  </Link>
                  <Link
                    href="/marketplace"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-sm ${pathname.startsWith('/marketplace') ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                  >
                    Marketplace
                  </Link>
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    Docs
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* New Landing Sections */}
        <Hero />
        <UseCases />
        <MarketplaceTeaser />
        <Security />
        <PricingTeaser />
        <FAQ />
        <FinalCTA />

        {/* Replaced old CTA with FinalCTA component above */}

        {/* Footer */}
        <footer className="py-16 px-4 relative z-10">
          {/* Gradient horizontal line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="max-w-6xl mx-auto relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-6 md:mb-0 text-center md:text-left">
                <p className="text-muted-foreground mb-2">© 2025 Starships.ai - Where Ideas meet Intelligence</p>
                <p className="text-muted-foreground text-sm">
                  🪐 Manifested by{' '}
                  <a href="https://theingenuity.co" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">
                    The Ingenuity Co
                  </a>
                </p>
              </div>
              <div className="flex space-x-6">
                <Button variant="ghost" size="sm" onClick={() => window.open('/docs', '_blank')}>
                  <Icon name="book" className="w-4 h-4 mr-2" />
                  Documentation
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.open('https://discord.gg/HjAXxpsV', '_blank')}>
                  <Icon name="discord" className="w-4 h-4 mr-2" />
                  Discord
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </StarTheme>
  )
}
