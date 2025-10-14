'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import BoringAvatar from 'boring-avatars'

type Variant = 'beam' | 'bauhaus' | 'marble' | 'pixel' | 'ring' | 'sunset'

export type AnimatedBoringAvatarProps = {
  name?: string
  seed: string
  size?: number
  square?: boolean
  variant?: Variant
  // Emotion micro-animations
  expression?: 'neutral' | 'happy' | 'wow' | 'sad' | 'thinking'
  // Emphasize on select/hover
  emphasis?: boolean
  // Optional reaction burst emoji (one-shot). Use a different key to re-trigger.
  reactionEmoji?: string | null
  className?: string
}

function expressionTilt(expression: NonNullable<AnimatedBoringAvatarProps['expression']>) {
  switch (expression) {
    case 'happy':
      return -6
    case 'wow':
      return 4
    case 'sad':
      return 6
    case 'thinking':
      return -3
    default:
      return 0
  }
}

export function AnimatedBoringAvatar({
  name,
  seed,
  size = 40,
  square = false,
  variant = 'beam',
  expression = 'neutral',
  emphasis = false,
  reactionEmoji = null,
  className,
}: AnimatedBoringAvatarProps) {
  const reduce = useReducedMotion()

  const burst = !!reactionEmoji && !reduce

  return (
    <div className={className} style={{ width: size, height: size }}>
      <motion.div
        initial={false}
        animate={{
          rotate: expressionTilt(expression),
          scale: emphasis && !reduce ? 1.06 : 1,
        }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        style={{ width: size, height: size }}
      >
        {/* Base Boring Avatar - default export accepts variant prop */}
        <BoringAvatar name={name ?? seed} size={size} square={square} variant={variant} />

        {/* Overlay micro-animations using an SVG layer */}
        {!reduce && (
          <motion.div
            aria-hidden
            style={{ position: 'relative', width: size, height: size, marginTop: -size }}
            animate={{ y: [0, -0.6, 0] }}
            transition={{ repeat: Infinity, repeatType: 'mirror', duration: 3.2, ease: 'easeInOut' }}
          />
        )}
      </motion.div>

      {/* Reaction burst */}
      {burst && (
        <motion.div
          aria-hidden
          style={{ position: 'relative', width: size, height: size, pointerEvents: 'none', marginTop: -size }}
          initial={{ opacity: 0, y: 8, scale: 0.8 }}
          animate={{ opacity: [0, 1, 0], y: [-4, -18, -28], scale: [0.8, 1, 0.95] }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <div style={{ position: 'absolute', right: -6, top: -6, background: 'white', borderRadius: 9999, padding: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize: Math.max(10, size * 0.22) }}>{reactionEmoji}</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default AnimatedBoringAvatar
