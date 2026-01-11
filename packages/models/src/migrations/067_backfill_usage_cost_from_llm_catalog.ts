import type { Client } from 'pg';

/**
 * Migration 067: Backfill historical usage.cost when it was not recorded.
 *
 * Background:
 * - Older usage rows may have cost=0 even when tokens were recorded (e.g. BYOK where provider did not return cost).
 * - We now compute cost server-side from provider usage / catalog pricing, but old rows remain 0.
 *
 * Approach:
 * - For usage rows where cost=0 and model is known, compute (OpenRouter pricing is per-token):
 *   cost = (prompt_tokens * pricing.prompt) + (completion_tokens * pricing.completion) + pricing.request
 * - Pricing values are sourced from llm_model_providers.pricing JSON (OpenRouter sync), and are typically strings.
 * - We pick the highest-priority enabled provider route per model.
 * - Rows are only updated when at least one pricing component is present and tokens > 0.
 *
 * Notes:
 * - Some usage.model values may include OpenRouter suffixes like ":free". We match both full model and base id.
 * - Pricing strings may be in scientific notation (e.g. "1.5e-6").
 */
export async function up(client: Client): Promise<void> {
  const sql = `
    WITH best_route AS (
      SELECT DISTINCT ON (p.model)
        p.model,
        p.pricing
      FROM llm_model_providers p
      WHERE p.is_enabled = true
      ORDER BY p.model, p.priority DESC, p.provider ASC, p.provider_model_id ASC
    ),
    pricing AS (
      SELECT
        b.model,
        -- Allow decimals and scientific notation
        CASE WHEN (b.pricing->>'prompt') ~ '^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$' THEN (b.pricing->>'prompt')::numeric ELSE NULL END AS prompt_per_token,
        CASE WHEN (b.pricing->>'completion') ~ '^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$' THEN (b.pricing->>'completion')::numeric ELSE NULL END AS completion_per_token,
        CASE WHEN (b.pricing->>'request') ~ '^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$' THEN (b.pricing->>'request')::numeric ELSE NULL END AS request_cost
      FROM best_route b
    ),
    usage_norm AS (
      SELECT
        u.id,
        u.model,
        -- Normalize OpenRouter variant suffixes (e.g. "openai/gpt-4o-mini:free" -> "openai/gpt-4o-mini")
        NULLIF(split_part(u.model, ':', 1), '') AS model_base
      FROM usage u
      WHERE u.cost = 0
        AND u.model IS NOT NULL
        AND (u.prompt_tokens > 0 OR u.completion_tokens > 0 OR u.total_tokens > 0)
    )
    UPDATE usage u
    SET cost = ROUND(
      (
        (u.prompt_tokens::numeric * COALESCE(p.prompt_per_token, 0))
        + (u.completion_tokens::numeric * COALESCE(p.completion_per_token, 0))
        + COALESCE(p.request_cost, 0)
      ),
      6
    )
    FROM usage_norm un
    JOIN pricing p
      ON p.model = un.model OR (un.model_base IS NOT NULL AND p.model = un.model_base)
    WHERE u.id = un.id
      AND u.cost = 0
      AND (p.prompt_per_token IS NOT NULL OR p.completion_per_token IS NOT NULL OR p.request_cost IS NOT NULL);
  `;

  await client.query(sql);
}

export async function down(): Promise<void> {
  // Non-reversible backfill (we cannot distinguish original 0-cost rows from legitimately free usage).
}

