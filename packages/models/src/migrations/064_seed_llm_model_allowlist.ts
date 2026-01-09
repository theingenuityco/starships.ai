import type { Client } from 'pg';

/**
 * Migration 064: Seed initial canonical model allowlist.
 *
 * We intentionally seed ONLY a curated list of canonical model identifiers.
 * Execution remains OpenRouter-backed for now, so we also seed provider routes
 * for provider="openrouter" for each canonical model.
 */
export async function up(client: Client): Promise<void> {
  const models = [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-5.2',
    'openai/gpt-5.2-mini',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-opus-4.5',
    'anthropic/claude-haiku-4.5',
    'google/gemini-3-pro-image-preview',
    'google/gemini-3-flash-preview',
    'google/gemini-3-flash-lite-preview',
    'google/gemini-3-pro-preview',
  ];

  const nowIso = new Date().toISOString();

  // 1) Seed canonical models
  for (const model of models) {
    await client.query(
      `
      INSERT INTO llm_models (model, is_enabled, is_deprecated, metadata, created_at, updated_at)
      VALUES ($1, true, false, $2::jsonb, $3, $3)
      ON CONFLICT (model) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        is_deprecated = EXCLUDED.is_deprecated,
        updated_at = EXCLUDED.updated_at
      `,
      [model, JSON.stringify({ seeded: true, source: 'allowlist' }), nowIso]
    );
  }

  // 2) Seed provider routes (openrouter) for each canonical model
  for (const model of models) {
    await client.query(
      `
      INSERT INTO llm_model_providers (
        model,
        provider,
        provider_model_id,
        priority,
        is_enabled,
        pricing,
        metadata,
        last_synced_at,
        created_at,
        updated_at
      ) VALUES (
        $1, 'openrouter', $2, 0, true, NULL, $3::jsonb, NULL, $4, $4
      )
      ON CONFLICT (model, provider, provider_model_id) DO UPDATE SET
        priority = EXCLUDED.priority,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = EXCLUDED.updated_at
      `,
      [model, model, JSON.stringify({ seeded: true, source: 'allowlist' }), nowIso]
    );
  }
}

export async function down(client: Client): Promise<void> {
  const models = [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-5.2',
    'openai/gpt-5.2-mini',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-opus-4.5',
    'anthropic/claude-haiku-4.5',
    'google/gemini-3-pro-image-preview',
    'google/gemini-3-flash-preview',
    'google/gemini-3-flash-lite-preview',
    'google/gemini-3-pro-preview',
  ];

  // Remove seeded provider routes first (FK cascade would also handle on model delete)
  await client.query(
    `
    DELETE FROM llm_model_providers
    WHERE provider = 'openrouter'
      AND model = ANY($1::text[])
      AND provider_model_id = model
    `,
    [models]
  );

  // Then remove canonical models (only those we seeded)
  await client.query(
    `
    DELETE FROM llm_models
    WHERE model = ANY($1::text[])
    `,
    [models]
  );
}

