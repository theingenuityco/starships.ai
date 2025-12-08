'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback } from 'react'
import { track } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'

export default function Hero() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = starships[0]

  const handlePrimaryClick = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}/conversations`)
      return
    }
    router.push('/login')
  }, [isAuthenticated, primaryStarship?.slug, router])

  return (
    <section className="pt-44 md:pt-52 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10 items-center text-center">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-4 max-w-[26ch] mx-auto">AI teams that get work done.</h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 md:mb-10 leading-relaxed max-w-[60ch] mx-auto">
            Starships is a hosted platform for engineers to design agents, connect tools and APIs, and monitor every run in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="h-12 px-10 text-base leading-none overflow-hidden [&_svg]:!w-7 [&_svg]:!h-7" onClick={handlePrimaryClick}>
              {isAuthenticated ? (
                <span className="inline-flex w-7 h-7 items-center justify-center mr-2">
                  <Icon name="rocket" size={28} />
                </span>
              ) : (
                <span className="inline-flex w-7 h-7 items-center justify-center mr-2">
                  <Icon name="rocket-launch" size={28} />
                </span>
              )}
              {isAuthenticated ? 'Go to your workspace' : 'Start for free'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-10 text-base"
              onClick={() => {
                window.open('/docs', '_blank')
              }}
            >
              <Icon name="book" className="w-5 h-5 mr-2.5" />
              View docs
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">Get started for free • No credit card required • $10 credit on signup</div>
          <div className="mt-3 mb-8 md:mb-12">
            <button
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => {
                track({ type: 'discord_hero_clicked' })
                window.open('https://discord.gg/wzF7xfjrKv', '_blank')
              }}
            >
              <Icon name="discord" className="w-4 h-4" />
              <span>Have questions? Join our Discord community</span>
            </button>
          </div>
        </div>

        {/* Demo video replacing blueprint visualization */}
        <div className="relative w-full overflow-visible pt-[56.25%]">
          {/* Glow layer around the video frame */}
          <div className="absolute inset-0 rounded-2xl video-glow pointer-events-none" aria-hidden />
          {/* Blurry, almost transparent border */}
          <div className="absolute inset-0 rounded-2xl video-blur-border pointer-events-none" aria-hidden />
          <div className="absolute inset-0 rounded-2xl shadow-2xl overflow-hidden">
            <div
              className="h-full w-full rounded-lg bg-black/30 overflow-hidden"
              style={{
                background:
                  'radial-gradient(1000px 700px at 20% 20%, rgba(245, 158, 11, 0.16) 0%, transparent 58%), radial-gradient(1000px 700px at 80% 80%, rgba(217, 119, 6, 0.10) 0%, transparent 56%)',
              }}
            >
              <video className="h-full w-full object-contain" src="/landing/demo.webm" autoPlay loop muted playsInline preload="none" />
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground max-w-[60ch]">2-minute overview: from connecting your keys to launching your first agent.</p>
      </div>
    </section>
  )
}
