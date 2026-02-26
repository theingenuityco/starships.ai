---
title: Tabs Widget
slug: widgets/tabs
category: widgets
---

# Tabs Widget

A layout widget that renders a tabbed interface. `Tabs` accepts children; the runtime typically expects children to be arranged per-tab by the `Tabs` implementation.

## Component Name

`Tabs`

## Props

### defaultIndex
- **Type:** `number`
- **Required:** No (default `0`)
- **Description:** Initial tab index.

### labels
- **Type:** `string[]`
- **Required:** No (default `[]`)
- **Description:** Tab labels. (In the view editor, this may be edited via runtime bindings or script-driven patches.)

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the container.

## Usage Example

```json
{
  "widgetType": "Tabs",
  "props": {
    "defaultIndex": 0,
    "labels": ["Overview", "Details"],
    "className": "w-full"
  }
}
```
