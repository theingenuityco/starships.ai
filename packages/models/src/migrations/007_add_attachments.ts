import { Client } from 'pg';

/**
 * Migration: Add file attachments support
 *
 * Creates:
 * - attachments table for file metadata and S3 references
 * - attachment_ids column in messages table (array)
 * - Indexes for efficient queries
 */
export async function up(client: Client): Promise<void> {
  // Create attachments table
  await client.query(`
    CREATE TABLE attachments (
      id VARCHAR(255) PRIMARY KEY,
      starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
      message_id VARCHAR(255) REFERENCES messages(id) ON DELETE CASCADE,

      -- File metadata
      filename VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes BIGINT NOT NULL,

      -- S3 storage
      s3_key VARCHAR(1000) NOT NULL UNIQUE,

      -- Image optimization (NULL for non-images)
      image_width INTEGER,
      image_height INTEGER,

      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // Create indexes for attachments table
  await client.query(`
    CREATE INDEX idx_attachments_message ON attachments(message_id);
  `);

  await client.query(`
    CREATE INDEX idx_attachments_starship ON attachments(starship_id);
  `);

  await client.query(`
    CREATE INDEX idx_attachments_created ON attachments(created_at DESC);
  `);

  await client.query(`
    CREATE INDEX idx_attachments_s3_key ON attachments(s3_key);
  `);

  // Extend messages table to link attachments
  await client.query(`
    ALTER TABLE messages
    ADD COLUMN attachment_ids VARCHAR(255)[] DEFAULT '{}';
  `);

  // Add GIN index for array queries
  await client.query(`
    CREATE INDEX idx_messages_attachment_ids ON messages USING GIN (attachment_ids);
  `);
}

/**
 * Rollback migration
 *
 * To manually rollback (if needed):
 *
 * await client.query(`ALTER TABLE messages DROP COLUMN attachment_ids;`);
 * await client.query(`DROP INDEX IF EXISTS idx_messages_attachment_ids;`);
 * await client.query(`DROP TABLE IF EXISTS attachments CASCADE;`);
 */
