
import React from 'react'
import Lottie from 'lottie-react'

type AnimatedIconProps = {
  animationData: object
  loop?: boolean
  autoplay?: boolean
  width?: number | string
  height?: number | string
  className?: string
  label?: string
}

export function AnimatedIcon({ animationData, loop = false, autoplay = true, width = 28, height = 28, className, label }: AnimatedIconProps) {
  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      style={{ width, height }}
      className={className}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

export default AnimatedIcon


