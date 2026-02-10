'use client'

import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'

export type AgentAvatarProps = {
  seed?: string | null
  imageUrl?: string | null
  size?: number
  className?: string
  emphasis?: boolean
  animation?: 'none' | 'wobble' | 'pulse'
  rounded?: boolean
  /**
   * When true, ignore `size` and stretch to fill the parent.
   * Useful for responsive containers (e.g. full-width square cards).
   */
  fill?: boolean
  /**
   * When true, clip overflow (pair with Tailwind rounded-* classes on the wrapper).
   */
  clip?: boolean
}

function hashSeed(input: string): number {
  // Simple, stable non-crypto hash.
  // Produces consistent visuals across renders without pulling in deps.
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickFrom<T>(arr: readonly T[], idx: number): T {
  return arr[((idx % arr.length) + arr.length) % arr.length]!
}

export default function AgentAvatar({
  seed,
  imageUrl,
  size = 40,
  className,
  emphasis = false,
  animation = 'none',
  rounded = false,
  fill = false,
  clip = false,
}: AgentAvatarProps) {
  const hasSeed = typeof seed === 'string' && seed.trim().length > 0
  const hasImage = typeof imageUrl === 'string' && imageUrl.trim().length > 0
  const showInitialsFallback = !hasImage && hasSeed

  const initials = useMemo(() => {
    if (!hasSeed) return ''
    const parts = String(seed).trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return ''
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase().slice(0, 2)
  }, [seed, hasSeed])

  const generated = useMemo(() => {
    if (!hasSeed) return null
    const s = String(seed).trim()
    const h = hashSeed(s)

    // Brand-adjacent palette (deep neutrals + purples/indigos).
    const paletteA = ['#0b1220', '#111827', '#1f2937', '#0f172a'] as const
    const paletteB = ['#7c3aed', '#a855f7', '#6366f1', '#22c55e', '#06b6d4'] as const
    const c1 = pickFrom(paletteA, h)
    const c2 = pickFrom(paletteB, h >>> 3)
    const c3 = pickFrom(paletteB, h >>> 7)

    const shape = h % 5
    const id = `av-${(h >>> 0).toString(16)}`
    return { c1, c2, c3, shape, id }
  }, [seed, hasSeed])

  const outerStyle: React.CSSProperties = {
    width: fill ? '100%' : size,
    height: fill ? '100%' : size,
    position: 'relative',
    ...(rounded ? { borderRadius: '9999px', overflow: 'hidden' } : {}),
    ...(!rounded && clip ? { overflow: 'hidden' } : {}),
  }

  return (
    <div
      className={cn(className, animation !== 'none' && 'animate-pulse')}
      style={outerStyle}
    >
      {hasImage ? (
        <img
          src={imageUrl as string}
          alt=""
          width={size}
          height={size}
          style={{
            width: fill ? '100%' : size,
            height: fill ? '100%' : size,
            objectFit: 'cover',
            display: 'block',
            borderRadius: 'inherit',
          }}
        />
      ) : showInitialsFallback ? (
        <div
          className={cn(
            'flex items-center justify-center font-semibold select-none',
            emphasis ? 'text-foreground' : 'text-white/90'
          )}
          style={{
            width: fill ? '100%' : size,
            height: fill ? '100%' : size,
            fontSize: Math.max(10, Math.floor(size * 0.38)),
            borderRadius: 'inherit',
            overflow: 'hidden',
          }}
          aria-hidden="true"
        >
          {generated ? (
            <>
              <svg
                viewBox="0 0 100 100"
                width="100%"
                height="100%"
                preserveAspectRatio="xMidYMid slice"
                style={{ position: 'absolute', inset: 0 }}
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={`${generated.id}-g`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={generated.c1} />
                    <stop offset="0.55" stopColor={generated.c2} />
                    <stop offset="1" stopColor={generated.c3} />
                  </linearGradient>
                  <filter id={`${generated.id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" />
                  </filter>
                </defs>

                <rect width="100" height="100" fill={`url(#${generated.id}-g)`} />

                {/* Soft “nebula” blobs (vary by shape) */}
                {generated.shape === 0 ? (
                  <>
                    <circle cx="28" cy="36" r="22" fill="rgba(255,255,255,0.16)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="78" cy="70" r="26" fill="rgba(255,255,255,0.10)" filter={`url(#${generated.id}-blur)`} />
                  </>
                ) : generated.shape === 1 ? (
                  <>
                    <circle cx="70" cy="28" r="20" fill="rgba(255,255,255,0.14)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="34" cy="76" r="28" fill="rgba(255,255,255,0.10)" filter={`url(#${generated.id}-blur)`} />
                  </>
                ) : generated.shape === 2 ? (
                  <>
                    <circle cx="22" cy="70" r="24" fill="rgba(255,255,255,0.14)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="80" cy="44" r="22" fill="rgba(255,255,255,0.10)" filter={`url(#${generated.id}-blur)`} />
                  </>
                ) : generated.shape === 3 ? (
                  <>
                    <circle cx="52" cy="26" r="18" fill="rgba(255,255,255,0.12)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="56" cy="78" r="30" fill="rgba(255,255,255,0.10)" filter={`url(#${generated.id}-blur)`} />
                  </>
                ) : (
                  <>
                    <circle cx="26" cy="30" r="20" fill="rgba(255,255,255,0.14)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="74" cy="32" r="18" fill="rgba(255,255,255,0.10)" filter={`url(#${generated.id}-blur)`} />
                    <circle cx="54" cy="78" r="28" fill="rgba(255,255,255,0.08)" filter={`url(#${generated.id}-blur)`} />
                  </>
                )}

                {/* subtle vignette */}
                <rect width="100" height="100" fill="rgba(0,0,0,0.18)" />
              </svg>
              <span style={{ position: 'relative', zIndex: 1, letterSpacing: '0.02em' }}>{initials}</span>
            </>
          ) : (
            initials
          )}
        </div>
      ) : (
        <div style={{ width: fill ? '100%' : size, height: fill ? '100%' : size }} />
      )}

      {/* Subtle inward glow for initials fallback (matches marketplace), with light-mode support */}
      {showInitialsFallback ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0',
            // "Purple inward glow" to match marketplace blank avatars.
            // Important: do NOT add an inset ring/inner border for empty avatars.
            'shadow-[inset_0_0_14px_rgba(124,58,237,0.10)]',
            'dark:shadow-[inset_0_0_14px_rgba(167,139,250,0.09)]'
          )}
          style={{ borderRadius: 'inherit' }}
        />
      ) : null}
    </div>
  )
}
