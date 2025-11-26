'use client'

import React from 'react'
import { StatCard } from './StatCard'
import { DataTable } from './DataTable'
import { MetricGrid } from './MetricGrid'
import { AreaChart, BarChart, DonutChart, LineChart, PieChart, RadarChart, RadialChart } from './charts'

export interface WidgetConfig {
  id: string
  widgetType: string
  props: Record<string, any>
}

export interface WidgetRendererProps {
  widget: WidgetConfig
  className?: string
}

const WIDGET_MAP: Record<string, React.ComponentType<any>> = {
  StatCard,
  DataTable,
  MetricGrid,
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  DonutChart,
  RadarChart,
  RadialChart,
}

export function WidgetRenderer({ widget, className }: WidgetRendererProps): React.JSX.Element {
  const Component = WIDGET_MAP[widget.widgetType]

  if (!Component) {
    return (
      <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Unknown widget type: {widget.widgetType}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Available components: {Object.keys(WIDGET_MAP).join(', ')}
        </p>
      </div>
    )
  }

  try {
    return <Component {...widget.props} className={className} />
  } catch (error) {
    return (
      <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Error rendering widget: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            Widget details
          </summary>
          <pre className="text-xs mt-2 overflow-auto">
            {JSON.stringify(widget, null, 2)}
          </pre>
        </details>
      </div>
    )
  }
}

export default WidgetRenderer
