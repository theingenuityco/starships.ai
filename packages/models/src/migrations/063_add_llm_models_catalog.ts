import type { Client } from 'pg';

/**
 * Migration 063: DB-backed LLM model catalog + provider mappings.
 *
 * Design goals:
 * - Agents and LLM nodes reference ONLY the canonical model identifier string (OpenRouter-style: "provider/model").
 * - The catalog maps a canonical model -> many provider routes (openrouter, aws_bedrock, google_vertex, ...).
 * - Multiple routes per provider are allowed (UNIQUE(model, provider, provider_model_id)).
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    -- ------------------------------------------------------------------------
    -- Canonical model catalog
    -- ------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS llm_models (
      -- Canonical identifier used everywhere in Starships (OpenRouter-style)
      model VARCHAR(255) PRIMARY KEY,

      display_name VARCHAR(255),
      description TEXT,

      -- Optional metadata fields (kept generic for multi-provider support)
      context_length INTEGER,
      input_modalities TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      output_modalities TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      supported_parameters TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

      is_enabled BOOLEAN NOT NULL DEFAULT true,
      is_deprecated BOOLEAN NOT NULL DEFAULT false,

      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_llm_models_enabled ON llm_models(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_llm_models_deprecated ON llm_models(is_deprecated);

    -- ------------------------------------------------------------------------
    -- Provider routes for each canonical model
    -- ------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS llm_model_providers (
      model VARCHAR(255) NOT NULL REFERENCES llm_models(model) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      provider_model_id VARCHAR(255) NOT NULL,

      -- Higher priority wins when selecting a provider route.
      priority INTEGER NOT NULL DEFAULT 0,
      is_enabled BOOLEAN NOT NULL DEFAULT true,

      pricing JSONB,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

      last_synced_at TIMESTAMP WITH TIME ZONE NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

      -- Allow multiple routes per provider (e.g., regions/accounts/variants)
      PRIMARY KEY (model, provider, provider_model_id)
    );

    CREATE INDEX IF NOT EXISTS idx_llm_model_providers_model ON llm_model_providers(model);
    CREATE INDEX IF NOT EXISTS idx_llm_model_providers_provider ON llm_model_providers(provider);
    CREATE INDEX IF NOT EXISTS idx_llm_model_providers_enabled ON llm_model_providers(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_llm_model_providers_priority ON llm_model_providers(model, provider, priority DESC);
  `;

  await client.query(sql);
}

export async function down(client: Client): Promise<void> {
  const sql = `
    DROP TABLE IF EXISTS llm_model_providers;
    DROP TABLE IF EXISTS llm_models;
  `;
  await client.query(sql);
}

