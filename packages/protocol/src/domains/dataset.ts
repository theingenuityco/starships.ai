/**
 * Starship Dataset (Tabular Data) Domain Types
 *
 * Starship-scoped tabular datasets used by humans and agents.
 *
 * Notes:
 * - Datasets store a schema-like `columns` array and JSON row objects.
 * - Rows are returned to the UI in `data` form (array of row objects) to feed `DataTable`.
 */

export type StarshipDatasetColumnFormat = 'text' | 'number' | 'currency' | 'date' | 'percentage';
export type StarshipDatasetColumnType = 'string' | 'number' | 'boolean' | 'date' | 'json';

export interface StarshipDatasetColumn {
  /**
   * Stable key used in row objects and shown in tables.
   */
  name: string;
  format?: StarshipDatasetColumnFormat;
  type?: StarshipDatasetColumnType;
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
};

