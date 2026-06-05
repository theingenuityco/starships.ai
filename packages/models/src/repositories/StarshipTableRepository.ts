import type { StarshipTableColumn } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { NotFoundError, ValidationError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { getEnvConfig } from '@starships/env';
import type { PostgresConnection } from '@/helpers/database';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { schemaName, qualifiedTable, sanitizeTableName, assertSafeId } from '@/helpers/starship-tables/identifiers';
import { compileCreateTable, compileAlterTable, TableSchemaChangeError } from '@/services/StarshipTableDdlCompiler';
import { StarshipDatabaseProvisioner } from '@/services/StarshipDatabaseProvisioner';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { serializeTable, tableFilename } from '@/services/definition/tableCodec';
import type { TableDefinition } from '@/services/definition/types';

type DbRow = Record<string, unknown>;

/** A Table = a real Postgres table inside a starship's Database schema. */
export interface StarshipTableRecord {
  id: string;
  starshipId: string;
  name: string;
  slug: string;
  description: string;
  columns: StarshipTableColumn[];
  primaryKey: string | null;
  schemaName: string;
  physicalTable: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStarshipTableInput {
  starshipId: string;
  name: string;
  description?: string;
  columns: StarshipTableColumn[];
  primaryKey?: string | null;
}

export interface UpdateStarshipTableInput {
  name?: string;
  description?: string;
  columns?: StarshipTableColumn[];
  primaryKey?: string | null;
  archived?: boolean;
}

const SELECT_COLS = `
  id, starship_id, name, slug, description, schema_name, physical_table,
  columns_meta_json AS columns_meta, primary_key, archived, created_at, updated_at
`;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : new Date(String(value)).toISOString();
}

function dropFormula(columns: StarshipTableColumn[] | undefined): StarshipTableColumn[] {
  return (Array.isArray(columns) ? columns : []).filter((c) => c && c.name);
}

export class StarshipTableRepository extends BaseRepository {
  private _definitionStore?: StarshipDefinitionStore;

  constructor(connection?: PostgresConnection) {
    super('StarshipTableRepository', connection);
  }

  /**
   * Tables mirror to the definition file at the repository layer (routes call
   * the repo directly, no service seam). DB-first-mirror: the row + physical
   * table is the canonical write (DDL is computed here); its logical schema is
   * mirrored to `.autopilot/tables/<slug>.yaml`. The physical binding
   * (schema/physicalTable) and `archived` are index-only. Gated by
   * STARSHIP_FS_AUTHORITY.
   */
  private get definitionStore(): StarshipDefinitionStore {
    if (!this._definitionStore) this._definitionStore = new StarshipDefinitionStore();
    return this._definitionStore;
  }

  private fsAuthority(): boolean {
    return getEnvConfig().STARSHIP_FS_AUTHORITY === true;
  }

  private async mirrorToFile(record: StarshipTableRecord | null): Promise<void> {
    if (!record || !this.fsAuthority()) return;
    await this.definitionStore.ensureProvisioned(record.starshipId);
    await this.definitionStore.write(record.starshipId, 'tables', tableFilename(record.slug), serializeTable(record));
  }

  private async removeFile(record: StarshipTableRecord | null): Promise<void> {
    if (!record || !this.fsAuthority()) return;
    await this.definitionStore.delete(record.starshipId, 'tables', tableFilename(record.slug));
  }

  private mapRow(row: DbRow): StarshipTableRecord {
    const rawCols = row['columns_meta'];
    const columns: StarshipTableColumn[] = Array.isArray(rawCols)
      ? (rawCols as StarshipTableColumn[])
      : typeof rawCols === 'string'
        ? (JSON.parse(rawCols) as StarshipTableColumn[])
        : [];
    return {
      id: String(row['id']),
      starshipId: String(row['starship_id']),
      name: String(row['name']),
      slug: String(row['slug']),
      description: typeof row['description'] === 'string' ? (row['description'] as string) : '',
      columns,
      primaryKey: row['primary_key'] == null ? null : String(row['primary_key']),
      schemaName: String(row['schema_name']),
      physicalTable: String(row['physical_table']),
      archived: Boolean(row['archived']),
      createdAt: toIso(row['created_at']),
      updatedAt: toIso(row['updated_at']),
    };
  }

  async findById(id: string): Promise<StarshipTableRecord | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(`SELECT ${SELECT_COLS} FROM starship_tables WHERE id = $1`, [id]);
        return row ? this.mapRow(row) : null;
      },
      'findById',
      'StarshipTable',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<StarshipTableRecord | null> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `SELECT ${SELECT_COLS} FROM starship_tables WHERE starship_id = $1 AND slug = $2 LIMIT 1`,
          [starshipId, slug]
        );
        return row ? this.mapRow(row) : null;
      },
      'findBySlug',
      'StarshipTable',
      slug
    );
  }

  async listByStarship(starshipId: string, opts?: { includeArchived?: boolean }): Promise<StarshipTableRecord[]> {
    return this.executeWithErrorHandling(
      async () => {
        const includeArchived = Boolean(opts?.includeArchived);
        const rows = await this.getConnection().query<DbRow>(
          `SELECT ${SELECT_COLS} FROM starship_tables
           WHERE starship_id = $1 AND ($2::boolean = TRUE OR archived = FALSE)
           ORDER BY archived ASC, created_at DESC`,
          [starshipId, includeArchived]
        );
        return rows.map((r) => this.mapRow(r));
      },
      'listByStarship',
      'StarshipTable'
    );
  }

  private async physicalTableExists(schema: string, name: string): Promise<boolean> {
    const row = await this.getConnection().queryOne<DbRow>(
      `SELECT 1 AS one FROM starship_tables WHERE schema_name = $1 AND physical_table = $2 LIMIT 1`,
      [schema, name]
    );
    return Boolean(row);
  }

  private async uniquePhysicalTable(schema: string, slug: string): Promise<string> {
    const base = sanitizeTableName(slug);
    let candidate = base;
    let i = 2;
    while (await this.physicalTableExists(schema, candidate)) {
      const suffix = `_${i++}`;
      candidate = `${base.slice(0, 63 - suffix.length)}${suffix}`;
    }
    return candidate;
  }

  async create(data: CreateStarshipTableInput): Promise<StarshipTableRecord> {
    return this.executeWithErrorHandling(
      async () => {
        const starshipId = assertSafeId(data.starshipId, 'starshipId');
        const columns = dropFormula(data.columns);
        const primaryKey = typeof data.primaryKey === 'string' ? data.primaryKey : null;

        // Ensure the starship's Database schema + read-only role exist.
        await new StarshipDatabaseProvisioner(this.getConnection()).ensureProvisioned(starshipId);

        const id = nanoid();
        const now = new Date().toISOString();
        const slug = await generateUniqueSlugIncremental(
          String(data.name || 'table'),
          async (candidate: string) => Boolean(await this.findBySlug(candidate, starshipId)),
          { fallbackBase: 'table', maxLength: 100 }
        );
        const schema = schemaName(starshipId);
        const physicalTable = await this.uniquePhysicalTable(schema, slug);
        const ddl = compileCreateTable({ table: qualifiedTable(starshipId, physicalTable), physicalTable, columns, primaryKey });

        await this.getConnection().transaction(async (client) => {
          await client.query(
            `INSERT INTO starship_tables
               (id, starship_id, name, slug, description, schema_name, physical_table, columns_meta_json, primary_key, archived, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
            [id, starshipId, data.name, slug, data.description ?? '', schema, physicalTable, JSON.stringify(columns), primaryKey, false, now, now]
          );
          for (const stmt of ddl) await client.query(stmt);
        });

        const created = await this.findById(id);
        if (!created) throw new NotFoundError('StarshipTable', id);
        await this.mirrorToFile(created);
        return created;
      },
      'create',
      'StarshipTable'
    );
  }

  async update(id: string, updates: UpdateStarshipTableInput): Promise<StarshipTableRecord | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return null;

        const columnsChanged = updates.columns !== undefined;
        const nextColumns = columnsChanged ? dropFormula(updates.columns) : existing.columns;
        const nextPrimaryKey =
          updates.primaryKey !== undefined ? (typeof updates.primaryKey === 'string' ? updates.primaryKey : null) : existing.primaryKey;
        const primaryKeyChanged = nextPrimaryKey !== existing.primaryKey;

        let alter: string[] = [];
        // Run the diff when columns OR the primaryKey changed — the latter toggles the __row_key UNIQUE constraint.
        if (columnsChanged || primaryKeyChanged) {
          try {
            alter = compileAlterTable({
              table: qualifiedTable(existing.starshipId, existing.physicalTable),
              physicalTable: existing.physicalTable,
              oldColumns: existing.columns,
              columns: nextColumns,
              primaryKey: nextPrimaryKey,
              oldPrimaryKey: existing.primaryKey,
            });
          } catch (e) {
            // Surface as a 400-mappable validation error rather than a 500.
            if (e instanceof TableSchemaChangeError) throw new ValidationError(e.message);
            throw e;
          }
        }

        const sets: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        if (updates.name !== undefined) {
          sets.push(`name = $${i++}`);
          values.push(updates.name);
        }
        if (updates.description !== undefined) {
          sets.push(`description = $${i++}`);
          values.push(updates.description);
        }
        if (columnsChanged) {
          sets.push(`columns_meta_json = $${i++}::jsonb`);
          values.push(JSON.stringify(nextColumns));
        }
        if (updates.primaryKey !== undefined) {
          sets.push(`primary_key = $${i++}`);
          values.push(nextPrimaryKey);
        }
        if (updates.archived !== undefined) {
          sets.push(`archived = $${i++}`);
          values.push(Boolean(updates.archived));
        }
        sets.push(`updated_at = $${i++}`);
        values.push(new Date().toISOString());

        await this.getConnection().transaction(async (client) => {
          for (const stmt of alter) await client.query(stmt);
          if (sets.length > 0) {
            values.push(id);
            await client.query(`UPDATE starship_tables SET ${sets.join(', ')} WHERE id = $${i}`, values);
          }
        });

        const updated = await this.findById(id);
        await this.mirrorToFile(updated);
        return updated;
      },
      'update',
      'StarshipTable',
      id
    );
  }

  async archive(id: string): Promise<StarshipTableRecord | null> {
    return this.update(id, { archived: true });
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return false;
        const table = qualifiedTable(existing.starshipId, existing.physicalTable);
        await this.getConnection().transaction(async (client) => {
          await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
          await client.query(`DELETE FROM starship_tables WHERE id = $1`, [id]);
        });
        await this.removeFile(existing);
        return true;
      },
      'delete',
      'StarshipTable',
      id
    );
  }

  /**
   * Upsert the starship_tables INDEX row + physical table from a filesystem
   * definition (the reconcile target; does NOT mirror back to a file).
   *
   * - New (no row for def.id): provision schema, generate a physical table name,
   *   compileCreateTable, INSERT (explicit id + authored slug) + DDL in one tx.
   * - Existing: compileAlterTable(old -> new) for column/primaryKey changes, then
   *   ALTER + UPDATE authored columns in one tx. Physical binding (schema_name,
   *   physical_table) and `archived` are preserved.
   *
   * A destructive schema change surfaces as a ValidationError (mappable to 400).
   */
  async upsertIndexFromDefinition(input: { def: TableDefinition; starshipId: string }): Promise<StarshipTableRecord> {
    const { def } = input;
    return this.executeWithErrorHandling(
      async () => {
        const starshipId = assertSafeId(input.starshipId, 'starshipId');
        const columns = dropFormula(def.columns as unknown as StarshipTableColumn[]);
        const primaryKey = typeof def.primaryKey === 'string' ? def.primaryKey : null;
        const existing = await this.findById(def.id);
        const now = new Date().toISOString();

        if (!existing) {
          await new StarshipDatabaseProvisioner(this.getConnection()).ensureProvisioned(starshipId);
          const schema = schemaName(starshipId);
          const physicalTable = await this.uniquePhysicalTable(schema, def.slug);
          const ddl = compileCreateTable({ table: qualifiedTable(starshipId, physicalTable), physicalTable, columns, primaryKey });
          await this.getConnection().transaction(async (client) => {
            await client.query(
              `INSERT INTO starship_tables
                 (id, starship_id, name, slug, description, schema_name, physical_table, columns_meta_json, primary_key, archived, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
              [def.id, starshipId, def.name, def.slug, def.description ?? '', schema, physicalTable, JSON.stringify(columns), primaryKey, false, now, now]
            );
            for (const stmt of ddl) await client.query(stmt);
          });
        } else {
          let alter: string[] = [];
          try {
            alter = compileAlterTable({
              table: qualifiedTable(existing.starshipId, existing.physicalTable),
              physicalTable: existing.physicalTable,
              oldColumns: existing.columns,
              columns,
              primaryKey,
              oldPrimaryKey: existing.primaryKey,
            });
          } catch (e) {
            if (e instanceof TableSchemaChangeError) throw new ValidationError(e.message);
            throw e;
          }
          await this.getConnection().transaction(async (client) => {
            for (const stmt of alter) await client.query(stmt);
            await client.query(
              `UPDATE starship_tables
                 SET name = $1, description = $2, columns_meta_json = $3::jsonb, primary_key = $4, updated_at = $5
               WHERE id = $6`,
              [def.name, def.description ?? '', JSON.stringify(columns), primaryKey, now, def.id]
            );
          });
        }

        const result = await this.findById(def.id);
        if (!result) throw new NotFoundError('StarshipTable', def.id);
        return result;
      },
      'upsertIndexFromDefinition',
      'StarshipTable',
      def.id
    );
  }
}

export default StarshipTableRepository;
