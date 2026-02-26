'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type StackProps = {
  direction?: 'row' | 'column'
  gap?: number
  align?: React.CSSProperties['alignItems']
  justify?: React.CSSProperties['justifyContent']
  wrap?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function Stack(props: StackProps) {
  const { direction = 'column', gap = 12, align, justify, wrap = false, className, style, children } = props
  return (
    <div
      className={cn('flex w-full min-w-0', direction === 'row' ? 'flex-row' : 'flex-col', wrap ? 'flex-wrap' : 'flex-nowrap', className)}
      style={{ gap, alignItems: align, justifyContent: justify, ...style }}
    >
      {children}
    </div>
  )
}

