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
                <Button variant="ghost" size="sm" onClick={() => window.open('https://discord.gg/wzF7xfjrKv', '_blank')}>
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
