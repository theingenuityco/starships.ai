'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import StarryBackground from '@/app/components/StarryBackground'

export default function LightCosmicParallaxBackground() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const blobs = useMemo(() => {
    // Deterministic-ish positions; keep lightweight + stable across mounts.
    return [
      { x: 18, y: -8, size: 760, c: 'rgba(59,130,246,0.10)' }, // blue
      { x: 78, y: 12, size: 640, c: 'rgba(168,85,247,0.09)' }, // violet
      { x: 52, y: 86, size: 820, c: 'rgba(245,158,11,0.07)' }, // amber
      { x: -6, y: 72, size: 520, c: 'rgba(99,102,241,0.06)' }, // indigo
    ] as const
  }, [])

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(Boolean(mql?.matches))
    apply()

    if (!mql) return
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])

  useEffect(() => {
    if (reducedMotion) return

    const el = rootRef.current
    if (!el) return

    let raf = 0
    const state = {
      y: 0,
      ty: 0,
    }

    const onScroll = () => {
      state.ty = window.scrollY || 0
      tick()
    }

    const tick = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        // Smooth so the parallax feels floaty without jitter.
        state.y += (state.ty - state.y) * 0.12

        // Per-layer parallax (px strings so CSS can use them directly).
        const y = state.y
        el.style.setProperty('--starsY', `${y * -0.02}px`)
        el.style.setProperty('--washY', `${y * -0.045}px`)
        el.style.setProperty('--topGlowY', `${y * -0.06}px`)
        el.style.setProperty('--blobsY', `${y * -0.075}px`)
        el.style.setProperty('--orbitsY', `${y * -0.095}px`)
        el.style.setProperty('--planetY', `${y * -0.12}px`)
        el.style.setProperty('--bottomGlowY', `${y * -0.035}px`)
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [reducedMotion])

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden
      style={
        {
          // Defaults for SSR / reduced motion
          ['--starsY' as any]: '0px',
          ['--washY' as any]: '0px',
          ['--topGlowY' as any]: '0px',
          ['--blobsY' as any]: '0px',
          ['--orbitsY' as any]: '0px',
          ['--planetY' as any]: '0px',
          ['--bottomGlowY' as any]: '0px',
        } as any
      }
    >
      {/* Stars (parallax layer) */}
      <div
        className="absolute -inset-[18%] opacity-[0.55]"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--starsY), 0)',
        }}
      >
        <StarryBackground position="absolute" className="absolute inset-0" />
      </div>

      {/* Base wash (parallax) */}
      <div
        className="absolute inset-0"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--washY), 0)',
          backgroundImage: [
            'radial-gradient(1100px 520px at 12% 0%, rgba(59,130,246,0.09), transparent 60%)',
            'radial-gradient(900px 420px at 88% 12%, rgba(168,85,247,0.08), transparent 60%)',
            'radial-gradient(1200px 760px at 50% 105%, rgba(245,158,11,0.055), transparent 65%)',
            'linear-gradient(to bottom, rgba(2,6,23,0.03), transparent 40%, rgba(2,6,23,0.03))',
          ].join(', '),
        }}
      />

      {/* Top glow (parallax) */}
      <div
        className="absolute inset-x-0 top-0 h-[620px] opacity-100"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--topGlowY), 0)',
          backgroundImage: [
            'radial-gradient(900px 360px at 50% 0%, rgba(124,58,237,0.20), transparent 60%)',
            'radial-gradient(700px 300px at 15% 30%, rgba(59,130,246,0.12), transparent 62%)',
            'radial-gradient(720px 320px at 85% 22%, rgba(245,158,11,0.10), transparent 62%)',
          ].join(', '),
        }}
      />

      {/* Nebula blobs (parallax) */}
      <div
        className="absolute inset-0 blur-3xl opacity-100"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--blobsY), 0)',
        }}
      >
        {blobs.map((b, idx) => (
          <div
            key={`blob-${idx}`}
            className="absolute rounded-full"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              backgroundImage: `radial-gradient(circle at 35% 30%, ${b.c}, transparent 62%)`,
            }}
          />
        ))}
      </div>

      {/* Orbit lines (parallax + slight scroll drift) */}
      <svg
        className="absolute -inset-[20%] opacity-[0.35]"
        viewBox="0 0 1000 700"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--orbitsY), 0)',
        }}
      >
        <defs>
          <linearGradient id="orbitStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(59,130,246,0.30)" />
            <stop offset="45%" stopColor="rgba(168,85,247,0.22)" />
            <stop offset="100%" stopColor="rgba(245,158,11,0.18)" />
          </linearGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g fill="none" filter="url(#softGlow)">
          <path d="M90 260 C 250 120, 430 110, 620 200 C 780 275, 890 430, 830 560" stroke="url(#orbitStroke)" strokeWidth="1.2" />
          <path d="M40 430 C 210 330, 350 300, 520 330 C 710 365, 860 470, 920 620" stroke="rgba(2,6,23,0.16)" strokeWidth="1" />
          <path d="M120 600 C 320 520, 460 480, 640 500 C 800 520, 910 600, 980 700" stroke="rgba(2,6,23,0.12)" strokeWidth="1" />
          <circle cx="760" cy="180" r="140" stroke="rgba(2,6,23,0.10)" strokeWidth="1" />
          <circle cx="290" cy="520" r="170" stroke="rgba(2,6,23,0.10)" strokeWidth="1" />
        </g>
      </svg>

      {/* “Planet” (foreground parallax) */}
      <div
        className="absolute -right-28 top-24 h-[320px] w-[320px] rounded-full"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--planetY), 0)',
          backgroundImage: [
            'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0.55) 26%, rgba(2,6,23,0.06) 58%, transparent 68%)',
            'radial-gradient(circle at 60% 65%, rgba(59,130,246,0.18), transparent 60%)',
            'radial-gradient(circle at 25% 75%, rgba(168,85,247,0.14), transparent 62%)',
          ].join(', '),
          boxShadow: '0 24px 64px rgba(2,6,23,0.12)',
        }}
      />

      {/* Bottom glow (parallax) */}
      <div
        className="absolute inset-x-0 bottom-0 h-[120vh]"
        style={{
          transform: reducedMotion ? undefined : 'translate3d(0, var(--bottomGlowY), 0)',
          backgroundImage: [
            'radial-gradient(ellipse 1000px 700px at 50% 100%, rgba(168,85,247,0.20), transparent 65%)',
            'radial-gradient(ellipse 1200px 850px at 50% 102%, rgba(139,92,246,0.14), transparent 70%)',
            'radial-gradient(ellipse 1400px 1000px at 50% 105%, rgba(99,102,241,0.10), transparent 75%)',
          ].join(', '),
        }}
      />

      {/* Dust grain (very subtle, static) */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(2,6,23,0.55) 0.6px, transparent 0.7px), radial-gradient(circle at 80% 70%, rgba(2,6,23,0.45) 0.6px, transparent 0.7px)',
          backgroundSize: '28px 28px, 34px 34px',
          backgroundPosition: '0 0, 10px 14px',
        }}
      />
    </div>
  )
}

