import type { Client } from 'pg';

/**
 * Migration 091: Migrate existing agent template content to marketing_content table
 *
 * Goals:
 * - Migrate avatars from agent_templates.avatar_s3_key → marketing_content
 * - Migrate profile images from agent_templates.*_s3_key → marketing_content
 * - Preserve all metadata (mime_type, updated_at)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // Migrate avatars
    await client.query(`
      INSERT INTO marketing_content (
        id, entity_type, entity_id, content_type, content_format,
        s3_key, mime_type, generation_status, generation_completed_at,
        version, is_active, created_at, updated_at
      )
      SELECT 
        gen_random_uuid()::text,
        'agent_template',
        id,
        'avatar',
        'image',
        avatar_s3_key,
        avatar_mime_type,
        'completed',
        avatar_updated_at,
        1,
        true,
        COALESCE(avatar_updated_at, created_at),
        COALESCE(avatar_updated_at, updated_at)
      FROM agent_templates
      WHERE avatar_s3_key IS NOT NULL
      ON CONFLICT (entity_type, entity_id, content_type) WHERE is_active = true DO NOTHING
    `);

    // Migrate problem_statements images
    await client.query(`
      INSERT INTO marketing_content (
        id, entity_type, entity_id, content_type, content_format,
        s3_key, mime_type, generation_status, generation_completed_at,
        version, is_active, created_at, updated_at
      )
      SELECT 
        gen_random_uuid()::text,
        'agent_template',
        id,
        'problem_statements_image',
        'image',
        problem_statements_s3_key,
        problem_statements_mime_type,
        'completed',
        problem_statements_updated_at,
        1,
        true,
        COALESCE(problem_statements_updated_at, created_at),
        COALESCE(problem_statements_updated_at, updated_at)
      FROM agent_templates
      WHERE problem_statements_s3_key IS NOT NULL
      ON CONFLICT (entity_type, entity_id, content_type) WHERE is_active = true DO NOTHING
    `);

    // Migrate capabilities images
    await client.query(`
      INSERT INTO marketing_content (
        id, entity_type, entity_id, content_type, content_format,
        s3_key, mime_type, generation_status, generation_completed_at,
        version, is_active, created_at, updated_at
      )
      SELECT 
        gen_random_uuid()::text,
        'agent_template',
        id,
        'capabilities_image',
        'image',
        capabilities_s3_key,
        capabilities_mime_type,
        'completed',
        capabilities_updated_at,
        1,
        true,
        COALESCE(capabilities_updated_at, created_at),
        COALESCE(capabilities_updated_at, updated_at)
      FROM agent_templates
      WHERE capabilities_s3_key IS NOT NULL
      ON CONFLICT (entity_type, entity_id, content_type) WHERE is_active = true DO NOTHING
    `);

    // Migrate try_these_prompts images
    await client.query(`
      INSERT INTO marketing_content (
        id, entity_type, entity_id, content_type, content_format,
        s3_key, mime_type, generation_status, generation_completed_at,
        version, is_active, created_at, updated_at
      )
      SELECT 
        gen_random_uuid()::text,
        'agent_template',
        id,
        'try_these_prompts_image',
        'image',
        try_these_prompts_s3_key,
        try_these_prompts_mime_type,
        'completed',
        try_these_prompts_updated_at,
        1,
        true,
        COALESCE(try_these_prompts_updated_at, created_at),
        COALESCE(try_these_prompts_updated_at, updated_at)
      FROM agent_templates
      WHERE try_these_prompts_s3_key IS NOT NULL
      ON CONFLICT (entity_type, entity_id, content_type) WHERE is_active = true DO NOTHING
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
    // Delete migrated content (we'll keep the original columns for now)
    await client.query(`
      DELETE FROM marketing_content 
      WHERE entity_type = 'agent_template' 
        AND content_type IN ('avatar', 'problem_statements_image', 'capabilities_image', 'try_these_prompts_image')
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
