'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant } from '@/lib/flags'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import POPULAR_BLUEPRINTS from '@/components/marketplace/popularBlueprints'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Orbitron } from 'next/font/google'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export default function Hero() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = starships[0]

  const [blueprintIndex, setBlueprintIndex] = useState(0)
  const popularBlueprints = useMemo(() => POPULAR_BLUEPRINTS, [])
  const [logoTrigger, setLogoTrigger] = useState(0)

  useEffect(() => {
    if (!popularBlueprints.length) return
    const interval = setInterval(() => {
      setBlueprintIndex(prev => (prev + 1) % popularBlueprints.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [popularBlueprints.length])

  // Trigger a one-off logo entry animation after a short delay while keeping default static state
  useEffect(() => {
    const t = setTimeout(() => setLogoTrigger(v => v + 1), 900)
    return () => clearTimeout(t)
  }, [])

  const handlePrimaryClick = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}/conversations`)
      return
    }
    router.push('/login')
  }, [isAuthenticated, primaryStarship?.slug, router])

  return (
    <section className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        <div>
          <div className="mb-6 flex items-center gap-3 cursor-pointer select-none" onClick={() => setLogoTrigger(v => v + 1)} title="Animate logo">
            <StarshipsLogo width={56} height={56} className="text-foreground" idleLoop={false} playOnMountOnce={false} triggerAnimation={logoTrigger} />
            <span className={`${orbitron.className} text-3xl md:text-4xl font-normal tracking-tight`}>starships.ai</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'From prompt to working agent—without brittle glue'
              if (v === 'C') return 'Design, run, and monitor AI automations'
              return 'Build automations at warp speed'
            })()}
          </h1>
          <p className="text-lg text-muted-foreground mb-6 leading-relaxed">Ship intelligent automations in minutes - safe, observable and fast.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="px-7" onClick={handlePrimaryClick}>
              <Icon name={isAuthenticated ? 'rocket' : 'user-plus'} className="w-4 h-4 mr-2" />
              {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Sign up'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-7"
              onClick={() => {
                window.open('/docs', '_blank')
              }}
            >
              <Icon name="book" className="w-4 h-4 mr-2" />
              View Docs
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">Get started for free • No credit card required • $20 credit on signup</div>
        </div>

        {/* Visualization: viewport removed; styles moved into visualization */}
        <div className="relative h-[560px] overflow-visible">
          {/* Tabs for switching blueprints */}
          <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 overflow-x-visible overflow-y-visible py-1 pointer-events-auto">
            {popularBlueprints.map((item, idx) => {
              const isActive = idx === blueprintIndex
              return (
                <button
                  key={item.name || idx}
                  onClick={() => setBlueprintIndex(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors duration-200 whitespace-nowrap shadow-frosted-lg frosted-glass-card ${
                    isActive ? 'bg-primary/15 ring-2 ring-primary/30 text-white font-semibold shadow-[0_6px_28px_rgba(var(--primary-rgb),0.35)]' : 'text-white/90 hover:bg-white/5'
                  }`}
                >
                  {item.name || `Blueprint ${idx + 1}`}
                </button>
              )
            })}
          </div>

          <BlueprintVisualization
            blueprint={popularBlueprints[blueprintIndex]?.blueprint || { nodes: [], edges: [] }}
            className="absolute inset-0 rounded-2xl shadow-2xl"
            containerClassName="rounded-lg bg-black/30 border border-white/10"
            containerStyle={{
              background:
                'radial-gradient(1000px 700px at 20% 20%, rgba(245, 158, 11, 0.16) 0%, transparent 58%), radial-gradient(1000px 700px at 80% 80%, rgba(217, 119, 6, 0.10) 0%, transparent 56%)',
            }}
            transparent
            nodesDraggable={false}
            borderless
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-6 md:bottom-8 px-4 md:px-6 z-40">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <ConversationMessageInput starshipId="" minimal disabled={false} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
