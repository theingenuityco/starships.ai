 'use client'
 
 import AgentAvatar from '@/components/animated/AgentAvatar'
 import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
 import { useAgentTemplates } from '@/hooks/useTemplates'
 import { useRouter } from 'next/navigation'
 import { useEffect, useMemo, useState } from 'react'
 
 function normalize(s: unknown) {
   return String(s ?? '').trim().toLowerCase()
 }
 
 export default function HeroMarketplaceCarousel() {
   const router = useRouter()
   const { data: agentTemplates = [], isLoading } = useAgentTemplates()
   const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
   const [isHovering, setIsHovering] = useState(false)
 
  // Fixed card widths (avoid percentage-based stretching on small screens)
  const CARD_W = 208
  const CARD_W_SM = 240
  const CARD_W_MD = 260

  // Keep the hero visually "full-width" by ensuring at least N cards render
  // for the current breakpoint (so the row is filled even if API returns few).
  const [cardsPerView, setCardsPerView] = useState(5)

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      // Estimate visible cards for fixed-width slides (Embla padding is handled by CarouselItem pl-4).
      const cardW = w >= 768 ? CARD_W_MD : w >= 640 ? CARD_W_SM : CARD_W
      const count = Math.max(1, Math.floor(w / cardW))
      return Math.min(7, count)
    }

    const onResize = () => setCardsPerView(compute())
    onResize()
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
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
      if (picked.length >= 14) break
       if (!picked.some(p => p.id === t.id)) picked.push(t)
     }
 
    if (picked.length === 0) return []
    if (picked.length >= 14) return picked.slice(0, 14)

    // If we have fewer templates than the layout needs, repeat them to fill the row.
    if (picked.length < cardsPerView) {
      return Array.from({ length: cardsPerView }, (_, idx) => picked[idx % picked.length]!)
    }

    return picked
  }, [agentTemplates, cardsPerView])
 
   useEffect(() => {
     if (!carouselApi) return
     const id = setInterval(() => {
       if (!isHovering) {
         try {
           carouselApi.scrollNext()
         } catch {}
       }
     }, 2800)
     return () => clearInterval(id)
   }, [carouselApi, isHovering])
 
   const goToMarketplace = () => router.push('/marketplace?from=public')
 
   return (
    <div className="w-full mx-auto mt-14 sm:mt-20 md:mt-24 lg:mt-28 mb-16 sm:mb-20">
       <Carousel
         className="px-0 sm:px-2"
         opts={{ loop: true, align: 'start' }}
         setApi={setCarouselApi}
         onMouseEnter={() => setIsHovering(true)}
         onMouseLeave={() => setIsHovering(false)}
       >
         <CarouselContent>
           {isLoading
            ? [...Array(cardsPerView)].map((_, idx) => (
                <CarouselItem key={idx} className="basis-auto w-[208px] sm:w-[240px] md:w-[260px]">
                   <div className="h-[164px] sm:h-[184px] md:h-[196px] rounded-2xl bg-muted/40 border border-muted-foreground/20 animate-pulse" />
                 </CarouselItem>
               ))
             : featuredAgents.map((template, idx) => {
                 const name = String(template.name ?? '').trim()
                 const role = String((template as any)?.role ?? '').trim()
                 const primaryLabel =
                   role || String((template as any)?.category ?? '').trim() || String((template as any)?.slug ?? '').trim() || name
                 const avatarUrl = (template as any)?.avatarUrl as string | undefined
 
                 return (
                  <CarouselItem key={`${template.id}-${idx}`} className="basis-auto w-[208px] sm:w-[240px] md:w-[260px]">
                     <button
                       type="button"
                       onClick={goToMarketplace}
                      className="group w-full rounded-2xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors text-left p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View ${name}${primaryLabel ? ` (${primaryLabel})` : ''} in Marketplace`}
                     >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                          <AgentAvatar seed={name} imageUrl={avatarUrl} fill clip className="w-full h-full rounded-2xl" />
                         </div>
                         <div className="min-w-0 w-full px-1 text-left">
                          <div className="text-sm font-semibold leading-tight truncate max-w-[20ch]">{primaryLabel}</div>
                          <div className="text-[11px] text-muted-foreground leading-tight truncate max-w-[18ch]">{name}</div>
                         </div>
                       </div>
                     </button>
                   </CarouselItem>
                 )
               })}
         </CarouselContent>
 
         <CarouselPrevious className="hidden md:inline-flex -left-10" aria-label="Previous marketplace agents" />
         <CarouselNext className="hidden md:inline-flex -right-10" aria-label="Next marketplace agents" />
       </Carousel>
     </div>
   )
 }

