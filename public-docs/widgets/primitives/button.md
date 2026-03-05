---
title: Button Widget
slug: widgets/primitives/button
category: widgets
---

# Button Widget

## Overview

An interactive button widget. In Views, `Button` supports a `click` event handler (via node `handlers.click`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "cta",
  "type": "Button",
  "props": { "label": "Run workflow" },
  "handlers": {
    "click": {
      "kind": "actions",
      "actions": [{ "type": "run_workflow", "workflowSlug": "my-workflow", "args": { "source": "view" } }]
    }
  }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Button"` | Button label text. |
| `variant` | `"default" \| "destructive" \| "outline" \| "primaryOutline" \| "secondary" \| "ghost" \| "link"` | No | `"default"` | Visual style variant. |
| `size` | `"default" \| "sm" \| "lg" \| "icon"` | No | `"default"` | Size variant. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind class string applied to the button. |

## Events / handlers (optional)

- Views: `handlers.click` is supported on `Button` nodes.
  - The runtime only wires the `click` event if `handlers.click` exists on the node.
  - `click` payload: `undefined`

## Related

- `../README.md`
- Primitives: `./text.md`
- Views runtime: `../../views/runtime.md`

