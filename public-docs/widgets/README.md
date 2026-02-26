## Widgets Reference

Widgets are **structured UI components** that starships.ai can render inside the product.

Widgets are rendered in **Views (dynamic pages)**: persisted as a widget tree (`ViewModel.root`) and rendered by the Views runtime.

## Where widgets show up

- **API**: widgets are managed via `@starships/server` routes (for example `GET /api/v1/starships/:starshipId/widgets`, `POST /api/v1/widgets`).
- **Views**: the view renderer (`DynamicViewRenderer` → `WidgetTreeRenderer`) renders a persisted widget tree (`ViewModel.root`) and supports bindings/handlers at runtime.

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

The widget key is the `WIDGET_REGISTRY` key (client).

- Layout (`./layout/`)
  - `Box` → `layout/box.md`
  - `Stack` → `layout/stack.md`
  - `Grid` → `layout/grid.md`
  - `Tabs` → `layout/tabs.md`
- Primitives (`./primitives/`)
  - `Text` → `primitives/text.md`
  - `Button` → `primitives/button.md`
- Data (`./data/`)
  - `DataTable` → `data/data-table.md`
  - `MetricGrid` → `data/metric-grid.md`
- Charts (`./charts/`)
  - `BarChart` → `charts/bar-chart.md`
  - `LineChart` → `charts/line-chart.md`
  - `AreaChart` → `charts/area-chart.md`
  - `PieChart` → `charts/pie-chart.md`
  - `DonutChart` → `charts/donut-chart.md`
  - `RadarChart` → `charts/radar-chart.md`
  - `RadialChart` → `charts/radial-chart.md`
- Cards (`./cards/`)
  - `StatCard` → `cards/stat-card.md`
- Product (`./product/`)
  - `StarshipDetails` → `product/starship-details.md`
  - `AgentSuggestionCard` → `product/agent-suggestion-card.md`
  - `ConnectorSuggestionCard` → `product/connector-suggestion-card.md`

## Conventions (authoring)

These conventions apply to `public-docs/widgets/**`.

### Naming

- **Widget key**: use the `WIDGET_REGISTRY` key (e.g. `Button`, `Tabs`, `LineChart`).
- **File name**: kebab-case (e.g. `line-chart.md`).
- **Directory**: group by function (layout, primitives, data, charts, cards, product).

### Terminology

- **Views node**: a node in `ViewModel.root` with `{ id, type, props, children?, handlers? }`.

### Examples

- Prefer JSON examples (agents can copy/paste).
- Keep examples minimal and realistic; avoid huge data blocks unless required.

### Props section

- Use a single props table: `Prop | Type | Required | Default | Notes`
- Keep `Type` readable (string unions, arrays, object shapes).

### Optional sections

Only include these when they add real value:

- **Events / handlers**: for interactive widgets (e.g. `Button` click handler in Views).
- **Data model**: for data-heavy widgets (charts/tables).
- **Agent guidelines**: short, practical tips (avoid long playbooks in every doc).

## Authoring

- Widget doc template: `./_template.md`

## Links

- Root overview: `../../README.md`
- Autopilot blueprint docs: `../blueprints/README.md`
- Views docs: `../views/README.md`
