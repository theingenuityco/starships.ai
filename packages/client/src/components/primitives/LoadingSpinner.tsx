
import React from 'react'
import { Icon as Iconify } from '@iconify/react'

type LoadingSpinnerProps = {
  size?: number | string
  className?: string
  label?: string
}

export function LoadingSpinner({ size = 20, className, label }: LoadingSpinnerProps) {
  return (
    <Iconify
      icon="line-md:loading-twotone-loop"
      width={size as any}
      height={size as any}
      className={className}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

export default LoadingSpinner


