'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type TextProps = {
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  text?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function Text(props: TextProps) {
  const { as = 'p', text, className, style, children } = props
  const Tag = as as any
  return (
    <Tag className={cn('min-w-0', className)} style={style}>
      {text != null ? String(text) : children}
    </Tag>
  )
}

