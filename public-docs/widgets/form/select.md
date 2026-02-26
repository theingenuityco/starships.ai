---
title: Select Widget
slug: widgets/form/select
category: widgets
---

# Select Widget

## Overview

A dropdown select. In Views, `Select` supports a `change` event handler (via node `handlers.change`) that can run a script or an action list.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "plan",
  "type": "Select",
  "props": {
    "label": "Plan",
    "placeholder": "Select…",
    "value": "pro",
    "optionsText": "free: Free\\npro: Pro\\nenterprise: Enterprise"
  },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_select", "entrypoint": "onChange" }
  }
}
```

### `change` payload (runtime)

```json
{ "value": "pro" }
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `label` | `string` | No | `"Label"` | Optional label displayed above the select. |
| `placeholder` | `string` | No | `"Select…"` | Placeholder shown when no value is selected. |
| `value` | `string` | No | `"a"` | Selected value. Use empty string/undefined for “none”. |
| `optionsText` | `string` | No | `"a: Option A\\nb: Option B"` | Options, one per line. Format: `value: Label` (or `value` alone). Lines starting with `#` are ignored. |
| `disabled` | `boolean` | No | `false` | Disable interaction. |
| `className` | `string` | No | - | Tailwind classes applied to the widget wrapper. |

## Events / handlers (optional)

- Views: `handlers.change` is supported on `Select` nodes.
  - The runtime only wires the `change` event if `handlers.change` exists on the node.

## Examples

### Minimal

```json
{
  "id": "plan",
  "type": "Select",
  "props": { "label": "Plan", "value": "free", "optionsText": "free: Free\\npro: Pro" }
}
```

## Related

- `../README.md`
- Form: `./input.md`, `./checkbox.md`
- Views runtime: `../../views/runtime.md`

