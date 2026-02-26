---
title: Tabs Widget
slug: widgets/layout/tabs
category: widgets
---

# Tabs Widget

## Overview

A layout widget that renders a tabbed interface. `Tabs` accepts children; the widget implementation controls how children are partitioned per tab.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "tabs",
  "type": "Tabs",
  "props": { "defaultIndex": 0, "labels": ["Overview", "Details"] },
  "children": []
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `defaultIndex` | `number` | No | `0` | Initial tab index. |
| `labels` | `string[]` | No | `[]` | Tab labels. |
| `className` | `string` | No | - | Tailwind class string applied to the container. |

## Related

- `../README.md`
- Layout: `./stack.md`, `./grid.md`

