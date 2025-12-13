import { ConnectorEntity } from '@/entities/ConnectorEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConnectorModel, ConnectorProvider, ConnectorStatus } from '@starships/protocol';

export class ConnectorRepository extends BaseRepository {
  constructor() {
    super('ConnectorRepository');
  }

  async findByStarship(starshipId: string): Promise<ConnectorModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM connectors WHERE starship_id = $1 ORDER BY provider',
          [starshipId]
        );

        return result.map((record) => fromDatabase(ConnectorEntity, record));
      },
      'findByStarship',
      'Connector'
    );
  }

  async findByStarshipAndProvider(starshipId: string, provider: ConnectorProvider): Promise<ConnectorModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim() || !provider?.trim()) {
          throw new Error('starshipId and provider are required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM connectors WHERE starship_id = $1 AND provider = $2',
          [starshipId, provider]
        );

        return result ? fromDatabase(ConnectorEntity, result) : null;
      },
      'findByStarshipAndProvider',
      'Connector'
    );
  }

  async create(data: {
    starshipId: string;
    provider: ConnectorProvider;
    status?: ConnectorStatus;
    metadata?: Record<string, unknown>;
    lastError?: string;
    templateId?: string;
    version?: string;
  }): Promise<ConnectorModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        const connectorData = {
          starshipId: data.starshipId,
          provider: data.provider,
          status: data.status || 'connected',
          metadata: data.metadata || {},
          lastError: data.lastError,
          templateId: data.templateId,
          version: data.version,
          createdAt: now,
          updatedAt: now,
        };

        await ConnectorEntity.validate(connectorData, 'create');

        const connectorEntity = toEntityInstance(ConnectorEntity, connectorData);
        const databaseFormat = toDatabase(connectorEntity);
        const result = await this.createEntity<Record<string, unknown>>('connectors', databaseFormat);

        return fromDatabase(ConnectorEntity, result);
      },
      'create',
      'Connector'
    );
  }

  async update(
    id: string,
    updates: {
      status?: ConnectorStatus;
      metadata?: Record<string, unknown>;
      lastError?: string | null;
    }
  ): Promise<ConnectorModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for update operation');
        }

        const updateProps: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };

        if (updates.status !== undefined) {
          updateProps.status = updates.status;
        }

        if (updates.metadata !== undefined) {
          updateProps.metadata = updates.metadata;
        }

        if (updates.lastError !== undefined) {
          updateProps.lastError = updates.lastError;
        }

        await ConnectorEntity.validate(
          {
            id,
            ...updateProps,
          },
          'update'
        );

        const updateData = toDatabase(toEntityInstance(ConnectorEntity, updateProps));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          const existing = await this.getConnection().queryOne<Record<string, unknown>>('SELECT * FROM connectors WHERE id = $1', [
            id,
          ]);
          return existing ? fromDatabase(ConnectorEntity, existing) : null;
        }

        const result = await this.updateEntity<Record<string, unknown>>('connectors', id, filteredUpdateData);
        return result ? fromDatabase(ConnectorEntity, result) : null;
      },
      'update',
      'Connector',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for delete operation');
        }

        return await this.deleteEntity('connectors', id);
      },
      'delete',
      'Connector',
      id
    );
  }
}
