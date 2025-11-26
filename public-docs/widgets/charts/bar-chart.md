---
title: Bar Chart Widget
slug: widgets/charts/bar
category: widgets
---

# Bar Chart Widget

A multi-series column chart powered by Recharts and shadcn/ui chart patterns. It reuses `ChartContainer`, tooltip, and legend implementations from the official docs (Context7 `/websites/ui_shadcn`, topic `charts`), meaning theme colors (`var(--chart-*)`), keyboard navigation, and responsive sizing all match the recommended approach.

## Component Name

`BarChart`

## Data & Config Anatomy

| Piece | Required? | Description |
| --- | --- | --- |
| `indexKey` | ✅ | Property used for the X-axis. Example: `"month"`, `"date"`, `"region"`. |
| `series` | ✅ | Array of `{ dataKey, label, color? }`. Each `dataKey` must exist on every datum. `color` can be a CSS var (preferred) or raw hex. |
| `data` | ✅ | Array of records. Each record must include the `indexKey` plus all `series.dataKey`s. |
| `stacked` | ⛔ | When `true`, all bars share `stackId="stack"` to create stacked columns. |

**Sample datum**

```ts
{
  month: "Jan",            // indexKey
  desktop: 186,            // series[0].dataKey
  mobile: 80               // series[1].dataKey
}
```

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card heading. |
| `description` | `string` | ❌ | Optional subtitle. |
| `data` | `Array<Record<string, string \| number>>` | ✅ | Must include `indexKey` and all series keys. |
| `indexKey` | `string` | ✅ | Field for `XAxis.dataKey`. |
| `series` | `ChartSeriesConfig[]` | ✅ | Populates `ChartConfig`, legend labels, and colors. |
| `height` | `number` | ❌ (default `260`) | Applied to `ChartContainer`. |
| `showLegend` | `boolean` | ❌ (default `true`) | Toggles `ChartLegendContent`. |
| `showGrid` | `boolean` | ❌ (default `true`) | Controls `CartesianGrid vertical={false}`. |
| `stacked` | `boolean` | ❌ (default `false`) | Switches from grouped to stacked bars. |
| `className` | `string` | ❌ | Tailwind classes merged onto the card. |

## Usage Example

```json
{
  "widgetType": "BarChart",
  "props": {
    "title": "Sessions by Device",
    "description": "Last 6 months",
    "indexKey": "month",
    "series": [
      { "dataKey": "desktop", "label": "Desktop", "color": "var(--chart-2)" },
      { "dataKey": "mobile", "label": "Mobile", "color": "var(--chart-1)" }
    ],
    "data": [
      { "month": "Jan", "desktop": 186, "mobile": 80 },
      { "month": "Feb", "desktop": 305, "mobile": 200 },
      { "month": "Mar", "desktop": 237, "mobile": 120 },
      { "month": "Apr", "desktop": 73, "mobile": 190 },
      { "month": "May", "desktop": 209, "mobile": 130 },
      { "month": "Jun", "desktop": 214, "mobile": 140 }
    ],
    "height": 280,
    "stacked": false
  }
}
```

## Agent Playbook

1. **Map prompts to `series`:** Whenever a user lists multiple metrics (e.g., “desktop vs mobile”), create one `series` entry per metric so the legend is accurate.
2. **Stack only when needed:** Use `stacked: true` when showing contributions to a total; leave it false for comparisons. This mirrors the shadcn interactive bar example referenced in Context7.
3. **Format axes smartly:** Pre-format labels in your data (e.g., store `"Jan"` instead of `"January"`) if you need abbreviations or localized strings.
4. **Honor brand palettes:** Pull colors from `var(--chart-1..5)` for instant theming, or accept custom hex values if the prompt specifies brand colors.
5. **Call out units:** Mention measurement units (e.g., “Sessions”, “k USD”) in `description` or include them inside the data labels for clarity.
6. **Handle long labels:** Shorten or wrap labels before passing data to the widget; legend/tooltips will still provide human-friendly text.

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

`BarChart` extends `ChartWidgetBaseProps` and expects:

```ts
type BarChartProps = ChartWidgetBaseProps & {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  stacked?: boolean
}
```

## Related References

- Context7 `/websites/ui_shadcn`, topic `charts` → “Configure Chart Theme with ChartConfig Type”, “Complete Bar Chart with XAxis and Tooltip”, and “Configure Chart Colors in Global CSS.” These patterns drove this widget’s structure.

