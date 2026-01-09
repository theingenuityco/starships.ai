import type { Client } from 'pg';

/**
 * Migration 065: Update internal Starships connector endpoint `list-models`
 * to use the DB-backed LLM model catalog (`/llm/models`) instead of the
 * OpenRouter proxy endpoint (`/openrouter/models`).
 *
 * This keeps the seeded `list-models` tool working while ensuring it returns
 * the curated canonical models from `llm_models`.
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    UPDATE connector_templates
    SET
      endpoints_json = (
        SELECT jsonb_agg(
          CASE
            WHEN (e->>'name') = 'list-models'
              THEN jsonb_set(e, '{path}', to_jsonb('/llm/models'::text), true)
            ELSE e
          END
        )
        FROM jsonb_array_elements(connector_templates.endpoints_json) e
      ),
      updated_at = NOW()
    WHERE provider = 'starships';
  `;
  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    UPDATE connector_templates
    SET
      endpoints_json = (
        SELECT jsonb_agg(
          CASE
            WHEN (e->>'name') = 'list-models'
              THEN jsonb_set(e, '{path}', to_jsonb('/openrouter/models'::text), true)
            ELSE e
          END
        )
        FROM jsonb_array_elements(connector_templates.endpoints_json) e
      ),
      updated_at = NOW()
    WHERE provider = 'starships';
  `;
  await client.query(sql);
}

