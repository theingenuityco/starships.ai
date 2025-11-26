---
title: Pie Chart Widget
slug: widgets/charts/pie
category: widgets
---

# Pie Chart Widget

Single-ring composition chart for parts-of-a-whole storytelling. Built atop shadcn/ui’s chart primitives (`ChartContainer`, `ChartTooltipContent`, `ChartLegendContent`) so colors, theming, and accessibility follow the official documentation (Context7 `/websites/ui_shadcn`, topic `charts`).

## Component Name

`PieChart`

## Data & Config Anatomy

| Field | Required? | Description |
| --- | --- | --- |
| `label` | ✅ | Slice name rendered in the legend/tooltips. |
| `value` | ✅ | Numeric magnitude. Determines slice angle. |
| `color` | ⛔ | Optional custom color. Use `var(--chart-N)` tokens or hex codes. If omitted, rely on agent-provided palette or fallback colors. |

**Example data array**

```ts
[
  { label: 'Chrome', value: 187, color: 'var(--chart-1)' },
  { label: 'Safari', value: 200, color: 'var(--chart-2)' }
]
```

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card heading. |
| `description` | `string` | ❌ | Subtitle/context. |
| `data` | `PieSegment[]` | ✅ | Each entry becomes a slice. |
| `height` | `number` | ❌ (default `280`) | Chart height. |
| `showLegend` | `boolean` | ❌ (default `true`) | Renders `ChartLegendContent` below the chart. |
| `showLabels` | `boolean` | ❌ (default `false`) | Adds `%` labels directly on slices; only enable when slices are large enough. |
| `className` | `string` | ❌ | Tailwind classes on the card. |

## Usage Example

```json
{
  "widgetType": "PieChart",
  "props": {
    "title": "Browser Share",
    "description": "Week ending Jun 15",
    "showLabels": true,
    "data": [
      { "label": "Chrome", "value": 187, "color": "var(--chart-1)" },
      { "label": "Safari", "value": 200, "color": "var(--chart-2)" },
      { "label": "Firefox", "value": 65, "color": "var(--chart-3)" },
      { "label": "Other", "value": 48, "color": "var(--chart-4)" }
    ]
  }
}
```

## Agent Playbook

1. **Keep slices manageable:** Aim for 3–7 categories. If prompts list more, aggregate the smallest slices into “Other” or switch to `BarChart`.
2. **Percent labels vs. tooltips:** Enable `showLabels` only when slices have enough area (>15%). Otherwise rely on tooltips to show exact percentages and values.
3. **Color alignment:** Use `var(--chart-*)` tokens described in shadcn’s “Configure Chart Colors in Global CSS” snippet for automatic light/dark support.
4. **Totals belong elsewhere:** Mention overall totals in `description` or pair with a `StatCard` so viewers don’t need to sum values.
5. **Ordering:** Sort slices descending unless the user demands alphabetical order; it improves readability, especially with `showLabels`.
6. **Units in tooltips:** If the prompt talks about money or percentages, reflect that in the `description` and optionally customize tooltip display via data formatting.

## Relevant TypeScript

```ts
export interface ChartWidgetBaseProps {
  title: string
  description?: string
  height?: number
  className?: string
}

export interface PieSegment {
  label: string
  value: number
  color?: string
}
```

Pie widget props mirror those definitions:

```ts
type PieChartProps = ChartWidgetBaseProps & {
  data: PieSegment[]
  showLegend?: boolean
  showLabels?: boolean
}
```

## References

- Context7 `/websites/ui_shadcn` topic `charts` → “Configure Chart Data and Config Objects for Tooltip”, “Reference theme colors in chart components”, and the pie/donut examples.

