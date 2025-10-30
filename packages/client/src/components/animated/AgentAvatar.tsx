'use client'

import React, { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { avataaars } from '@dicebear/collection'
import { normalizeAvatarSeed } from '@/lib/avatar'

export type AgentAvatarProps = {
  seed?: string | null
  size?: number
  className?: string
  emphasis?: boolean
  animation?: 'none' | 'wobble' | 'pulse'
  rounded?: boolean
}

export default function AgentAvatar({ seed, size = 40, className, emphasis = false, animation = 'none', rounded = false }: AgentAvatarProps) {
  const hasSeed = typeof seed === 'string' && seed.trim().length > 0

  const svg = useMemo(() => {
    if (!hasSeed) return ''
    const normalized = normalizeAvatarSeed(seed as string)
    return createAvatar(avataaars, {
      seed: normalized,
    }).toString()
  }, [seed, hasSeed])

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative', borderRadius: rounded ? '9999px' : undefined, overflow: rounded ? 'hidden' : undefined }}>
      {hasSeed ? <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} /> : <div style={{ width: size, height: size }} />}
    </div>
  )
}
