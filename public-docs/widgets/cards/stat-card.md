---
title: StatCard Widget
slug: widgets/cards/stat-card
category: widgets
---

# StatCard Widget

## Overview

A card widget that displays multiple statistics with labels, values, and optional variants for emphasis.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): Yes

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "System Health",
    "description": "Last 24 hours",
    "stats": [
      { "label": "Active Users", "value": 842, "variant": "success" },
      { "label": "Pending Actions", "value": 23, "variant": "warning" },
      { "label": "System Errors", "value": 3, "variant": "error" }
    ]
  }
}
```

### Views node (widget tree)

```json
{
  "id": "kpis",
  "type": "StatCard",
  "props": {
    "title": "System Health",
    "stats": [{ "label": "Active Users", "value": 842 }]
  }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `title` | `string` | Yes | - | Card heading. |
| `description` | `string` | No | - | Subtitle/context. |
| `stats` | `Array<{ label: string; value: string \| number; variant?: "default" \| "success" \| "warning" \| "error"; icon?: string }>` | Yes | - | Stats grid content. |
| `className` | `string` | No | - | Tailwind classes on the card container. |

## Examples

### StatCard with icons

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "Revenue Metrics",
    "description": "Last 30 days",
    "stats": [
      { "label": "Total Revenue", "value": "$45,230", "variant": "success", "icon": "dollar-sign" },
      { "label": "Orders", "value": 342, "icon": "shopping-cart" },
      { "label": "Refunds", "value": "$850", "variant": "warning", "icon": "arrow-left" }
    ]
  }
}
```

## Related

- `../README.md`
- Data: `../data/metric-grid.md`, `../data/data-table.md`
- Charts: `../charts/bar-chart.md`, `../charts/line-chart.md`

