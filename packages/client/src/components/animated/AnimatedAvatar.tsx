'use client'

import React, { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { createAvatar } from '@dicebear/core'
import { funEmoji } from '@dicebear/collection'

export type AvatarExpression = 'neutral' | 'happy' | 'sad' | 'wow' | 'angry' | 'wink' | 'thinking'
export type AvatarAnimation = 'none' | 'wobble' | 'pulse'

export type AnimatedAvatarProps = {
  seed: string
  name?: string
  size?: number
  expression?: AvatarExpression
  animation?: AvatarAnimation
  emphasis?: boolean
  reactionEmoji?: string | null
  className?: string
  forceMotion?: boolean
  // micro-animations
  autoBlink?: boolean
  blinkDurationMs?: number
  blinkMinMs?: number
  blinkMaxMs?: number
  autoCycleExpressions?: AvatarExpression[]
  cycleIntervalMs?: number
  onExpressionChange?: (expr: AvatarExpression) => void
}

function mapExpressionToOptions(expr: AvatarExpression): any {
  switch (expr) {
    case 'happy':
      return { mood: ['happy'] }
    case 'sad':
      return { mood: ['sad'] }
    case 'wow':
      return { mood: ['surprised'] }
    case 'angry':
      return { mood: ['angry'] }
    case 'wink':
      return { mood: ['wink'] }
    case 'thinking':
      return { mood: ['skeptical'] }
    default:
      return { mood: ['default'] }
  }
}

export default function AnimatedAvatar({
  seed,
  name,
  size = 40,
  expression = 'neutral',
  animation = 'none',
  emphasis = false,
  reactionEmoji = null,
  className,
  forceMotion = false,
  autoBlink = true,
  blinkDurationMs = 120,
  blinkMinMs = 2500,
  blinkMaxMs = 5000,
  autoCycleExpressions,
  cycleIntervalMs = 6000,
  onExpressionChange,
}: AnimatedAvatarProps) {
  const prefersReduced = useReducedMotion()
  const motionEnabled = forceMotion || !prefersReduced

  // expression state machine (supports blinking and optional cycling)
  const [currentExpression, setCurrentExpression] = React.useState<AvatarExpression>(expression)
  const blinkActiveRef = React.useRef(false)
  const baseExpressionRef = React.useRef<AvatarExpression>(expression)

  // keep base expression in sync with prop
  React.useEffect(() => {
    baseExpressionRef.current = expression
    if (!blinkActiveRef.current && !autoCycleExpressions?.length) {
      setCurrentExpression(expression)
      onExpressionChange?.(expression)
    }
  }, [expression, autoCycleExpressions?.length, onExpressionChange])

  // cycle expressions (if provided) using timeout loop (more controllable with blinks)
  React.useEffect(() => {
    if (!autoCycleExpressions || autoCycleExpressions.length === 0) return
    let cancelled = false
    let idx = 0
    const minInterval = Math.max(2000, cycleIntervalMs)

    const tick = () => {
      if (cancelled) return
      if (blinkActiveRef.current) {
        timer = window.setTimeout(tick, 250)
        return
      }
      idx = (idx + 1) % autoCycleExpressions.length
      const next = autoCycleExpressions[idx]
      baseExpressionRef.current = next
      setCurrentExpression(next)
      onExpressionChange?.(next)
      timer = window.setTimeout(tick, minInterval)
    }

    let timer = window.setTimeout(tick, minInterval)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [autoCycleExpressions && autoCycleExpressions.join(','), cycleIntervalMs, onExpressionChange])

  // auto blink (uses 'wink' as a quick blink substitute)
  React.useEffect(() => {
    if (!autoBlink || !motionEnabled) return
    let cancelled = false
    const schedule = () => {
      const delay = blinkMinMs + Math.random() * Math.max(0, blinkMaxMs - blinkMinMs)
      const t = window.setTimeout(() => {
        if (cancelled) return
        blinkActiveRef.current = true
        const prev = baseExpressionRef.current
        setCurrentExpression('wink')
        window.setTimeout(() => {
          blinkActiveRef.current = false
          setCurrentExpression(prev)
          onExpressionChange?.(prev)
          if (!cancelled) schedule()
        }, blinkDurationMs)
      }, delay)
      return t
    }
    let timer = schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [autoBlink, motionEnabled, blinkDurationMs, blinkMinMs, blinkMaxMs, onExpressionChange])

  const svg = useMemo(() => {
    const opts: any = {
      seed: name ?? seed,
      backgroundType: ['gradientLinear'],
      backgroundColor: ['f2f2f2', 'ffffff', 'e6e6ff', 'ffe6f2'],
      radius: 50,
      ...mapExpressionToOptions(currentExpression),
    }
    return createAvatar(funEmoji, opts).toString()
  }, [seed, name, currentExpression])

  const baseScale = emphasis && motionEnabled ? 1.06 : 1

  const animate = useMemo(() => {
    if (!motionEnabled || animation === 'none') return { scale: baseScale }
    switch (animation) {
      case 'wobble':
        return { rotate: [-3, 3, -3], scale: baseScale }
      case 'pulse':
        return { scale: [baseScale, baseScale * 1.06, baseScale] }
      default:
        return { scale: baseScale }
    }
  }, [animation, baseScale, motionEnabled])

  const transition = useMemo(() => {
    return motionEnabled ? ({ repeat: Infinity, repeatType: 'mirror' as const, duration: 2.6, ease: 'easeInOut' as const } as any) : ({ type: 'spring' as const, stiffness: 180, damping: 16 } as any)
  }, [motionEnabled])

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative' }}>
      <motion.div initial={false} animate={animate} transition={transition} style={{ width: size, height: size }}>
        <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
      </motion.div>

      {reactionEmoji && motionEnabled && (
        <motion.div
          aria-hidden
          style={{ position: 'absolute', right: -6, top: -6, pointerEvents: 'none' }}
          initial={{ opacity: 0, y: 8, scale: 0.8 }}
          animate={{ opacity: [0, 1, 0], y: [-4, -18, -28], scale: [0.8, 1, 0.95] }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <div style={{ background: 'white', borderRadius: 9999, padding: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize: Math.max(10, size * 0.22) }}>{reactionEmoji}</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}
