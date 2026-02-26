## Widgets Reference

Widgets are **structured UI components** that starships.ai can render inside the product.

They show up in two main places:

- **Conversations (inline widgets)**: emitted by a workflow/tool as a `ui_action` with `action: "render_widget"`.
- **Views (dynamic pages)**: persisted as a widget tree (`ViewModel.root`) and rendered by the Views runtime.

## Where widgets show up

- **API**: widgets are managed via `@starships/server` routes (for example `GET /api/v1/starships/:starshipId/widgets`, `POST /api/v1/widgets`).
- **Client**: the chat UI renders widgets from conversation stream `ui_action` events (specifically `action: "render_widget"`) using a known widget type + props.
- **Views**: the view renderer (`DynamicViewRenderer` → `WidgetTreeRenderer`) renders a persisted widget tree (`ViewModel.root`) and supports bindings/handlers at runtime.

## Inline widget payload shape (conversations)

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

## Widget trees (Views)

Views store widgets as a **tree**. Each node has:

- `id`: stable node id (string)
- `type`: widget type (must exist in the client widget registry)
- `props`: raw props object
- Optional: `children[]`, `bindings`, `handlers`, `permissions`

Minimal example root:

```json
{
  "id": "root",
  "type": "Box",
  "props": { "className": "p-6" },
  "children": [
    { "id": "title", "type": "Text", "props": { "as": "h2", "text": "Hello", "className": "text-xl font-semibold" } },
    { "id": "cta", "type": "Button", "props": { "label": "Run", "variant": "default" } }
  ]
}
```

See `../views/README.md` for the Views runtime model (bindings, scripts, actions, streaming).

## Supported widget types (current UI)

- Layout & primitives:
  - `Box` → `box.md`
  - `Stack` → `stack.md`
  - `Grid` → `grid.md`
  - `Tabs` → `tabs.md`
  - `Text` → `text.md`
  - `Button` → `button.md`
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
- Views docs: `../views/README.md`
