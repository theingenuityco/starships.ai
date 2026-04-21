'use client'

import { landingPrimaryCtaHero } from '@/app/components/landing/landingSurface'
import { track } from '@/lib/analytics'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export default function EmailHero() {
  const router = useRouter()

  const handleWaitlistClick = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    router.push('/login')
  }, [router])

  return (
    <section
      className="relative flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-28 md:pt-32 pb-16 sm:pb-20 overflow-hidden"
      style={{ minHeight: 'calc(100dvh - 80px)' }}
    >

{/* Asset placeholder: Warp speed star-trail effect radiating from center with email envelope icons
          streaking outward — represents emails being sent at light speed */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        {/* Warp trail lines radiating from center */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 left-1/2 h-px origin-left"
            style={{
              width: `${30 + i * 8}%`,
              opacity: 0.04 + i * 0.01,
              background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.6), transparent)',
              transform: `rotate(${i * 30}deg) translateY(-50%)`,
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center gap-6 sm:gap-8 relative z-10">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-300">AI-Powered Email Outreach</span>
        </div>

        {/* Headline */}
        <div style={{ fontSize: 'clamp(2rem, 5vw + 1rem, 5.5rem)' }}>
          <h1
            className="m-0 font-black tracking-tight leading-[1.05] text-white font-[family-name:var(--font-orbitron)]"
            style={{ fontSize: '1em' }}
          >
            Outreach that{' '}
            <span className="warp-word" data-text="Warps">
              <span className="warp-letter">W</span>
              <span className="warp-letter">a</span>
              <span className="warp-letter">r</span>
              <span className="warp-letter">p</span>
              <span className="warp-letter">s</span>
            </span>{' '}
            past your competitors.
          </h1>
        </div>

        {/* Subheadline */}
        <p className="text-base sm:text-lg md:text-xl text-white/65 leading-relaxed max-w-[60ch] mx-auto text-balance">
          Starships.ai discovers your ICPs, finds thousands of leads, enriches every contact, and writes a genuinely personalized email —
          before your SDR finishes their first coffee.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2">
          <button className={landingPrimaryCtaHero} onClick={handleWaitlistClick}>
            Join the Waitlist →
          </button>
          <a
            href="#how-it-works"
            className="text-sm text-white/50 hover:text-white/80 transition-colors duration-150 underline-offset-2 hover:underline"
          >
            See how it works ↓
          </a>
        </div>

        {/* Social nudge */}
        <p className="text-xs text-white/30 mt-1">No credit card. No SDR required.</p>
      </div>

      <style jsx>{`
        .warp-word {
          display: inline-block;
          gap: 0;
          position: relative;
          font-size: 1em;
          font-weight: inherit;
          line-height: inherit;
          vertical-align: baseline;
          overflow: visible;
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
            gradient-shift 8s ease-in-out 1.2s infinite,
            warp-blur 3.6s ease-in-out 1.3s infinite,
            warp-wobble 4.2s ease-in-out calc(700ms + var(--warp-delay)) infinite;
          will-change: transform, opacity, filter, background-position;
          background: linear-gradient(
            120deg,
            rgba(168, 85, 247, 0.95) 0%,
            rgba(139, 92, 246, 0.9) 35%,
            rgba(124, 58, 237, 0.9) 70%,
            rgba(168, 85, 247, 0.95) 100%
          );
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

        @media (prefers-reduced-motion: reduce) {
          .warp-letter {
            animation: none;
          }
        }
      `}</style>
    </section>
  )
}
