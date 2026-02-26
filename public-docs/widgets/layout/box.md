---
title: Box Widget
slug: widgets/layout/box
category: widgets
---

# Box Widget

## Overview

A simple container widget. Commonly used as the root of Views because it composes children naturally.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "root",
  "type": "Box",
  "props": { "className": "p-6" },
  "children": []
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `className` | `string` | No | - | Tailwind class string applied to the container. |

## Related

- `../README.md`
- Layout: `./stack.md`, `./grid.md`

