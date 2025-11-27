---
title: Donut Chart Widget
slug: widgets/charts/donut
category: widgets
---

# Donut Chart Widget

A hollow pie chart that highlights composition and key totals. Uses shadcn/ui’s `ChartContainer`, `ChartTooltipContent`, and `ChartLegendContent` primitives (Context7 `/websites/ui_shadcn`, topic `charts`) for consistent theming and accessibility.

## Component Name

`DonutChart`

## Data & Config Anatomy

Donut segments reuse the same `PieSegment` structure as the Pie widget:

| Field | Required? | Description |
| --- | --- | --- |
| `label` | ✅ | Slice name (legend + tooltip). |
| `value` | ✅ | Numeric value; summed to show center total if `showTotal` is true. |
| `color` | ⛔ | **IMPORTANT: Always use hex color codes (e.g., `"#3b82f6"`, `"#ef4444"`)**. Do not use CSS variables like `var(--chart-1)`. |

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card heading. |
| `description` | `string` | ❌ | Subtitle/context. |
| `data` | `PieSegment[]` | ✅ | Each item renders a slice. |
| `height` | `number` | ❌ (default `280`) | Chart height. |
| `innerRadius` | `number \| string` | ❌ (default `"65%"`) | Controls size of the center hole. |
| `centerLabel` | `string` | ❌ | Text rendered above the total (e.g., “Total”). |
| `showTotal` | `boolean` | ❌ (default `true`) | Displays the sum of `value`s inside the donut. |
| `showLegend` | `boolean` | ❌ (default `true`) | Renders `ChartLegendContent`. |
| `className` | `string` | ❌ | Tailwind classes on the card. |

## Usage Example

```json
{
  "widgetType": "DonutChart",
  "props": {
    "title": "Budget Allocation",
    "description": "FY25 draft",
    "centerLabel": "Total",
    "data": [
      { "label": "R&D", "value": 35, "color": "#3b82f6" },
      { "label": "Sales", "value": 30, "color": "#8b5cf6" },
      { "label": "Marketing", "value": 20, "color": "#06b6d4" },
      { "label": "Ops", "value": 15, "color": "#f59e0b" }
    ],
    "innerRadius": "60%"
  }
}
```

## Agent Playbook

1. **Center messaging:** Use `centerLabel` + `showTotal` to communicate what the donut represents ("ARR", "Q4 Budget"). If the total isn't meaningful, disable `showTotal`.
2. **Slices vs. readability:** Follow the same 3–7 slice guideline as the Pie widget. If prompts mention many small categories, aggregate or switch chart types.
3. **Color strategy: ALWAYS USE HEX COLORS.** Generate visually distinct hex color codes for each data point (e.g., `"#3b82f6"`, `"#8b5cf6"`, `"#06b6d4"`). Never use CSS variables like `var(--chart-1)`. Use a diverse color palette with good contrast.
4. **Unit clarity:** Mention units in `description` or the center label so the total isn’t ambiguous (e.g., “$” or “hrs”).
5. **Comparison prompts:** When asked to compare “budget vs spend”, consider combining Donut + `StatCard` to show the variance, since the donut only shows ratios/absolute values.
6. **Label trade-offs:** Keep `showLegend` true unless there’s only one slice. The legend relays exact values while the center emphasizes totals.

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

Donut props extend those definitions:

```ts
type DonutChartProps = ChartWidgetBaseProps & {
  data: PieSegment[]
  innerRadius?: number | string
  centerLabel?: string
  showTotal?: boolean
  showLegend?: boolean
}
```

## References

- Context7 `/websites/ui_shadcn` topic `charts`: “Configure Chart Colors in Global CSS”, “Configure Chart Data and Config Objects for Tooltip”, and donut/pie examples leveraged by this widget.

