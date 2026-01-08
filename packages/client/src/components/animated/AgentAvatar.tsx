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

  const initials = useMemo(() => {
    if (!hasSeed) return ''
    const parts = String(seed).trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return ''
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase().slice(0, 2)
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
          style={{ width: fill ? '100%' : size, height: fill ? '100%' : size, objectFit: 'cover', display: 'block' }}
        />
      ) : hasSeed ? (
        <div
          className={cn('flex items-center justify-center bg-muted text-muted-foreground font-semibold select-none', emphasis && 'text-foreground', rounded ? 'rounded-full' : 'rounded-lg')}
          style={{
            width: fill ? '100%' : size,
            height: fill ? '100%' : size,
            fontSize: Math.max(10, Math.floor(size * 0.38)),
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
      ) : (
        <div style={{ width: fill ? '100%' : size, height: fill ? '100%' : size }} />
      )}
    </div>
  )
}
