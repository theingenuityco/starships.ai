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
| `color` | ⛔ | **IMPORTANT: Always use hex color codes (e.g., `"#3b82f6"`, `"#ef4444"`)**. Do not use CSS variables like `var(--chart-1)`. |

**Example data array**

```ts
[
  { label: 'Chrome', value: 187, color: '#3b82f6' },
  { label: 'Safari', value: 200, color: '#8b5cf6' }
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
      { "label": "Chrome", "value": 187, "color": "#3b82f6" },
      { "label": "Safari", "value": 200, "color": "#8b5cf6" },
      { "label": "Firefox", "value": 65, "color": "#06b6d4" },
      { "label": "Other", "value": 48, "color": "#f59e0b" }
    ]
  }
}
```

## Agent Playbook

1. **Keep slices manageable:** Aim for 3–7 categories. If prompts list more, aggregate the smallest slices into "Other" or switch to `BarChart`.
2. **Percent labels vs. tooltips:** Enable `showLabels` only when slices have enough area (>15%). Otherwise rely on tooltips to show exact percentages and values.
3. **Color strategy: ALWAYS USE HEX COLORS.** Generate visually distinct hex color codes for each data point (e.g., `"#3b82f6"`, `"#8b5cf6"`, `"#06b6d4"`). Never use CSS variables like `var(--chart-1)`. Use a diverse color palette with good contrast.
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

