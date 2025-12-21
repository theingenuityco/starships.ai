'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { getHeadlineVariant } from '@/lib/flags'
import { useAuth } from '@/hooks/useAuth'
import { useUserStarships } from '@/hooks/useStarships'
import { useRouter } from 'next/navigation'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import HeroConversationDemo from '@/app/components/HeroConversationDemo'

export default function Hero() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const { data: starships = [] } = useUserStarships(user?.id || '', !!user?.id && isAuthenticated)
  const primaryStarship = starships[0]
  const [heroLogoTrigger, setHeroLogoTrigger] = useState(0)
  const [isPrimaryAnimating, setIsPrimaryAnimating] = useState(false)
  const pendingPrimaryActionRef = useRef<null | (() => void)>(null)
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    }
  }, [])

  const runPendingPrimaryAction = useCallback(() => {
    const fn = pendingPrimaryActionRef.current
    if (!fn) return
    pendingPrimaryActionRef.current = null
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current)
      fallbackTimeoutRef.current = null
    }
    fn()
  }, [])

  const navigatePrimary = useCallback(() => {
    if (isAuthenticated && primaryStarship?.slug) {
      router.push(`/ship/${primaryStarship.slug}/conversations`)
      return
    }
    router.push('/login')
  }, [isAuthenticated, primaryStarship?.slug, router])

  const handlePrimaryClick = useCallback(() => {
    if (isPrimaryAnimating) return
    track({ type: 'hero_cta_clicked' })

    setIsPrimaryAnimating(true)
    pendingPrimaryActionRef.current = () => {
      navigatePrimary()
      setIsPrimaryAnimating(false)
    }

    // Kick off the logo entry animation, then navigate once it completes.
    setHeroLogoTrigger(v => v + 1)

    // Fallback: if the animation completion callback doesn't fire (e.g. reduced motion),
    // proceed after a short delay.
    fallbackTimeoutRef.current = setTimeout(() => {
      runPendingPrimaryAction()
    }, 1100)
  }, [isPrimaryAnimating, navigatePrimary, runPendingPrimaryAction])

  return (
    <section className="pt-44 md:pt-52 pb-20 px-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10 items-center text-center">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-4 max-w-[26ch] mx-auto">
            {(() => {
              const v = getHeadlineVariant()
              if (v === 'B') return 'Hire your AI team—then brief them in plain English'
              if (v === 'C') return 'A team of AI specialists that ships work with you'
              return (
                <>
                  Your very own{' '}
                  <span className="warp-word" data-text="ai">
                    <span className="warp-letter">A</span>
                    <span className="warp-letter">I</span>
                  </span>
                  &nbsp;
                  <span className="warp-word" data-text="team">
                    <span className="warp-letter">t</span>
                    <span className="warp-letter">e</span>
                    <span className="warp-letter">a</span>
                    <span className="warp-letter">m</span>
                  </span>
                </>
              )
            })()}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-8 md:mb-12 leading-relaxed max-w-[60ch] mx-auto">Build, manage and deploy agents to handle the busy work.</p>
          <div className="flex flex-col items-center gap-3 justify-center">
            <Button
              size="lg"
              className="h-14 sm:h-16 px-12 sm:px-14 text-lg sm:text-xl leading-none overflow-hidden rounded-full [&_svg]:!w-10 [&_svg]:!h-10 disabled:opacity-100 disabled:bg-primary disabled:text-primary-foreground"
              onClick={handlePrimaryClick}
              disabled={isPrimaryAnimating}
              aria-busy={isPrimaryAnimating}
            >
              <span className="inline-flex w-10 h-10 items-center justify-center mr-1">
                <StarshipsLogo
                  width={40}
                  height={40}
                  className="text-primary-foreground"
                  gradientId="hero-starships-logo-gradient"
                  idleLoop={false}
                  activeStroke="currentColor"
                  triggerAnimation={heroLogoTrigger}
                  onEntryAnimationComplete={runPendingPrimaryAction}
                />
              </span>
              {isAuthenticated ? `Enter ${primaryStarship?.name || 'your starship'}` : 'Get started for free'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-base text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                window.location.href = '/marketplace?from=public'
              }}
            >
              <Icon name="store" className="w-6 h-6 mr-1" />
              Explore agents in Marketplace
            </Button>
          </div>
        </div>

        {/* Conversation demo (uses the same message renderer as /ship/.../conversations) */}
        <div className="w-full mt-6 sm:mt-8 md:mt-10 text-left">
          <HeroConversationDemo />
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
          background: linear-gradient(120deg, rgba(168, 85, 247, 0.95) 0%, rgba(139, 92, 246, 0.9) 35%, rgba(124, 58, 237, 0.9) 70%, rgba(168, 85, 247, 0.95) 100%);
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
