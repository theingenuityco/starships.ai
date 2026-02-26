---
title: Stack Widget
slug: widgets/stack
category: widgets
---

# Stack Widget

A flexbox-based layout widget for arranging children in a row or column with consistent spacing.

## Component Name

`Stack`

## Props

### direction
- **Type:** `"column" | "row"`
- **Required:** No (default `"column"`)
- **Description:** Main axis direction.

### gap
- **Type:** `number`
- **Required:** No (default `12`)
- **Description:** Spacing between children.

### align
- **Type:** `"__default__" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline"`
- **Required:** No
- **Description:** `align-items` override for the flex container.

### justify
- **Type:** `"__default__" | "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"`
- **Required:** No
- **Description:** `justify-content` override for the flex container.

### wrap
- **Type:** `boolean`
- **Required:** No (default `false`)
- **Description:** When `true`, enables wrapping (`flex-wrap`).

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the container.

## Usage Example

```json
{
  "widgetType": "Stack",
  "props": {
    "direction": "row",
    "gap": 12,
    "align": "center",
    "className": "p-4 border rounded-lg"
  }
}
```
