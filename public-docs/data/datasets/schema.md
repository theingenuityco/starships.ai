---
title: Datasets Schema & Columns
slug: data/datasets/schema
category: data
---

## Dataset model

At the protocol/API level, a dataset looks like:

- **`id`**: string
- **`starshipId`**: string
- **`name`**: string (max 200)
- **`slug`**: string (max 100, unique per starship)
- **`description`**: string (max 2000, defaults to `""`)
- **`columns`**: `StarshipDatasetColumn[]` (stored as JSON)
- **`primaryKey`**: `string | null` (optional)
- **`archived`**: boolean
- **`createdAt` / `updatedAt`**: ISO8601 strings

DB storage is:

- **Datasets table**: `starship_datasets`
  - `columns_json` (JSONB)
  - `primary_key` (VARCHAR(100), nullable)
- **Rows table**: `starship_dataset_rows`
  - `data_json` (JSONB)
  - `row_key` (TEXT, nullable; `UNIQUE(dataset_id, row_key)`)

## Column model (`StarshipDatasetColumn`)

Each column is an object with:

```json
{
  "name": "status",
  "description": "Current workflow stage",
  "type": "enum",
  "format": "text",
  "constraints": { "required": true },
  "enum": { "options": ["todo", "doing", "done"] }
}
```

### Required fields

- **`name`**: required
  - Must match `^[a-zA-Z0-9_]+$`
  - Max length: 100
  - Must be unique within `columns`

All other fields are optional, but some become required depending on `type` (see below).

## Column types (`column.type`)

Supported types:

- `string`
- `number`
- `boolean`
- `date` (stored as ISO date-only `YYYY-MM-DD`)
- `datetime` (stored as ISO instant; requires `Z` or an offset, canonicalized to `...Z`)
- `json` (any JSON value accepted)
- `enum` (single-select string)
- `reference` (relation to a dataset row or task card)
- `formula` (computed on read)

## Column formats (`column.format`)

Formats are primarily display hints for UI/export:

- `text`
- `number`
- `currency`
- `date`
- `datetime`
- `percentage`

## Constraints (`column.constraints`)

Supported constraint keys:

- `required?: boolean`
- `nullable?: boolean`
- `unique?: boolean`
- `autoincrement?: boolean`
- `default?: unknown`
- `min?: number`, `max?: number`
- `minLength?: number`, `maxLength?: number`
- `pattern?: string` (JS regex string)

Important server rule:

- **`constraints.unique` is currently only supported for the dataset `primaryKey` column.**
- **`constraints.autoincrement` is only supported for a `number` column that is also the dataset `primaryKey`.**

## Autoincrement columns

For `constraints.autoincrement: true`, the server will generate an incrementing integer value **on write** when the field is missing/blank.

Notes:

- Works for `type: "number"` only.
- Must be the dataset `primaryKey` column.
- Values start at `1` and increment by `1`.
- Allocation is **atomic** (safe under concurrent writes).
- If you explicitly provide `null`, normal nullability rules apply (it will not autogenerate a value).

Example:

```json
{
  "primaryKey": "id",
  "columns": [
    { "name": "id", "type": "number", "constraints": { "autoincrement": true, "unique": true } },
    { "name": "name", "type": "string", "constraints": { "required": true } }
  ]
}
```

## Enum columns

For `type: "enum"`, `enum.options` is required:

```json
{
  "name": "status",
  "type": "enum",
  "enum": { "options": ["todo", "doing", "done"] }
}
```

Writes are validated so the stored value must be one of the configured `options`.

## Reference columns

For `type: "reference"`, `reference.target` is required:

### Reference to a task card

```json
{
  "name": "task",
  "type": "reference",
  "reference": { "target": { "kind": "task_card" } }
}
```

### Reference to a row in another dataset

```json
{
  "name": "account",
  "type": "reference",
  "reference": {
    "target": { "kind": "dataset_row", "datasetIdOrSlug": "accounts" },
    "labelColumn": "name"
  }
}
```

Notes:

- `datasetIdOrSlug` may be a dataset id or a slug.
- Reference hydration uses the **target dataset’s primaryKey** (i.e., it resolves by `row_key`).

## Formula columns

For `type: "formula"`, `formula.expr` is required:

```json
{
  "name": "total",
  "type": "formula",
  "formula": { "expr": "round(price * qty, 2)", "resultType": "number" }
}
```

