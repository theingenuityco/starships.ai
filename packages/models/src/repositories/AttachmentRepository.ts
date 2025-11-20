/**
 * Attachment Repository
 *
 * Data access layer for file attachments.
 * Follows the same pattern as other repositories in the codebase.
 */

import { BaseRepository } from './BaseRepository';
import type { AttachmentModel } from '@starships/protocol';
import { nanoid } from 'nanoid';

export class AttachmentRepository extends BaseRepository {
  constructor() {
    super('AttachmentRepository');
  }

  /**
   * Create new attachment record
   */
  async create(data: {
    starshipId: string;
    messageId?: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    s3Key: string;
    imageWidth?: number;
    imageHeight?: number;
  }): Promise<AttachmentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const id = nanoid();
        const now = new Date().toISOString();

        const result = await connection.queryOne<Record<string, unknown>>(
          `INSERT INTO attachments (
            id, starship_id, message_id, filename, mime_type, size_bytes,
            s3_key, image_width, image_height, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            id,
            data.starshipId,
            data.messageId || null,
            data.filename,
            data.mimeType,
            data.sizeBytes,
            data.s3Key,
            data.imageWidth || null,
            data.imageHeight || null,
            now,
          ]
        );

        if (!result) {
          throw new Error('Failed to create attachment');
        }

        return this.mapToModel(result);
      },
      'create',
      'Attachment'
    );
  }

  /**
   * Find attachment by ID
   */
  async findById(id: string): Promise<AttachmentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM attachments WHERE id = $1',
          [id]
        );
        return result ? this.mapToModel(result) : null;
      },
      'findById',
      'Attachment',
      id
    );
  }

  /**
   * Find multiple attachments by IDs
   */
  async findByIds(ids: string[]): Promise<AttachmentModel[]> {
    if (ids.length === 0) return [];

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM attachments WHERE id = ANY($1) ORDER BY created_at ASC',
          [ids]
        );
        return result.map((r) => this.mapToModel(r));
      },
      'findByIds',
      'Attachment'
    );
  }

  /**
   * Find attachments by message ID
   */
  async findByMessageId(messageId: string): Promise<AttachmentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM attachments WHERE message_id = $1 ORDER BY created_at ASC',
          [messageId]
        );
        return result.map((r) => this.mapToModel(r));
      },
      'findByMessageId',
      'Attachment',
      messageId
    );
  }

  /**
   * Update attachment to link to message
   */
  async linkToMessage(id: string, messageId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          'UPDATE attachments SET message_id = $1 WHERE id = $2',
          [messageId, id]
        );
        // If no error was thrown, the update succeeded
        return true;
      },
      'linkToMessage',
      'Attachment',
      id
    );
  }

  /**
   * Delete attachment
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('attachments', id);
      },
      'delete',
      'Attachment',
      id
    );
  }

  /**
   * Map database row to AttachmentModel
   */
  private mapToModel(row: Record<string, unknown>): AttachmentModel {
    return {
      id: row.id as string,
      starshipId: row.starship_id as string,
      messageId: row.message_id as string | undefined,
      filename: row.filename as string,
      mimeType: row.mime_type as string,
      sizeBytes: Number(row.size_bytes),
      s3Key: row.s3_key as string,
      imageWidth: row.image_width as number | undefined,
      imageHeight: row.image_height as number | undefined,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }
}
