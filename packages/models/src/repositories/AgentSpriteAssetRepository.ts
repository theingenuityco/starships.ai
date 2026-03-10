import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { AgentSpriteAssetEntity } from '@/entities/AgentSpriteAssetEntity';
import type { AgentSpriteAssetModel, AgentSpriteAssetStatus } from '@starships/protocol';
import { nanoid } from 'nanoid';
import type { PostgresConnection } from '@/helpers/database';

export class AgentSpriteAssetRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentSpriteAssetRepository', connection);
  }

  async listByAgent(agentId: string): Promise<AgentSpriteAssetModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const id = String(agentId || '').trim();
        if (!id) return [];
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT * FROM agent_sprite_assets WHERE agent_id = $1 ORDER BY created_at DESC`,
          [id]
        );
        return fromDatabaseArray(AgentSpriteAssetEntity, rows);
      },
      'listByAgent',
      'agent_sprite_assets',
      agentId
    );
  }

  async findByAgentAndAppearanceKey(agentId: string, appearanceKey: string): Promise<AgentSpriteAssetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const id = String(agentId || '').trim();
        const k = String(appearanceKey || '').trim();
        if (!id || !k) return null;
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `SELECT * FROM agent_sprite_assets WHERE agent_id = $1 AND appearance_key = $2 LIMIT 1`,
          [id, k]
        );
        return row ? fromDatabase(AgentSpriteAssetEntity, row) : null;
      },
      'findByAgentAndAppearanceKey',
      'agent_sprite_assets',
      `${agentId}:${appearanceKey}`
    );
  }

  async createDraft(args: {
    agentId: string;
    appearanceKey: string;
    avatarAttachmentId?: string | null;
    styleId: string;
    modelVersion: string;
    generatorVersion: string;
    staticBasePath?: string | null;
  }): Promise<AgentSpriteAssetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const data: AgentSpriteAssetModel = {
          id: nanoid(),
          agentId: String(args.agentId),
          appearanceKey: String(args.appearanceKey),
          avatarAttachmentId: args.avatarAttachmentId ?? null,
          spritesheetAttachmentId: null,
          atlasAttachmentId: null,
          staticBasePath: args.staticBasePath ?? null,
          status: 'draft',
          styleId: String(args.styleId || 'default'),
          modelVersion: String(args.modelVersion || 'unknown'),
          generatorVersion: String(args.generatorVersion || 'v1'),
          createdAt: now,
          updatedAt: now,
        };

        const entity = toEntityInstance(AgentSpriteAssetEntity, data as unknown as Record<string, unknown>);
        const serialized = toDatabase(entity);

        const connection = this.getConnection();
        const cols = Object.keys(serialized);
        const vals = Object.values(serialized);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const sql = `
          INSERT INTO agent_sprite_assets (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *;
        `;
        const row = await connection.queryOne<Record<string, unknown>>(sql, vals);
        if (!row) throw new Error('Failed to create agent sprite asset');
        return fromDatabase(AgentSpriteAssetEntity, row);
      },
      'createDraft',
      'agent_sprite_assets'
    );
  }

  async upsertDraftForAppearance(args: {
    agentId: string;
    appearanceKey: string;
    avatarAttachmentId?: string | null;
    styleId: string;
    modelVersion: string;
    generatorVersion: string;
    staticBasePath?: string | null;
  }): Promise<AgentSpriteAssetModel> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findByAgentAndAppearanceKey(args.agentId, args.appearanceKey);
        if (existing) return existing;
        return await this.createDraft(args);
      },
      'upsertDraftForAppearance',
      'agent_sprite_assets'
    );
  }

  async setStatus(id: string, status: AgentSpriteAssetStatus): Promise<AgentSpriteAssetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const assetId = String(id || '').trim();
        if (!assetId) return null;
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `UPDATE agent_sprite_assets
              SET status = $2,
                  updated_at = NOW()
            WHERE id = $1
            RETURNING *`,
          [assetId, status]
        );
        return row ? fromDatabase(AgentSpriteAssetEntity, row) : null;
      },
      'setStatus',
      'agent_sprite_assets',
      id
    );
  }

  async publish(
    id: string,
    updates: { spritesheetAttachmentId?: string | null; atlasAttachmentId?: string | null; staticBasePath?: string | null }
  ): Promise<AgentSpriteAssetModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const assetId = String(id || '').trim();
        if (!assetId) return null;
        const sets: string[] = ['status = $2', 'updated_at = NOW()'];
        const values: unknown[] = [assetId, 'published'];
        let idx = 2;

        const add = (col: string, value: unknown) => {
          idx += 1;
          sets.push(`${col} = $${idx}`);
          values.push(value);
        };
        if ('spritesheetAttachmentId' in updates) add('spritesheet_attachment_id', updates.spritesheetAttachmentId ?? null);
        if ('atlasAttachmentId' in updates) add('atlas_attachment_id', updates.atlasAttachmentId ?? null);
        if ('staticBasePath' in updates) add('static_base_path', updates.staticBasePath ?? null);

        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `UPDATE agent_sprite_assets SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
          values
        );
        return row ? fromDatabase(AgentSpriteAssetEntity, row) : null;
      },
      'publish',
      'agent_sprite_assets',
      id
    );
  }
}

