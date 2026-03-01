import { BaseRepository } from './BaseRepository';
import type { RoomPinnedDataset } from '@starships/protocol';

type DbRow = {
  room_conversation_id: string;
  dataset_id: string;
  position: number;
  created_at: string;
  created_by: string | null;
};

function fromDb(r: DbRow): RoomPinnedDataset {
  return {
    kind: 'dataset',
    roomConversationId: String(r.room_conversation_id),
    datasetId: String(r.dataset_id),
    position: Number(r.position) || 0,
    createdAt: String(r.created_at),
    createdBy: r.created_by ?? null,
  };
}

export class RoomPinnedDatasetsRepository extends BaseRepository {
  constructor() {
    super('RoomPinnedDatasetsRepository');
  }

  async list(roomConversationId: string): Promise<RoomPinnedDataset[]> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const rows = await conn.query<DbRow>(
        `SELECT room_conversation_id, dataset_id, position, created_at, created_by
           FROM room_pinned_datasets
          WHERE room_conversation_id = $1
          ORDER BY position ASC, created_at ASC`,
        [roomConversationId]
      );
      return rows.map(fromDb);
    }, 'list', 'room_pinned_datasets', roomConversationId);
  }

  async upsert(args: { roomConversationId: string; datasetId: string; position: number; createdBy?: string | null }): Promise<RoomPinnedDataset> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const row = await conn.queryOne<DbRow>(
        `INSERT INTO room_pinned_datasets (room_conversation_id, dataset_id, position, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_conversation_id, dataset_id) DO UPDATE SET
           position = EXCLUDED.position
         RETURNING room_conversation_id, dataset_id, position, created_at, created_by`,
        [args.roomConversationId, args.datasetId, Math.trunc(args.position), args.createdBy ?? null]
      );
      if (!row) throw new Error('Failed to upsert pinned dataset');
      return fromDb(row);
    }, 'upsert', 'room_pinned_datasets');
  }

  async remove(roomConversationId: string, datasetId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const conn = this.getConnection();
      const result = await conn.queryWithResult(
        `DELETE FROM room_pinned_datasets WHERE room_conversation_id = $1 AND dataset_id = $2`,
        [roomConversationId, datasetId]
      );
      return (result.rowCount ?? 0) > 0;
    }, 'remove', 'room_pinned_datasets');
  }
}

