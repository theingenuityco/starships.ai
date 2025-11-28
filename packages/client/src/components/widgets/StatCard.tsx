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
  default: 'bg-card/50 border-border/30',
  success: 'bg-green-50/50 dark:bg-green-950/30 border-green-200/50 dark:border-green-800/50',
  warning: 'bg-yellow-50/50 dark:bg-yellow-950/30 border-yellow-200/50 dark:border-yellow-800/50',
  error: 'bg-red-50/50 dark:bg-red-950/30 border-red-200/50 dark:border-red-800/50',
}

const variantIconStyles = {
  default: 'text-primary',
  success: 'text-green-600 dark:text-green-500',
  warning: 'text-yellow-600 dark:text-yellow-500',
  error: 'text-red-600 dark:text-red-500',
}

const variantValueStyles = {
  default: 'text-foreground',
  success: 'text-green-700 dark:text-green-300',
  warning: 'text-yellow-700 dark:text-yellow-300',
  error: 'text-red-700 dark:text-red-300',
}

export function StatCard({ title, stats, description, className }: StatCardProps): React.JSX.Element {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={cn(
              'relative overflow-hidden rounded-lg border',
              variantStyles[stat.variant || 'default']
            )}
          >
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                  {stat.label}
                </span>
                {stat.icon && (
                  <div className={cn(
                    'rounded-md p-1.5',
                    stat.variant === 'success' && 'bg-green-100 dark:bg-green-900/30',
                    stat.variant === 'warning' && 'bg-yellow-100 dark:bg-yellow-900/30',
                    stat.variant === 'error' && 'bg-red-100 dark:bg-red-900/30',
                    (!stat.variant || stat.variant === 'default') && 'bg-primary/10'
                  )}>
                    <Icon
                      name={stat.icon}
                      className={cn('w-3.5 h-3.5', variantIconStyles[stat.variant || 'default'])}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  'text-3xl font-bold tracking-tight',
                  variantValueStyles[stat.variant || 'default']
                )}>
                  {stat.value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StatCard
