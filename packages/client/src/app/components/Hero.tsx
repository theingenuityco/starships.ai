'use client'

import { Textarea } from '@/components/ui/textarea'
import { useCallback, useEffect, useState } from 'react'
import HeroMarketplaceCarousel from '@/app/components/HeroMarketplaceCarousel'
import { HeroCtaButton } from '@/app/components/HeroCtaButton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { AgentTemplateModel } from '@starships/protocol'

export default function Hero(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []

  // Landing hero input + agent selection state
  const [selectedAgentTemplate, setSelectedAgentTemplate] = useState<AgentTemplateModel | null>(null)
  const [heroInputValue, setHeroInputValue] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleAgentSelection = useCallback((template: AgentTemplateModel) => {
    setSelectedAgentTemplate(prev => {
      if (prev?.id === template.id) return prev
      setHeroInputValue('')
      return template
    })
  }, [])

  const selectedAgentName = String(selectedAgentTemplate?.name || '').trim() || 'this agent'
  const defaultPlaceholder = selectedAgentTemplate
    ? `Describe what you want ${selectedAgentName} to research, plan, or execute…`
    : 'Describe what you want an agent to research, plan, or execute…'
  const examplePrompts = (selectedAgentTemplate?.previewPrompts ?? []).filter(Boolean)
  const [tryPromptsOpen, setTryPromptsOpen] = useState(false)

  return (
    <section className="min-h-[100dvh] flex items-center px-4 sm:px-6 py-16 sm:py-20">
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10 items-center text-center">
        <div className="w-full min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-4 w-full max-w-[42ch] mx-auto break-words text-balance">
            Team chat, powered by{' '}
            <span className="warp-word" data-text="ai">
              <span className="warp-letter">A</span>
              <span className="warp-letter">I</span>
            </span>{' '}
            <span className="warp-word" data-text="agents">
              <span className="warp-letter">a</span>
              <span className="warp-letter">g</span>
              <span className="warp-letter">e</span>
              <span className="warp-letter">n</span>
              <span className="warp-letter">t</span>
              <span className="warp-letter">s</span>
            </span>
            .
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 md:mb-12 leading-relaxed w-full max-w-[72ch] mx-auto text-balance break-words">
            Chat with your team, delegate work to agents, and ship faster across your tools.
          </p>
          <div className="flex flex-col items-center gap-8 justify-center w-full min-w-0">
            <div className="w-full max-w-3xl mx-auto flex flex-col gap-2 items-stretch text-left">
              {/* Single input box: arrow button inside with padding from edges (match reference) */}
              <div className="relative min-h-[148px] rounded-xl border border-border/60 bg-background/80 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
                <Textarea
                  value={heroInputValue}
                  onChange={event => setHeroInputValue(event.target.value)}
                  rows={3}
                  placeholder={defaultPlaceholder}
                  className="min-h-[148px] w-full rounded-xl border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 pl-5 pr-14 pt-5 pb-4 text-sm sm:text-base resize-none placeholder:text-muted-foreground/80"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Submit"
                >
                  <span className="text-lg leading-none">↑</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 px-1">
                <Popover open={tryPromptsOpen} onOpenChange={setTryPromptsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      disabled={examplePrompts.length === 0}
                    >
                      Try these prompts
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(calc(100vw-2rem),28rem)] p-2" align="start">
                    <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
                      {examplePrompts.map((prompt, i) => (
                        <button
                          key={i}
                          type="button"
                          className="text-left text-sm px-3 py-2 rounded-md hover:bg-muted line-clamp-2"
                          onClick={() => {
                            setHeroInputValue(prompt)
                            setTryPromptsOpen(false)
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <HeroMarketplaceCarousel
              initialAgentTemplates={initialAgentTemplates}
              autoPlay={false}
              onSelectionChange={handleAgentSelection}
            />
            {mounted ? <HeroCtaButton /> : <div className="h-14 w-64 max-w-[22rem] animate-pulse rounded-full bg-muted" />}
          </div>
        </div>
      </div>
      <style jsx>{`
        .warp-word {
          display: inline-block;
          gap: 0;
          position: relative;
          /* Ensure warped text matches surrounding headline typography */
          font-size: 1em;
          font-weight: inherit;
          line-height: inherit;
          vertical-align: baseline;

          overflow: visible;
          /*
            Prevent descenders (e.g. "y") from clipping without inflating multi-line spacing:
            add a little extra bottom room, then cancel it out with a negative margin.
          */
          padding-bottom: 0.14em;
          margin-bottom: -0.14em;
        }

        .warp-letter {
          display: inline-block;
          overflow: visible;
          font-size: 1em;
          font-weight: inherit;
          line-height: inherit;
          --warp-delay: 0ms;
          animation:
            warp-letter-in 640ms cubic-bezier(0.22, 1, 0.36, 1) var(--warp-delay) both,
            /* Keep these independent of per-letter entry delay */
            gradient-shift 8s ease-in-out 1.2s infinite,
            warp-blur 3.6s ease-in-out 1.3s infinite,
            /* Continuous subtle warping after entry finishes */
            warp-wobble 4.2s ease-in-out calc(700ms + var(--warp-delay)) infinite;
          will-change: transform, opacity, filter, background-position;
          background: linear-gradient(120deg, rgba(168, 85, 247, 0.95) 0%, rgba(139, 92, 246, 0.9) 35%, rgba(124, 58, 237, 0.9) 70%, rgba(168, 85, 247, 0.95) 100%);
          background-size: 250% 250%;
          color: transparent;
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
        }

        .warp-letter:nth-child(1) {
          --warp-delay: 0ms;
        }
        .warp-letter:nth-child(2) {
          --warp-delay: 60ms;
        }
        .warp-letter:nth-child(3) {
          --warp-delay: 120ms;
        }
        .warp-letter:nth-child(4) {
          --warp-delay: 180ms;
        }
        .warp-letter:nth-child(5) {
          --warp-delay: 240ms;
        }
        .warp-letter:nth-child(6) {
          --warp-delay: 300ms;
        }
        .warp-letter:nth-child(7) {
          --warp-delay: 360ms;
        }
        .warp-letter:nth-child(8) {
          --warp-delay: 420ms;
        }
        .warp-letter:nth-child(9) {
          --warp-delay: 480ms;
        }

        @keyframes warp-letter-in {
          0% {
            opacity: 0;
            transform: translateY(14px) scaleX(1.5) skewX(-14deg);
            filter: blur(8px);
            text-shadow:
              10px 0 rgba(168, 85, 247, 0.28),
              -10px 0 rgba(139, 92, 246, 0.22),
              18px 0 rgba(124, 58, 237, 0.14),
              -18px 0 rgba(168, 85, 247, 0.12);
          }
          45% {
            opacity: 1;
            transform: translateY(0) scaleX(0.94) skewX(3deg);
            filter: blur(1px);
            text-shadow:
              6px 0 rgba(168, 85, 247, 0.18),
              -6px 0 rgba(139, 92, 246, 0.14);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleX(1) skewX(0deg);
            filter: blur(0);
            text-shadow: none;
          }
        }

        /* Remove pseudo-element overlays to prevent background bleed */

        @keyframes gradient-shift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        /* Gentle continuous "warp" motion once letters are in */
        @keyframes warp-wobble {
          0%,
          100% {
            transform: translateY(0) scaleX(1) skewX(0deg);
          }
          25% {
            transform: translateY(-1px) scaleX(0.985) skewX(1.2deg);
          }
          50% {
            transform: translateY(0.5px) scaleX(1.015) skewX(-1.2deg);
          }
          75% {
            transform: translateY(-0.5px) scaleX(0.995) skewX(0.6deg);
          }
        }

        /* Subtle pulsating blur inside the glyphs */
        @keyframes warp-blur {
          0%,
          100% {
            filter: blur(0);
          }
          45% {
            filter: blur(1.6px);
          }
          50% {
            filter: blur(3px);
          }
          55% {
            filter: blur(1.6px);
          }
        }

        /* No outer glow – keep all effects inside glyphs */

        @media (prefers-reduced-motion: reduce) {
          .warp-letter {
            animation: none;
          }
          .warp-word {
          }
        }

        /* Glow styles moved to global CSS for earlier paint */
      `}</style>
    </section>
  )
}
