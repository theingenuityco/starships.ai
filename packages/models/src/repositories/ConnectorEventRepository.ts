import { ConnectorEventEntity } from '@/entities/ConnectorEventEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { ConnectorEventModel, ConnectorProvider } from '@starships/protocol';
import { nanoid } from 'nanoid';

export class ConnectorEventRepository extends BaseRepository {
  constructor() {
    super('ConnectorEventRepository');
  }

  async findById(id: string): Promise<ConnectorEventModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('connector_events', id);
        return result ? fromDatabase(ConnectorEventEntity, result) : null;
      },
      'findById',
      'ConnectorEvent',
      id
    );
  }

  /**
   * Create an event. If externalEventId is provided, dedupe by (connector_id, external_event_id).
   * Returns the existing row if a conflict occurred.
   */
  async createOrGetByExternalId(data: {
    starshipId: string;
    connectorId: string;
    provider: ConnectorProvider;
    eventType: string;
    externalEventId?: string | null;
    payloadJson: Record<string, unknown>;
    rawPayloadJson?: Record<string, unknown> | null;
    headersJson?: Record<string, unknown> | null;
    receivedAt?: string;
  }): Promise<ConnectorEventModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const receivedAt = data.receivedAt ?? now;
        const id = nanoid();

        const eventData: Record<string, unknown> = {
          id,
          starshipId: data.starshipId,
          connectorId: data.connectorId,
          provider: data.provider,
          eventType: data.eventType,
          externalEventId: data.externalEventId ?? null,
          payloadJson: data.payloadJson ?? {},
          rawPayloadJson: data.rawPayloadJson ?? null,
          headersJson: data.headersJson ?? null,
          receivedAt,
          processedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        await ConnectorEventEntity.validate(eventData, 'create');
        const entity = toEntityInstance(ConnectorEventEntity, eventData);
        const dbFormat = toDatabase(entity);

        const conn = this.getConnection();

        // If we don't have externalEventId, fall back to normal insert (no dedupe).
        if (!data.externalEventId) {
          const created = await this.createEntity<Record<string, unknown>>('connector_events', dbFormat);
          return fromDatabase(ConnectorEventEntity, created);
        }

        // Dedupe insert.
        const result = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO connector_events (
            id, starship_id, connector_id, provider, event_type, external_event_id,
            payload_json, raw_payload_json, headers_json,
            received_at, processed_at, created_at, updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,
            $10,$11,$12,$13
          )
          ON CONFLICT (connector_id, external_event_id) DO UPDATE
            SET updated_at = EXCLUDED.updated_at
          RETURNING *
          `,
          [
            dbFormat.id,
            dbFormat.starship_id,
            dbFormat.connector_id,
            dbFormat.provider,
            dbFormat.event_type,
            dbFormat.external_event_id,
            dbFormat.payload_json,
            dbFormat.raw_payload_json,
            dbFormat.headers_json,
            dbFormat.received_at,
            dbFormat.processed_at,
            dbFormat.created_at,
            dbFormat.updated_at,
          ]
        );

        if (!result) {
          // Extremely defensive fallback.
          const existing = await conn.queryOne<Record<string, unknown>>(
            `SELECT * FROM connector_events WHERE connector_id = $1 AND external_event_id = $2`,
            [data.connectorId, data.externalEventId]
          );
          if (!existing) {
            throw new Error('Failed to create connector event');
          }
          return fromDatabase(ConnectorEventEntity, existing);
        }

        return fromDatabase(ConnectorEventEntity, result);
      },
      'createOrGetByExternalId',
      'ConnectorEvent'
    );
  }

  async markProcessed(id: string, processedAt?: string): Promise<ConnectorEventModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const at = processedAt ?? new Date().toISOString();
        const updated = await this.updateEntity<Record<string, unknown>>('connector_events', id, {
          processed_at: at,
        });
        return updated ? fromDatabase(ConnectorEventEntity, updated) : null;
      },
      'markProcessed',
      'ConnectorEvent',
      id
    );
  }

  async listByConnector(connectorId: string, limit = 50): Promise<ConnectorEventModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `SELECT * FROM connector_events WHERE connector_id = $1 ORDER BY received_at DESC LIMIT $2`,
          [connectorId, limit]
        );
        return fromDatabaseArray(ConnectorEventEntity, rows);
      },
      'listByConnector',
      'ConnectorEvent'
    );
  }
}

export default ConnectorEventRepository;

