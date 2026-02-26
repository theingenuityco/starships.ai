---
title: Checkbox Widget
slug: widgets/form/checkbox
category: widgets
---

# Checkbox Widget

## Overview

A boolean checkbox. In Views, `Checkbox` supports a `change` event handler (via node `handlers.change`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "agree",
  "type": "Checkbox",
  "props": { "label": "I agree", "checked": false },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_checkbox", "entrypoint": "onChange" }
  }
}
```

### `change` payload (runtime)

```json
{ "checked": true }
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Checkbox"` | Label displayed to the right of the checkbox. |
| `checked` | `boolean` | No | `false` | Controlled checked state. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind classes applied to the widget wrapper. |

## Events / handlers (optional)

- Views: `handlers.change` is supported on `Checkbox` nodes.
  - The runtime only wires the `change` event if `handlers.change` exists on the node.

## Examples

### Minimal

```json
{ "id": "agree", "type": "Checkbox", "props": { "label": "I agree" } }
```

## Related

- `../README.md`
- Form: `./switch.md`, `./input.md`
- Views runtime: `../../views/runtime.md`

