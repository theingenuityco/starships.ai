'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type GridProps = {
  cols?: number
  gap?: number
  minColWidthPx?: number
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function Grid(props: GridProps) {
  const { cols = 3, gap = 16, minColWidthPx = 320, className, style, children } = props
  const safeCols = Math.max(1, Math.min(24, Math.floor(Number(cols) || 3)))
  const safeMin = Math.max(120, Math.floor(Number(minColWidthPx) || 320))
  return (
    <div
      className={cn('grid w-full min-w-0', className)}
      style={{
        gap,
        gridTemplateColumns: `repeat(${safeCols}, minmax(${safeMin}px, 1fr))`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

