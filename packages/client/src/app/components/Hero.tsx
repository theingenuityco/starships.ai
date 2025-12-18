'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant } from '@/lib/flags'
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
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-4 max-w-[26ch] mx-auto">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'Hire, train, and run AI teammates'
              if (v === 'C') return 'Your AI team’s command center'
              return <>Build your own AI team</>
            })()}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 md:mb-10 leading-relaxed max-w-[60ch] mx-auto">
            Create specialized agents for support, ops, research, and more—then stay in control with clear visibility into every action.
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
              {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Build your AI team'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-10 text-base"
              onClick={() => {
                window.location.href = '/marketplace?from=public'
              }}
            >
              <Icon name="store" className="w-5 h-5 mr-2.5" />
              Browse Marketplace
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">Start free • No credit card required • $10 credit on signup</div>
          <div className="mt-2 text-sm text-muted-foreground">Your starship is your AI team workspace.</div>
          <div className="mt-3 mb-8 md:mb-12">
            <Button
              size="sm"
              variant="ghost"
              className="text-sm h-9 px-4 hover:bg-primary/10 hover:text-primary transition-colors"
              onClick={() => {
                track({ type: 'discord_hero_clicked' })
                window.open('https://discord.gg/wzF7xfjrKv', '_blank')
              }}
            >
              <Icon name="discord" className="w-4 h-4 mr-2" />
              Join the community
            </Button>
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
      </div>
      <style jsx>{``}</style>
    </section>
  )
}
