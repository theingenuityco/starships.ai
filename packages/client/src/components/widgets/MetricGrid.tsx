'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'

export interface Metric {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: string
  icon?: string
}

export interface MetricGridProps {
  metrics: Metric[]
  title?: string
  description?: string
  columns?: number
  compact?: boolean
  showDividers?: boolean
  className?: string
}

const trendConfig = {
  up: {
    icon: 'trending-up',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/30',
  },
  down: {
    icon: 'trending-down',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
  },
  neutral: {
    icon: 'minus',
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
  },
}

export function MetricGrid({
  metrics,
  title,
  description,
  columns = 3,
  compact = false,
  showDividers = false,
  className,
}: MetricGridProps): React.JSX.Element {
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className={cn(
          'grid gap-3',
          gridColsClass
        )}
      >
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={cn(
              'relative overflow-hidden rounded-lg border border-border/30',
              'bg-card/50',
              compact ? 'p-3' : 'p-4'
            )}
          >
            <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                  {metric.label}
                </span>
                {metric.icon && (
                  <div className="rounded-md p-1.5 bg-primary/10">
                    <Icon
                      name={metric.icon}
                      className="w-3.5 h-3.5 text-primary"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'font-bold tracking-tight',
                    compact ? 'text-2xl' : 'text-3xl'
                  )}
                  style={metric.color ? { color: metric.color } : undefined}
                >
                  {metric.value}
                </span>
                {metric.unit && (
                  <span className="text-sm font-medium text-muted-foreground/60">
                    {metric.unit}
                  </span>
                )}
              </div>
              {metric.trend && metric.trendValue && (
                <div className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium w-fit',
                  trendConfig[metric.trend].color,
                  trendConfig[metric.trend].bg
                )}>
                  <Icon name={trendConfig[metric.trend].icon} className="w-3 h-3" />
                  <span>{metric.trendValue}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MetricGrid
