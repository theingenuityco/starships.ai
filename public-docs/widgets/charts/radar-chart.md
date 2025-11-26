---
title: Radar Chart Widget
slug: widgets/charts/radar
category: widgets
---

# Radar Chart Widget

Radar (spider) charts compare multiple metrics across the same axes. This widget composes shadcn/ui’s chart primitives (`ChartContainer`, `ChartTooltipContent`, `ChartLegendContent`) so color variables, accessibility, and responsive behavior match the official documentation (see Context7 `/websites/ui_shadcn`, topic `charts`).

## Component Name

`RadarChart`

## Data & Config Anatomy

| Piece | Required? | Description |
| --- | --- | --- |
| `indexKey` | ✅ | Field on every datum used by `PolarAngleAxis`. Typical values: `"skill"`, `"metric"`, `"region"`. |
| `series` | ✅ | Array of `{ dataKey, label, color? }`. Each `dataKey` must exist on every datum. Colors can reference CSS vars like `var(--chart-2)` (per shadcn “Configure Chart Colors in Global CSS”). |
| `data` | ✅ | Array of plain objects. Every object needs `indexKey` plus *all* series `dataKey`s. Numeric values drive the radius. |
| `maxValue` | ⛔ | Optional cap for the radius axis (e.g., 5, 10, 100). If omitted, Recharts infers max from data. |

**Sample data row**

```ts
{
  skill: "Frontend",   // indexKey
  alice: 80,           // series[0].dataKey
  bob: 60              // series[1].dataKey
}
```

## Prop Reference

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | ✅ | Shown inside the card header. |
| `description` | `string` | ❌ | Secondary text below the title. |
| `data` | `Array<Record<string, string \| number>>` | ✅ | Must contain `indexKey` and every `series.dataKey`. |
| `indexKey` | `string` | ✅ | Field used for axis labels. |
| `series` | `ChartSeriesConfig[]` | ✅ | `dataKey`, `label`, optional `color`. Drives `ChartConfig`. |
| `height` | `number` | ❌ (default `320`) | Applied to the `ChartContainer` style. |
| `showLegend` | `boolean` | ❌ (default `true`) | Wraps shadcn `ChartLegendContent`. |
| `showGrid` | `boolean` | ❌ (default `true`) | Toggles `PolarGrid`. |
| `startAngle` / `endAngle` | `number` | ❌ | Rotate/offset the spider web (e.g., `startAngle={-90}`). |
| `maxValue` | `number` | ❌ | Explicit polar radius domain (useful when data shares a known scale). |
| `className` | `string` | ❌ | Tailwind classes merged onto the card. |

## Usage Example

```json
{
  "widgetType": "RadarChart",
  "props": {
    "title": "Team Skill Radar",
    "description": "Self-reported proficiencies",
    "indexKey": "skill",
    "series": [
      { "dataKey": "alice", "label": "Alice", "color": "var(--chart-1)" },
      { "dataKey": "bob", "label": "Bob", "color": "var(--chart-2)" }
    ],
    "data": [
      { "skill": "Frontend", "alice": 80, "bob": 60 },
      { "skill": "Backend", "alice": 65, "bob": 85 },
      { "skill": "DevOps", "alice": 55, "bob": 70 },
      { "skill": "UX", "alice": 90, "bob": 50 },
      { "skill": "Data", "alice": 40, "bob": 75 }
    ],
    "maxValue": 100
  }
}
```

## Agent Playbook

1. **Extract consistent axes:** If a prompt lists “Security 4, UX 5, Performance 2”, turn that into `data` entries keyed by `indexKey` (e.g., `metric`) and supply a single series representing the entity.
2. **Multi-entity comparisons:** When comparing people/products, create multiple `series` entries so each contour represents one entity.
3. **Normalize scales:** If the user mentions “scores out of 10”, set `maxValue: 10` to keep the web edge aligned with the statement.
4. **Color guidance:** Use palette tokens (`var(--chart-1...5)`) from the shadcn doc for readability across themes. Direct hex values are also fine if the prompt insists on brand colors.
5. **Legend vs. labels:** Keep `showLegend` true unless there’s only one series—the legend communicates which contour is which without cluttering the axes.
6. **Context paragraph:** Mention the evaluation scale or time period in `description` so end users know what the axes represent.

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

Radar props extend those interfaces:

```ts
type RadarChartProps = ChartWidgetBaseProps & {
  data: ChartDataPoint[]
  indexKey: string
  series: ChartSeriesConfig[]
  showLegend?: boolean
  showGrid?: boolean
  startAngle?: number
  endAngle?: number
  maxValue?: number
}
```

## References

- Context7 `/websites/ui_shadcn`, topic `charts` → “Configure Chart Theme with ChartConfig Type”, tooltip integration, and color variable recommendations mirrored in this widget.

