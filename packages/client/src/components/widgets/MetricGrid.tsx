'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Icon } from '@iconify/react'

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
    icon: 'lucide:trending-up',
    color: 'text-green-600 dark:text-green-400',
  },
  down: {
    icon: 'lucide:trending-down',
    color: 'text-red-600 dark:text-red-400',
  },
  neutral: {
    icon: 'lucide:minus',
    color: 'text-muted-foreground',
  },
}

export function MetricGrid({
  metrics,
  title,
  description,
  columns = 3,
  compact = false,
  showDividers = true,
  className,
}: MetricGridProps): React.JSX.Element {
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div
        className={cn(
          'grid gap-4',
          gridColsClass,
          showDividers && 'divide-x divide-border'
        )}
      >
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={cn(
              'flex flex-col',
              compact ? 'gap-1 p-2' : 'gap-2 p-4',
              showDividers && index > 0 && 'pl-4'
            )}
          >
            <div className="flex items-center gap-2">
              {metric.icon && (
                <Icon
                  icon={metric.icon}
                  className="w-4 h-4 text-muted-foreground"
                />
              )}
              <span className="text-sm text-muted-foreground">{metric.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn('text-2xl font-bold')}
                style={metric.color ? { color: metric.color } : undefined}
              >
                {metric.value}
              </span>
              {metric.unit && (
                <span className="text-sm text-muted-foreground">{metric.unit}</span>
              )}
            </div>
            {metric.trend && (
              <div className={cn('flex items-center gap-1 text-xs', trendConfig[metric.trend].color)}>
                <Icon icon={trendConfig[metric.trend].icon} className="w-3 h-3" />
                {metric.trendValue && <span>{metric.trendValue}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default MetricGrid
