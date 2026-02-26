---
title: If
slug: widgets/layout/if
category: widgets
---

## If

`If` is a layout widget that conditionally renders its children.

### Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `when` | boolean | no | `true` | When falsy, renders nothing |
| `className` | string | no | `""` | Optional wrapper classes (only applied when rendered) |

### Example

Show a section when a boolean in runtime state is true:

```json
{
  "id": "details_if",
  "type": "If",
  "props": { "when": false, "className": "mt-4" },
  "bindings": {
    "when": { "kind": "state", "path": "ui.showDetails" }
  },
  "children": [
    {
      "id": "details_text",
      "type": "Text",
      "props": { "text": "Details visible", "className": "text-sm text-muted-foreground" }
    }
  ]
}
```

