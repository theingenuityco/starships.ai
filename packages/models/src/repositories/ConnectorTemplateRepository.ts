import { ConnectorTemplateEntity } from '@/entities/ConnectorTemplateEntity';
import { fromDatabase } from '@/helpers/serialization-helper';
import { toDatabase } from '@/helpers/serialization-helper';
import { toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { CreateConnectorTemplateRequest, ConnectorProvider } from '@starships/protocol';
import type { ConnectorAuthV2, ConnectorEndpointV2, ConnectorTemplateRuntimeFieldsV2, JsonSchemaObject } from '@starships/protocol';

export class ConnectorTemplateRepository extends BaseRepository {
  constructor() {
    super('ConnectorTemplateRepository');
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
          authType: data.authType,
          baseUrl: data.baseUrl,
          authJson: data.auth as ConnectorAuthV2,
          variablesJson: (data.variables as ConnectorTemplateRuntimeFieldsV2['variables']) ?? undefined,
          endpointsJson: (data.endpoints as ConnectorEndpointV2[]) ?? [],
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
        const databaseFormat = toDatabase(entity);
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
        | 'authType'
        | 'isEnabled'
        | 'version'
        | 'category'
        | 'baseUrl'
        | 'authJson'
        | 'variablesJson'
        | 'endpointsJson'
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

        const dbUpdates = toDatabase(updates as unknown as Record<string, unknown>);
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
