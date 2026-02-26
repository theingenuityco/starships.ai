---
title: Switch Widget
slug: widgets/form/switch
category: widgets
---

# Switch Widget

## Overview

A toggle switch (boolean). In Views, `Switch` supports a `change` event handler (via node `handlers.change`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "notify",
  "type": "Switch",
  "props": { "label": "Email notifications", "checked": true, "size": "default" },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_switch", "entrypoint": "onChange" }
  }
}
```

### `change` payload (runtime)

```json
{ "checked": false }
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Switch"` | Label displayed to the right of the switch. |
| `checked` | `boolean` | No | `false` | Controlled checked state. |
| `size` | `"default" \| "sm"` | No | `"default"` | Visual size variant. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind classes applied to the widget wrapper. |

## Events / handlers (optional)

- Views: `handlers.change` is supported on `Switch` nodes.
  - The runtime only wires the `change` event if `handlers.change` exists on the node.

## Examples

### Minimal

```json
{ "id": "notify", "type": "Switch", "props": { "label": "Email notifications" } }
```

## Related

- `../README.md`
- Form: `./checkbox.md`, `./select.md`
- Views runtime: `../../views/runtime.md`

