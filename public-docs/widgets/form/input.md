---
title: Input Widget
slug: widgets/form/input
category: widgets
---

# Input Widget

## Overview

A single-line text input. In Views, `Input` supports a `change` event handler (via node `handlers.change`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "name",
  "type": "Input",
  "props": { "label": "Name", "placeholder": "Ada Lovelace", "value": "" },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_input", "entrypoint": "onChange" }
  }
}
```

### `change` payload (runtime)

When the user types, the runtime dispatches `handlers.change` with:

```json
{ "value": "..." }
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Label"` | Optional label displayed above the input. |
| `placeholder` | `string` | No | `"Type…"` | Placeholder text. |
| `value` | `string` | No | `""` | Controlled input value. |
| `type` | `"text" \| "email" \| "password" \| "number" \| "search" \| "url" \| "tel"` | No | `"text"` | HTML input type. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind classes applied to the widget wrapper. |

## Events / handlers (optional)

- Views: `handlers.change` is supported on `Input` nodes.
  - The runtime only wires the `change` event if `handlers.change` exists on the node.

## Examples

### Minimal

```json
{ "id": "name", "type": "Input", "props": { "label": "Name" } }
```

### Realistic (controlled input via script)

This example keeps the input controlled by patching the instance `value` prop on each change.

```json
{
  "id": "name",
  "type": "Input",
  "props": { "label": "Name", "value": "" },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_input", "entrypoint": "onChange" }
  }
}
```

Related concepts:

- Views runtime actions: `patch_props` and `set_state` (`../../views/runtime.md`)

## Related

- `../README.md`
- Form: `./textarea.md`, `./select.md`
- Views runtime: `../../views/runtime.md`

