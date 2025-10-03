'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface MetricCardProps {
  title: string
  value: string
  icon: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export function MetricCard({ title, value, icon, description, className }: MetricCardProps): React.JSX.Element {
  return (
    <Card className={cn('shadow-sm border-border/50 bg-background/80', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {description ? <div className="text-xs text-muted-foreground mt-1">{description}</div> : null}
      </CardContent>
    </Card>
  )
}

export default MetricCard
