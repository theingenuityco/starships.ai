---
title: Text Widget
slug: widgets/primitives/text
category: widgets
---

# Text Widget

## Overview

A simple text widget. Choose the HTML tag via `as`, set content via `text`, and style with `className`.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "title",
  "type": "Text",
  "props": { "as": "h2", "text": "Quarterly Summary", "className": "text-xl font-semibold" }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `as` | `"p" \| "span" \| "div" \| "h1" \| "h2" \| "h3" \| "h4" \| "h5" \| "h6"` | No | `"p"` | HTML tag to render. |
| `text` | `string` | No | `"Text"` | Text content. |
| `className` | `string` | No | - | Tailwind class string applied to the element. |

## Related

- `../README.md`
- Primitives: `./button.md`

