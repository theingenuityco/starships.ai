import { AutopilotAwaitEntity } from '@/entities/AutopilotAwaitEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { AutopilotAwaitModel, AutopilotAwaitStatus } from '@starships/protocol';

export class AutopilotAwaitRepository extends BaseRepository {
  constructor() {
    super('AutopilotAwaitRepository');
  }

  async findById(id: string): Promise<AutopilotAwaitModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('autopilot_awaits', id);
        return result ? fromDatabase(AutopilotAwaitEntity, result) : null;
      },
      'findById',
      'AutopilotAwait',
      id
    );
  }

  async create(data: {
    starshipId: string;
    ownerUserId?: string | null;
    status?: AutopilotAwaitStatus;
    specJson: AutopilotAwaitModel['specJson'];
    blueprintJson: AutopilotAwaitModel['blueprintJson'];
    executionJson: AutopilotAwaitModel['executionJson'];
    stateJson?: Record<string, unknown> | null;
    expiresAt?: string | null;
    lastError?: string | null;
  }): Promise<AutopilotAwaitModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const row: Record<string, unknown> = {
          starshipId: data.starshipId,
          ownerUserId: data.ownerUserId ?? null,
          status: data.status ?? 'waiting',
          specJson: data.specJson ?? {},
          blueprintJson: data.blueprintJson ?? {},
          executionJson: data.executionJson ?? {},
          stateJson: data.stateJson ?? null,
          expiresAt: data.expiresAt ?? null,
          lastError: data.lastError ?? null,
          createdAt: now,
          updatedAt: now,
        };

        await AutopilotAwaitEntity.validate(row, 'create');
        const entity = toEntityInstance(AutopilotAwaitEntity, row);
        const dbFormat = toDatabase(entity);

        const created = await this.createEntity<Record<string, unknown>>('autopilot_awaits', dbFormat);

        return fromDatabase(AutopilotAwaitEntity, created);
      },
      'create',
      'AutopilotAwait'
    );
  }

  async update(id: string, updates: Partial<AutopilotAwaitModel>): Promise<AutopilotAwaitModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await AutopilotAwaitEntity.validate(updates as unknown as Record<string, unknown>, 'update');
        const entity = toEntityInstance(AutopilotAwaitEntity, updates as unknown as Record<string, unknown>);
        const dbFormat = toDatabase(entity) as Record<string, unknown>;

        // Strip read-only fields
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, starship_id: _starshipId, ...filtered } = dbFormat;

        if (Object.keys(filtered).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('autopilot_awaits', id, filtered);
        return result ? fromDatabase(AutopilotAwaitEntity, result) : null;
      },
      'update',
      'AutopilotAwait',
      id
    );
  }

  /**
   * Find awaits waiting for a given connector event signature.
   *
   * The matcher semantics are intentionally permissive:
   * - Missing spec.provider/connectorId/eventTypes means "match all".
   */
  async findWaitingMatches(args: {
    starshipId: string;
    provider: string;
    connectorId: string;
    eventType: string;
    limit?: number;
  }): Promise<AutopilotAwaitModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 100;
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT *
          FROM autopilot_awaits
          WHERE starship_id = $1
            AND status = 'waiting'
            AND spec_json->>'kind' = 'connector_event'
            AND (spec_json->'spec'->>'provider' IS NULL OR spec_json->'spec'->>'provider' = $2)
            AND (spec_json->'spec'->>'connectorId' IS NULL OR spec_json->'spec'->>'connectorId' = $3)
            AND (
              spec_json->'spec'->'eventTypes' IS NULL
              OR jsonb_typeof(spec_json->'spec'->'eventTypes') <> 'array'
              OR (spec_json->'spec'->'eventTypes') ? $4
            )
          ORDER BY created_at ASC
          LIMIT $5
          `,
          [args.starshipId, args.provider, args.connectorId, args.eventType, limit]
        );
        return fromDatabaseArray(AutopilotAwaitEntity, rows);
      },
      'findWaitingMatches',
      'AutopilotAwait'
    );
  }
}

export default AutopilotAwaitRepository;

