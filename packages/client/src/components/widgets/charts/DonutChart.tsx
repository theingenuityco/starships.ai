'use client'

import React from 'react'
import { Cell as RechartsCell, Label as RechartsLabel, Pie as RechartsPie, PieChart as RechartsPieChart } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

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
    <div className={className}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
          <RechartsPieChart>
            <RechartsPie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius="85%"
              paddingAngle={1}
              strokeWidth={1}
            >
              {(centerLabel || showTotal) && (
                <RechartsLabel
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          {centerLabel && (
                            <tspan x={viewBox.cx} dy="-0.5em" className="fill-muted-foreground text-xs">
                              {centerLabel}
                            </tspan>
                          )}
                          {showTotal && (
                            <tspan x={viewBox.cx} dy="1.5em" className="fill-foreground text-xl font-semibold">
                              {total.toLocaleString()}
                            </tspan>
                          )}
                        </text>
                      )
                    }
                  }}
                />
              )}
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

