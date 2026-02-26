---
title: StarshipDetails Widget
slug: widgets/product/starship-details
category: widgets
---

# StarshipDetails Widget

## Overview

Renders a form that lets a user view/update their starship (name, description, website URL).

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "starship-details",
  "type": "StarshipDetails",
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

