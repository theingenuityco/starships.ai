 'use client'
 
 import AgentAvatar from '@/components/animated/AgentAvatar'
 import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel'
 import { useAgentTemplates } from '@/hooks/useTemplates'
 import { useRouter } from 'next/navigation'
 import { useEffect, useMemo, useRef, useState } from 'react'
 
 function normalize(s: unknown) {
   return String(s ?? '').trim().toLowerCase()
 }
 
 export default function HeroMarketplaceCarousel() {
   const router = useRouter()
   const { data: agentTemplates = [], isLoading } = useAgentTemplates()
  const containerRef = useRef<HTMLDivElement | null>(null)
 
  // Fixed card widths (avoid percentage-based stretching on small screens)
  const CARD_W = 136
  const CARD_W_SM = 152
  const CARD_W_MD = 176

  // Keep the hero visually "full-width" by ensuring at least N cards render
  // for the current breakpoint (so the row is filled even if API returns few).
  const [cardsPerView, setCardsPerView] = useState(5)

  useEffect(() => {
    const compute = (containerWidth: number) => {
      const w = window.innerWidth
      // Match the Tailwind breakpoints that control slide width classes.
      const cardW = w >= 768 ? CARD_W_MD : w >= 640 ? CARD_W_SM : CARD_W
      // Match our slide padding (gap) below: !pl-1 on mobile, sm:!pl-2 on sm+
      const gap = w >= 640 ? 8 : 4
      const effective = cardW + gap
      const count = Math.max(1, Math.floor((containerWidth + gap) / effective))
      return Math.min(16, count)
    }

    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? el.getBoundingClientRect().width
      setCardsPerView(compute(width))
    })
    ro.observe(el)
    // Initial
    setCardsPerView(compute(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const featuredAgents = useMemo(() => {
     // Prefer a few "known good" agents, then fill from the rest.
     const wanted = ['Doc Organizer', 'Lead Generator', 'Aria']
     const picked: typeof agentTemplates = []
 
     for (const name of wanted) {
       const n = normalize(name)
       const found =
         agentTemplates.find(t => normalize(t.name) === n) ??
         agentTemplates.find(t => normalize((t as any).slug) === n) ??
         agentTemplates.find(t => normalize(t.name).includes(n))
       if (found && !picked.some(p => p.id === found.id)) picked.push(found)
     }
 
     for (const t of agentTemplates) {
      if (picked.length >= 64) break
       if (!picked.some(p => p.id === t.id)) picked.push(t)
     }
 
    if (picked.length === 0) return []
    if (picked.length >= 64) return picked.slice(0, 64)

    // If we have fewer templates than the layout needs, repeat them to keep the carousel feeling "full".
    const minSlides = Math.min(64, Math.max(cardsPerView * 6, cardsPerView + 8))
    if (picked.length < minSlides) {
      return Array.from({ length: minSlides }, (_, idx) => picked[idx % picked.length]!)
    }

    return picked
  }, [agentTemplates, cardsPerView])
 
   const goToMarketplace = () => router.push('/marketplace?from=public')
 
   return (
    <div ref={containerRef} className="w-full max-w-6xl mx-auto mt-4 sm:mt-6 mb-14 sm:mb-16">
       <Carousel
         className="w-full"
         opts={{ loop: true, align: 'start' }}
       >
         {/* Use `!` important utilities so we truly override CarouselContent's default `-ml-4` */}
         <CarouselContent className="!-ml-1 sm:!-ml-2">
           {isLoading
            ? [...Array(cardsPerView)].map((_, idx) => (
                <CarouselItem key={idx} className="basis-auto w-[136px] sm:w-[152px] md:w-[176px] !pl-1 sm:!pl-2">
                   <div className="h-[120px] sm:h-[132px] md:h-[144px] rounded-2xl bg-muted/40 border border-muted-foreground/20 animate-pulse" />
                 </CarouselItem>
               ))
             : featuredAgents.map((template, idx) => {
                 const name = String(template.name ?? '').trim()
                 const role = String((template as any)?.role ?? '').trim()
                 const primaryLabel =
                   role || String((template as any)?.category ?? '').trim() || String((template as any)?.slug ?? '').trim() || name
                 const avatarUrl = (template as any)?.avatarUrl as string | undefined
 
                 return (
                  <CarouselItem key={`${template.id}-${idx}`} className="basis-auto w-[136px] sm:w-[152px] md:w-[176px] !pl-1 sm:!pl-2">
                     <button
                       type="button"
                       onClick={goToMarketplace}
                      className="group w-full rounded-2xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors text-left p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View ${name}${primaryLabel ? ` (${primaryLabel})` : ''} in Marketplace`}
                     >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                          <AgentAvatar seed={name} imageUrl={avatarUrl} fill clip className="w-full h-full rounded-2xl" />
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
       </Carousel>
     </div>
   )
 }

