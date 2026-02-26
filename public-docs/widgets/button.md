---
title: Button Widget
slug: widgets/button
category: widgets
---

# Button Widget

An interactive button widget. In Views, `Button` supports a `click` event handler (via node `handlers.click`), which can run a script or an action list.

## Component Name

`Button`

## Props

### label
- **Type:** `string`
- **Required:** No (default `"Button"`)
- **Description:** Button label text.

### variant
- **Type:** `"default" | "destructive" | "outline" | "primaryOutline" | "secondary" | "ghost" | "link"`
- **Required:** No (default `"default"`)
- **Description:** Visual style variant.

### size
- **Type:** `"default" | "sm" | "lg" | "icon"`
- **Required:** No (default `"default"`)
- **Description:** Size variant.

### disabled
- **Type:** `boolean`
- **Required:** No (default `false`)
- **Description:** Disable interaction.

### className
- **Type:** `string`
- **Required:** No
- **Description:** Tailwind class string applied to the button.

## Usage Example (inline widget)

```json
{
  "widgetType": "Button",
  "props": {
    "label": "Continue",
    "variant": "default"
  }
}
```

## Usage Example (Views node with click handler)

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
