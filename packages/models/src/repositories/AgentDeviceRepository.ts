import { BaseRepository } from './BaseRepository';
import type { AgentConnectionStatus, AgentDeviceModel } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

type DbRow = {
  id: string;
  agent_id: string;
  device_label: string | null;
  platform: string | null;
  last_seen_at: string | null;
  connection_status: string;
  created_at: string;
};

function fromDb(r: DbRow): AgentDeviceModel {
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    deviceLabel: r.device_label ?? null,
    platform: r.platform ?? null,
    lastSeenAt: r.last_seen_at ?? null,
    connectionStatus: String(r.connection_status) as AgentConnectionStatus,
    createdAt: String(r.created_at),
  };
}

export class AgentDeviceRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentDeviceRepository', connection);
  }

  async register(input: { agentId: string; deviceLabel?: string | null; platform?: string | null }): Promise<AgentDeviceModel> {
    return this.executeWithErrorHandling(
      async () => {
        const row = await this.getConnection().queryOne<DbRow>(
          `INSERT INTO agent_devices (id, agent_id, device_label, platform, last_seen_at, connection_status)
           VALUES ($1,$2,$3,$4,NOW(),'online') RETURNING *`,
          [nanoid(), input.agentId, input.deviceLabel ?? null, input.platform ?? null]
        );
        if (!row) throw new Error('Failed to register agent device');
        return fromDb(row);
      },
      'register',
      'AgentDevice'
    );
  }

  async updateStatus(id: string, status: AgentConnectionStatus): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        await this.getConnection().query(
          `UPDATE agent_devices SET connection_status = $2, last_seen_at = NOW() WHERE id = $1`,
          [id, status]
        );
      },
      'updateStatus',
      'AgentDevice',
      id
    );
  }

  async listByAgent(agentId: string): Promise<AgentDeviceModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const rows = await this.getConnection().query<DbRow>(`SELECT * FROM agent_devices WHERE agent_id = $1 ORDER BY last_seen_at DESC NULLS LAST`, [agentId]);
        return rows.map(fromDb);
      },
      'listByAgent',
      'AgentDevice'
    );
  }
}
