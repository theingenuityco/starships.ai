---
title: Line Chart Widget
slug: widgets/charts/line
category: widgets
---

# Line Chart Widget

Time-series visualization with smooth curves, optional dots, and shadcn/ui tooltips. By reusing `ChartContainer`, `ChartTooltipContent`, and `ChartLegendContent` (Context7 `/websites/ui_shadcn`, topic `charts`), the widget inherits official accessibility and theming guidance.

## Component Name

`LineChart`

## Data & Config Anatomy

| Piece | Required? | Description |
| --- | --- | --- |
| `indexKey` | ✅ | Field used for the X-axis (dates, categories, etc.). |
| `series` | ✅ | Array of `{ dataKey, label, color? }`. Each line corresponds to one series entry. **IMPORTANT: Always use hex color codes (e.g., `"#3b82f6"`)**, not CSS variables. |
| `data` | ✅ | Array of objects where every row contains the `indexKey` plus each series `dataKey`. Values must be numeric to plot along Y-axis. |
| `showDots` | ⛔ | When true (default), renders `dot` + `activeDot` markers. Disable for dense data. |

**Sample datum**

```ts
{
  date: "2024-06-01",   // indexKey
  desktop: 222,         // line for series "desktop"
  mobile: 150           // line for series "mobile"
}
```

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card heading. |
| `description` | `string` | ❌ | Subtitle / context. |
| `data` | `Array<Record<string, string \| number>>` | ✅ | Must include `indexKey` + all series keys. |
| `indexKey` | `string` | ✅ | Passed to `XAxis.dataKey`. |
| `series` | `ChartSeriesConfig[]` | ✅ | Defines each line’s label/color. |
| `height` | `number` | ❌ (default `260`) | `ChartContainer` height. |
| `showLegend` | `boolean` | ❌ (default `true`) | Toggles `ChartLegendContent`. |
| `showGrid` | `boolean` | ❌ (default `true`) | Enables dashed `CartesianGrid`. |
| `showDots` | `boolean` | ❌ (default `true`) | Controls dot rendering; `activeDot` remains for hover states. |
| `className` | `string` | ❌ | Extra Tailwind classes. |

## Usage Example

```json
{
  "widgetType": "LineChart",
  "props": {
    "title": "Daily Active Users",
    "description": "UTC rolling 7-day average",
    "indexKey": "date",
    "series": [
      { "dataKey": "desktop", "label": "Desktop", "color": "#3b82f6" },
      { "dataKey": "mobile", "label": "Mobile", "color": "#8b5cf6" }
    ],
    "data": [
      { "date": "2024-06-01", "desktop": 222, "mobile": 150 },
      { "date": "2024-06-02", "desktop": 97, "mobile": 180 },
      { "date": "2024-06-03", "desktop": 167, "mobile": 120 },
      { "date": "2024-06-04", "desktop": 242, "mobile": 260 }
    ],
    "height": 300,
    "showDots": true
  }
}
```

## Agent Playbook

1. **Match scale to prompt:** If the user specifies "7-day moving average", mention it in `description` and ensure data reflects the aggregated values.
2. **Pre-format labels:** Abbreviate dates or convert units before passing data to the widget (e.g., store `"Apr 12"` or thousands as `value / 1000`).
3. **Dots vs. density:** Leave `showDots` on for ≤ 30 data points; disable for dense telemetry to reduce noise.
4. **Color strategy: ALWAYS USE HEX COLORS.** Generate visually distinct hex color codes for each series (e.g., `"#3b82f6"`, `"#8b5cf6"`, `"#06b6d4"`). Never use CSS variables like `var(--chart-1)`. Use a diverse color palette with good contrast.
5. **Latest value callouts:** Pair with a `StatCard` summarizing the final data point or delta to give agents a textual hook.
6. **Friendly labels:** Tooltips display `series.label`, so keep them human readable ("Mobile Visitors" vs. "mobile").
6. **Handling missing data:** If prompts include gaps, fill `null` for the missing series key—Recharts will break the line, signaling incomplete data.

## Relevant TypeScript


```ts
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
```

Line charts expect:

```ts
type LineChartProps = ChartWidgetBaseProps & {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  showDots?: boolean
}
```

## References

- Context7 `/websites/ui_shadcn`, topic `charts` → “Chart Tooltip Integration with ChartTooltipContent”, “Create Interactive Bar Chart with Recharts” (axis formatting pattern), and “Configure Chart Theme with ChartConfig Type”.

