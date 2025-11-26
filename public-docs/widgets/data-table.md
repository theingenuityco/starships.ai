---
title: DataTable Widget
slug: widgets/data-table
category: widgets
---

# DataTable Widget

A lightweight, read-only table for displaying structured rows with optional pagination and zebra striping.

## Component Name

`DataTable`

## Description

DataTable is a straightforward widget for displaying tabular data with optional pagination and zebra striping. Inspired by the shadcn/ui Data Table pattern (`/websites/ui_shadcn`, topic `data-table`), it expects the payload to specify `"widgetType": "DataTable"` so the renderer can pick the right component. Unlike more advanced TanStack-table demos, this widget intentionally omits sorting, searching, and selection so agents only need to provide primitive, read-only props.

## Data & Config Anatomy

| Piece | Required? | Notes |
| --- | --- | --- |
| `columns` | ✅ | Array of `{ key, label, format? }`. Keys must match properties in every data row. |
| `data` | ✅ | Array of serializable row objects (`string | number | boolean | null`). Avoid nested objects. |
| `title` | ❌ | Heading text shown above the table. |
| `description` | ❌ | Secondary context line under the title. |
| `pageSize` | ❌ | Defaults to `10`. Use `0` to disable pagination. |
| `striped` | ❌ | Defaults to `true`. Controls zebra row backgrounds. |
| `emptyMessage` | ❌ | Custom text when `data` is empty. |
| `className` | ❌ | Extra Tailwind classes merged onto the outer `Card`. |

## Props

### columns
- **Type:** `Array<DataColumn>`
- **Required:** Yes
- **Description:** Column definitions. Each column includes:
  - `key` (string, required): Data property key (must exist on every row)
  - `label` (string, required): Column header label
  - `format` (string, optional): Value formatting – `"text"`, `"number"`, `"currency"`, `"date"`, or `"percentage"`

### data
- **Type:** `Array<Record<string, string | number | boolean | null>>`
- **Required:** Yes
- **Description:** Array of data rows. Each row is an object with keys matching column keys. Keep cell values primitive (string, number, boolean) so they remain serializable for agents.

### title
- **Type:** `string`
- **Required:** No
- **Description:** Table title displayed above the table

### description
- **Type:** `string`
- **Required:** No
- **Description:** Optional subtitle or context text

### pageSize
- **Type:** `number`
- **Required:** No
- **Description:** Number of rows per page (default: 10). Set to 0 to disable pagination

### striped
- **Type:** `boolean`
- **Required:** No
- **Description:** Whether to use alternating row colors (default: true)

### className
- **Type:** `string`
- **Required:** No
- **Description:** Additional CSS classes for custom styling

## Visual Appearance

- Full-width table with sticky header styles from the shadcn table primitive
- Rows optionally zebra-striped via `striped`
- Responsive container that scrolls horizontally on small screens
- Minimal footer with pagination controls when `pageSize > 0` and rows exceed one page

## Usage Examples

