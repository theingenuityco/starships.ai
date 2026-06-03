---
title: DataTable Widget
slug: widgets/data/data-table
category: widgets
---

## DataTable

`DataTable` renders a simple paginated table and supports CSV export.

## Props

Prop | Type | Required | Default | Notes
---|---|---:|---|---
`columns` | `Array<{ key: string; label: string; format?: "text"|"number"|"currency"|"date"|"datetime"|"percentage" }>` | no | `[]` | `key` must match row field names
`data` | `Array<Record<string, unknown>>` | no | `[]` | Rows are plain objects
`title` | `string` | no |  | Shown above the table
`description` | `string` | no |  | Subtext (often a table slug)
`pageSize` | `number` | no | `10` | Use `0` to disable pagination
`striped` | `boolean` | no | `true` | Alternating row backgrounds
`className` | `string` | no |  | Wrapper class
`onRowClick` | `(payload: { row: Record<string, unknown>; rowIndex: number }) => void` | no |  | When provided, rows become clickable

## Cell formatting

Cells are formatted using the `format` value:

- `currency`, `number`, `percentage`, `date`, `datetime`
- For reference-shaped objects (e.g. table/task refs), the renderer prefers `label` when present, otherwise falls back to `key`/`cardId`.
- For other objects/arrays, the renderer falls back to JSON stringification.

---
title: DataTable Widget
slug: widgets/data/data-table
category: widgets
---

# DataTable Widget

## Overview

A lightweight, read-only table for displaying structured rows with optional pagination and zebra striping. This widget intentionally omits sorting, searching, and selection so agents can render useful tables with simple, serializable props.

## Where it can be used

- Inline (conversations): Yes
- Views (widget tree): Yes

## Payload shapes

### Inline widget (conversations)

```json
{
  "widgetType": "DataTable",
  "props": {
    "title": "Active Users",
    "columns": [
      { "key": "name", "label": "Name" },
      { "key": "email", "label": "Email" },
      { "key": "role", "label": "Role" },
      { "key": "status", "label": "Status" }
    ],
    "data": [
      { "name": "John Doe", "email": "john@example.com", "role": "Admin", "status": "Active" },
      { "name": "Jane Smith", "email": "jane@example.com", "role": "User", "status": "Active" }
    ]
  }
}
```

### Views node (widget tree)

```json
{
  "id": "table",
  "type": "DataTable",
  "props": {
    "title": "Active Users",
    "columns": [{ "key": "name", "label": "Name" }],
    "data": [{ "name": "John Doe" }]
  }
}
```

## Props

| Prop           | Type                                                                                                         | Required | Default | Notes                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------- | --------------------------------------------------------- |
| `columns`      | `Array<{ key: string; label: string; format?: "text" \| "number" \| "currency" \| "date" \| "percentage" }>` | Yes      | -       | Column definitions. `key` must exist on every row.        |
| `data`         | `Array<Record<string, string \| number \| boolean \| null>>`                                                 | Yes      | -       | Keep values primitive/serializable; avoid nested objects. |
| `title`        | `string`                                                                                                     | No       | -       | Heading text shown above the table.                       |
| `description`  | `string`                                                                                                     | No       | -       | Secondary context line under the title.                   |
| `pageSize`     | `number`                                                                                                     | No       | `10`    | Set to `0` to disable pagination.                         |
| `striped`      | `boolean`                                                                                                    | No       | `true`  | Zebra row backgrounds.                                    |
| `emptyMessage` | `string`                                                                                                     | No       | -       | Text when `data` is empty.                                |
| `className`    | `string`                                                                                                     | No       | -       | Tailwind classes on the outer container.                  |

## Events (Views runtime)

When used in Views, `DataTable` supports:

- `row_click`
  - payload: `{ "row": { ... }, "rowIndex": 0 }`

Example handler (click row → mirror into state):

```json
{
  "id": "table",
  "type": "DataTable",
  "props": { "columns": [{ "key": "name", "label": "Name" }], "data": [{ "name": "Ada" }] },
  "handlers": {
    "row_click": {
      "kind": "script",
      "scriptId": "table_click",
      "entrypoint": "onRowClick"
    }
  }
}
```

Script source (`runtimeConfig.scripts.table_click.source`):

```js
exports.onRowClick = function (ctx, event) {
  var row = event && event.payload ? event.payload.row : null;
  var idx = event && event.payload ? event.payload.rowIndex : null;
  ctx.setState('table.lastClickedRow', row);
  ctx.setState('table.lastClickedRowIndex', idx);
};
```

## Examples

### DataTable with formatting

```json
{
  "widgetType": "DataTable",
  "props": {
    "title": "Sales Report",
    "description": "Last 30 days",
    "columns": [
      { "key": "date", "label": "Date", "format": "date" },
      { "key": "revenue", "label": "Revenue", "format": "currency" },
      { "key": "margin", "label": "Margin", "format": "percentage" }
    ],
    "data": [
      { "date": "2024-01-15", "revenue": 4500, "margin": 0.35 },
      { "date": "2024-01-16", "revenue": 6400, "margin": 0.42 }
    ],
    "pageSize": 10
  }
}
```

## Agent guidelines (optional)

- Prefer **3–8 columns**; use `description` for extra context instead of adding more columns.
- Use `format` for presentation:
  - money → `"currency"`
  - ISO dates → `"date"`
  - ratios → `"percentage"`
- For >20 rows, set `pageSize` to 10–25; for short lists, set `pageSize: 0`.

## Related

- `../README.md`
- Data: `./metric-grid.md`
- Cards: `../cards/stat-card.md`
