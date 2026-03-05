---
title: MetricGrid Widget
slug: widgets/data/metric-grid
category: widgets
---

# MetricGrid Widget

## Overview

A responsive grid for displaying multiple metrics / key-value pairs. Unlike `StatCard`, it has no card wrapper and focuses on compact presentation.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): Yes

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "System Overview",
    "metrics": [
      { "label": "CPU Usage", "value": 45, "unit": "%" },
      { "label": "Memory", "value": 8.2, "unit": "GB" },
      { "label": "Uptime", "value": "24d 6h" }
    ],
    "columns": 3
  }
}
```

### Views node (widget tree)

```json
{
  "id": "metrics",
  "type": "MetricGrid",
  "props": {
    "title": "System Overview",
    "metrics": [{ "label": "CPU Usage", "value": 45, "unit": "%" }],
    "columns": 3
  }
}
```

## Props

| Prop           | Type                                                                                                                                                        | Required | Default | Notes                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------- |
| `metrics`      | `Array<{ label: string; value: string \| number; unit?: string; trend?: "up" \| "down" \| "neutral"; trendValue?: string; color?: string; icon?: string }>` | Yes      | -       | Primary content. `color` should be a hex code.          |
| `title`        | `string`                                                                                                                                                    | No       | -       | Optional heading above the grid.                        |
| `description`  | `string`                                                                                                                                                    | No       | -       | Optional subtitle/context.                              |
| `columns`      | `number`                                                                                                                                                    | No       | `3`     | Responsive column target (layout adapts by breakpoint). |
| `compact`      | `boolean`                                                                                                                                                   | No       | `false` | Reduced spacing for dense layouts.                      |
| `showDividers` | `boolean`                                                                                                                                                   | No       | `true`  | Vertical dividers between metrics.                      |
| `className`    | `string`                                                                                                                                                    | No       | -       | Tailwind classes on the outer container.                |

## Examples

### MetricGrid with trends

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Business Metrics",
    "description": "Last 30 days vs previous period",
    "metrics": [
      { "label": "Revenue", "value": "$125,430", "trend": "up", "trendValue": "+12%" },
      { "label": "Conversion Rate", "value": 3.2, "unit": "%", "trend": "down", "trendValue": "-0.4%" }
    ]
  }
}
```

## Supported icons (optional)

`icon` is a string key. Use lowercase with hyphens (e.g. `alert-circle`, `dollar-sign`).

## Related

- `../README.md`
- Data: `./data-table.md`
- Cards: `../cards/stat-card.md`