### Basic DataTable - User List

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
      { "name": "Jane Smith", "email": "jane@example.com", "role": "User", "status": "Active" },
      { "name": "Bob Johnson", "email": "bob@example.com", "role": "User", "status": "Active" }
    ]
  }
}
```

### DataTable with Formatting

```json
{
  "widgetType": "DataTable",
  "props": {
    "title": "Sales Report",
    "description": "Last 30 days",
    "columns": [
      { "key": "date", "label": "Date", "format": "date" },
      { "key": "product", "label": "Product" },
      { "key": "quantity", "label": "Quantity", "format": "number" },
      { "key": "revenue", "label": "Revenue", "format": "currency" },
      { "key": "margin", "label": "Margin", "format": "percentage" }
    ],
    "data": [
      { "date": "2024-01-15", "product": "Widget A", "quantity": 45, "revenue": 4500, "margin": 0.35 },
      { "date": "2024-01-16", "product": "Widget B", "quantity": 32, "revenue": 6400, "margin": 0.42 },
      { "date": "2024-01-17", "product": "Widget C", "quantity": 58, "revenue": 2900, "margin": 0.28 }
    ]
  }
}
```

### DataTable with Pagination

```json
{
  "widgetType": "DataTable",
  "props": {
    "title": "Customer Database",
    "pageSize": 25,
    "columns": [
      { "key": "id", "label": "ID" },
      { "key": "name", "label": "Customer Name" },
      { "key": "email", "label": "Email" },
      { "key": "company", "label": "Company" },
      { "key": "lastOrder", "label": "Last Order", "format": "date" },
      { "key": "totalSpent", "label": "Total Spent", "format": "currency" }
    ],
    "data": [
      { "id": "C001", "name": "Alice Brown", "email": "alice@company.com", "company": "Tech Corp", "lastOrder": "2024-01-10", "totalSpent": 12500 },
      { "id": "C002", "name": "Charlie Davis", "email": "charlie@startup.io", "company": "Startup Inc", "lastOrder": "2024-01-12", "totalSpent": 8900 }
    ]
  }
}
```

### DataTable - Inventory Snapshot

```json
{
  "widgetType": "DataTable",
  "props": {
    "title": "Inventory Status",
    "striped": false,
    "columns": [
      { "key": "sku", "label": "SKU" },
      { "key": "product", "label": "Product Name" },
      { "key": "stock", "label": "In Stock", "format": "number" },
      { "key": "reserved", "label": "Reserved", "format": "number" },
      { "key": "available", "label": "Available", "format": "number" },
      { "key": "location", "label": "Location" }
    ],
    "data": [
      { "sku": "WDG-001", "product": "Premium Widget", "stock": 450, "reserved": 23, "available": 427, "location": "Warehouse A" },
      { "sku": "WDG-002", "product": "Standard Widget", "stock": 1200, "reserved": 156, "available": 1044, "location": "Warehouse B" }
    ]
  }
}
```

## Column Formatting

The `format` property automatically formats values:

- **`currency`**: Formats numbers as currency ($1,234.56)
- **`date`**: Formats ISO dates as readable dates (Jan 15, 2024)
- **`percentage`**: Formats decimals as percentages (0.35 → 35%)
- **`number`**: Formats numbers with thousands separators (1,234)

## Common Use Cases

1. **User Management:** Display user lists with roles, statuses, and actions
2. **Sales Reports:** Show sales data with revenue, quantities, and trends
3. **Transaction History:** Display payment/order logs with timestamps
4. **Inventory Management:** Show product stock levels and locations
5. **Analytics Data:** Present metrics, conversions, and performance data
6. **Customer Lists:** Display customer information with contact details
7. **Task Management:** Show task lists with assignees and deadlines

## Agent Playbook

1. **Map prompts to flat rows:** Extract key/value pairs from the user request. Each column should correspond to a single primitive field (string/number/boolean) so the renderer can display it without custom cell components.
2. **Keep column counts reasonable:** 3–8 columns keeps the table readable. Merge secondary details into descriptions rather than adding more columns.
3. **Use `format` for presentation:** Money → `"currency"`, counts → `"number"`, ISO dates → `"date"`, ratios → `"percentage"`. Booleans render as “Yes/No” automatically.
4. **Pick a pagination strategy:** For >20 rows, set `pageSize` to 10–25. For short lists, set `pageSize: 0` to show everything and hide the footer controls.
5. **Customize empty states:** If a prompt implies “no data yet,” still provide an empty array and set `emptyMessage` to something descriptive like “No invoices in this period.”

## Relevant TypeScript

```ts
export type DataCellValue = string | number | boolean | null | undefined

export interface DataColumn {
  key: string
  label: string
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage'
}

export interface DataTableProps {
  columns: DataColumn[]
  data: Array<Record<string, DataCellValue>>
  title?: string
  description?: string
  pageSize?: number
  striped?: boolean
  className?: string
}
```

## Related Components

- **Chart:** For visualizing trends instead of raw tabular data
- **StatCard:** For displaying summary metrics instead of detailed rows
- **MetricGrid:** For simple key-value pairs instead of complex tables
