import { ConnectorTemplateEntity } from '@/entities/ConnectorTemplateEntity';
import { fromDatabase } from '@/helpers/serialization-helper';
import { toDatabase } from '@/helpers/serialization-helper';
import { toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { CreateConnectorTemplateRequest, ConnectorProvider } from '@starships/protocol';
import type { ConnectorAuthV2, ConnectorTemplateRuntimeFieldsV2, JsonSchemaObject } from '@starships/protocol';

export class ConnectorTemplateRepository extends BaseRepository {
  constructor() {
    super('ConnectorTemplateRepository');
  }

  /**
   * Search connector templates for Explore catalog (DB-backed).
   * Filters to enabled templates by default.
   */
  async searchCatalog(args?: { q?: string; limit?: number }): Promise<Array<Record<string, unknown>>> {
    return this.executeWithErrorHandling(
      async () => {
        const q = typeof args?.q === 'string' ? args.q.trim() : '';
        const limit = typeof args?.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.min(200, args.limit)) : 200;

        const connection = this.getConnection();
        const params: unknown[] = [];
        let i = 1;
        const where: string[] = [];

        // Only enabled connectors should be discoverable in public Explore.
        where.push('(is_enabled IS DISTINCT FROM FALSE)');

        if (q) {
          if (q.length > 200) throw new Error('Search query cannot exceed 200 characters');
          params.push(`%${q}%`);
          const p = `$${i++}`;
          where.push(`(
            provider ILIKE ${p}
            OR name ILIKE ${p}
            OR description ILIKE ${p}
            OR category ILIKE ${p}
          )`);
        }

        params.push(limit);
        const pLimit = `$${i++}`;

        const sql = `
          SELECT *
          FROM connector_templates
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY usage_count DESC, provider ASC, created_at DESC
          LIMIT ${pLimit}
        `;

        const rows = await connection.query<Record<string, unknown>>(sql, params);
        return rows ?? [];
      },
      'searchCatalog',
      'ConnectorTemplate'
    );
  }

  /**
   * Search connector templates for Explore catalog (DB-backed), including a total count.
   *
   * This exists to support API routes that need totals for UX without reaching into private DB internals.
   */
  async searchCatalogWithTotal(args?: {
    q?: string;
    limit?: number;
  }): Promise<{ total: number; rows: Array<Record<string, unknown>> }> {
    return this.executeWithErrorHandling(
      async () => {
        const q = typeof args?.q === 'string' ? args.q.trim() : '';
        const limit = typeof args?.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.min(200, args.limit)) : 200;

        const connection = this.getConnection();
        const where: string[] = ['(is_enabled IS DISTINCT FROM FALSE)'];
        const params: unknown[] = [];
        let i = 1;

        if (q) {
          if (q.length > 200) throw new Error('Search query cannot exceed 200 characters');
          params.push(`%${q}%`);
          const p = `$${i++}`;
          where.push(`(
            provider ILIKE ${p}
            OR name ILIKE ${p}
            OR description ILIKE ${p}
            OR category ILIKE ${p}
          )`);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countRow = await connection.queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM connector_templates ${whereSql}`, params);

        params.push(limit);
        const pLimit = `$${i++}`;

        const sql = `
          SELECT *
          FROM connector_templates
          ${whereSql}
          ORDER BY usage_count DESC, provider ASC, created_at DESC
          LIMIT ${pLimit}
        `;

        const rows = await connection.query<Record<string, unknown>>(sql, params);
        return { total: countRow?.n ?? 0, rows: rows ?? [] };
      },
      'searchCatalogWithTotal',
      'ConnectorTemplate'
    );
  }

  /**
   * Read-only access to the legacy endpoints catalog stored on connector_templates.endpoints_json.
   *
   * IMPORTANT: This exists only for admin transparency/debugging. Runtime execution must use
   * connector_template_actions (row table) exclusively.
   */
  async getLegacyEndpointsJsonByTemplateId(templateId: string): Promise<unknown[]> {
    return this.executeWithErrorHandling(
      async () => {
        const id = String(templateId || '').trim();
        if (!id) throw new Error('templateId is required');

        const connection = this.getConnection();
        const row = await connection.queryOne<{ endpoints_json?: unknown }>(
          `SELECT endpoints_json FROM connector_templates WHERE id = $1`,
          [id]
        );
        const raw = row?.endpoints_json;
        return Array.isArray(raw) ? raw : [];
      },
      'getLegacyEndpointsJsonByTemplateId',
      'ConnectorTemplate',
      templateId
    );
  }

  /**
   * IMPORTANT:
   * node-postgres serializes JavaScript arrays as PostgreSQL array literals (e.g. {"a","b"}).
   * When the destination column is JSONB, that encoding is NOT valid JSON (JSON arrays are ["a","b"]).
   *
   * This is why updates to connector_templates.variables_json (when non-empty)
   * can fail with: `invalid input syntax for type json` / `Expected ":", but found ",".`
   *
   * To ensure JSONB columns always receive valid JSON, we explicitly JSON.stringify any object/array
   * values for known JSONB columns before passing params to pg.
   */
  private normalizeJsonbUpdateValue(value: unknown): unknown {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  private normalizeJsonbColumns(dbRecord: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...dbRecord };
    const jsonbColumns = [
      'auth_json',
      'variables_json',
      'rate_limit_json',
      'metadata_schema_json',
      'webhooks_json',
    ] as const;
    for (const col of jsonbColumns) {
      if (col in out) {
        out[col] = this.normalizeJsonbUpdateValue(out[col]);
      }
    }
    return out;
  }

  private async generateUniqueTemplateSlug(baseSlug: string): Promise<string> {
    const connection = this.getConnection();
    const base = (baseSlug || '').trim();
    const fallbackBase = base.length > 0 ? base : 'connector-template';

    const existing = await connection.queryOne<{ id: string }>('SELECT id FROM connector_templates WHERE slug = $1', [fallbackBase]);
    if (!existing?.id) return fallbackBase;

    let counter = 2;
    const maxAttempts = 10_000;
    while (counter < maxAttempts) {
      const candidate = `${fallbackBase}-${counter}`;
      const row = await connection.queryOne<{ id: string }>('SELECT id FROM connector_templates WHERE slug = $1', [candidate]);
      if (!row?.id) return candidate;
      counter++;
    }

    const ts = Date.now().toString(36);
    return `${fallbackBase}-${ts}`;
  }

  async list(): Promise<ConnectorTemplateEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM connector_templates ORDER BY provider, created_at DESC'
        );

        return result.map((record) => fromDatabase(ConnectorTemplateEntity, record));
      },
      'list',
      'ConnectorTemplate'
    );
  }

  async findById(id: string): Promise<ConnectorTemplateEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM connector_templates WHERE id = $1', [id]);

        return result ? fromDatabase(ConnectorTemplateEntity, result) : null;
      },
      'findById',
      'ConnectorTemplate',
      id
    );
  }

  async findByProvider(provider: ConnectorProvider): Promise<ConnectorTemplateEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!provider?.trim()) {
          throw new Error('provider is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM connector_templates WHERE provider = $1 ORDER BY created_at DESC',
          [provider]
        );

        return result ? fromDatabase(ConnectorTemplateEntity, result) : null;
      },
      'findByProvider',
      'ConnectorTemplate',
      provider
    );
  }

  async create(data: CreateConnectorTemplateRequest): Promise<ConnectorTemplateEntity> {
    return this.executeWithErrorHandling(
      async () => {
        if (!data?.provider?.trim()) {
          throw new Error('provider is required');
        }

        const now = new Date().toISOString();

        // Default to stable ids for templates (matches seeded templates).
        const id = (data.id || data.provider).toString().trim();

        // Generate a stable template slug, ensuring uniqueness.
        const baseSlug = generateSlug((data.slug || data.provider || '').toString()) || 'connector-template';
        const slug = await this.generateUniqueTemplateSlug(baseSlug);

        const entityProps = {
          id,
          slug,
          provider: data.provider,
          name: data.name,
          description: data.description,
          demoVideoUrl: typeof data.demoVideoUrl === 'string' ? data.demoVideoUrl.trim() || undefined : undefined,
          // Persist denormalized auth_type for DB filtering/legacy reasons, derived from auth_json.type.
          authType: ((data.auth as unknown as { type?: string })?.type || 'none') as CreateConnectorTemplateRequest['auth']['type'],
          baseUrl: data.baseUrl,
          authJson: data.auth as ConnectorAuthV2,
          variablesJson: (data.variables as ConnectorTemplateRuntimeFieldsV2['variables']) ?? undefined,
          rateLimitJson: (data.rateLimit as ConnectorTemplateRuntimeFieldsV2['rateLimit']) ?? undefined,
          metadataSchemaJson: (data.metadataSchema as JsonSchemaObject | undefined) ?? undefined,
          version: data.version || '1.0.0',
          category: data.category || 'connector',
          usageCount: 0,
          isEnabled: data.isEnabled ?? true,
          createdAt: now,
          updatedAt: now,
        };

        await ConnectorTemplateEntity.validate(entityProps);

        const entity = toEntityInstance(ConnectorTemplateEntity, entityProps);
        const databaseFormat = this.normalizeJsonbColumns(toDatabase(entity));
        const result = await this.createEntity<Record<string, unknown>>('connector_templates', databaseFormat);
        return fromDatabase(ConnectorTemplateEntity, result);
      },
      'create',
      'ConnectorTemplate'
    );
  }

  async update(
    id: string,
    updates: Partial<
      Pick<
        ConnectorTemplateEntity,
        | 'name'
        | 'description'
        | 'demoVideoUrl'
        | 'authType'
        | 'isEnabled'
        | 'version'
        | 'category'
        | 'baseUrl'
        | 'authJson'
        | 'variablesJson'
        | 'rateLimitJson'
        | 'metadataSchemaJson'
      >
    >
  ): Promise<ConnectorTemplateEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required');
        }

        const dbUpdates = this.normalizeJsonbColumns(toDatabase(updates as unknown as Record<string, unknown>));
        const connection = this.getConnection();
        const updated = await this.updateEntity<Record<string, unknown>>('connector_templates', id, dbUpdates, connection);
        return updated ? fromDatabase(ConnectorTemplateEntity, updated) : null;
      },
      'update',
      'ConnectorTemplate',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required');
        }
        return await this.deleteEntity('connector_templates', id);
      },
      'delete',
      'ConnectorTemplate',
      id
    );
  }
}
