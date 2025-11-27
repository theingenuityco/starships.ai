---
title: Area Chart Widget
slug: widgets/charts/area
category: widgets
---

# Area Chart Widget

Stacked or single-series area charts that emphasize magnitude over time. Built per the [`AreaChart` guidance from shadcn/ui](https://ui.shadcn.com/docs/components/chart), so it automatically wires `ChartConfig` colors, tooltips, and legends outlined in Context7.

## Component Name

`AreaChart`

## Data & Config Anatomy

| Piece | Required? | Description |
| --- | --- | --- |
| `indexKey` | ✅ | Field used for the X-axis (dates, categories, etc.). |
| `series` | ✅ | Array of `{ dataKey, label, color? }`. When `stack` is true, every series shares `stackId="stack"`. **IMPORTANT: Always use hex color codes (e.g., `"#3b82f6"`)**, not CSS variables. |
| `data` | ✅ | Array of objects containing the `indexKey` plus every `series.dataKey`. Values must be numeric. |
| `stack` | ⛔ | Determines whether the widget calls `Area` with a shared `stackId`. |

**Sample datum**

```ts
{
  date: "2024-06-10",   // indexKey
  organic: 2400,        // series[0]
  paid: 1200            // series[1]
}
```

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card heading. |
| `description` | `string` | ❌ | Subtitle/context. |
| `data` | `Array<Record<string, string \| number>>` | ✅ | Must include `indexKey` + series keys. |
| `indexKey` | `string` | ✅ | X-axis field. |
| `series` | `ChartSeriesConfig[]` | ✅ | Supplies labels/colors for each area. |
| `height` | `number` | ❌ (default `260`) | `ChartContainer` height. |
| `showLegend` | `boolean` | ❌ (default `true`) | Toggles `ChartLegendContent`. |
| `showGrid` | `boolean` | ❌ (default `true`) | Displays dashed `CartesianGrid`. |
| `stack` | `boolean` | ❌ (default `false`) | When true, each area shares `stackId="stack"`. |
| `className` | `string` | ❌ | Tailwind classes on the card. |

## Usage Example

```json
{
  "widgetType": "AreaChart",
  "props": {
    "title": "Traffic Mix",
    "description": "7 day moving average",
    "indexKey": "date",
    "stack": true,
    "series": [
      { "dataKey": "organic", "label": "Organic", "color": "#3b82f6" },
      { "dataKey": "paid", "label": "Paid", "color": "#8b5cf6" }
    ],
    "data": [
      { "date": "2024-06-10", "organic": 2400, "paid": 1200 },
      { "date": "2024-06-11", "organic": 2600, "paid": 900 },
      { "date": "2024-06-12", "organic": 2800, "paid": 1400 },
      { "date": "2024-06-13", "organic": 3000, "paid": 1500 }
    ]
  }
}
```

## Agent Playbook

1. **Stack when describing composition:** If the user talks about mixes/percentages ("organic vs paid"), enable `stack: true` so colors accumulate toward the top.
2. **Non-stacked for overlaps:** For "compare trends" prompts, keep `stack` false so each line/area stands alone.
3. **Formatter usage:** Pre-format dates/units within your data if you need abbreviations or localized strings; the widget renders values as-is.
4. **Color strategy: ALWAYS USE HEX COLORS.** Generate visually distinct hex color codes for each series (e.g., `"#3b82f6"`, `"#8b5cf6"`, `"#06b6d4"`). Never use CSS variables like `var(--chart-1)`. Use a diverse color palette with good contrast.
5. **Data smoothing:** If the prompt references moving averages, provide already-smoothed data; the widget simply plots what you pass in.
6. **Totals elsewhere:** Since stacked areas show contributions but not exact totals, mention sums in `description` or add a `StatCard`.

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

Area props extend those types:

```ts
type AreaChartProps = ChartWidgetBaseProps & {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  stack?: boolean
  showLegend?: boolean
  showGrid?: boolean
}
```

## References

- Context7 `/websites/ui_shadcn` topic `charts` → “Define ChartConfig with labels, icons, and colors”, “Configure Chart Data and Config Objects for Tooltip”, and the AreaChart snippets that inspired this widget.