Semantics:

- Formulas are **computed on read** (during row listing).
- Writes **ignore** any provided value for a formula column (the server drops it).
- If evaluation fails (parse error, unknown function, etc.), the value returned is `null`.
- Formulas are evaluated **in column order**, so a formula can reference earlier formula columns.
- If `formula.resultType` is set, the server will **coerce** the computed value to that type; if coercion fails, the result is `null`.

### Expression language

#### Literals

- `true`, `false`
- `null`
- Numbers: `123`, `3.14`, `.5`
- Strings: `"hello"` or `'hello'` (supports simple escapes like `\'` and `\"`)

#### Variables

- Any identifier (e.g. `price`, `qty`, `status`) resolves to the current row field value.
- Column names are restricted to `^[a-zA-Z0-9_]+$`, so variable names follow that same convention.

#### Operators (with precedence)

Highest to lowest:

- Parentheses: `( ... )`
- Unary: `-x`, `!x`
- Multiplicative: `*`, `/`, `%`
- Additive: `+`, `-`
- Comparisons: `<`, `<=`, `>`, `>=`
- Equality: `==`, `!=`
- Boolean: `&&`, `||`

Notes:

- Arithmetic operators (`+ - * / %`) work on numeric values (numbers, booleans, or number-like strings). If a value can’t be coerced to a number, the result is `null`.
- Division/modulo by zero returns `null`.
- `&&` and `||` return booleans and **short-circuit**.

### Built-in functions (comprehensive)

Function calls use standard syntax: `fn(arg1, arg2, ...)`.

#### Null/blank + conditionals

- `coalesce(a, b, ...)`: first non-blank value (treats `null`, `undefined`, and `""` as blank)
- `isNull(x)`: boolean
- `isBlank(x)`: boolean (null/undefined/empty-string)
- `if(cond, whenTrue, whenFalse?)`: conditional (`whenFalse` defaults to `null`)
- `not(x)`: boolean negation
- `and(a, b, ...)`: boolean conjunction
- `or(a, b, ...)`: boolean disjunction

#### Type conversions

- `toNumber(x)`: number or `null`
- `toString(x)`: string or `null`
- `toBoolean(x)`: boolean or `null`

#### Math

- `abs(x)`
- `ceil(x)`
- `floor(x)`
- `round(x, digits)`
- `sqrt(x)` (returns `null` for negative inputs)
- `pow(a, b)`
- `min(a, b, ...)` (ignores null/invalid inputs; returns `null` if nothing valid)
- `max(a, b, ...)` (ignores null/invalid inputs; returns `null` if nothing valid)
- `clamp(x, lo, hi)`
- `sum(a, b, ...)` (ignores null/invalid inputs; returns `null` if nothing valid)
- `avg(a, b, ...)` (ignores null/invalid inputs; returns `null` if nothing valid)

#### Strings

- `length(x)`
- `lower(x)`
- `upper(x)`
- `trim(x)`
- `concat(a, b, ...)` (skips null/undefined)
- `substring(s, start, len?)`
- `replace(s, from, to)` (simple string replace-all)
- `startsWith(s, prefix)`
- `endsWith(s, suffix)`
- `includes(s, part)`

#### Date/time (ISO strings in, numbers out unless noted)

- `now()`: current epoch milliseconds
- `toMs(datetimeLike)`: parse a datetime-like string and return epoch milliseconds (or `null`)
- `diffDays(a, b)`: difference in days (\(b - a\)) as a floating-point number

#### Cross-record lookups

These are powerful but can be slower than pure row-local formulas.

- `lookupDataset(datasetIdOrSlug, key, fieldName)`
- `lookupTask(cardId, fieldName)`

### Examples

#### Guard against divide-by-zero

- `if(qty == 0, null, round(total / qty, 2))`

#### Normalize strings

- `upper(trim(status))`

#### Date differences

- `diffDays(start_date, end_date)`

#### Look up related data

- `lookupDataset("accounts", account_id, "tier")`
- `lookupTask(task_id, "title")`

## `primaryKey`

`primaryKey` (when set) must match an existing column name.

What it enables:

- `POST .../rows:upsert` with `mode: "upsert"`
- Stable `row_key` storage (`starship_dataset_rows.row_key`) and `UNIQUE(dataset_id, row_key)`
- Dataset-row reference hydration (and formula `lookupDataset`) to work predictably
