'use client'

import React from 'react'
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  CartesianGrid as RechartsCartesianGrid,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import type { ChartSeriesConfig, ChartWidgetBaseProps, ChartDataPoint } from './types'

export interface AreaChartProps extends ChartWidgetBaseProps {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  stack?: boolean
}

const DEFAULT_HEIGHT = 260

export function AreaChart({
  title,
  description,
  data,
  indexKey,
  series,
  className,
  height = DEFAULT_HEIGHT,
  showLegend = true,
  showGrid = true,
  stack = false,
}: AreaChartProps): React.JSX.Element {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    return series.reduce((acc, item) => {
      acc[item.dataKey] = {
        label: item.label,
        color: item.color,
      }
      return acc
    }, {} as ChartConfig)
  }, [series])

  return (
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
          <RechartsAreaChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
            {showGrid && <RechartsCartesianGrid strokeDasharray="3 3" />}
            <RechartsXAxis
              dataKey={indexKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <RechartsYAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            {series.map(item => (
              <RechartsArea
                key={item.dataKey}
                type="monotone"
                dataKey={item.dataKey}
                stackId={stack ? 'stack' : item.dataKey}
                stroke={`var(--color-${item.dataKey})`}
                fill={`var(--color-${item.dataKey})`}
                fillOpacity={0.2}
              />
            ))}
          </RechartsAreaChart>
        </ChartContainer>
    </div>
  )
}





