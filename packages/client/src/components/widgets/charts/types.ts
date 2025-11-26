export interface ChartWidgetBaseProps {
  title: string
  description?: string
  height?: number
  className?: string
}

export interface ChartSeriesConfig {
  dataKey: string
  label: string
  color?: string
}

export interface ChartDataPoint {
  [key: string]: string | number | undefined
  label?: string
  value?: number
}

export interface PieSegment {
  label: string
  value: number
  color?: string
}

export type RadialSegment = PieSegment

