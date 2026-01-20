## ConnectorSuggestionCard

ConnectorSuggestionCard renders one or more **connector cards** (the same UI used on the Connectors page) inline in chat.

### widgetType

```json
{ "widgetType": "ConnectorSuggestionCard" }
```

### Props

- `starshipId` (string, required): Starship id used to fetch connector catalog + current connector states.
- `providers` (string[], required): Connector providers to display (e.g. `["slack", "notion"]`).
- `hideSearch` (boolean, optional, default `true`): Hides the search bar.
- `hideDisconnect` (boolean, optional, default `false`): When `false`, shows Disconnect for connected connectors (when allowed by the provider auth type).

### Example payload

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

