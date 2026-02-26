---
title: ConnectorSuggestionCard Widget
slug: widgets/product/connector-suggestion-card
category: widgets
---

# ConnectorSuggestionCard Widget

## Overview

Renders one or more connector cards (the same UI used on the Connectors page) inline in chat.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): No

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "ConnectorSuggestionCard",
  "props": {
    "starshipId": "starship_123",
    "providers": ["slack", "notion"],
    "hideSearch": true,
    "hideDisconnect": false
  },
  "name": "Connectors: slack, notion",
  "description": "Suggested connectors: slack, notion"
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

