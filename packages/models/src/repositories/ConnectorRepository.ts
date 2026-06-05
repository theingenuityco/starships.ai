import { ConnectorEntity } from '@/entities/ConnectorEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { getEnvConfig } from '@starships/env';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { connectorFilename, serializeConnector } from '@/services/definition/connectorCodec';
import type { ConnectorDefinition } from '@/services/definition/types';
import type { ConnectorModel, ConnectorProvider, ConnectorStatus } from '@starships/protocol';

export class ConnectorRepository extends BaseRepository {
  private _definitionStore?: StarshipDefinitionStore;

  constructor() {
    super('ConnectorRepository');
  }

  /**
   * Connectors mirror to the definition file at the repository layer because
   * connector rows are written from many flows (configure/start/OAuth/disconnect)
   * with no single service seam. DB-first-mirror: the row is the canonical write,
   * its authored fields (provider/metadata/templateId/version) are mirrored to
   * `.autopilot/connectors/<provider>.yaml`. Secrets stay in connector_secrets;
   * status/lastError are index-only. Gated by STARSHIP_FS_AUTHORITY.
   */
  private get definitionStore(): StarshipDefinitionStore {
    if (!this._definitionStore) this._definitionStore = new StarshipDefinitionStore();
    return this._definitionStore;
  }

  private fsAuthority(): boolean {
    return getEnvConfig().STARSHIP_FS_AUTHORITY === true;
  }

  private async mirrorToFile(connector: ConnectorModel | null): Promise<void> {
    if (!connector || !this.fsAuthority()) return;
    await this.definitionStore.ensureProvisioned(connector.starshipId);
    await this.definitionStore.write(connector.starshipId, 'connectors', connectorFilename(connector.provider), serializeConnector(connector));
  }

  private async removeFile(connector: ConnectorModel | null): Promise<void> {
    if (!connector || !this.fsAuthority()) return;
    await this.definitionStore.delete(connector.starshipId, 'connectors', connectorFilename(connector.provider));
  }

  async findById(id: string): Promise<ConnectorModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const trimmed = String(id || '').trim();
        if (!trimmed) throw new Error('id is required');
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM connectors WHERE id = $1', [trimmed]);
        return result ? fromDatabase(ConnectorEntity, result) : null;
      },
      'findById',
      'Connector',
      id
    );
  }

  async findByIds(ids: string[]): Promise<ConnectorModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const list = Array.isArray(ids) ? ids.map((x) => String(x || '').trim()).filter(Boolean) : [];
        if (!list.length) return [];
        const connection = this.getConnection();

        // Preserve input order.
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT *
          FROM connectors
          WHERE id = ANY($1::text[])
          `,
          [list]
        );
        const byId = new Map(rows.map((r) => [String(r.id), fromDatabase(ConnectorEntity, r)]));
        return list.map((id) => byId.get(id)).filter((v): v is ConnectorModel => Boolean(v));
      },
      'findByIds',
      'Connector'
    );
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

        const connector = fromDatabase(ConnectorEntity, result);
        await this.mirrorToFile(connector);
        return connector;
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
        const connector = result ? fromDatabase(ConnectorEntity, result) : null;
        await this.mirrorToFile(connector);
        return connector;
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

        // Capture the row before deletion so we can remove its definition file.
        const existing = this.fsAuthority() ? await this.findById(id) : null;
        const deleted = await this.deleteEntity('connectors', id);
        if (deleted) await this.removeFile(existing);
        return deleted;
      },
      'delete',
      'Connector',
      id
    );
  }

  /**
   * Upsert the connectors INDEX row from a filesystem-authoritative definition.
   * Refreshes authored fields (provider, metadata, templateId, version);
   * preserves runtime fields (status, lastError, createdAt) on conflict. This is
   * the reconcile target (file -> index) and does NOT mirror back to a file.
   */
  async upsertIndexFromDefinition(input: { def: ConnectorDefinition; starshipId: string }): Promise<ConnectorModel> {
    const { def, starshipId } = input;
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const now = new Date().toISOString();

        const authored: Record<string, unknown> = {
          provider: def.provider,
          metadata: JSON.stringify(def.metadata ?? {}),
          template_id: def.templateId ?? null,
          version: def.version ?? null,
        };

        const insertRow: Record<string, unknown> = {
          id: def.id,
          ...authored,
          status: 'disconnected',
          last_error: null,
          starship_id: starshipId,
          created_at: now,
          updated_at: now,
        };

        const cols = Object.keys(insertRow);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const conflict = [...Object.keys(authored), 'updated_at'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');

        const result = await connection.query<Record<string, unknown>>(
          `INSERT INTO connectors (${cols.join(', ')})
           VALUES (${placeholders.join(', ')})
           ON CONFLICT (id) DO UPDATE SET ${conflict}
           RETURNING *`,
          Object.values(insertRow)
        );
        return fromDatabase(ConnectorEntity, result[0]);
      },
      'upsertIndexFromDefinition',
      'Connector',
      def.id
    );
  }

  async deleteByTemplateId(templateId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        if (!templateId?.trim()) {
          throw new Error('templateId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'DELETE FROM connectors WHERE template_id = $1 RETURNING id',
          [templateId]
        );

        return Array.isArray(result) ? result.length : 0;
      },
      'deleteByTemplateId',
      'Connector',
      templateId
    );
  }
}
