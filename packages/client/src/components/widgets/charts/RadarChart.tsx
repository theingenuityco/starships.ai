'use client'

import React from 'react'
import {
  PolarAngleAxis as RechartsPolarAngleAxis,
  PolarGrid as RechartsPolarGrid,
  PolarRadiusAxis as RechartsPolarRadiusAxis,
  Radar as RechartsRadar,
  RadarChart as RechartsRadarChart,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import type { ChartDataPoint, ChartSeriesConfig, ChartWidgetBaseProps } from './types'

export interface RadarChartProps extends ChartWidgetBaseProps {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  startAngle?: number
  endAngle?: number
  maxValue?: number
}

const DEFAULT_HEIGHT = 320

export function RadarChart({
  title,
  description,
  data,
  indexKey,
  series,
  className,
  height = DEFAULT_HEIGHT,
  showLegend = true,
  showGrid = true,
  startAngle,
  endAngle,
  maxValue,
}: RadarChartProps): React.JSX.Element {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    return series.reduce((acc, item) => {
      acc[item.dataKey] = {
        label: item.label,
        color: item.color,
      }
      return acc
    }, {} as ChartConfig)
  }, [series])

  const radiusAxisProps = React.useMemo(() => {
    return maxValue ? { domain: [0, maxValue] as [number, number] } : {}
  }, [maxValue])

  return (
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
          <RechartsRadarChart data={data} startAngle={startAngle} endAngle={endAngle}>
            {showGrid && <RechartsPolarGrid />}
            <RechartsPolarAngleAxis dataKey={indexKey} />
            <RechartsPolarRadiusAxis tickLine={false} axisLine={false} {...radiusAxisProps} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {series.map(seriesItem => (
              <RechartsRadar
                key={seriesItem.dataKey}
                dataKey={seriesItem.dataKey}
                stroke={`var(--color-${seriesItem.dataKey})`}
                fill={`var(--color-${seriesItem.dataKey})`}
                fillOpacity={0.2}
              />
            ))}
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          </RechartsRadarChart>
        </ChartContainer>
    </div>
  )
}





