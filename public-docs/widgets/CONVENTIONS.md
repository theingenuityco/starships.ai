## Widget documentation conventions

These conventions apply to `public-docs/widgets/**`.

## Naming

- **Widget key**: use the `WIDGET_REGISTRY` key (e.g. `Button`, `Tabs`, `LineChart`).
- **File name**: kebab-case (e.g. `line-chart.md`).
- **Directory**: group by function (layout, primitives, data, charts, cards, product).

## Terminology

- **Inline widget**: emitted via `ui_action` with `action: "render_widget"` and a payload containing `{ widgetType, props }`.
- **Views node**: a node in `ViewModel.root` with `{ id, type, props, children?, handlers? }`.

## Examples

- Prefer JSON examples (agents can copy/paste).
- Include both payload shapes when the widget can be used in both contexts.
- Keep examples minimal and realistic; avoid huge data blocks unless required.

## Props section

- Use a single props table:
  - `Prop | Type | Required | Default | Notes`
- Keep `Type` readable (string unions, arrays, object shapes).

## Optional sections

Only include these when they add real value:

- **Events / handlers**: for interactive widgets (e.g. `Button` click handler in Views).
- **Data model**: for data-heavy widgets (charts/tables).
- **Agent guidelines**: short, practical tips (avoid long playbooks in every doc).

