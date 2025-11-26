'use client'

import React from 'react'
import { Cell as RechartsCell, Pie as RechartsPie, PieChart as RechartsPieChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

import type { ChartWidgetBaseProps, PieSegment } from './types'

export interface DonutChartProps extends ChartWidgetBaseProps {
  data: PieSegment[]
  innerRadius?: number | string
  showLegend?: boolean
  centerLabel?: string
  showTotal?: boolean
}

const DEFAULT_HEIGHT = 280

export function DonutChart({
  title,
  description,
  data,
  className,
  height = DEFAULT_HEIGHT,
  innerRadius = '65%',
  showLegend = true,
  centerLabel,
  showTotal = true,
}: DonutChartProps): React.JSX.Element {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    return data.reduce((acc, segment) => {
      acc[segment.label] = {
        label: segment.label,
        color: segment.color,
      }
      return acc
    }, {} as ChartConfig)
  }, [data])

  const total = React.useMemo(() => data.reduce((sum, segment) => sum + segment.value, 0), [data])

  return (
    <Card className={cn('shadow-sm border-border/50', className)}>
      <CardHeader className="space-y-1">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
            <RechartsPieChart>
              <RechartsPie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={innerRadius}
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={2}
              >
                {data.map(segment => (
                  <RechartsCell key={segment.label} fill={segment.color ?? undefined} />
                ))}
              </RechartsPie>
              <ChartTooltip content={<ChartTooltipContent />} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsPieChart>
          </ChartContainer>
          {(centerLabel || showTotal) && (
            <div className="text-center absolute left-1/2 top-1/2 flex w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
              {centerLabel && <p className="text-muted-foreground text-xs">{centerLabel}</p>}
              {showTotal && <p className="text-foreground text-xl font-semibold">{total.toLocaleString()}</p>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

