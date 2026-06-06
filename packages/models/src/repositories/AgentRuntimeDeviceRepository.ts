import { BaseRepository } from './BaseRepository';
import type { AgentConnectionStatus, AgentRuntimeDeviceModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  runtime_id: string;
  device_label: string | null;
  platform: string | null;
  last_seen_at: string | null;
  connection_status: string;
  created_at: string;
};

function fromDb(r: DbRow): AgentRuntimeDeviceModel {
  return {
    id: String(r.id),
    runtimeId: String(r.runtime_id),
    deviceLabel: r.device_label ?? null,
    platform: r.platform ?? null,
    lastSeenAt: r.last_seen_at ?? null,
    connectionStatus: String(r.connection_status) as AgentConnectionStatus,
    createdAt: String(r.created_at),
  };
}

export class AgentRuntimeDeviceRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentRuntimeDeviceRepository', connection);
  }

  async register(input: { runtimeId: string; deviceLabel?: string | null; platform?: string | null }): Promise<AgentRuntimeDeviceModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_runtime_devices (id, runtime_id, device_label, platform, last_seen_at, connection_status)
           VALUES ($1,$2,$3,$4,NOW(),'online') RETURNING *`,
          [nanoid(), input.runtimeId, input.deviceLabel ?? null, input.platform ?? null]
        );
        if (!row) throw new Error('Failed to register runtime device');
        return fromDb(row);
      },
      'register',
      'AgentRuntimeDevice'
    );
  }

  async updateStatus(id: string, status: AgentConnectionStatus): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        await this.getConnection().query(`UPDATE agent_runtime_devices SET connection_status = $2, last_seen_at = NOW() WHERE id = $1`, [id, status]);
      },
      'updateStatus',
      'AgentRuntimeDevice',
      id
    );
  }

  async listByRuntime(runtimeId: string): Promise<AgentRuntimeDeviceModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(
          `SELECT * FROM agent_runtime_devices WHERE runtime_id = $1 ORDER BY last_seen_at DESC NULLS LAST`,
          [runtimeId]
        );
        return rows.map(fromDb);
      },
      'listByRuntime',
      'AgentRuntimeDevice'
    );
  }
}
