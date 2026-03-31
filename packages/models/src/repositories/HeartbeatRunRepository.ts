import { HeartbeatRunEntity } from '@/entities/HeartbeatRunEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { HeartbeatRunModel } from '@starships/protocol';

/**
 * HeartbeatRunRepository
 *
 * Audit log for heartbeat executions. Insert-heavy with occasional reads
 * for the recent-runs list endpoint.
 */
export class HeartbeatRunRepository extends BaseRepository {
  constructor() {
    super('HeartbeatRunRepository');
  }

  async create(data: {
    heartbeatConfigId: string;
    agentId: string;
    starshipId: string;
    status: 'ran' | 'skipped' | 'failed';
    result?: string | null;
    durationMs?: number | null;
    conversationId?: string | null;
    startedAt: string;
    completedAt?: string | null;
  }): Promise<HeartbeatRunModel> {
    return this.executeWithErrorHandling(
      async () => {
        const runData = {
          heartbeatConfigId: data.heartbeatConfigId,
          agentId: data.agentId,
          starshipId: data.starshipId,
          status: data.status,
          result: data.result ?? null,
          durationMs: data.durationMs ?? null,
          conversationId: data.conversationId ?? null,
          startedAt: data.startedAt,
          completedAt: data.completedAt ?? null,
        };

        await HeartbeatRunEntity.validate(runData, 'create');

        const entity = toEntityInstance(HeartbeatRunEntity, runData);
        const dbFormat = toDatabase(entity);
        const result = await this.createEntity<Record<string, unknown>>('heartbeat_runs', dbFormat);

        return fromDatabase(HeartbeatRunEntity, result);
      },
      'create',
      'HeartbeatRun'
    );
  }

  async findByConfigId(configId: string, limit = 50): Promise<HeartbeatRunModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM heartbeat_runs
           WHERE heartbeat_config_id = $1
           ORDER BY started_at DESC
           LIMIT $2`,
          [configId, limit]
        );

        return fromDatabaseArray(HeartbeatRunEntity, result);
      },
      'findByConfigId',
      'HeartbeatRun'
    );
  }
}

export default HeartbeatRunRepository;
