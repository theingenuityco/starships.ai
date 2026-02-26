'use client'

import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type TabsWidgetProps = {
  /**
   * Optional labels for each child tab (fallback when child doesn't provide a label).
   */
  labels?: string[]
  defaultIndex?: number
  className?: string
  children?: React.ReactNode
}

export function TabsWidget(props: TabsWidgetProps) {
  const { labels = [], defaultIndex = 0, className, children } = props
  const arr = React.Children.toArray(children)
  const safeDefault = Math.max(0, Math.min(arr.length - 1, Math.floor(defaultIndex || 0)))
  const defaultValue = `tab_${safeDefault}`

  if (arr.length === 0) return <div className={cn('w-full min-w-0', className)} />

  return (
    <Tabs defaultValue={defaultValue} className={cn('w-full min-w-0', className)}>
      <TabsList className="w-full justify-start">
        {arr.map((_, i) => (
          <TabsTrigger key={i} value={`tab_${i}`}>
            {labels[i] ?? `Tab ${i + 1}`}
          </TabsTrigger>
        ))}
      </TabsList>
      {arr.map((node, i) => (
        <TabsContent key={i} value={`tab_${i}`} className="mt-4">
          {node}
        </TabsContent>
      ))}
    </Tabs>
  )
}

