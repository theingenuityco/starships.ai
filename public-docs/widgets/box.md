---
title: Box Widget
slug: widgets/box
category: widgets
---

# Box Widget

A simple container widget used as the default root of many Views. It accepts children and lets you apply layout/styling via `className`.

## Component Name

`Box`

## Props

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the container.

## Usage Example

```json
{
  "widgetType": "Box",
  "props": {
    "className": "p-6 border rounded-lg bg-background"
  }
}
```

## Notes

- **Views**: `Box` is commonly used as the `root` node (`ViewModel.root`) because it composes children naturally.
