'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'

export interface StatItem {
  label: string
  value: string | number
  variant?: 'default' | 'success' | 'warning' | 'error'
  icon?: string
}

export interface StatCardProps {
  title: string
  stats: StatItem[]
  description?: string
  className?: string
}

const variantStyles = {
  default: 'bg-muted/50',
  success: 'bg-green-50 dark:bg-green-950/30',
  warning: 'bg-yellow-50 dark:bg-yellow-950/30',
  error: 'bg-red-50 dark:bg-red-950/30',
}

const variantTextStyles = {
  default: 'text-foreground',
  success: 'text-green-700 dark:text-green-400',
  warning: 'text-yellow-700 dark:text-yellow-400',
  error: 'text-red-700 dark:text-red-400',
}

export function StatCard({ title, stats, description, className }: StatCardProps): React.JSX.Element {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={cn(
              'flex flex-col gap-1 p-4 rounded-lg border',
              variantStyles[stat.variant || 'default']
            )}
          >
            <div className="flex items-center gap-2">
              {stat.icon && (
                <Icon
                  name={stat.icon}
                  className={cn('w-4 h-4', variantTextStyles[stat.variant || 'default'])}
                />
              )}
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <span className={cn('text-2xl font-bold', variantTextStyles[stat.variant || 'default'])}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StatCard
