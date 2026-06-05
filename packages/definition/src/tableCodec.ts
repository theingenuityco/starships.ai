import type { StarshipTableColumn } from '@starships/protocol';
import type { TableDefinition } from './types';
import { compact, dumpYaml, loadYaml, requireString } from './yaml';

/**
 * Codec between a starship Table's index record and its
 * `.autopilot/tables/<slug>.yaml` file: the LOGICAL schema only (columns,
 * primaryKey). The physical binding (schemaName/physicalTable) and `archived`
 * are index-only; rows live in the per-starship Postgres schema.
 */

interface TableRecordLike {
  id: string;
  slug: string;
  name: string;
  description?: string;
  primaryKey?: string | null;
  columns: StarshipTableColumn[];
}

export function tableFilename(slug: string): string {
  return `${slug}.yaml`;
}

export function tableSlugFromFilename(filename: string): string {
  return filename.replace(/\.yaml$/i, '');
}

export function tableRecordToDefinition(table: TableRecordLike): TableDefinition {
  return {
    id: table.id,
    slug: table.slug,
    name: table.name,
    ...(table.description ? { description: table.description } : {}),
    ...(table.primaryKey ? { primaryKey: table.primaryKey } : {}),
    columns: (table.columns ?? []) as TableDefinition['columns'],
  };
}

export function serializeTableDefinition(def: TableDefinition): string {
  return dumpYaml(
    compact({
      id: def.id,
      slug: def.slug,
      name: def.name,
      description: def.description || undefined,
      primaryKey: def.primaryKey ?? undefined,
      columns: def.columns ?? [],
    })
  );
}

export function serializeTable(table: TableRecordLike): string {
  return serializeTableDefinition(tableRecordToDefinition(table));
}

export function parseTable(raw: string): TableDefinition {
  const data = loadYaml(raw);
  if (!Array.isArray(data.columns)) {
    throw new Error("table definition field 'columns' must be an array");
  }
  return {
    id: requireString(data, 'id', 'table'),
    slug: requireString(data, 'slug', 'table'),
    name: requireString(data, 'name', 'table'),
    ...(typeof data.description === 'string' && data.description ? { description: data.description } : {}),
    ...(typeof data.primaryKey === 'string' ? { primaryKey: data.primaryKey } : {}),
    columns: data.columns as TableDefinition['columns'],
  };
}
