## StarshipDetails

Renders a small **inline form** in chat that lets a user view/update their starship:

- name
- description
- website URL

### `widgetType`

`StarshipDetails`

### `props` schema

```json
{
  "starshipId": "starship_123"
}
```

### Props

- `starshipId` (string): Starship id whose details should be displayed/updated.

### Example payload

```json
{
  "widgetType": "StarshipDetails",
  "props": {
    "starshipId": "starship_123"
  }
}
```

