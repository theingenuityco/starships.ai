---
title: Radial Bar Chart Widget
slug: widgets/charts/radial
category: widgets
---

# Radial Bar Chart Widget

A radial (semi-donut) bar chart for ranking categories while keeping focus on absolute values instead of proportions. It leverages shadcn/ui’s `ChartContainer`, tooltip, and CSS-variable theming, ensuring consistency with other chart widgets (see Context7 `/websites/ui_shadcn`, topic `charts`).

## Component Name

`RadialChart`

## Data & Config Anatomy

| Piece | Required? | Description |
| --- | --- | --- |
| `data` | ✅ | Array of `{ label: string; value: number; color?: string }`. Each item renders a single radial bar. |
| `value` | ✅ | Numeric magnitude. Drives radial length. |
| `label` | ✅ | Name used in the legend and tooltip. |
| `color` | ⛔ | **IMPORTANT: Always use hex color codes (e.g., `"#3b82f6"`, `"#ef4444"`)**. Do not use CSS variables like `var(--chart-1)`. |

**Default palette fallback**

If `color` is omitted, the widget uses built-in fallback colors.

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Card header title. |
| `description` | `string` | ❌ | Context/subtitle. |
| `data` | `RadialSegment[]` | ✅ | See “Data & Config Anatomy”. |
| `height` | `number` | ❌ (default `320`) | Passed to `ChartContainer` style. |
| `innerRadius` | `number \| string` | ❌ (default `"40%"`) | Controls the hole size; increase for donut-style visuals. |
| `outerRadius` | `number \| string` | ❌ (default `"100%"`) | Max radius; adjust when embedding inside smaller cards. |
| `startAngle` / `endAngle` | `number` | ❌ (defaults `90` → `450`) | Sweep of the arcs. Use `180 -> 540` for semicircle gauges. |
| `showLegend` | `boolean` | ❌ (default `true`) | Renders a textual legend below the chart. |
| `className` | `string` | ❌ | Tailwind classes for the card container. |

## Usage Example

```json
{
  "widgetType": "RadialChart",
  "props": {
    "title": "Top Support Queues",
    "description": "Tickets resolved last week",
    "data": [
      { "label": "Billing", "value": 142, "color": "#3b82f6" },
      { "label": "Onboarding", "value": 118, "color": "#8b5cf6" },
      { "label": "Security", "value": 96, "color": "#06b6d4" },
      { "label": "Integrations", "value": 84, "color": "#f59e0b" }
    ],
    "innerRadius": "55%",
    "outerRadius": "95%",
    "startAngle": 180,
    "endAngle": 540
  }
}
```

## Agent Playbook

1. **Ranked data:** Use this widget when the prompt highlights top/bottom performers instead of proportions. Provide explicit numeric `value`s; the legend displays them verbatim.
2. **Set sweep intentionally:** `startAngle` + `endAngle` determine whether this feels like a KPI gauge (180°) or full radial ranking (360°+). Tie these settings back to the user's wording ("Create a half-circle progress chart").
3. **Color strategy: ALWAYS USE HEX COLORS.** Generate visually distinct hex color codes for each data point (e.g., `"#3b82f6"`, `"#8b5cf6"`, `"#06b6d4"`). Never use CSS variables like `var(--chart-1)`. Use a diverse color palette with good contrast.
4. **Summaries:** Since radial bars don’t convey totals, mention aggregate context (e.g., “Total tickets resolved: 540”) in `description` or a nearby `StatCard`.
5. **Limit categories:** 3–6 slices keep legends readable. If a prompt lists many categories, consider switching to `BarChart` or summarizing long tails inside `DataTable`.
6. **Zero / negative values:** Avoid negative numbers—radial bars are intended for positive magnitudes. If the prompt includes decreases, convert them into absolute values with clarifying text (e.g., “-12% decrease ⇒ value: 12, description clarifies direction”).

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

export type RadialSegment = PieSegment
```

Radial props extend those definitions:

```ts
type RadialChartProps = ChartWidgetBaseProps & {
  data: RadialSegment[]
  innerRadius?: number | string
  outerRadius?: number | string
  startAngle?: number
  endAngle?: number
  showLegend?: boolean
}
```

## References

- Context7 `/websites/ui_shadcn`, topic `charts` → CSS variable palette guidance, tooltip patterns, and general chart configuration used here.

