/**
 * Starship Dataset (Tabular Data) Domain Types
 *
 * Starship-scoped tabular datasets used by humans and agents.
 *
 * Notes:
 * - Datasets store a schema-like `columns` array and JSON row objects.
 * - Rows are returned to the UI in `data` form (array of row objects) to feed `DataTable`.
 */

export type StarshipDatasetColumnFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percentage';
export type StarshipDatasetColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'enum'
  | 'reference'
  | 'formula';

export type StarshipDatasetColumnConstraints = {
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
   * - Use only on the dataset `primaryKey` column
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
   * support uniqueness for the dataset primaryKey column.
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

export type StarshipDatasetEnumConfig = {
  options: string[];
};

export type StarshipDatasetReferenceTarget =
  | { kind: 'dataset_row'; datasetIdOrSlug: string }
  | { kind: 'task_card' };

export type StarshipDatasetReferenceConfig = {
  target: StarshipDatasetReferenceTarget;
  /**
   * Optional column name to use as a human label when hydrating references.
   */
  labelColumn?: string;
};

export type StarshipDatasetFormulaConfig = {
  expr: string;
  resultType?: Exclude<StarshipDatasetColumnType, 'formula' | 'reference' | 'enum'> | 'enum';
};

export type StarshipDatasetReferenceValue =
  | { kind: 'dataset_row'; datasetIdOrSlug: string; key: string; label?: string; url?: string }
  | { kind: 'task_card'; cardId: string; label?: string; url?: string };

export interface StarshipDatasetColumn {
  /**
   * Stable key used in row objects and shown in tables.
   */
  name: string;
  /**
   * Optional human-readable help text for this column.
   */
  description?: string;
  format?: StarshipDatasetColumnFormat;
  type?: StarshipDatasetColumnType;
  constraints?: StarshipDatasetColumnConstraints;
  enum?: StarshipDatasetEnumConfig;
  reference?: StarshipDatasetReferenceConfig;
  formula?: StarshipDatasetFormulaConfig;
}

export interface StarshipDatasetModel {
  id: string;
  starshipId: string;
  name: string;
  slug: string;
  description: string;
  columns: StarshipDatasetColumn[];
  /**
   * Optional column name that acts as a primary key for upsert semantics.
   */
  primaryKey?: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StarshipDatasetRowModel {
  id: string;
  datasetId: string;
  rowKey?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Requests / responses
// ----------------------------------------------------------------------------

export type CreateStarshipDatasetRequest = {
  starshipId: string;
  name: string;
  description?: string;
  columns: StarshipDatasetColumn[];
  primaryKey?: string | null;
};

export type UpdateStarshipDatasetRequest = {
  name?: string;
  description?: string;
  columns?: StarshipDatasetColumn[];
  primaryKey?: string | null;
  archived?: boolean;
};

export type StarshipDatasetListResponse = {
  datasets: StarshipDatasetModel[];
};

export type StarshipDatasetDetailsResponse = {
  dataset: StarshipDatasetModel;
};

export type StarshipDatasetRowsPageResponse = {
  columns: StarshipDatasetColumn[];
  data: Array<Record<string, unknown>>;
  pagination: { limit: number; offset: number; total: number };
};

export type UpsertStarshipDatasetRowsRequest = {
  rows: Array<Record<string, unknown>>;
  mode?: 'append' | 'upsert';
};

export type UpsertStarshipDatasetRowsResponse = {
  inserted: number;
  updated: number;
  /**
   * Row-level validation/coercion errors. When present, some rows may have been
   * rejected while others were applied successfully (implementation-defined).
   */
  errors?: Array<{ index: number; column?: string; code: string; message: string }>;
};

