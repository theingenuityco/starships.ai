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

        {/* Mock desktop window with blueprint (top) and chat (bottom) */}
        <div className="relative">
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-lg">
            {/* Window top bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-black/30 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <div className="text-xs text-white/70">Starships • Blueprint & Chat</div>
              <div className="w-10" />
            </div>

            {/* Content area: blueprint on top, chat below */}
            <div className="grid grid-rows-[1fr_auto] md:grid-rows-[320px_240px]">
              {/* Blueprint panel */}
              <div className="p-4 bg-black/20 border-b border-white/10 overflow-auto">
                <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Blueprint</div>
                <div className="rounded-lg bg-black/30 border border-white/10 p-3 font-mono text-xs leading-relaxed text-white/90">
                  <div>// agent: Data Enrichment</div>
                  <div>goals:</div>
                  <div className="pl-4">- fetch recent news for company</div>
                  <div className="pl-4">- extract partners and funding</div>
                  <div className="pl-4">- write normalized profile</div>
                  <div>tools:</div>
                  <div className="pl-4">- web.search(q)</div>
                  <div className="pl-4">- db.enrich(entity)</div>
                  <div>guardrails:</div>
                  <div className="pl-4">- PII-check: pass required</div>
                  <div className="pl-4">- retry-policy: 2 attempts</div>
                </div>
              </div>

              {/* Chat panel */}
              <div className="p-4 bg-black/10">
                <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Chat</div>
                <div className="space-y-2 max-h-56 overflow-auto pr-1">
                  <div className="flex gap-2">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-white/20" />
                    <div className="rounded-lg bg-white/10 px-3 py-2 text-sm">Can you enrich Acme and list recent partners?</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-primary/40" />
                    <div className="rounded-lg bg-primary/15 px-3 py-2 text-sm">Sure — I will search the web, extract entities, apply guardrails, and update the profile.</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input placeholder="Ask about this blueprint..." className="flex-1 rounded-md bg-black/20 border border-white/10 px-3 py-2 text-sm outline-none" />
                  <Button size="sm" className="px-4">
                    <Icon name="paper-plane-right" className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
