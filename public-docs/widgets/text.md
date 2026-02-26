---
title: Text Widget
slug: widgets/text
category: widgets
---

# Text Widget

A simple text widget. Choose the HTML tag via `as`, set content via `text`, and style with `className`.

## Component Name

`Text`

## Props

### as
- **Type:** `"p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"`
- **Required:** No (default `"p"`)
- **Description:** HTML tag to render.

### text
- **Type:** `string`
- **Required:** No (default `"Text"`)
- **Description:** Text content.

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the element.

## Usage Example

```json
{
  "widgetType": "Text",
  "props": {
    "as": "h2",
    "text": "Quarterly Summary",
    "className": "text-xl font-semibold"
  }
}
```
