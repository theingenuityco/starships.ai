---
title: AgentSuggestionCard Widget
slug: widgets/product/agent-suggestion-card
category: widgets
---

# AgentSuggestionCard Widget

## Overview

Renders 2–3 marketplace agent cards, each with a deploy CTA.

## Where it can be used

- Views (widget tree): Yes

## Payload shapes

### Views node (widget tree)

```json
{
  "id": "agent-suggestions",
  "type": "AgentSuggestionCard",
  "props": {
    "starshipId": "starship_123",
    "templateSlugs": ["data-analyst", "support-triage", "github-pr-summarizer"],
    "maxColumns": 2
  }
}
```

## Props

| Prop | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `starshipId` | `string` | Yes | - | Starship to deploy the agent(s) to. |
| `templateSlugs` | `string[]` | Yes | - | Marketplace agent template slugs (recommended 2–3). |
| `maxColumns` | `1 \| 2` | No | `2` | Grid columns cap for chat UI. |

## Related

- `../README.md`
- Product: `./connector-suggestion-card.md`, `./starship-details.md`

