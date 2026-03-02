'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentTemplateModel } from '@starships/protocol'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/analytics'

function normalize(s: unknown) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

export type HeroMarketplaceCarouselViewProps = {
  agentTemplates: AgentTemplateModel[]
  agentTemplatesLoading?: boolean
  autoPlay?: boolean
  onSelectionChange?: (template: AgentTemplateModel) => void
}

/** Presentational carousel only. No React Query / no useAgentTemplates. Safe to use during SSR. */
export function HeroMarketplaceCarouselView({ agentTemplates, agentTemplatesLoading = false, autoPlay = true, onSelectionChange }: HeroMarketplaceCarouselViewProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [selectedSnapIndex, setSelectedSnapIndex] = useState(0)

  const CARD_W = 136
  const CARD_W_SM = 152
  const CARD_W_MD = 176
  const [cardsPerView, setCardsPerView] = useState(5)

  useEffect(() => {
    const compute = (containerWidth: number) => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024
      const cardW = w >= 768 ? CARD_W_MD : w >= 640 ? CARD_W_SM : CARD_W
      const gap = w >= 640 ? 8 : 4
      const effective = cardW + gap
      const count = Math.max(1, Math.floor((containerWidth + gap) / effective))
      return Math.min(16, count)
    }

    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width ?? el.getBoundingClientRect().width
      setCardsPerView(compute(width))
    })
    ro.observe(el)
    setCardsPerView(compute(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const featuredAgents = useMemo(() => {
    const wanted = ['Aria', 'Iris', 'Saga']
    const picked: typeof agentTemplates = []

    for (const name of wanted) {
      const n = normalize(name)
      const found = agentTemplates.find(t => normalize(t.name) === n) ?? agentTemplates.find(t => normalize(t.slug) === n) ?? agentTemplates.find(t => normalize(t.name).includes(n))
      if (found && !picked.some(p => p.id === found.id)) picked.push(found)
    }

    for (const t of agentTemplates) {
      if (picked.length >= 64) break
      if (!picked.some(p => p.id === t.id)) picked.push(t)
    }

    const templates = picked.slice(0, 64)
    if (templates.length === 0) return { templates: [], slideCount: 0 }

    const minSlides = Math.min(64, Math.max(cardsPerView * 6, cardsPerView + 8))
    const slideCount = Math.max(templates.length, minSlides)
    return { templates, slideCount }
  }, [agentTemplates, cardsPerView])

  useEffect(() => {
    if (!carouselApi || featuredAgents.templates.length === 0) return

    const notify = () => {
      try {
        const snap = carouselApi.selectedScrollSnap()
        const n = featuredAgents.templates.length
        const idx = snap % n
        setSelectedSnapIndex(snap)
        const template = featuredAgents.templates[idx]
        if (template && onSelectionChange) onSelectionChange(template)
      } catch {
        /* ignore */
      }
    }

    notify()
    carouselApi.on('select', notify)
    return () => {
      carouselApi.off('select', notify)
    }
  }, [carouselApi, featuredAgents.templates, onSelectionChange])

  useEffect(() => {
    if (!carouselApi || !autoPlay) return

    const AUTO_PLAY_MS = 6500
    const id = setInterval(() => {
      if (isHovering) return
      try {
        carouselApi.scrollNext()
      } catch {}
    }, AUTO_PLAY_MS)

    return () => clearInterval(id)
  }, [autoPlay, carouselApi, isHovering])

  const handleAgentClick = (template: AgentTemplateModel) => {
    track({
      type: 'marketplace_agent_template_opened',
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      source: 'landing_hero_carousel',
    })
    router.push(`/explore/agents/${encodeURIComponent(template.slug)}`)
  }

  return (
    <div ref={containerRef} className="w-full max-w-6xl mx-auto mt-4 sm:mt-6 mb-14 sm:mb-16">
      <Carousel
        className="w-full px-2 sm:px-4 md:px-8"
        opts={{ loop: true, align: 'center' }}
        setApi={setCarouselApi}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <CarouselContent className="!-ml-1 sm:!-ml-2">
          {agentTemplatesLoading
            ? [...Array(cardsPerView)].map((_, idx) => (
                <CarouselItem key={idx} className="basis-auto w-[136px] sm:w-[152px] md:w-[176px] !pl-1 sm:!pl-2">
                  <div className="w-full rounded-2xl border border-border/50 bg-muted/10 p-1.5 pointer-events-none">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                        <Skeleton className="w-full h-full rounded-2xl" />
                      </div>
                      <div className="min-w-0 w-full px-1 text-left">
                        <Skeleton className="h-4 w-24 rounded-md" />
                        <Skeleton className="mt-1 h-3 w-16 rounded-md" />
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))
            : Array.from({ length: featuredAgents.slideCount }, (_, idx) => {
                const template = featuredAgents.templates[idx % featuredAgents.templates.length]!
                const name = String(template.name ?? '').trim()
                const role = String(template.role ?? '').trim()
                const primaryLabel = role || String(template.category ?? '').trim() || String(template.slug ?? '').trim() || name
                const avatarUrl = template.avatarUrl
                const isActive = idx === selectedSnapIndex

                return (
                  <CarouselItem key={`${template.id}-${idx}`} className="basis-auto w-[136px] sm:w-[152px] md:w-[176px] !pl-1 sm:!pl-2">
                    <button
                      type="button"
                      onClick={() => handleAgentClick(template)}
                      className={`group w-full rounded-2xl border bg-muted/10 hover:bg-muted/20 transition-colors text-left p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'border-primary/70 ring-2 ring-primary/60 shadow-md shadow-primary/20' : 'border-border/50'}`}
                      aria-label={`View ${name}${primaryLabel ? ` (${primaryLabel})` : ''} details`}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                          <AgentAvatar seed={name} imageUrl={avatarUrl} instanceId={`hero-marketplace-${template.id}-${idx}`} fill clip className="w-full h-full rounded-2xl" />
                        </div>
                        <div className="min-w-0 w-full px-1 text-left">
                          <div className="text-sm font-semibold leading-tight truncate max-w-[20ch]">{primaryLabel}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground leading-tight truncate max-w-[18ch]">{name}</div>
                        </div>
                      </div>
                    </button>
                  </CarouselItem>
                )
              })}
        </CarouselContent>
        <CarouselPrevious className="hidden md:inline-flex" />
        <CarouselNext className="hidden md:inline-flex" />
      </Carousel>
    </div>
  )
}
