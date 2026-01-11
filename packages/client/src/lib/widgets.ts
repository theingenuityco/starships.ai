export const SUPPORTED_WIDGET_TYPES = [
  'StatCard',
  'DataTable',
  'MetricGrid',
  'BarChart',
  'LineChart',
  'AreaChart',
  'PieChart',
  'DonutChart',
  'RadarChart',
  'RadialChart',
] as const

export type SupportedWidgetType = (typeof SUPPORTED_WIDGET_TYPES)[number]

const SUPPORTED_WIDGET_TYPE_SET = new Set<string>(SUPPORTED_WIDGET_TYPES)

export function isSupportedWidgetType(value: unknown): value is SupportedWidgetType {
  if (typeof value !== 'string') {
    return false
  }
  return SUPPORTED_WIDGET_TYPE_SET.has(value)
}

export function coerceSupportedWidgetType(value: unknown): SupportedWidgetType | null {
  return isSupportedWidgetType(value) ? (value as SupportedWidgetType) : null
}
