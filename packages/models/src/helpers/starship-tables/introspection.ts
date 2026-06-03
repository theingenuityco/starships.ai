import type { StarshipDatasetColumn } from '@starships/protocol';

/**
 * Catalog introspection for Tables.
 *
 * The authored column definitions in `starship_tables.columns_meta_json` are the
 * source of truth for semantic metadata (format, enum options, reference target,
 * description). Because schema is only ever changed via app-mediated DDL compiled
 * from those same definitions, the physical table and the sidecar stay in
 * lockstep. Introspection is used to (a) expose physical column names/types to
 * the agent SQL surface and (b) reconcile structural truth (NOT NULL, identity)
 * as a drift guard.
 */

export interface IntrospectedColumn {
  table: string;
  column: string;
  dataType: string;
  isNullable: boolean;
  isIdentity: boolean;
  default: string | null;
}

/** SQL + params to introspect every column of every table in a starship's schema. */
export function buildColumnsIntrospectionSql(schema: string): { sql: string; params: unknown[] } {
  return {
    sql: `
      SELECT table_name AS table, column_name AS column, data_type AS "dataType",
             (is_nullable = 'YES') AS "isNullable",
             (is_identity = 'YES') AS "isIdentity",
             column_default AS default
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `,
    params: [schema],
  };
}

const HIDDEN = new Set(['__id', '__row_key', '__created_at', '__updated_at']);

/** Physical (user-facing) columns of a single table, hidden bookkeeping columns removed. */
export function physicalUserColumns(introspected: IntrospectedColumn[]): IntrospectedColumn[] {
  return introspected.filter((c) => !HIDDEN.has(c.column));
}

/**
 * Reassemble the API `columns` array. Authored definitions supply semantics;
 * when introspection is provided it reconciles structural truth (NOT NULL ->
 * required, identity -> autoincrement) and drops columns no longer physically
 * present. Formula columns (a removed feature) are filtered out.
 */
export function reassembleColumns(
  authored: StarshipDatasetColumn[],
  introspected?: IntrospectedColumn[]
): StarshipDatasetColumn[] {
  const cols = (authored ?? []).filter((c) => c && c.name && c.type !== 'formula');
  if (!introspected || introspected.length === 0) return cols;

  const byName = new Map(physicalUserColumns(introspected).map((c) => [c.column, c]));
  return cols
    .filter((c) => byName.has(c.name))
    .map((c) => {
      const phys = byName.get(c.name)!;
      const constraints = { ...(c.constraints ?? {}) };
      constraints.required = !phys.isNullable;
      if (phys.isIdentity) constraints.autoincrement = true;
      return { ...c, constraints };
    });
}
