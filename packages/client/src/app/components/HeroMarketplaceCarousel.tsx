 'use client'
 
 import AgentAvatar from '@/components/animated/AgentAvatar'
 import { Avatar } from '@/components/ui/avatar'
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
 
  // Keep the hero visually "full-width" by ensuring at least N cards render
  // for the current breakpoint (so the row is filled even if API returns few).
  const [cardsPerView, setCardsPerView] = useState(5)

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth
      // Tailwind default breakpoints: sm 640, md 768, lg 1024, xl 1280, 2xl 1536
      if (w >= 1536) return 7
      if (w >= 1280) return 6
      if (w >= 1024) return 5
      if (w >= 768) return 4
      if (w >= 640) return 3
      return 2
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
    <div className="w-full mx-auto mt-20 mb-20">
       <Carousel
         className="px-1 sm:px-2"
         opts={{ loop: true, align: 'start' }}
         setApi={setCarouselApi}
         onMouseEnter={() => setIsHovering(true)}
         onMouseLeave={() => setIsHovering(false)}
       >
         <CarouselContent>
           {isLoading
            ? [...Array(cardsPerView)].map((_, idx) => (
                <CarouselItem key={idx} className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6 2xl:basis-[14.2857%]">
                   <div className="h-[196px] rounded-2xl bg-muted/40 border border-muted-foreground/20 animate-pulse" />
                 </CarouselItem>
               ))
             : featuredAgents.map((template, idx) => {
                 const name = String(template.name ?? '').trim()
                 const role = String((template as any)?.role ?? '').trim()
                 const primaryLabel =
                   role || String((template as any)?.category ?? '').trim() || String((template as any)?.slug ?? '').trim() || name
                 const avatarUrl = (template as any)?.avatarUrl as string | undefined
 
                 return (
                  <CarouselItem key={`${template.id}-${idx}`} className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6 2xl:basis-[14.2857%]">
                     <button
                       type="button"
                       onClick={goToMarketplace}
                      className="group w-full rounded-2xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors text-left p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View ${name}${primaryLabel ? ` (${primaryLabel})` : ''} in Marketplace`}
                     >
                      <div className="flex flex-col items-center gap-1">
                        <Avatar className="h-36 w-36 rounded-2xl ring-1 ring-border/50 bg-background/40">
                          <AgentAvatar seed={name} imageUrl={avatarUrl} size={144} rounded={false} className="rounded-xl overflow-hidden" />
                         </Avatar>
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

