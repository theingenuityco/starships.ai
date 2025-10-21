'use client'

import Icon from '@/components/primitives/Icon'
import Hero from '@/app/components/Hero'
import ProductModel from '@/app/components/ProductModel'
import InteractiveDemo from '@/app/components/InteractiveDemo'
import UseCases from '@/app/components/UseCases'
import ProblemOutcome from '@/app/components/ProblemOutcome'
import HowItWorks from '@/app/components/HowItWorks'
import Integrations from '@/app/components/Integrations'
import Security from '@/app/components/Security'
import PricingTeaser from '@/app/components/PricingTeaser'
import FAQ from '@/app/components/FAQ'
import FinalCTA from '@/app/components/FinalCTA'

import { LoginButton } from '@/components/auth/LoginButton'
import { StarTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

// Legacy components removed for a cleaner landing

export default function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-background relative overflow-x-hidden">
        {/* Minimal top bar; removed legacy background/handlers */}
        {/* Top Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 z-50 p-6">
          <div className="flex justify-between items-center">
            <div></div>

            {/* Right side buttons */}
            <div className="flex gap-4">
              {!isAuthenticated && (
                <LoginButton size="default" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-full">
                  Login
                </LoginButton>
              )}
            </div>
          </div>
        </div>

        {/* New Landing Sections */}
        <Hero />
        <ProblemOutcome />
        <ProductModel />
        <InteractiveDemo />
        <UseCases />
        <HowItWorks />
        <Integrations />
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
                  <Icon name="user" className="w-4 h-4 mr-2" />
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
