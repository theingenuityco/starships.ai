---
title: ConnectorSuggestionCard Widget
slug: widgets/product/connector-suggestion-card
category: widgets
---

# ConnectorSuggestionCard Widget

## Overview

Renders one or more connector cards (the same UI used on the Connectors page).

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "connector-suggestions",
  "type": "ConnectorSuggestionCard",
  "props": {
    "starshipId": "starship_123",
    "providers": ["slack", "notion"],
    "hideSearch": true,
    "hideDisconnect": false
  }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `starshipId` | `string` | Yes | - | Starship id used to fetch connector catalog + current connector states. |
| `providers` | `string[]` | Yes | - | Connector providers to display (e.g. `["slack", "notion"]`). |
| `hideSearch` | `boolean` | No | `true` | Hides the search bar. |
| `hideDisconnect` | `boolean` | No | `false` | When `false`, shows Disconnect for connected connectors (if supported). |

## Related

- `../README.md`
- Product: `./agent-suggestion-card.md`, `./starship-details.md`

