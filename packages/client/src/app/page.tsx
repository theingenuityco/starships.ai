'use client'

import Icon from '@/components/primitives/Icon'
import Hero from '@/app/components/Hero'
import UseCases from '@/app/components/UseCases'
import Security from '@/app/components/Security'
import PricingTeaser from '@/app/components/PricingTeaser'
import FAQ from '@/app/components/FAQ'
import FinalCTA from '@/app/components/FinalCTA'
import MarketplaceTeaser from '@/app/components/MarketplaceTeaser'
import StarryBackground from '@/app/components/StarryBackground'
import BackToTop from '@/app/components/BackToTop'

import { StarTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import PublicHeader from '@/components/navigation/PublicHeader'
import { useEffect, useState, Suspense } from 'react'
import { Orbitron } from 'next/font/google'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

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
      <div className="min-h-[100dvh] bg-background relative overflow-x-hidden">
        <StarryBackground />
        <PublicHeader />

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
          {/* Bottom gradient fade - same as login screen */}
          <div
            className="absolute bottom-0 left-0 right-0 h-screen pointer-events-none -z-10"
            style={{
              backgroundImage: [
                // Core bottom glow - purple/violet (brightest)
                'radial-gradient(ellipse 1000px 700px at 50% 100%, rgba(168,85,247,0.65), transparent 65%)',
                // Secondary layer - blue/purple blend
                'radial-gradient(ellipse 1200px 850px at 50% 102%, rgba(139,92,246,0.50), transparent 70%)',
                // Outer spread - indigo/blue
                'radial-gradient(ellipse 1400px 1000px at 50% 105%, rgba(99,102,241,0.38), transparent 75%)',
                // Soft cyan accent
                'radial-gradient(ellipse 1300px 950px at 50% 103%, rgba(59,130,246,0.28), transparent 72%)',
                // Farthest fade - subtle purple
                'radial-gradient(ellipse 1600px 1150px at 50% 108%, rgba(124,58,237,0.18), transparent 78%)',
              ].join(', '),
            }}
          />
          {/* Gradient horizontal line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="max-w-6xl mx-auto relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="mb-6 md:mb-0 text-center md:text-left">
                <p className="text-muted-foreground mb-2">© 2025 Starships.ai - Where Ideas meet Intelligence</p>
                <p className="text-muted-foreground text-sm">
                  🪐 Manifested by{' '}
                  <a href="https://theingenuity.co" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">
                    The Ingenuity Co
                  </a>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => window.open('/docs', '_blank')}>
                  <Icon name="book" className="w-4 h-4 mr-2" />
                  Documentation
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/privacy">Privacy Policy</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/terms">Terms &amp; Conditions</Link>
                </Button>
                <BackToTop />
              </div>
            </div>
          </div>
        </footer>
      </div>
    </StarTheme>
  )
}
