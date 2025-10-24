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
import { useEffect, useState } from 'react'
import { Orbitron } from 'next/font/google'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

// Legacy components removed for a cleaner landing

export default function HomePage() {
  const [logoTrigger, setLogoTrigger] = useState(0)
  const pathname = usePathname()
  const router = useRouter()
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

  // Trigger a one-off logo entry animation after a short delay while keeping default static state
  useEffect(() => {
    const t = setTimeout(() => setLogoTrigger(v => v + 1), 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-background relative overflow-x-hidden">
        {/* Top-left logo with same animation as before */}
        <div
          className="fixed top-8 left-8 z-50 cursor-pointer select-none"
          onClick={() => {
            setLogoTrigger(v => v + 1)
            router.push('/')
          }}
          title="Animate logo"
        >
          <div className="flex items-center gap-2">
            <StarshipsLogo width={32} height={32} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
            <span className={`${orbitron.className} text-xl md:text-2xl font-normal tracking-tight`}>starships.ai</span>
          </div>
        </div>

        {/* Top-right navigation items */}
        <nav className="fixed top-8 right-8 z-50 flex items-center gap-6 text-sm">
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
