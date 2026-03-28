'use client'

import { landingPrimaryCtaHero } from '@/app/components/landing/landingSurface'
import { Button } from '@/components/ui/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { useRouter } from 'next/navigation'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import type { AgentTemplateModel } from '@starships/protocol'

export default function Hero(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  const router = useRouter()
  const [heroLogoTrigger, setHeroLogoTrigger] = useState(0)
  const [isPrimaryAnimating, setIsPrimaryAnimating] = useState(false)
  const [laptopParallaxX, setLaptopParallaxX] = useState(0)
  const pendingPrimaryActionRef = useRef<null | (() => void)>(null)
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0
      // Move laptop right as user scrolls down, capped to keep it near astronaut.
      const next = Math.min(120, Math.max(0, y * 0.3))
      setLaptopParallaxX(next)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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
    router.push('/login')
  }, [router])

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
    <section
      className="relative flex items-start justify-center px-4 sm:px-6 pt-16 sm:pt-20 md:pt-24 pb-10 sm:pb-12 overflow-hidden"
      style={{
        // Shorter than 100dvh so the showcase peeks; overlap+z-index hid it behind opaque astro.
        minHeight: 'calc(100dvh - 80px - clamp(5rem, 10vh, 6.75rem))',
      }}
    >
      {/* Astro landscape at the base of the hero (inspired by Dewang landing). */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[50vh] sm:h-[60vh]"
        aria-hidden
        style={{
          backgroundImage: "url('/landing/astro-base.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center bottom',
          backgroundSize: 'cover',
        }}
      />
      <div
        className="pointer-events-none absolute z-[2] hidden md:block"
        style={{
          bottom: '150px',
          left: 'calc(50% - 188px)',
          transform: `translate3d(${laptopParallaxX}px, 0, 0) rotate(-16deg)`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <img src="/landing/laptop-hover.svg" alt="" aria-hidden className="w-[64px] sm:w-[72px] md:w-[80px] lg:w-[88px] h-auto" />
      </div>
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10 items-center text-center relative z-10">
        <div className="w-full min-w-0 flex flex-col items-center">
          {/* inline-block + shrink-0: avoid flex min-width:0 collapsing the line and forcing a wrap */}
          <h1
            className="inline-block max-w-none shrink-0 font-bold tracking-tight leading-tight mb-4 whitespace-nowrap text-center"
            style={{ fontSize: 'clamp(1.125rem, 2.75vw + 0.35rem, 4.5rem)' }}
          >
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
          <p className="text-base sm:text-lg text-white/80 mb-5 md:mb-7 leading-relaxed w-full max-w-[72ch] mx-auto text-balance break-words">
            Chat with your team, delegate work to agents, and ship faster.
          </p>
          <div className="flex flex-col items-center gap-6 justify-center w-full min-w-0">
            {/* <HeroMarketplaceCarousel initialAgentTemplates={initialAgentTemplates} /> */}
            <Button
              size="lg"
              className={landingPrimaryCtaHero}
              onClick={handlePrimaryClick}
              disabled={isPrimaryAnimating}
              aria-busy={isPrimaryAnimating}
            >
              <span className="inline-flex w-12 h-12 items-center justify-center mr-2 text-slate-900">
                <StarshipsLogo
                  width={48}
                  height={48}
                  className="text-slate-900"
                  gradientId="hero-starships-logo-gradient"
                  idleLoop={false}
                  activeStroke="currentColor"
                  triggerAnimation={heroLogoTrigger}
                  onEntryAnimationComplete={runPendingPrimaryAction}
                />
              </span>
              <span className="text-slate-900">Get Started Free</span>
            </Button>
            <p className="text-xs sm:text-sm text-white/70">No credit card required.</p>
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
            /* Keep these independent of per-letter entry delay */ gradient-shift 8s ease-in-out 1.2s infinite,
            warp-blur 3.6s ease-in-out 1.3s infinite,
            /* Continuous subtle warping after entry finishes */ warp-wobble 4.2s ease-in-out calc(700ms + var(--warp-delay)) infinite;
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
