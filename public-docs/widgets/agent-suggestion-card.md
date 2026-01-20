## AgentSuggestionCard

Renders **2–3 marketplace agent cards** inline in chat, each with a deploy CTA.

### `widgetType`

`AgentSuggestionCard`

### `props` schema

```json
{
  "starshipId": "starship_123",
  "templateSlugs": ["data-analyst", "support-triage", "github-pr-summarizer"],
  "maxColumns": 2
}
```

### Props

- **`starshipId`** _(string, required)_: Starship to deploy the agent(s) to.
- **`templateSlugs`** _(string[], required)_: Marketplace agent template slugs (recommended 2–3).
- **`maxColumns`** _(1 | 2, optional)_: Grid columns cap for chat UI (default: `2`).
