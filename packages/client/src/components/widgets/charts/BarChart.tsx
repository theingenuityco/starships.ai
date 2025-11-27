'use client'

import React from 'react'
import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
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

export interface BarChartProps extends ChartWidgetBaseProps {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  stacked?: boolean
}

const DEFAULT_HEIGHT = 260

export function BarChart({
  title,
  description,
  data,
  indexKey,
  series,
  className,
  height = DEFAULT_HEIGHT,
  showLegend = true,
  showGrid = true,
  stacked = false,
}: BarChartProps): React.JSX.Element {
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
          <RechartsBarChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
            {showGrid && <RechartsCartesianGrid vertical={false} />}
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
              <RechartsBar
                key={item.dataKey}
                dataKey={item.dataKey}
                stackId={stacked ? 'stack' : item.dataKey}
                fill={`var(--color-${item.dataKey})`}
                radius={4}
              />
            ))}
          </RechartsBarChart>
        </ChartContainer>
    </div>
  )
}





