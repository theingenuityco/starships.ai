'use client'

import React, { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { botttsNeutral } from '@dicebear/collection'
import { normalizeAvatarSeed } from '@/lib/avatar'

export type AgentAvatarProps = {
  seed: string
  size?: number
  className?: string
  emphasis?: boolean
  animation?: 'none' | 'wobble' | 'pulse'
}

export default function AgentAvatar({ seed, size = 40, className, emphasis = false, animation = 'none' }: AgentAvatarProps) {
  const svg = useMemo(() => {
    const normalized = normalizeAvatarSeed(seed)
    return createAvatar(botttsNeutral, {
      seed: normalized,
    }).toString()
  }, [seed])

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative' }}>
      <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}
