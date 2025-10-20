'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant, getCtaVariant } from '@/lib/flags'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import POPULAR_BLUEPRINTS from '@/components/marketplace/popularBlueprints'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import { Orbitron } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400'] })

export default function Hero() {
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

  const handleLaunchDemo = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    const el = document.getElementById('interactive-demo')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <section className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        <div>
          <div className="mb-6 flex items-center gap-3 cursor-pointer select-none" onClick={() => setLogoTrigger(v => v + 1)} title="Animate logo">
            <StarshipsLogo width={56} height={56} className="text-foreground" idleLoop={false} playOnMountOnce triggerAnimation={logoTrigger} />
            <span className={`${orbitron.className} text-3xl md:text-4xl font-normal tracking-tight`}>starships.ai</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'From prompt to production agent—without brittle glue'
              if (v === 'C') return 'Build, run, and trust AI automations'
              return 'Ship production AI agents fast'
            })()}
          </h1>
          <p className="text-lg text-muted-foreground mb-6 leading-relaxed">Design agent behavior, connect tools safely, and run with observability and guardrails—on a production-ready runtime.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            {(() => {
              const c = getCtaVariant()
              const label = c === 'B' ? 'See it run' : 'Launch interactive demo'
              return (
                <Button size="lg" className="px-7" onClick={handleLaunchDemo}>
                  <Icon name="play" className="w-4 h-4 mr-2" />
                  {label}
                </Button>
              )
            })()}
            <Button
              size="lg"
              variant="outline"
              className="px-7"
              onClick={() => {
                window.open('mailto:team@starships.ai?subject=Walkthrough%20request', '_blank')
              }}
            >
              <Icon name="calendar" className="w-4 h-4 mr-2" />
              Book a walkthrough
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-6 opacity-90">
            <div className="text-sm text-muted-foreground">Guardrails built-in • Production runner • Deep visibility</div>
          </div>
        </div>

        {/* Visualization: viewport removed; styles moved into visualization */}
        <div className="relative h-[560px]">
          <BlueprintVisualization
            blueprint={popularBlueprints[blueprintIndex]?.blueprint || { nodes: [], edges: [] }}
            className="absolute inset-0 rounded-2xl shadow-2xl"
            containerClassName="rounded-lg bg-black/30 border border-white/10"
            containerStyle={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.14) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.14) 0%, transparent 40%), linear-gradient(135deg, rgba(17,24,39,0.85) 0%, rgba(2,6,23,0.85) 100%)',
            }}
            transparent
            nodesDraggable={false}
            borderless
          />
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs bg-black/40 border border-white/15 text-white/90">{popularBlueprints[blueprintIndex]?.name}</div>
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
