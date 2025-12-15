import { ConnectorTemplateEntity } from '@/entities/ConnectorTemplateEntity';
import { fromDatabase } from '@/helpers/serialization-helper';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConnectorProvider } from '@starships/protocol';

export class ConnectorTemplateRepository extends BaseRepository {
  constructor() {
    super('ConnectorTemplateRepository');
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

  async update(
    id: string,
    updates: Partial<
      Pick<
        ConnectorTemplateEntity,
        | 'displayName'
        | 'description'
        | 'authType'
        | 'isEnabled'
        | 'runtimeConfig'
        | 'version'
        | 'category'
        | 'connectBlueprint'
        | 'refreshBlueprint'
        | 'testBlueprint'
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
}
