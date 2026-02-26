---
title: Textarea Widget
slug: widgets/form/textarea
category: widgets
---

# Textarea Widget

## Overview

A multi-line text input. In Views, `Textarea` supports a `change` event handler (via node `handlers.change`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "notes",
  "type": "Textarea",
  "props": { "label": "Notes", "placeholder": "Write…", "value": "", "rows": 6 },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_textarea", "entrypoint": "onChange" }
  }
}
```

### `change` payload (runtime)

```json
{ "value": "..." }
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Label"` | Optional label displayed above the textarea. |
| `placeholder` | `string` | No | `"Write…"` | Placeholder text. |
| `value` | `string` | No | `""` | Controlled textarea value. |
| `rows` | `number` | No | `4` | Visible row count. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind classes applied to the widget wrapper. |

## Events / handlers (optional)

- Views: `handlers.change` is supported on `Textarea` nodes.
  - The runtime only wires the `change` event if `handlers.change` exists on the node.

## Examples

### Minimal

```json
{ "id": "notes", "type": "Textarea", "props": { "label": "Notes" } }
```

## Related

- `../README.md`
- Form: `./input.md`, `./select.md`
- Views runtime: `../../views/runtime.md`

