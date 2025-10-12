'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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

export function LordIcon({ src, width = 20, height = 20, className, label, trigger = 'hover', speed = 1 }: LordIconProps) {
  const [animationData, setAnimationData] = useState<any>(null)
  const lottieRef = useRef<any>(null)

  useEffect(() => {
    let isMounted = true
    async function load() {
      if (!src) return
      try {
        const res = await fetch(src)
        if (!res.ok) return
        const json = await res.json()
        if (isMounted) setAnimationData(json)
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
            lottieRef.current.goToAndStop?.(0, true)
          }
        },
      }
    }
    if (trigger === 'click') {
      return {
        onClick: () => {
          if (lottieRef.current) {
            lottieRef.current.setSpeed?.(speed)
            lottieRef.current.playSegments?.([0, 999], true)
          }
        },
      }
    }
    return {}
  }, [trigger, speed])

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
}

export default LordIcon
