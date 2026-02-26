'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type IfWidgetProps = {
  when?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function IfWidget(props: IfWidgetProps): React.JSX.Element | null {
  const when = Boolean(props.when)
  if (!when) return null

  const className = typeof props.className === 'string' ? props.className : ''
  const style = props.style

  if (!className && !style) return <>{props.children}</>
  return (
    <div className={cn('w-full min-w-0', className)} style={style}>
      {props.children}
    </div>
  )
}

