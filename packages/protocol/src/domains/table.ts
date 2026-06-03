/**
 * Starship Table (Tabular Data) Domain Types
 *
 * Starship-scoped Tables used by humans and agents.
 *
 * Notes:
 * - Tables store a schema-like `columns` array and JSON row objects.
 * - Rows are returned to the UI in `data` form (array of row objects) to feed `DataTable`.
 */

export type StarshipTableColumnFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percentage';
export type StarshipTableColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'enum'
  | 'reference';

export type StarshipTableColumnConstraints = {
  /**
   * When true, the value must be present (not null/undefined/empty-string) on writes.
   */
  required?: boolean;
  /**
   * When true, the server will generate an incrementing integer value on write
   * when the field is missing.
   *
   * Recommended usage:
   * - Use only on a `number` column
   * - Use only on the Table `primaryKey` column
   */
  autoincrement?: boolean;
  /**
   * When true, null is allowed as an explicit value.
   */
  nullable?: boolean;
  /**
   * When true, values should be unique across rows.
   *
   * Note: enforcement semantics are implementation-defined. Some deployments may only
   * support uniqueness for the Table primaryKey column.
   */
  unique?: boolean;
  /**
   * Default value applied on write when the field is missing.
   */
  default?: unknown;
  /**
   * Numeric bounds (for number/date/datetime depending on server rules).
   */
  min?: number;
  max?: number;
  /**
   * String length bounds.
   */
  minLength?: number;
  maxLength?: number;
  /**
   * Regex pattern (string values). Regex flavor is server-defined (typically JS).
   */
  pattern?: string;
};

export type StarshipTableEnumConfig = {
  options: string[];
};

export type StarshipTableReferenceTarget =
  | { kind: 'table_row'; tableIdOrSlug: string }
  | { kind: 'task_card' };

export type StarshipTableReferenceConfig = {
  target: StarshipTableReferenceTarget;
  /**
   * Optional column name to use as a human label when hydrating references.
   */
  labelColumn?: string;
};

export type StarshipTableReferenceValue =
  | { kind: 'table_row'; tableIdOrSlug: string; key: string; label?: string; url?: string }
  | { kind: 'task_card'; cardId: string; label?: string; url?: string };

export interface StarshipTableColumn {
  /**
   * Stable key used in row objects and shown in tables.
   */
  name: string;
  /**
   * Optional human-readable help text for this column.
   */
  description?: string;
  format?: StarshipTableColumnFormat;
  type?: StarshipTableColumnType;
  constraints?: StarshipTableColumnConstraints;
  enum?: StarshipTableEnumConfig;
  reference?: StarshipTableReferenceConfig;
}

export interface StarshipTableModel {
  id: string;
  starshipId: string;
  name: string;
  slug: string;
  description: string;
  columns: StarshipTableColumn[];
  /**
   * Optional column name that acts as a primary key for upsert semantics.
   */
  primaryKey?: string | null;
  /**
   * Physical Postgres table name backing this Table (within the starship's
   * Database schema). Surfaced so agents can write SQL against it.
   */
  physicalTable?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StarshipTableRowModel {
  id: string;
  tableId: string;
  rowKey?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Requests / responses
// ----------------------------------------------------------------------------

export type CreateStarshipTableRequest = {
  starshipId: string;
  name: string;
  description?: string;
  columns: StarshipTableColumn[];
  primaryKey?: string | null;
};

export type UpdateStarshipTableRequest = {
  name?: string;
  description?: string;
  columns?: StarshipTableColumn[];
  primaryKey?: string | null;
  archived?: boolean;
};

export type StarshipTableListResponse = {
  tables: StarshipTableModel[];
};

export type StarshipTableDetailsResponse = {
  table: StarshipTableModel;
};

export type StarshipTableRowsPageResponse = {
  columns: StarshipTableColumn[];
  data: Array<Record<string, unknown>>;
  pagination: { limit: number; offset: number; total: number };
};

export type UpsertStarshipTableRowsRequest = {
  rows: Array<Record<string, unknown>>;
  mode?: 'append' | 'upsert';
};

export type UpsertStarshipTableRowsResponse = {
  inserted: number;
  updated: number;
  /**
   * Row-level validation/coercion errors. When present, some rows may have been
   * rejected while others were applied successfully (implementation-defined).
   */
  errors?: Array<{ index: number; column?: string; code: string; message: string }>;
};

