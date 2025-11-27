'use client'

import React from 'react'
import { Cell as RechartsCell, Pie as RechartsPie, PieChart as RechartsPieChart } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import type { ChartWidgetBaseProps, PieSegment } from './types'

export interface PieChartProps extends ChartWidgetBaseProps {
  data: PieSegment[]
  showLegend?: boolean
  showLabels?: boolean
}

const DEFAULT_HEIGHT = 280

export function PieChart({
  title,
  description,
  data,
  className,
  height = DEFAULT_HEIGHT,
  showLegend = true,
  showLabels = false,
}: PieChartProps): React.JSX.Element {
  const chartConfig = React.useMemo<ChartConfig>(() => {
    return data.reduce((acc, segment) => {
      acc[segment.label] = {
        label: segment.label,
        color: segment.color,
      }
      return acc
    }, {} as ChartConfig)
  }, [data])

  return (
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
          <RechartsPieChart>
            <RechartsPie
              data={data}
              dataKey="value"
              nameKey="label"
              outerRadius="80%"
              label={showLabels ? ({ percent }) => `${(percent * 100).toFixed(0)}%` : false}
            >
              {data.map(segment => (
                <RechartsCell key={segment.label} fill={segment.color ?? undefined} />
              ))}
            </RechartsPie>
            <ChartTooltip content={<ChartTooltipContent />} />
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          </RechartsPieChart>
        </ChartContainer>
    </div>
  )
}





