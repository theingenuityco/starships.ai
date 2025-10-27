'use client'

import React, { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { personas } from '@dicebear/collection'
import { normalizeAvatarSeed } from '@/lib/avatar'

export type UserAvatarProps = {
  seed: string
  size?: number
  className?: string
  rounded?: boolean
}

export default function UserAvatar({ seed, size = 40, className, rounded = true }: UserAvatarProps) {
  const svg = useMemo(() => {
    const normalized = normalizeAvatarSeed(seed)
    return createAvatar(personas, {
      seed: normalized,
      // Keep it simple - let DiceBear handle the configuration
      backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
    }).toString()
  }, [seed])

  return (
    <div 
      className={className} 
      style={{ 
        width: size, 
        height: size, 
        position: 'relative', 
        borderRadius: rounded ? '9999px' : undefined, 
        overflow: rounded ? 'hidden' : undefined 
      }}
    >
      <div 
        style={{ width: size, height: size }} 
        dangerouslySetInnerHTML={{ __html: svg }} 
      />
    </div>
  )
}