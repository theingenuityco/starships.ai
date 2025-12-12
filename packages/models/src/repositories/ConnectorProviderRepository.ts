import { ConnectorProviderEntity } from '@/entities/ConnectorProviderEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';

export class ConnectorProviderRepository extends BaseRepository {
  constructor() {
    super('ConnectorProviderRepository');
  }

  async list(): Promise<ConnectorProviderEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM connector_providers ORDER BY id',
        );

        return result.map((record) => fromDatabase(ConnectorProviderEntity, record));
      },
      'list',
      'ConnectorProvider',
    );
  }

  async findById(id: string): Promise<ConnectorProviderEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM connector_providers WHERE id = $1',
          [id],
        );

        return result ? fromDatabase(ConnectorProviderEntity, result) : null;
      },
      'findById',
      'ConnectorProvider',
      id,
    );
  }

  async create(data: Partial<ConnectorProviderEntity>): Promise<ConnectorProviderEntity> {
    return this.executeWithErrorHandling(
      async () => {
        await ConnectorProviderEntity.validate(data);
        const entity = toEntityInstance(ConnectorProviderEntity, data);
        const dbData = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('connector_providers', dbData);
        return fromDatabase(ConnectorProviderEntity, result);
      },
      'create',
      'ConnectorProvider',
    );
  }

  async update(id: string, updates: Partial<ConnectorProviderEntity>): Promise<ConnectorProviderEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('id is required for update operation');
        }

        const existing = await this.findById(id);
        if (!existing) {
          return null;
        }

        const merged = {
          ...toDatabase(existing),
          ...toDatabase(toEntityInstance(ConnectorProviderEntity, updates)),
        };

        await ConnectorProviderEntity.validate(merged);

        // id is immutable
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...updateData } = merged;

        const result = await this.updateEntity<Record<string, unknown>>('connector_providers', id, updateData);
        return result ? fromDatabase(ConnectorProviderEntity, result) : null;
      },
      'update',
      'ConnectorProvider',
      id,
    );
  }
}


