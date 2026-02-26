---
title: StarshipDetails Widget
slug: widgets/product/starship-details
category: widgets
---

# StarshipDetails Widget

## Overview

Renders an inline form in chat that lets a user view/update their starship (name, description, website URL).

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): No

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "StarshipDetails",
  "props": {
    "starshipId": "starship_123"
  }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `starshipId` | `string` | Yes | - | Starship id whose details should be displayed/updated. |

## Related

- `../README.md`
- Product: `./agent-suggestion-card.md`, `./connector-suggestion-card.md`

