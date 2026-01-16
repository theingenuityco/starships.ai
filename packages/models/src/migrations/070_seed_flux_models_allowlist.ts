import type { Client } from 'pg';

/**
 * Migration 070: Seed Black Forest Labs FLUX models into the canonical allowlist.
 *
 * Starships treats canonical model identifiers as OpenRouter-style strings (provider/model).
 * For now, execution remains OpenRouter-backed, so we also seed provider routes for
 * provider="openrouter" for each canonical model.
 *
 * Note: These model IDs must match OpenRouter's `model.id` values exactly.
 */
export async function up(client: Client): Promise<void> {
  // Remove from curated allowlist (if previously seeded).
  // We intentionally delete canonical rows + provider routes so they are no longer allowlisted.
  const removedModels = ['google/gemini-3-flash-lite-preview', 'openai/gpt-5.2-mini'];

  const models = [
    // FLUX.2 family (OpenRouter ids as shown in OpenRouter catalog pages)
    'black-forest-labs/flux.2-pro',
    'black-forest-labs/flux.2-flex',
    'black-forest-labs/flux.2-max',
    'black-forest-labs/flux.2-klein-4b',
  ];

  const nowIso = new Date().toISOString();

  // 0) Remove models from catalog + all provider routes (best-effort).
  await client.query(
    `
    DELETE FROM llm_model_providers
    WHERE model = ANY($1::text[])
    `,
    [removedModels]
  );
  await client.query(
    `
    DELETE FROM llm_models
    WHERE model = ANY($1::text[])
    `,
    [removedModels]
  );

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
      [model, JSON.stringify({ seeded: true, source: 'allowlist', family: 'flux' }), nowIso]
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
      [model, model, JSON.stringify({ seeded: true, source: 'allowlist', family: 'flux' }), nowIso]
    );
  }
}

export async function down(client: Client): Promise<void> {
  const models = [
    'black-forest-labs/flux.2-pro',
    'black-forest-labs/flux.2-flex',
    'black-forest-labs/flux.2-max',
    'black-forest-labs/flux.2-klein-4b',
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

  // Restore models removed in `up()`.
  const restoredModels = ['google/gemini-3-flash-lite-preview', 'openai/gpt-5.2-mini'];
  const nowIso = new Date().toISOString();

  for (const model of restoredModels) {
    await client.query(
      `
      INSERT INTO llm_models (model, is_enabled, is_deprecated, metadata, created_at, updated_at)
      VALUES ($1, true, false, $2::jsonb, $3, $3)
      ON CONFLICT (model) DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        is_deprecated = EXCLUDED.is_deprecated,
        updated_at = EXCLUDED.updated_at
      `,
      [model, JSON.stringify({ seeded: true, source: 'allowlist', family: 'preexisting' }), nowIso]
    );
  }

  for (const model of restoredModels) {
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
      [model, model, JSON.stringify({ seeded: true, source: 'allowlist', family: 'preexisting' }), nowIso]
    );
  }
}

