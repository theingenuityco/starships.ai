import { AutopilotAwaitFiringEntity } from '@/entities/AutopilotAwaitFiringEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { AutopilotAwaitFiringModel, AutopilotAwaitFiringStatus } from '@starships/protocol';
import { nanoid } from 'nanoid';

export class AutopilotAwaitFiringRepository extends BaseRepository {
  constructor() {
    super('AutopilotAwaitFiringRepository');
  }

  async findById(id: string): Promise<AutopilotAwaitFiringModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('autopilot_await_firings', id);
        return result ? fromDatabase(AutopilotAwaitFiringEntity, result) : null;
      },
      'findById',
      'AutopilotAwaitFiring',
      id
    );
  }

  async createOrIgnore(data: {
    awaitId: string;
    connectorEventId: string;
    status?: AutopilotAwaitFiringStatus;
    runRequestId?: string | null;
  }): Promise<AutopilotAwaitFiringModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const id = nanoid();
        const row: Record<string, unknown> = {
          id,
          awaitId: data.awaitId,
          connectorEventId: data.connectorEventId,
          status: data.status ?? 'pending',
          runRequestId: data.runRequestId ?? null,
          startedAt: null,
          completedAt: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        };

        await AutopilotAwaitFiringEntity.validate(row, 'create');
        const entity = toEntityInstance(AutopilotAwaitFiringEntity, row);
        const dbFormat = toDatabase(entity);

        const conn = this.getConnection();
        const inserted = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO autopilot_await_firings (
            id, await_id, connector_event_id, status, run_request_id,
            started_at, completed_at, error,
            created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (await_id, connector_event_id) DO NOTHING
          RETURNING *
          `,
          [
            dbFormat.id,
            dbFormat.await_id,
            dbFormat.connector_event_id,
            dbFormat.status,
            dbFormat.run_request_id,
            dbFormat.started_at,
            dbFormat.completed_at,
            dbFormat.error,
            dbFormat.created_at,
            dbFormat.updated_at,
          ]
        );

        return inserted ? fromDatabase(AutopilotAwaitFiringEntity, inserted) : null;
      },
      'createOrIgnore',
      'AutopilotAwaitFiring'
    );
  }

  async update(id: string, updates: Partial<AutopilotAwaitFiringModel>): Promise<AutopilotAwaitFiringModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await AutopilotAwaitFiringEntity.validate(updates as unknown as Record<string, unknown>, 'update');
        const entity = toEntityInstance(AutopilotAwaitFiringEntity, updates as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filtered } = dbFormat as any;
        if (Object.keys(filtered).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('autopilot_await_firings', id, filtered);
        return result ? fromDatabase(AutopilotAwaitFiringEntity, result) : null;
      },
      'update',
      'AutopilotAwaitFiring',
      id
    );
  }

  async listPending(limit = 100): Promise<AutopilotAwaitFiringModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT *
          FROM autopilot_await_firings
          WHERE status IN ('pending','running')
          ORDER BY created_at ASC
          LIMIT $1
          `,
          [limit]
        );
        return fromDatabaseArray(AutopilotAwaitFiringEntity, rows);
      },
      'listPending',
      'AutopilotAwaitFiring'
    );
  }
}

export default AutopilotAwaitFiringRepository;
