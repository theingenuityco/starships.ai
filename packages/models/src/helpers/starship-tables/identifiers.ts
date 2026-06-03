/**
 * Identifier helpers for the starship Database feature.
 *
 * Hierarchy: a starship owns one Database (a dedicated Postgres schema
 * `db_<starshipId>`) which contains many Tables (real Postgres tables).
 *
 * Every schema / role / table / column identifier that gets interpolated into
 * SQL MUST go through quoteIdent(). Starship ids are nanoids (alphabet
 * `A-Za-z0-9_-`), so we keep them verbatim inside a quoted identifier (which
 * preserves case and allows `-`) rather than lossily lowercasing them, which
 * could collide.
 */

/** Starship/table ids are nanoids; reject anything outside the safe alphabet. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function assertSafeId(id: string, label = 'id'): string {
  const s = String(id ?? '').trim();
  if (!s || !SAFE_ID.test(s)) {
    throw new Error(`Unsafe ${label} for SQL identifier: ${JSON.stringify(id)}`);
  }
  return s;
}

/**
 * Quote a SQL identifier (schema/table/column/role). Doubles embedded quotes.
 * The result includes the surrounding double quotes.
 */
export function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** The schema name backing a starship's Database. */
export function schemaName(starshipId: string): string {
  return `db_${assertSafeId(starshipId, 'starshipId')}`;
}

/** The per-starship read-only role used by the agent SQL surface. */
export function roleName(starshipId: string): string {
  return `ship_ro_${assertSafeId(starshipId, 'starshipId')}`;
}

/** Convenience: a fully quoted, schema-qualified table reference. */
export function qualifiedTable(starshipId: string, physicalTable: string): string {
  return `${quoteIdent(schemaName(starshipId))}.${quoteIdent(physicalTable)}`;
}

/**
 * Derive a readable, safe physical table name from a slug. The result is a bare
 * (unquoted-form) identifier in `[a-z0-9_]`, starting with a letter/underscore,
 * <= 63 bytes. Uniqueness within the schema is enforced by the caller.
 */
export function sanitizeTableName(input: string): string {
  let s = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = 'table';
  if (!/^[a-z_]/.test(s)) s = `t_${s}`;
  return s.slice(0, 63);
}

/** Deterministic, safe constraint name for a column check. */
export function constraintName(physicalTable: string, column: string, kind: string): string {
  const raw = `ck_${physicalTable}_${column}_${kind}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return raw.slice(0, 63);
}
