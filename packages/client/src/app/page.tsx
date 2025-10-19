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
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { toast } from '@/hooks/useToast'
import { motion } from 'motion/react'
import { memo, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

// System component cards
const SystemCard = memo(({ icon, title, description, accent = false, imageContent }: { icon: string; title: string; description: string; accent?: boolean; imageContent?: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    whileHover={{ y: -5, transition: { duration: 0.2 } }}
    className="group max-w-2xl mx-auto"
  >
    <Card
      className={`p-8 bg-white/5 backdrop-blur-md border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 relative overflow-hidden ${accent ? 'ring-1 ring-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent' : 'bg-gradient-to-br from-white/5 via-white/3 to-transparent'}`}
    >
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-3 rounded-lg ${accent ? 'bg-primary/20' : 'bg-white/10'} group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm`}>
              <Icon name={icon} className={`w-7 h-7 ${accent ? 'text-primary' : 'text-white/70'} group-hover:text-primary transition-colors`} />
            </div>
            <h3 className="font-semibold text-xl group-hover:text-primary transition-colors">{title}</h3>
          </div>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </div>
        {imageContent && <div className="flex justify-center">{imageContent}</div>}
      </div>
    </Card>
  </motion.div>
))

SystemCard.displayName = 'SystemCard'

// Component to handle URL parameters with Suspense boundary
function UrlParamHandler() {
  const [mounted, setMounted] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle email verification success toast after component is mounted
  useEffect(() => {
    if (!mounted) return

    // Check for email verification success parameter
    const verification = searchParams?.get('verification')
    if (verification === 'success') {
      // Show success toast notification
      toast({
        title: 'Email Verified Successfully!',
        description: 'Your email address has been verified. You can now access your account.',
        variant: 'success',
        duration: 5000,
      })

      // Clean up the URL parameter without triggering a page reload
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('verification')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [mounted, searchParams])

  return null
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const { isAuthenticated, isLoading, userId } = useAuth()

  // Use TanStack Query to fetch starships - only when authenticated
  const { data: starships = [] } = useUserStarships(userId || '', !!userId && isAuthenticated)

  const hasExistingStarships = starships.length > 0

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || isLoading) return null

  const handleLaunch = () => {
    // Don't reset launching state - let it continue until page unloads
    setTimeout(() => {
      if (isAuthenticated) {
        // If user has starships, redirect to first one, otherwise stay on main page to create
        if (hasExistingStarships && starships && starships.length > 0) {
          window.location.href = `/ship/${starships[0].slug}/conversations`
        } else {
          // Stay on current page - they can create a starship here
        }
      } else {
        // Trigger login
        const loginButton = document.querySelector('[data-login-button]') as HTMLButtonElement
        if (loginButton) loginButton.click()
      }
    }, 1000)
  }

  const triggerWarpThenLaunch = () => {
    const btn = document.querySelector('[data-warp-trigger]') as HTMLButtonElement | null
    if (btn) {
      btn.click()
    } else {
      handleLaunch()
    }
  }

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden">
        <Suspense fallback={null}>
          <UrlParamHandler />
        </Suspense>
        {/* Background removed */}
        {/* Top Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 z-50 p-6">
          <div className="flex justify-between items-center">
            {/* Logo/Brand (empty div for spacing) */}
            <div></div>

            {/* Right side buttons */}
            <div className="flex gap-4">
              {!isAuthenticated && (
                <LoginButton size="default" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-full">
                  Login
                </LoginButton>
              )}
              <Button variant="outline" size="default" className="px-6 py-2 rounded-full backdrop-blur-sm border-white/20 text-white hover:bg-white/10" onClick={() => window.open('/docs', '_blank')}>
                <Icon name="book" className="w-4 h-4 mr-2" />
                View Documentation
              </Button>
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

        {/* Single overlay covering Ready to Launch and Footer sections */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent backdrop-blur-md z-0" style={{ height: '85vh' }} />

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
