import { nanoid } from 'nanoid';
import { fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { ConnectorWebhookBindingEntity } from '@/entities/ConnectorWebhookBindingEntity';
import type { ConnectorWebhookBindingModel } from '@/entities/ConnectorWebhookBindingEntity';
import { BaseRepository } from './BaseRepository';

export class ConnectorWebhookBindingRepository extends BaseRepository {
  constructor() {
    super('ConnectorWebhookBindingRepository');
  }

  async listByProviderAndExternalAccountId(provider: string, externalAccountId: string): Promise<ConnectorWebhookBindingModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const p = String(provider || '').trim();
        const ext = String(externalAccountId || '').trim();
        if (!p) throw new Error('provider is required');
        if (!ext) throw new Error('externalAccountId is required');

        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT *
          FROM connector_webhook_bindings
          WHERE provider = $1 AND external_account_id = $2
          ORDER BY created_at ASC
          `,
          [p, ext]
        );
        return fromDatabaseArray(ConnectorWebhookBindingEntity, rows);
      },
      'listByProviderAndExternalAccountId',
      'ConnectorWebhookBinding'
    );
  }

  async listConnectorIds(provider: string, externalAccountId: string): Promise<string[]> {
    const bindings = await this.listByProviderAndExternalAccountId(provider, externalAccountId);
    return bindings.map((b) => b.connectorId);
  }

  /**
   * Upsert a single binding (fanout supported).
   */
  async upsert(args: {
    provider: string;
    externalAccountId: string;
    connectorId: string;
    starshipId: string;
  }): Promise<ConnectorWebhookBindingModel> {
    return this.executeWithErrorHandling(
      async () => {
        const provider = String(args.provider || '').trim();
        const externalAccountId = String(args.externalAccountId || '').trim();
        const connectorId = String(args.connectorId || '').trim();
        const starshipId = String(args.starshipId || '').trim();
        if (!provider) throw new Error('provider is required');
        if (!externalAccountId) throw new Error('externalAccountId is required');
        if (!connectorId) throw new Error('connectorId is required');
        if (!starshipId) throw new Error('starshipId is required');

        const now = new Date().toISOString();
        const bindingData: Record<string, unknown> = {
          id: nanoid(),
          provider,
          externalAccountId,
          connectorId,
          starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await ConnectorWebhookBindingEntity.validate(bindingData, 'create');
        const entity = toEntityInstance(ConnectorWebhookBindingEntity, bindingData);
        const db = toDatabase(entity);

        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO connector_webhook_bindings (
            id, provider, external_account_id, connector_id, starship_id, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (provider, external_account_id, connector_id) DO UPDATE
            SET
              starship_id = EXCLUDED.starship_id,
              updated_at = EXCLUDED.updated_at
          RETURNING *
          `,
          [db.id, db.provider, db.external_account_id, db.connector_id, db.starship_id, db.created_at, db.updated_at]
        );

        if (!row) throw new Error('Failed to upsert connector webhook binding');
        return fromDatabaseArray(ConnectorWebhookBindingEntity, [row])[0] as ConnectorWebhookBindingModel;
      },
      'upsert',
      'ConnectorWebhookBinding'
    );
  }

  async deleteByConnectorId(connectorId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const id = String(connectorId || '').trim();
        if (!id) throw new Error('connectorId is required');
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `DELETE FROM connector_webhook_bindings WHERE connector_id = $1 RETURNING id`,
          [id]
        );
        return Array.isArray(rows) ? rows.length : 0;
      },
      'deleteByConnectorId',
      'ConnectorWebhookBinding',
      connectorId
    );
  }
}

export default ConnectorWebhookBindingRepository;

