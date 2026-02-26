---
title: Button Widget
slug: widgets/primitives/button
category: widgets
---

# Button Widget

## Overview

An interactive button widget. In Views, `Button` supports a `click` event handler (via node `handlers.click`) that can run a script or an action list.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): Yes

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "Button",
  "props": {
    "label": "Continue",
    "variant": "default"
  }
}
```

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

## Related

- `../README.md`
- Primitives: `./text.md`

