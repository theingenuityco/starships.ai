'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type BoxProps = {
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function Box(props: BoxProps) {
  const { className, style, children } = props
  return (
    <div className={cn('w-full min-w-0', className)} style={style}>
      {children}
    </div>
  )
}

