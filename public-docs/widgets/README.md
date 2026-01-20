## Widgets Reference

Widgets are **structured UI components** that starships.ai can render inside the product (notably inline in conversations). They’re useful when an agent/tool wants to return data as a chart/table/card instead of (or in addition to) plain text.

## Where widgets show up

- **API**: widgets are managed via `@starships/server` routes (for example `GET /api/v1/starships/:starshipId/widgets`, `POST /api/v1/widgets`).
- **Client**: the chat UI renders widgets from conversation stream `ui_action` events (specifically `action: "render_widget"`) using a known widget type + props.

## Widget payload shape (conceptual)

When a tool wants the UI to render a widget, emit a `ui_action` with a payload containing:

- `widgetType`: the widget component name (see supported types below)
- `props`: the widget props object (must be JSON)
- Optional metadata: `id`, `name`, `description`

Example:

```json
{
  "widgetType": "BarChart",
  "props": {
    "title": "Revenue by month",
    "data": [
      { "name": "Jan", "value": 120 },
      { "name": "Feb", "value": 180 }
    ]
  },
  "name": "Revenue chart",
  "description": "Monthly revenue in USD"
}
```

## Supported widget types (current UI)

- `StatCard` → `stat-card.md`
- `MetricGrid` → `metric-grid.md`
- `DataTable` → `data-table.md`
- `ConnectorSuggestionCard` → `connector-suggestion-card.md`
- `AgentSuggestionCard` → `agent-suggestion-card.md`
- `StarshipDetails` → `starship-details.md`
- Charts:
  - `BarChart` → `charts/bar-chart.md`
  - `LineChart` → `charts/line-chart.md`
  - `AreaChart` → `charts/area-chart.md`
  - `PieChart` → `charts/pie-chart.md`
  - `DonutChart` → `charts/donut-chart.md`
  - `RadarChart` → `charts/radar-chart.md`
  - `RadialChart` → `charts/radial-chart.md`

## Links

- Root overview: `../../README.md`
- Autopilot blueprint docs: `../blueprints/README.md`
