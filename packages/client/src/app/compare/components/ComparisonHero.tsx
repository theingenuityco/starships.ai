'use client'

import Link from 'next/link'
import type { ComparisonContent } from '@/app/compare/comparison-content'
import { landingSecondaryCta } from '@/app/components/landing/landingSurface'
import StarryBackground from '@/app/components/StarryBackground'

export default function ComparisonHero(props: { content: ComparisonContent }) {
  const { content } = props
  const [brandWord, restTitle] = content.hero.title.includes(' vs ') ? content.hero.title.split(' vs ', 2) : [content.hero.title, '']

  return (
    <section className="relative flex min-h-[88vh] flex-col justify-center overflow-hidden px-4 pb-[min(26vh,10rem)] pt-24 text-white sm:px-8 sm:pt-28 sm:pb-24" style={{ backgroundColor: '#050b24' }}>
      <StarryBackground position="absolute" className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[42vh] sm:h-[50vh]"
        aria-hidden
        style={{
          backgroundImage: "url('/landing/planet-base.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center bottom',
          backgroundSize: 'cover',
        }}
      />
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 text-white lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">{content.hero.eyebrow}</p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            <span className="warp-word" data-text={brandWord.toLowerCase()}>
              {brandWord.split('').map((ch, idx) => (
                <span key={`${ch}-${idx}`} className="warp-letter">
                  {ch}
                </span>
              ))}
            </span>
            {restTitle ? ` vs ${restTitle}` : ''}
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-relaxed text-slate-200 sm:text-lg">{content.hero.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={content.hero.secondaryCtaHref} className={`${landingSecondaryCta} h-11 px-5 text-sm`}>
              {content.hero.secondaryCtaLabel}
            </Link>
          </div>
        </div>
        <aside className="rounded-none border border-white/15 bg-white/[0.04] p-5 backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">What this comparison covers</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            <li>- AI delegation and workflow execution</li>
            <li>- Team collaboration model</li>
            <li>- Integrations, API, and recurring work</li>
            <li>- Migration complexity and rollout path</li>
          </ul>
        </aside>
      </div>
      <style jsx>{`
        .warp-word {
          display: inline-block;
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
