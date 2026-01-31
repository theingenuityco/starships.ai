import type { Client } from 'pg';

/**
 * Migration 090: Add marketing_content table
 *
 * Goals:
 * - Unified storage for marketing content (images + text) across entity types
 * - Supports pipeline generation tracking (status, metadata)
 * - Sparse data model (only rows for content that exists)
 * - Reusable across agent_templates, tool_templates, connector_templates, etc.
 *
 * Content types:
 * - Images: 'avatar' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image'
 * - Text: 'problem_statements_text' (JSON array of strings)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Create marketing_content table
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketing_content (
        id VARCHAR(255) PRIMARY KEY,
        
        -- Polymorphic entity reference
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        
        -- Content classification
        content_type VARCHAR(50) NOT NULL,
        content_format VARCHAR(20) NOT NULL CHECK (content_format IN ('image', 'text', 'video', 'other')),
        
        -- Storage (for images/videos)
        s3_key VARCHAR(1000),
        mime_type VARCHAR(100),
        
        -- Text content (for text format)
        text_content TEXT,
        text_format VARCHAR(20) DEFAULT 'json',
        
        -- Generation pipeline tracking
        generation_status VARCHAR(20) DEFAULT 'pending' 
          CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed', 'skipped')),
        generation_requested_at TIMESTAMPTZ,
        generation_started_at TIMESTAMPTZ,
        generation_completed_at TIMESTAMPTZ,
        generation_error TEXT,
        
        -- Generation metadata (for pipeline tracking)
        generation_metadata JSONB DEFAULT '{}',
        
        -- Display metadata (for SEO, alt text, etc.)
        metadata JSONB DEFAULT '{}',
        
        -- Versioning
        version INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        -- Constraints
        CONSTRAINT content_format_check CHECK (
          (content_format = 'image' AND s3_key IS NOT NULL AND text_content IS NULL) OR
          (content_format = 'text' AND text_content IS NOT NULL AND s3_key IS NULL) OR
          (content_format = 'video' AND s3_key IS NOT NULL AND text_content IS NULL) OR
          (content_format = 'other')
        )
      )
    `);

    // Unique constraint: one active version per content type per entity
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_unique_active
      ON marketing_content(entity_type, entity_id, content_type)
      WHERE is_active = true
    `);

    // Indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketing_content_entity
      ON marketing_content(entity_type, entity_id)
      WHERE is_active = true
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketing_content_status
      ON marketing_content(generation_status)
      WHERE generation_status IN ('pending', 'generating')
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketing_content_type
      ON marketing_content(content_type)
      WHERE is_active = true
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_marketing_content_updated_at
      ON marketing_content(updated_at DESC)
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      DROP INDEX IF EXISTS idx_marketing_content_updated_at
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_marketing_content_type
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_marketing_content_status
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_marketing_content_entity
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_marketing_content_unique_active
    `);

    await client.query(`
      DROP TABLE IF EXISTS marketing_content
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
