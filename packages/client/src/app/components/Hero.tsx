'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant, getCtaVariant } from '@/lib/flags'

export default function Hero() {
  const handleLaunchDemo = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    const el = document.getElementById('interactive-demo')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <section className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <div>
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

        <div className="relative">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Autopilot Runner</span>
              </div>
              <span className="text-xs text-muted-foreground">Observability</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded bg-black/20">
                <div className="flex items-center gap-2">
                  <Icon name="workflow" className="w-4 h-4 text-white/60" />
                  Plan generated
                </div>
                <span className="text-xs text-white/50">42ms</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-black/20">
                <div className="flex items-center gap-2">
                  <Icon name="globe" className="w-4 h-4 text-white/60" />
                  web.search("acme partners")
                </div>
                <span className="text-xs text-white/50">1.2s</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-black/20">
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4 text-emerald-400" />
                  Guardrail: PII-check passed
                </div>
                <span className="text-xs text-white/50">0ms</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-black/20">
                <div className="flex items-center gap-2">
                  <Icon name="database" className="w-4 h-4 text-white/60" />
                  db.enrich(company)
                </div>
                <span className="text-xs text-white/50">840ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
