'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetRenderer, type WidgetConfig } from '@/components/widgets'
import { WIDGET_TYPES } from '@/components/widgets/widgetRegistry'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'

type WidgetGalleryItem = {
  id: string
  widgetType: string
  name: string
  description?: string
  props: Record<string, any>
}

function buildWidgetGallery(starshipId: string): WidgetGalleryItem[] {
  const chartSeriesA = [
    { dataKey: 'revenue', label: 'Revenue', color: '#3b82f6' },
    { dataKey: 'cost', label: 'Cost', color: '#ef4444' },
  ]

  const timeSeries = [
    { month: 'Jan', revenue: 120, cost: 80 },
    { month: 'Feb', revenue: 180, cost: 95 },
    { month: 'Mar', revenue: 160, cost: 110 },
    { month: 'Apr', revenue: 220, cost: 120 },
    { month: 'May', revenue: 260, cost: 150 },
    { month: 'Jun', revenue: 240, cost: 140 },
  ]

  return [
    {
      id: 'stat-card',
      widgetType: 'StatCard',
      name: 'StatCard',
      description: 'High-level KPIs in a compact card grid.',
      props: {
        title: 'KPIs',
        stats: [
          { label: 'MRR', value: '$42,180', variant: 'success', icon: 'trending-up' },
          { label: 'Churn', value: '1.8%', variant: 'warning', icon: 'percent' },
          { label: 'Incidents', value: 2, variant: 'error', icon: 'alert-triangle' },
        ],
      },
    },
    {
      id: 'metric-grid',
      widgetType: 'MetricGrid',
      name: 'MetricGrid',
      description: 'A grid of metrics with trends.',
      props: {
        title: 'Operational metrics',
        columns: 3,
        metrics: [
          { label: 'Latency', value: 182, unit: 'ms', trend: 'down', trendValue: '-8%', icon: 'activity' },
          { label: 'Uptime', value: '99.97', unit: '%', trend: 'up', trendValue: '+0.03%', icon: 'check-circle' },
          { label: 'Errors', value: 14, unit: '/day', trend: 'neutral', trendValue: '±0%', icon: 'bug' },
        ],
      },
    },
    {
      id: 'data-table',
      widgetType: 'DataTable',
      name: 'DataTable',
      description: 'Tabular data with pagination + CSV export.',
      props: {
        title: 'Top customers',
        columns: [
          { key: 'name', label: 'Name', format: 'text' },
          { key: 'plan', label: 'Plan', format: 'text' },
          { key: 'mrr', label: 'MRR', format: 'currency' },
          { key: 'active', label: 'Active', format: 'text' },
        ],
        data: [
          { name: 'Acme Corp', plan: 'Pro', mrr: 1299, active: true },
          { name: 'Starlight Labs', plan: 'Team', mrr: 799, active: true },
          { name: 'Northwind', plan: 'Starter', mrr: 199, active: false },
          { name: 'Umbra Systems', plan: 'Enterprise', mrr: 4999, active: true },
        ],
        pageSize: 10,
      },
    },
    {
      id: 'bar-chart',
      widgetType: 'BarChart',
      name: 'BarChart',
      description: 'Multi-series bar chart.',
      props: {
        title: 'Revenue vs Cost',
        description: 'Last 6 months',
        data: timeSeries,
        indexKey: 'month',
        series: chartSeriesA,
        stacked: false,
      },
    },
    {
      id: 'line-chart',
      widgetType: 'LineChart',
      name: 'LineChart',
      description: 'Multi-series line chart.',
      props: {
        title: 'Revenue vs Cost (trend)',
        description: 'Last 6 months',
        data: timeSeries,
        indexKey: 'month',
        series: chartSeriesA,
        showDots: true,
      },
    },
    {
      id: 'area-chart',
      widgetType: 'AreaChart',
      name: 'AreaChart',
      description: 'Area chart (stacking optional).',
      props: {
        title: 'Revenue vs Cost (area)',
        description: 'Last 6 months',
        data: timeSeries,
        indexKey: 'month',
        series: chartSeriesA,
        stack: true,
      },
    },
    {
      id: 'pie-chart',
      widgetType: 'PieChart',
      name: 'PieChart',
      description: 'Distribution / composition.',
      props: {
        title: 'Spend by category',
        description: 'This month',
        data: [
          { label: 'Compute', value: 42, color: '#3b82f6' },
          { label: 'Storage', value: 18, color: '#8b5cf6' },
          { label: 'Networking', value: 15, color: '#06b6d4' },
          { label: 'Other', value: 25, color: '#f59e0b' },
        ],
        showLabels: true,
      },
    },
    {
      id: 'donut-chart',
      widgetType: 'DonutChart',
      name: 'DonutChart',
      description: 'Pie chart with a center label/total.',
      props: {
        title: 'Tickets by priority',
        description: 'Rolling 7 days',
        centerLabel: 'Tickets',
        data: [
          { label: 'P0', value: 2, color: '#ef4444' },
          { label: 'P1', value: 8, color: '#f59e0b' },
          { label: 'P2', value: 19, color: '#3b82f6' },
          { label: 'P3', value: 34, color: '#10b981' },
        ],
      },
    },
    {
      id: 'radar-chart',
      widgetType: 'RadarChart',
      name: 'RadarChart',
      description: 'Compare series across categorical dimensions.',
      props: {
        title: 'Capability score',
        description: 'Agent vs baseline',
        data: [
          { skill: 'Reasoning', agent: 86, baseline: 74 },
          { skill: 'Speed', agent: 78, baseline: 82 },
          { skill: 'Accuracy', agent: 84, baseline: 73 },
          { skill: 'Tooling', agent: 92, baseline: 61 },
          { skill: 'UX', agent: 75, baseline: 68 },
        ],
        indexKey: 'skill',
        series: [
          { dataKey: 'agent', label: 'Agent', color: '#3b82f6' },
          { dataKey: 'baseline', label: 'Baseline', color: '#8b5cf6' },
        ],
        maxValue: 100,
      },
    },
    {
      id: 'radial-chart',
      widgetType: 'RadialChart',
      name: 'RadialChart',
      description: 'Radial bars per segment.',
      props: {
        title: 'Usage by module',
        description: 'Last 30 days',
        data: [
          { label: 'Chat', value: 120 },
          { label: 'Connectors', value: 78 },
          { label: 'Automations', value: 54 },
          { label: 'Marketplace', value: 33 },
        ],
      },
    },
    {
      id: 'connector-suggestion-card',
      widgetType: 'ConnectorSuggestionCard',
      name: 'ConnectorSuggestionCard',
      description: 'Inline connector install prompts.',
      props: {
        starshipId,
        providers: ['slack', 'notion'],
        hideSearch: true,
        hideDisconnect: false,
      },
    },
    {
      id: 'agent-suggestion-card',
      widgetType: 'AgentSuggestionCard',
      name: 'AgentSuggestionCard',
      description: 'Inline marketplace agent suggestions.',
      props: {
        starshipId,
        templateSlugs: ['data-analyst', 'support-triage', 'github-pr-summarizer'],
        maxColumns: 2,
      },
    },
    {
      id: 'starship-details',
      widgetType: 'StarshipDetails',
      name: 'StarshipDetails',
      description: 'Editable starship profile widget.',
      props: { starshipId },
    },
  ]
}

