---
title: Grid Widget
slug: widgets/layout/grid
category: widgets
---

# Grid Widget

## Overview

A responsive layout widget for arranging children in a grid. Control the number of columns, gaps, and a minimum column width.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): Yes

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "Grid",
  "props": {
    "cols": 3,
    "gap": 16,
    "minColWidthPx": 280,
    "className": "w-full"
  }
}
```

### Views node (widget tree)

```json
{
  "id": "grid",
  "type": "Grid",
  "props": { "cols": 3, "gap": 16, "minColWidthPx": 280 },
  "children": []
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `cols` | `number` | No | `3` | Target number of columns. |
| `gap` | `number` | No | `16` | Spacing between grid items. |
| `minColWidthPx` | `number` | No | `320` | Minimum width per column; grid may reduce columns on smaller screens. |
| `className` | `string` | No | - | Tailwind class string applied to the container. |

## Related

- `../README.md`
- Layout: `./box.md`, `./stack.md`

