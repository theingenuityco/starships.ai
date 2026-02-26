---
title: Grid Widget
slug: widgets/grid
category: widgets
---

# Grid Widget

A responsive layout widget for arranging children in a grid. You can control the number of columns, gaps, and a minimum column width.

## Component Name

`Grid`

## Props

### cols
- **Type:** `number`
- **Required:** No (default `3`)
- **Description:** Target number of columns.

### gap
- **Type:** `number`
- **Required:** No (default `16`)
- **Description:** Spacing between grid items.

### minColWidthPx
- **Type:** `number`
- **Required:** No (default `320`)
- **Description:** Minimum width per column; the grid may reduce columns on smaller screens.

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the container.

## Usage Example

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
