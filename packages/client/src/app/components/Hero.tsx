'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant, getCtaVariant } from '@/lib/flags'
import { BlueprintVisualization } from '@/components/marketplace/BlueprintVisualization'
import { ConversationMessageInput } from '@/components/conversation/ConversationMessageInput'

export default function Hero() {
  const handleLaunchDemo = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    const el = document.getElementById('interactive-demo')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <section className="pt-28 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
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

        {/* Mock desktop - wallpaper container (window wrapper removed) */}
        <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl h-[720px]">
          {/* Wallpaper layer */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.14) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.14) 0%, transparent 40%), linear-gradient(135deg, rgba(17,24,39,0.85) 0%, rgba(2,6,23,0.85) 100%)',
            }}
          />
          <div className="relative h-full flex items-center justify-center">
            <div className="mx-auto max-w-5xl w-full">
              {/* Content area: blueprint with wrapper and no padding */}
              <div className="relative rounded-lg bg-black/30 border border-white/10 w-full overflow-hidden">
                <BlueprintVisualization
                  blueprint={{
                    nodes: [
                      { ref: 's', type: 'start', name: 'Start', description: '', parameters: {} },
                      { ref: 'n1', type: 'user_prompt', name: 'User prompt', description: '', parameters: {} },
                      { ref: 'n2', type: 'llm', name: 'Plan', description: '', parameters: {} },
                      { ref: 'n3', type: 'http_request', name: 'web.search', description: '', parameters: {} },
                      { ref: 'n4', type: 'transform', name: 'PII-check', description: '', parameters: {} },
                      { ref: 'n5', type: 'tool', name: 'db.enrich', description: '', parameters: {} },
                      { ref: 'n6', type: 'output', name: 'Write profile', description: '', parameters: {} },
                      { ref: 'e', type: 'end', name: 'End', description: '', parameters: {} },
                    ],
                    edges: [
                      { ref: 'e0', from: 's', to: 'n1' },
                      { ref: 'e1', from: 'n1', to: 'n2' },
                      { ref: 'e2', from: 'n2', to: 'n3' },
                      { ref: 'e3', from: 'n3', to: 'n4' },
                      { ref: 'e4', from: 'n4', to: 'n5' },
                      { ref: 'e5', from: 'n5', to: 'n6' },
                      { ref: 'e6', from: 'n6', to: 'e' },
                    ],
                  }}
                  className="w-full h-[520px] md:h-[600px]"
                  transparent
                  nodesDraggable={false}
                  borderless
                />
                {/* Floating input overlay (scoped to wrapper to avoid overflow) */}
                <div className="pointer-events-none absolute left-0 right-0 bottom-6 md:bottom-8 p-4 md:p-6">
                  <div className="max-w-2xl mx-auto pointer-events-auto">
                    <ConversationMessageInput starshipId="" minimal disabled={false} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
