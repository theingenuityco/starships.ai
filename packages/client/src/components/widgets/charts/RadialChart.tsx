'use client'

import React from 'react'
import { PolarAngleAxis as RechartsPolarAngleAxis, RadialBar as RechartsRadialBar, RadialBarChart as RechartsRadialBarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

import type { ChartWidgetBaseProps, RadialSegment } from './types'

const DEFAULT_HEIGHT = 320
const DEFAULT_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export interface RadialChartProps extends ChartWidgetBaseProps {
  data: RadialSegment[]
  innerRadius?: number | string
  outerRadius?: number | string
  startAngle?: number
  endAngle?: number
  showLegend?: boolean
}

export function RadialChart({
  title,
  description,
  data,
  className,
  height = DEFAULT_HEIGHT,
  innerRadius = '40%',
  outerRadius = '100%',
  startAngle = 90,
  endAngle = 450,
  showLegend = true,
}: RadialChartProps): React.JSX.Element {
  const chartData = React.useMemo(() => {
    if (!data?.length) {
      return []
    }

    return data.map((segment, index) => ({
      ...segment,
      fill: segment.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      name: segment.label,
    }))
  }, [data])

  const maxDomain = React.useMemo(() => {
    if (!chartData.length) {
      return 0
    }
    return Math.max(...chartData.map(segment => segment.value))
  }, [chartData])

  return (
    <Card className={cn('shadow-sm border-border/50', className)}>
      <CardHeader className="space-y-1">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="w-full" style={{ height }}>
          <RechartsRadialBarChart
            data={chartData}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            startAngle={startAngle}
            endAngle={endAngle}
          >
            <RechartsPolarAngleAxis type="number" domain={[0, maxDomain || 1]} tick={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <RechartsRadialBar background dataKey="value" cornerRadius={6} />
          </RechartsRadialBarChart>
        </ChartContainer>
        {showLegend && chartData.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            {chartData.map(segment => (
              <div key={segment.label} className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ background: segment.fill }} />
                <span className="text-muted-foreground">{segment.label}</span>
                <span className="text-foreground font-medium">{segment.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