export default function WidgetsGalleryPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship, isLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const gallery = useMemo(() => (starshipId ? buildWidgetGallery(starshipId) : []), [starshipId])
  const missingWidgetTypes = useMemo(() => {
    if (!starshipId) return []
    const present = new Set(gallery.map(w => w.widgetType))
    return WIDGET_TYPES.filter(t => !present.has(t))
  }, [gallery, starshipId])

  const GRID_COLS = 3
  const MIN_COL_WIDTH_PX = 520

  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${GRID_COLS}, minmax(${MIN_COL_WIDTH_PX}px, 1fr))`,
    }),
    [GRID_COLS, MIN_COL_WIDTH_PX]
  )

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex min-w-0 w-full gap-2 items-center">
                <span className="flex-shrink-0 self-center md:hidden">
                  <MobileNavToggleButton className="mx-2" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-baseline gap-2 min-w-0 w-full">
                    <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                      <Icon name="bar-chart" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Widgets</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      Gallery view of all supported conversation widgets (fixed columns, infinite rows).
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {starship?.name ? (
              <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[40%]" title={starship.name}>
                {starship.name}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className="w-full bg-transparent max-w-none mx-auto min-h-full flex flex-col gap-4">
          {isLoading && !starshipId ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          ) : !starshipId ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">No starship selected.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto pb-4">
              {missingWidgetTypes.length > 0 ? (
                <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-900 dark:text-yellow-200">
                  Missing gallery examples for: <code className="font-mono text-[12px]">{missingWidgetTypes.join(', ')}</code>
                </div>
              ) : null}
              <div className="grid gap-5 items-start" style={gridStyle}>
                {gallery.map(item => (
                  <Card key={item.id} className={cn('border-border/60 shadow-sm')}>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                        <span className="truncate">{item.name}</span>
                        <code className="text-[11px] font-mono text-muted-foreground">{item.widgetType}</code>
                      </CardTitle>
                      {item.description ? <CardDescription className="text-xs">{item.description}</CardDescription> : null}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="w-full max-w-none">
                        <WidgetRenderer
                          widget={
                            {
                              id: item.id,
                              widgetType: item.widgetType,
                              props: item.props,
                            } satisfies WidgetConfig
                          }
                          className="w-full max-w-none"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

