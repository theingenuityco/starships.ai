'use client'

import React from 'react'
import { CartesianGrid as RechartsCartesianGrid, Line as RechartsLine, LineChart as RechartsLineChart, XAxis as RechartsXAxis, YAxis as RechartsYAxis } from 'recharts'

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

import type { ChartSeriesConfig, ChartWidgetBaseProps, ChartDataPoint } from './types'

export interface LineChartProps extends ChartWidgetBaseProps {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  showDots?: boolean
}

const DEFAULT_HEIGHT = 260

export function LineChart({ title, description, data, indexKey, series, className, height = DEFAULT_HEIGHT, showLegend = true, showGrid = true, showDots = true }: LineChartProps): React.JSX.Element {
  const resolvedSeries = series ?? []

  const chartConfig = React.useMemo<ChartConfig>(() => {
    return resolvedSeries.reduce((acc, item) => {
      acc[item.dataKey] = {
        label: item.label,
        color: item.color,
      }
      return acc
    }, {} as ChartConfig)
  }, [resolvedSeries])

  return (
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
        <RechartsLineChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
          {showGrid && <RechartsCartesianGrid strokeDasharray="3 3" />}
          <RechartsXAxis dataKey={indexKey} tickLine={false} axisLine={false} tickMargin={8} />
          <RechartsYAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          {resolvedSeries.map(item => (
            <RechartsLine key={item.dataKey} type="monotone" dataKey={item.dataKey} stroke={`var(--color-${item.dataKey})`} strokeWidth={2} dot={showDots} activeDot={{ r: 4 }} />
          ))}
        </RechartsLineChart>
      </ChartContainer>
    </div>
  )
}
