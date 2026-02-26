---
title: Stack Widget
slug: widgets/layout/stack
category: widgets
---

# Stack Widget

## Overview

A flexbox-based layout widget for arranging children in a row or column with consistent spacing.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "row",
  "type": "Stack",
  "props": { "direction": "row", "gap": 12, "align": "center" },
  "children": []
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `direction` | `"column" \| "row"` | No | `"column"` | Main axis direction. |
| `gap` | `number` | No | `12` | Spacing between children. |
| `align` | `"__default__" \| "flex-start" \| "center" \| "flex-end" \| "stretch" \| "baseline"` | No | `"__default__"` | `align-items` override. |
| `justify` | `"__default__" \| "flex-start" \| "center" \| "flex-end" \| "space-between" \| "space-around" \| "space-evenly"` | No | `"__default__"` | `justify-content` override. |
| `wrap` | `boolean` | No | `false` | When `true`, enables wrapping (`flex-wrap`). |
| `className` | `string` | No | - | Tailwind class string applied to the container. |

## Related

- `../README.md`
- Layout: `./box.md`, `./grid.md`

