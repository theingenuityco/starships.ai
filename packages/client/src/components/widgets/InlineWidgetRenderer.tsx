'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { StatCard } from './StatCard'
import { DataTable } from './DataTable'
import { MetricGrid } from './MetricGrid'
import { AreaChart, BarChart, DonutChart, LineChart, PieChart, RadarChart, RadialChart } from './charts'

export interface InlineWidgetConfig {
  id?: string
  widgetType: string
  props: Record<string, any>
}

export interface InlineWidgetRendererProps {
  widget: InlineWidgetConfig
  className?: string
  compactMode?: boolean
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

/**
 * InlineWidgetRenderer - Renders widgets in chat context with compact styling
 *
 * Unlike WidgetRenderer (used for full-page views), this component:
 * - Reduces chart heights for inline display
 * - Removes card shadows/borders (parent provides container)
 * - Optimized for conversation message context
 */
export function InlineWidgetRenderer({
  widget,
  className = '',
  compactMode = true
}: InlineWidgetRendererProps): React.JSX.Element {
  const Component = WIDGET_MAP[widget.widgetType]

  if (!Component) {
    return (
      <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Unknown widget type: <code className="font-mono">{widget.widgetType}</code>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Available: {Object.keys(WIDGET_MAP).join(', ')}
        </p>
      </div>
    )
  }

  // For inline/compact mode, override height
  const inlineOverrides = compactMode ? {
    height: 420, // Large, professional height for better data visualization
  } : {}

  try {
    return (
      <div className={cn('w-full max-w-none', className)}>
        <Component {...widget.props} {...inlineOverrides} />
      </div>
    )
  } catch (error) {
    console.error('Widget rendering error:', error)
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

export default InlineWidgetRenderer
