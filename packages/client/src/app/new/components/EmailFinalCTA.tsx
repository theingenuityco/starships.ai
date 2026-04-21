'use client'

import { landingPrimaryCtaHero } from '@/app/components/landing/landingSurface'
import { track } from '@/lib/analytics'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

const urgencyItems = ['No SDR required', '10,000 leads in 60 seconds', 'Cancel anytime']

const warpLines = [
  { width: '80%', opacity: 0.18 },
  { width: '65%', opacity: 0.13 },
  { width: '50%', opacity: 0.09 },
  { width: '35%', opacity: 0.06 },
  { width: '90%', opacity: 0.07 },
  { width: '55%', opacity: 0.04 },
]

export default function EmailFinalCTA() {
  const router = useRouter()

  const handleClick = useCallback(() => {
    track({ type: 'hero_cta_clicked' })
    router.push('/login')
  }, [router])

  return (
    <section className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background: [
            'linear-gradient(to bottom, #171717, #0f0f0f, #0f0f0f)',
            'radial-gradient(ellipse 1000px 400px at 50% 0%, rgba(245,158,11,0.10), transparent 60%)',
          ].join(', '),
        }}
      />

      {/* Warp trail decoration */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 pointer-events-none" aria-hidden>
        {warpLines.map((line, i) => (
          <div
            key={i}
            className="h-px rounded-full"
            style={{
              width: line.width,
              opacity: line.opacity,
              background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.8), transparent)',
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-3xl flex flex-col items-center text-center gap-6">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-300">Limited early access</span>
        </div>

        {/* Headline */}
        <h2 className="font-[family-name:var(--font-orbitron)] font-black text-white text-3xl sm:text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Your pipeline won&apos;t build itself.
        </h2>

        {/* Sub */}
        <p className="text-white/60 text-base sm:text-lg leading-relaxed max-w-[50ch]">
          Every day you spend on manual outreach is a day your competitors aren&apos;t.
        </p>

        {/* Urgency bullets */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {urgencyItems.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-white/65 text-sm">{item}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleClick}
          className={landingPrimaryCtaHero}
          style={{ maxWidth: '24rem', width: '100%' }}
        >
          Join the Waitlist — It&apos;s Free →
        </button>

        {/* Login link */}
        <p className="text-white/30 text-sm">
          Already have access?{' '}
          <Link href="/login" className="text-amber-400/70 hover:text-amber-400 transition-colors underline-offset-2 underline">
            Log in
          </Link>
        </p>
      </div>
    </section>
  )
}
