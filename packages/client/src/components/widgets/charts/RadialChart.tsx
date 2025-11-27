'use client'

import React from 'react'
import { PolarAngleAxis as RechartsPolarAngleAxis, RadialBar as RechartsRadialBar, RadialBarChart as RechartsRadialBarChart } from 'recharts'

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import type { ChartWidgetBaseProps, RadialSegment } from './types'

const DEFAULT_HEIGHT = 320
const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981']

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

  const chartConfig = React.useMemo(() => {
    if (!chartData.length) {
      return {}
    }

    // Build config object for ChartContainer to generate CSS variables
    return chartData.reduce(
      (config, segment) => {
        config[segment.label] = {
          label: segment.label,
          color: segment.fill,
        }
        return config
      },
      {} as Record<string, { label: string; color: string }>,
    )
  }, [chartData])

  const maxDomain = React.useMemo(() => {
    if (!chartData.length) {
      return 0
    }
    return Math.max(...chartData.map(segment => segment.value))
  }, [chartData])

  return (
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
        <RechartsRadialBarChart
          data={chartData}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
        >
          <RechartsPolarAngleAxis type="number" domain={[0, maxDomain || 1]} tick={false} />
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="label" />} />
          <RechartsRadialBar background dataKey="value" cornerRadius={6} />
          {showLegend && <ChartLegend content={<ChartLegendContent nameKey="label" />} />}
        </RechartsRadialBarChart>
      </ChartContainer>
    </div>
  )
}

