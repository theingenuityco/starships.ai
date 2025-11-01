'use client'

import React, { useEffect, useMemo, useRef, useState, memo } from 'react'
import Lottie from 'lottie-react'

type Trigger = 'hover' | 'loop' | 'click' | 'none'

interface LordIconProps {
  src: string | undefined
  width?: number | string
  height?: number | string
  className?: string
  label?: string
  trigger?: Trigger
  speed?: number
}

export const LordIcon = memo(function LordIcon({ src, width = 20, height = 20, className, label, trigger = 'hover', speed = 1 }: LordIconProps) {
  const [animationData, setAnimationData] = useState<any>(null)
  const lottieRef = useRef<any>(null)
  const [totalFrames, setTotalFrames] = useState<number>(60)
  const [restFrame, setRestFrame] = useState<number>(1)

  useEffect(() => {
    let isMounted = true
    async function load() {
      if (!src) return
      try {
        const res = await fetch(src)
        if (!res.ok) return
        const json = await res.json()
        if (isMounted) {
          setAnimationData(json)
          const op = typeof json?.op === 'number' ? Math.max(1, Math.floor(json.op)) : 60
          setTotalFrames(op)
          // Prefer the last frame as resting frame; Lordicon docs suggest seeking to end for a stable visible state
          const last = Math.max(1, op - 1)
          setRestFrame(last)
        }
      } catch {}
    }
    setAnimationData(null)
    load()
    return () => {
      isMounted = false
    }
  }, [src])

  const loop = trigger === 'loop'
  const autoplay = trigger === 'loop'

  const eventProps = useMemo(() => {
    if (trigger === 'hover') {
      return {
        onMouseEnter: () => {
          if (lottieRef.current) {
            lottieRef.current.setSpeed?.(speed)
            lottieRef.current.play?.()
          }
        },
        onMouseLeave: () => {
          if (lottieRef.current) {
            lottieRef.current.stop?.()
            lottieRef.current.goToAndStop?.(restFrame, true)
          }
        },
      }
    }
    if (trigger === 'click') {
      return {
        onClick: () => {
          if (lottieRef.current) {
            lottieRef.current.setSpeed?.(speed)
            // Use total frames to play from start through end correctly
            lottieRef.current.playSegments?.([0, totalFrames - 1], true)
          }
        },
      }
    }
    return {}
  }, [trigger, speed, restFrame, totalFrames])

  // Ensure the icon does not disappear after a click-triggered animation.
  // When the animation completes, reset to the first frame (static icon state).
  useEffect(() => {
    if (trigger !== 'click') return
    const inst = lottieRef.current
    if (!inst || typeof inst.addEventListener !== 'function') return
    const handleComplete = () => {
      inst.goToAndStop?.(restFrame, true)
    }
    inst.addEventListener('complete', handleComplete)
    return () => {
      if (typeof inst.removeEventListener === 'function') {
        inst.removeEventListener('complete', handleComplete)
      }
    }
  }, [trigger, restFrame])

  // After the animation data loads and the lottie instance mounts, ensure we start on a visible resting frame
  useEffect(() => {
    if (!animationData || !lottieRef.current) return
    try {
      lottieRef.current.goToAndStop?.(restFrame, true)
    } catch {}
  }, [animationData, restFrame])

  if (!src) return null
  if (!animationData) return null

  return (
    <div className={`lordicon ${className ?? ''}`} aria-label={label} aria-hidden={label ? undefined : true} {...eventProps}>
      <Lottie lottieRef={lottieRef} animationData={animationData} loop={loop} autoplay={autoplay} style={{ width, height }} />
      <style jsx>{`
        :global(.lordicon svg [fill]:not([fill='none'])) {
          fill: currentColor !important;
        }
        :global(.lordicon svg [stroke]:not([stroke='none'])) {
          stroke: currentColor !important;
        }
      `}</style>
    </div>
  )
})

export default LordIcon
