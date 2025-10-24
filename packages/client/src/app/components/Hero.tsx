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
      <div className="max-w-6xl mx-auto flex flex-col gap-10 items-center text-center">
        <div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'From prompt to working agent—without brittle glue'
              if (v === 'C') return 'Design, run, and monitor AI automations'
              return (
                <>
                  Build automations at{' '}
                  <span className="warp-word" data-text="warp">
                    <span className="warp-letter">w</span>
                    <span className="warp-letter">a</span>
                    <span className="warp-letter">r</span>
                    <span className="warp-letter">p</span>
                  </span>{' '}
                  speed
                </>
              )
            })()}
          </h1>
          <p className="text-lg text-muted-foreground mb-8 md:mb-10 leading-relaxed">Ship intelligent automations in minutes - safe, observable and fast.</p>
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
              {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Launch your starship'}
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
              View Docs
            </Button>
          </div>
          <div className="mt-3 mb-8 md:mb-12 text-sm text-muted-foreground">Get started for free • No credit card required • $20 credit on signup</div>
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
              <video className="h-full w-full object-contain" src="/landing/demo.webm" autoPlay loop muted playsInline />
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .warp-word {
          display: inline-flex;
          gap: 0;
          position: relative;
        }

        .warp-letter {
          display: inline-block;
          animation:
            warp-letter-in 640ms cubic-bezier(0.22, 1, 0.36, 1) both,
            gradient-shift 8s ease-in-out 1.2s infinite,
            warp-blur 3.6s ease-in-out 1.3s infinite;
          will-change: transform, opacity, filter, background-position;
          background: linear-gradient(120deg, rgba(255, 255, 255, 0.95) 0%, rgba(59, 130, 246, 0.9) 35%, rgba(168, 85, 247, 0.9) 70%, rgba(255, 255, 255, 0.95) 100%);
          background-size: 250% 250%;
          color: transparent;
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
        }

        .warp-letter:nth-child(1) {
          animation-delay: 0ms;
        }
        .warp-letter:nth-child(2) {
          animation-delay: 60ms;
        }
        .warp-letter:nth-child(3) {
          animation-delay: 120ms;
        }
        .warp-letter:nth-child(4) {
          animation-delay: 180ms;
        }

        @keyframes warp-letter-in {
          0% {
            opacity: 0;
            transform: translateY(14px) scaleX(1.5) skewX(-14deg);
            filter: blur(8px);
            text-shadow:
              10px 0 rgba(59, 130, 246, 0.28),
              -10px 0 rgba(168, 85, 247, 0.22),
              18px 0 rgba(59, 130, 246, 0.14),
              -18px 0 rgba(168, 85, 247, 0.12);
          }
          45% {
            opacity: 1;
            transform: translateY(0) scaleX(0.94) skewX(3deg);
            filter: blur(1px);
            text-shadow:
              6px 0 rgba(59, 130, 246, 0.18),
              -6px 0 rgba(168, 85, 247, 0.14);
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
